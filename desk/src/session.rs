// SPDX-License-Identifier: AGPL-3.0-only

//! The session: a cookie (`Secure` behind https, `HttpOnly`, `SameSite=Lax`)
//! naming a row in the store, and the three ways a person gets one (Wave 4c
//! §5.1): none in `off` mode, where the one person is the operator at the
//! keyboard; username and password at the desk in `local` mode; the
//! provider in `oidc` mode. The display name is recorded beside the subject
//! at first sight (§5.9); the entitlements come from the user row or the
//! token's claim, never from the browser.

use axum::extract::{Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Redirect, Response};
use serde_json::{Value, json};

use crate::config::Mode;
use crate::store::Session;
use crate::{Shared, users};

pub const COOKIE: &str = "nils_desk";
const HOURS: i64 = 12;

/// The person of a session, as the capabilities document names them.
#[derive(Debug, Clone)]
pub struct Person {
    pub subject: String,
    pub display_name: String,
    pub entitlements: Vec<String>,
}

impl Person {
    pub fn roles(&self) -> Vec<&str> {
        self.entitlements
            .iter()
            .map(String::as_str)
            .filter(|e| *e != "assist")
            .collect()
    }
    pub fn holds(&self, e: &str) -> bool {
        let ladder = ["reader", "reviewer", "operator", "admin"];
        if e == "assist" {
            return self.entitlements.iter().any(|x| x == "assist");
        }
        let want = ladder.iter().position(|x| *x == e).unwrap_or(usize::MAX);
        self.entitlements.iter().any(|x| {
            ladder
                .iter()
                .position(|l| l == x)
                .is_some_and(|have| have >= want)
        })
    }
    pub fn as_json(&self) -> Value {
        json!({
            "subject": self.subject,
            "display_name": self.display_name,
            "entitlements": self.entitlements,
            "roles": self.roles(),
        })
    }
}

fn all() -> Vec<String> {
    users::ENTITLEMENTS.iter().map(|s| s.to_string()).collect()
}

pub fn cookie_of(desk: &Shared, id: &str, hours: i64) -> Option<HeaderValue> {
    let secure = if desk.config.origin.starts_with("https://") {
        "; Secure"
    } else {
        ""
    };
    HeaderValue::from_str(&format!(
        "{COOKIE}={id}; Path=/; HttpOnly; SameSite=Lax; Max-Age={}{secure}",
        hours * 3600
    ))
    .ok()
}

/// The session of a request, if any; in `off` mode one is made on the
/// first visit. The second value is a cookie to set when one was made.
pub fn resolve(desk: &Shared, headers: &HeaderMap) -> (Option<Session>, Option<HeaderValue>) {
    if let Some(id) = cookie(headers)
        && let Some(s) = desk.store.get(&id)
    {
        return (Some(s), None);
    }
    match desk.config.mode {
        Mode::Off => {
            let s = desk
                .store
                .create("operator", "the operator", &all(), &json!({}), HOURS)
                .ok();
            let set = s.as_ref().and_then(|s| cookie_of(desk, &s.id, HOURS));
            (s, set)
        }
        _ => (None, None),
    }
}

/// The person of a session: in `local` mode the entitlements are the user
/// row's now, not the session's at login, so a grant shows at once.
pub fn person(desk: &Shared, session: &Session) -> Person {
    let entitlements = match desk.config.mode {
        Mode::Local => desk
            .store
            .user(&session.subject)
            .map(|(u, _)| u.entitlements)
            .unwrap_or_default(),
        _ => session.entitlements.clone(),
    };
    Person {
        subject: session.subject.clone(),
        display_name: session.display.clone(),
        entitlements,
    }
}

/// Nobody, for the shell to name: the login page in `local` mode, the
/// provider in `oidc` mode.
pub fn nobody() -> Person {
    Person {
        subject: String::new(),
        display_name: String::new(),
        entitlements: Vec::new(),
    }
}

pub fn cookie(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    raw.split(';')
        .map(str::trim)
        .find_map(|c| c.strip_prefix(COOKIE).and_then(|r| r.strip_prefix('=')))
        .map(str::to_string)
}

fn error(status: StatusCode, message: impl Into<String>) -> Response {
    (status, axum::Json(json!({"error": message.into()}))).into_response()
}

/// `GET /desk/session`: who this is, and how one logs in.
pub async fn door(State(desk): State<Shared>, headers: HeaderMap) -> Response {
    let (session, set) = resolve(&desk, &headers);
    let person = session.as_ref().map(|s| person(&desk, s));
    let mut r = axum::Json(json!({
        "person": person.map(|p| p.as_json()),
        "mode": desk.config.mode.to_string(),
        "login": match desk.config.mode {
            Mode::Off => Value::Null,
            Mode::Local => json!({"kind": "password", "url": "/desk/login"}),
            Mode::Oidc => json!({"kind": "redirect", "url": "/desk/login"}),
        },
    }))
    .into_response();
    if let Some(v) = set {
        r.headers_mut().insert(header::SET_COOKIE, v);
    }
    r
}

/// `POST /desk/login` in `local` mode: username and password for a session.
pub async fn login(State(desk): State<Shared>, axum::Json(body): axum::Json<Value>) -> Response {
    if desk.config.mode != Mode::Local {
        return error(
            StatusCode::NOT_FOUND,
            "this desk takes no password; see /desk/session for how to log in",
        );
    }
    let (Some(u), Some(p)) = (body["username"].as_str(), body["password"].as_str()) else {
        return error(StatusCode::BAD_REQUEST, "username and password");
    };
    let Some(user) = users::login(&desk.store, u, p) else {
        return error(
            StatusCode::UNAUTHORIZED,
            "the username or the password is not right",
        );
    };
    desk.store.saw(&user.username, &user.display);
    match desk.store.create(
        &user.username,
        &user.display,
        &user.entitlements,
        &json!({}),
        HOURS,
    ) {
        Ok(s) => {
            let mut r = axum::Json(json!({"person": person(&desk, &s).as_json()})).into_response();
            if let Some(v) = cookie_of(&desk, &s.id, HOURS) {
                r.headers_mut().insert(header::SET_COOKIE, v);
            }
            r
        }
        Err(e) => error(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

/// `POST /desk/cli-login` in `local` mode (§5.8): a token of one day for
/// `nils login --desk`.
pub async fn cli_login(
    State(desk): State<Shared>,
    axum::Json(body): axum::Json<Value>,
) -> Response {
    let Some(issuer) = &desk.issuer else {
        return error(
            StatusCode::NOT_FOUND,
            "this desk mints no tokens; it is not in local mode",
        );
    };
    let (Some(u), Some(p)) = (body["username"].as_str(), body["password"].as_str()) else {
        return error(StatusCode::BAD_REQUEST, "username and password");
    };
    let Some(user) = users::login(&desk.store, u, p) else {
        return error(
            StatusCode::UNAUTHORIZED,
            "the username or the password is not right",
        );
    };
    match issuer.mint(&user.username, &user.display, &user.entitlements, crate::issuer::CLI_TOKEN_HOURS * 60) {
        Ok((token, exp)) => axum::Json(json!({"token": token, "expires_at": exp, "issuer": issuer.origin, "audience": issuer.audience})).into_response(),
        Err(e) => error(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

/// `GET /desk/login` in `oidc` mode: to the provider, with PKCE.
pub async fn begin(State(desk): State<Shared>) -> Response {
    let Some(client) = &desk.oidc else {
        return error(
            StatusCode::NOT_FOUND,
            "this desk has no provider; see /desk/session for how to log in",
        );
    };
    let redirect = format!("{}/desk/callback", desk.config.origin.trim_end_matches('/'));
    match client.begin(&redirect).await {
        Ok((url, state, verifier)) => {
            desk.store.pending_put(&state, &verifier);
            Redirect::to(&url).into_response()
        }
        Err(e) => error(StatusCode::BAD_GATEWAY, e),
    }
}

#[derive(serde::Deserialize)]
pub struct Callback {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

/// `GET /desk/callback`: the code for a session.
pub async fn callback(State(desk): State<Shared>, Query(q): Query<Callback>) -> Response {
    let Some(client) = &desk.oidc else {
        return error(StatusCode::NOT_FOUND, "this desk has no provider");
    };
    if let Some(e) = q.error {
        return error(
            StatusCode::UNAUTHORIZED,
            format!(
                "the provider refused: {e} {}",
                q.error_description.unwrap_or_default()
            ),
        );
    }
    let (Some(code), Some(state)) = (q.code, q.state) else {
        return error(StatusCode::BAD_REQUEST, "code and state");
    };
    let Some(verifier) = desk.store.pending_take(&state) else {
        return error(
            StatusCode::BAD_REQUEST,
            "this login was not begun here, or it timed out",
        );
    };
    let redirect = format!("{}/desk/callback", desk.config.origin.trim_end_matches('/'));
    match client.finish(&code, &verifier, &redirect).await {
        Ok(a) => {
            desk.store.saw(&a.subject, &a.display);
            match desk
                .store
                .create(&a.subject, &a.display, &a.entitlements, &a.tokens, HOURS)
            {
                Ok(s) => {
                    let mut r = Redirect::to("/").into_response();
                    if let Some(v) = cookie_of(&desk, &s.id, HOURS) {
                        r.headers_mut().insert(header::SET_COOKIE, v);
                    }
                    r
                }
                Err(e) => error(StatusCode::INTERNAL_SERVER_ERROR, e),
            }
        }
        Err(e) => error(StatusCode::UNAUTHORIZED, e),
    }
}

pub async fn logout(State(desk): State<Shared>, headers: HeaderMap) -> Response {
    if let Some(id) = cookie(&headers) {
        desk.store.delete(&id);
    }
    let mut r = StatusCode::NO_CONTENT.into_response();
    r.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_static("nils_desk=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"),
    );
    r
}

// --- the issuer's documents

pub async fn jwks(State(desk): State<Shared>) -> Response {
    match &desk.issuer {
        Some(i) => axum::Json(i.jwks()).into_response(),
        None => error(StatusCode::NOT_FOUND, "this desk is not an issuer"),
    }
}

pub async fn discovery(State(desk): State<Shared>) -> Response {
    match &desk.issuer {
        Some(i) => axum::Json(i.discovery()).into_response(),
        None => error(StatusCode::NOT_FOUND, "this desk is not an issuer"),
    }
}

// --- the admin's users page (local mode)

fn admin(desk: &Shared, headers: &HeaderMap) -> Result<Person, Box<Response>> {
    let (session, _) = resolve(desk, headers);
    let Some(s) = session else {
        return Err(Box::new(error(StatusCode::UNAUTHORIZED, "no session")));
    };
    let p = person(desk, &s);
    if !p.holds("admin") {
        return Err(Box::new(error(
            StatusCode::FORBIDDEN,
            "the users page is an admin's",
        )));
    }
    Ok(p)
}

pub async fn users_list(State(desk): State<Shared>, headers: HeaderMap) -> Response {
    if desk.config.mode != Mode::Local {
        return error(
            StatusCode::NOT_FOUND,
            "users live at the provider in this mode",
        );
    }
    if let Err(r) = admin(&desk, &headers) {
        return *r;
    }
    let list: Vec<Value> = desk
        .store
        .users()
        .into_iter()
        .map(|u| json!({"username": u.username, "display": u.display, "entitlements": u.entitlements, "admin": u.admin}))
        .collect();
    axum::Json(json!({"users": list, "entitlements": users::ENTITLEMENTS})).into_response()
}

pub async fn users_add(
    State(desk): State<Shared>,
    headers: HeaderMap,
    axum::Json(body): axum::Json<Value>,
) -> Response {
    if desk.config.mode != Mode::Local {
        return error(
            StatusCode::NOT_FOUND,
            "users live at the provider in this mode",
        );
    }
    if let Err(r) = admin(&desk, &headers) {
        return *r;
    }
    let (Some(u), Some(p)) = (body["username"].as_str(), body["password"].as_str()) else {
        return error(StatusCode::BAD_REQUEST, "username and password");
    };
    let ents: Vec<String> = body["entitlements"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    match users::add(
        &desk.store,
        u,
        p,
        body["display"].as_str(),
        &ents,
        body["admin"].as_bool() == Some(true),
    ) {
        Ok(()) => (StatusCode::CREATED, axum::Json(json!({"username": u}))).into_response(),
        Err(e) => error(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn users_entitlements(
    State(desk): State<Shared>,
    headers: HeaderMap,
    axum::extract::Path(name): axum::extract::Path<String>,
    axum::Json(body): axum::Json<Value>,
) -> Response {
    if desk.config.mode != Mode::Local {
        return error(
            StatusCode::NOT_FOUND,
            "users live at the provider in this mode",
        );
    }
    let who = match admin(&desk, &headers) {
        Ok(p) => p,
        Err(r) => return *r,
    };
    let ents: Vec<String> = body["entitlements"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    if let Err(e) = users::check_entitlements(&ents) {
        return error(StatusCode::BAD_REQUEST, e);
    }
    if who.subject == name && !ents.iter().any(|e| e == "admin") {
        return error(
            StatusCode::BAD_REQUEST,
            "an admin does not revoke their own admin; another admin does",
        );
    }
    match desk.store.user_set_entitlements(&name, &ents) {
        Ok(true) => axum::Json(json!({"username": name, "entitlements": ents})).into_response(),
        Ok(false) => error(StatusCode::NOT_FOUND, format!("no user named {name}")),
        Err(e) => error(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}
