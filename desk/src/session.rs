// SPDX-License-Identifier: AGPL-3.0-only

//! The session: a cookie (`Secure` behind https, `HttpOnly`, `SameSite=Lax`)
//! naming a row in the store, and the three ways a person gets one (Wave 4c
//! §5.1): none in `off` mode, where the one person is the operator at the
//! keyboard; username and password at the desk in `local` mode; the
//! provider in `oidc` mode. The display name is recorded beside the subject
//! at first sight (§5.9). What a person holds is resolved on every request
//! from the desk's groups and the grants they hold alone, under `oidc` with
//! the provider's groups kept from the sign-in, and never from the browser.

use axum::extract::{Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Redirect, Response};
use serde_json::{Value, json};

use crate::config::Mode;
use crate::grants::Access;
use crate::proxy::same_origin;
use crate::store::{Claims, Session};
use crate::{Shared, users};

pub const COOKIE: &str = "nils_desk";
pub const HOURS: i64 = 12;

/// The person of a session, as the capabilities document names them: what
/// they hold now, and the names of the groups it comes from.
#[derive(Debug, Clone)]
pub struct Person {
    pub subject: String,
    pub display_name: String,
    pub access: Access,
    pub groups: Vec<String>,
}

impl Person {
    /// Whether the person holds a grant.
    pub fn holds(&self, grant: &str) -> bool {
        self.access.holds(grant)
    }

    /// Whether the person holds a grant, or a set by its ladder name.
    pub fn holds_name(&self, name: &str) -> bool {
        self.access.holds_name(name)
    }

    pub fn as_json(&self) -> Value {
        json!({
            "subject": self.subject,
            "display_name": self.display_name,
            "grants": self.access.list(),
            "detail": self.access.detail.as_str(),
            "groups": self.groups,
        })
    }
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
        // in `local` mode a session holds only for a person the desk still keeps
        if desk.config.mode != Mode::Local || desk.store.user(&s.subject).is_some() {
            return (Some(s), None);
        }
        desk.store.delete(&id);
    }
    match desk.config.mode {
        Mode::Off => {
            let s = desk
                .store
                .create(
                    "operator",
                    "the operator",
                    &Claims::default(),
                    &json!({}),
                    HOURS,
                )
                .ok();
            let set = s.as_ref().and_then(|s| cookie_of(desk, &s.id, HOURS));
            (s, set)
        }
        _ => (None, None),
    }
}

/// The person of a session, resolved now rather than at login, so a change
/// to a group or to what a person holds applies at their next click. In
/// `off` mode the one person holds everything.
pub fn person(desk: &Shared, session: &Session) -> Person {
    let (access, groups) = match desk.config.mode {
        Mode::Off => (Access::everything(), Vec::new()),
        mode => {
            let book = desk.store.book();
            let claims = (mode == Mode::Oidc).then_some(&session.claims);
            let r = book.resolve(&session.subject, claims);
            let ids: Vec<i64> = r.member.iter().chain(&r.followed).copied().collect();
            (r.access, book.names(&ids))
        }
    };
    Person {
        subject: session.subject.clone(),
        display_name: session.display.clone(),
        access,
        groups,
    }
}

/// The person of a request, holding a grant or a set by its ladder name:
/// nobody signed in is 401, and a person without it 403, naming `what` they
/// reached for and what it needs.
pub fn holding(
    desk: &Shared,
    headers: &HeaderMap,
    need: &str,
    what: &str,
) -> Result<Person, Box<Response>> {
    let (session, _) = resolve(desk, headers);
    let Some(s) = session else {
        return Err(Box::new(error(
            StatusCode::UNAUTHORIZED,
            "no session; log in at the desk",
        )));
    };
    let p = person(desk, &s);
    if !p.holds_name(need) {
        return Err(Box::new(error(
            StatusCode::FORBIDDEN,
            format!("{what} needs {need}"),
        )));
    }
    Ok(p)
}

/// The tokens a session holds, with the provider's refreshed first in
/// `oidc` mode when near their expiry, which is when the desk asks the
/// provider again whether the sign-in stands (every fifteen minutes at the
/// provider's usual access token lifetime). A sign-in the provider has
/// ended ends the desk's session here.
pub async fn keep(desk: &Shared, s: &Session) -> Result<Value, String> {
    let mut tokens = if s.tokens.is_object() {
        s.tokens.clone()
    } else {
        json!({})
    };
    if let (Mode::Oidc, Some(client)) = (desk.config.mode, desk.oidc.as_ref()) {
        match client.refresh(&tokens, &s.subject).await {
            Ok(Some(mut fresh)) => {
                fresh["minted"] = tokens["minted"].take();
                tokens = fresh;
                desk.store.set_tokens(&s.id, &tokens);
            }
            Ok(None) => {}
            Err(crate::oidc::Refresh::Ended(why)) => {
                desk.store.delete(&s.id);
                return Err(format!("{why}; sign in again"));
            }
            Err(e) => return Err(e.message()),
        }
    }
    Ok(tokens)
}

/// The session of a request after [`keep`] has asked the provider, where
/// it is time to: what the shell's documents name, so a sign-in the
/// provider ended shows as signed out.
pub async fn resolve_kept(
    desk: &Shared,
    headers: &HeaderMap,
) -> (Option<Session>, Option<HeaderValue>) {
    if let (Some(id), Mode::Oidc) = (cookie(headers), desk.config.mode)
        && let Some(s) = desk.store.get(&id)
    {
        let _ = keep(desk, &s).await;
    }
    resolve(desk, headers)
}

/// Nobody, for the shell to name: the login page in `local` mode, the
/// provider in `oidc` mode.
pub fn nobody() -> Person {
    Person {
        subject: String::new(),
        display_name: String::new(),
        access: Access::default(),
        groups: Vec::new(),
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
    let (session, set) = resolve_kept(&desk, &headers).await;
    let person = session.as_ref().map(|s| person(&desk, s));
    let mut r = axum::Json(json!({
        "person": person.map(|p| p.as_json()),
        "mode": desk.config.mode.to_string(),
        "login": match desk.config.mode {
            Mode::Off => Value::Null,
            Mode::Local => json!({"kind": "password", "url": "/desk/login", "nobody_yet": !desk.store.has_users()}),
            Mode::Oidc => json!({"kind": "redirect", "url": "/desk/login", "choose": "/desk/login?prompt=login"}),
        },
    }))
    .into_response();
    if let Some(v) = set {
        r.headers_mut().insert(header::SET_COOKIE, v);
    }
    r
}

/// `POST /desk/login` in `local` mode: username and password for a session,
/// from the desk's own origin, so another site cannot sign a browser in as
/// someone else.
pub async fn login(
    State(desk): State<Shared>,
    headers: HeaderMap,
    axum::Json(body): axum::Json<Value>,
) -> Response {
    if desk.config.mode != Mode::Local {
        return error(
            StatusCode::NOT_FOUND,
            "this desk takes no password; see /desk/session for how to log in",
        );
    }
    if let Err(why) = same_origin(&desk.config.origins(), &headers) {
        return error(StatusCode::FORBIDDEN, why);
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
    desk.store
        .saw(&user.username, &user.display, &Claims::default());
    match desk.store.create(
        &user.username,
        &user.display,
        &Claims::default(),
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
/// `nils login --desk`, with what the person holds now.
pub async fn cli_login(
    State(desk): State<Shared>,
    axum::Json(body): axum::Json<Value>,
) -> Response {
    let (Mode::Local, Some(issuer)) = (desk.config.mode, &desk.issuer) else {
        return error(
            StatusCode::NOT_FOUND,
            "this desk mints no tokens for the command line; it is not in local mode",
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
    let access = desk.store.access(&user.username, None).access;
    match issuer.mint(&user.username, &user.username, &user.display, &access, crate::issuer::CLI_TOKEN_HOURS * 60) {
        Ok((token, exp)) => axum::Json(json!({"token": token, "expires_at": exp, "issuer": issuer.origin, "audience": issuer.audience})).into_response(),
        Err(e) => error(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

#[derive(serde::Deserialize)]
pub struct Begin {
    prompt: Option<String>,
}

/// `GET /desk/login` in `oidc` mode: to the provider, with PKCE. With
/// `?prompt=login` the provider signs the person in afresh, so they can
/// pick another account than the one it already knows in this browser.
pub async fn begin(State(desk): State<Shared>, Query(q): Query<Begin>) -> Response {
    let Some(client) = &desk.oidc else {
        return error(
            StatusCode::NOT_FOUND,
            "this desk has no provider; see /desk/session for how to log in",
        );
    };
    let choose = match q.prompt.as_deref() {
        None => false,
        Some("login") => true,
        Some(_) => return error(StatusCode::BAD_REQUEST, "prompt takes only login"),
    };
    let redirect = format!("{}/desk/callback", desk.config.origin.trim_end_matches('/'));
    match client.begin(&redirect, choose).await {
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

/// `GET /desk/callback`: the code for a session, which keeps the provider's
/// groups and legacy entitlements from this sign-in. The person of a
/// session is fixed at this moment and never read from the provider again;
/// a sign-in in a browser that held a session ends that one, so one browser
/// never holds two people.
pub async fn callback(
    State(desk): State<Shared>,
    headers: HeaderMap,
    Query(q): Query<Callback>,
) -> Response {
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
            let claims = Claims {
                groups: a.groups,
                roles: a.roles,
                username: a.username,
            };
            desk.store.saw(&a.subject, &a.display, &claims);
            if let Some(id) = cookie(&headers) {
                desk.store.delete(&id);
            }
            match desk
                .store
                .create(&a.subject, &a.display, &claims, &a.tokens, HOURS)
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

/// `POST /desk/logout`, from the desk's own origin: the desk's session
/// ends, and in `oidc` mode the answer names where the browser goes next to
/// end the person's session at the provider too (`then`), so the next
/// sign-in asks who it is rather than signing the same person in again.
pub async fn logout(State(desk): State<Shared>, headers: HeaderMap) -> Response {
    if let Err(why) = same_origin(&desk.config.origins(), &headers) {
        return error(StatusCode::FORBIDDEN, why);
    }
    let mut id_token = None;
    if let Some(id) = cookie(&headers) {
        id_token = desk
            .store
            .get(&id)
            .and_then(|s| s.tokens["id_token"].as_str().map(str::to_string));
        desk.store.delete(&id);
    }
    let then = match &desk.oidc {
        Some(client) => {
            let back = format!("{}/", desk.config.origin.trim_end_matches('/'));
            client.end_session(id_token.as_deref(), &back).await
        }
        None => None,
    };
    let mut r = match then {
        Some(url) => axum::Json(json!({"then": url})).into_response(),
        None => StatusCode::NO_CONTENT.into_response(),
    };
    r.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_static("nils_desk=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"),
    );
    r
}

#[derive(serde::Deserialize)]
pub struct LogoutToken {
    logout_token: Option<String>,
}

/// `POST /desk/backchannel-logout` in `oidc` mode (OpenID Connect
/// Back-Channel Logout 1.0): the provider says a person's session there has
/// ended, and the desk's sessions that came from it end too; those of the
/// subject when the token names no session.
pub async fn backchannel(
    State(desk): State<Shared>,
    axum::Form(f): axum::Form<LogoutToken>,
) -> Response {
    let Some(client) = &desk.oidc else {
        return error(StatusCode::NOT_FOUND, "this desk has no provider");
    };
    let Some(token) = f.logout_token else {
        return error(StatusCode::BAD_REQUEST, "logout_token");
    };
    let (sub, sid) = match client.logout_token(&token).await {
        Ok(v) => v,
        Err(e) => return error(StatusCode::BAD_REQUEST, e),
    };
    let ended = desk.store.end_sessions(sub.as_deref(), sid.as_deref());
    tracing::info!(ended, "a back-channel logout from the provider");
    let mut r = StatusCode::OK.into_response();
    r.headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    r
}

// --- the issuer's documents, wherever the desk signs for its people

pub async fn jwks(State(desk): State<Shared>) -> Response {
    match &desk.issuer {
        Some(i) => axum::Json(i.jwks()).into_response(),
        None => error(StatusCode::NOT_FOUND, "this desk is not an issuer"),
    }
}

pub async fn discovery(State(desk): State<Shared>) -> Response {
    match &desk.issuer {
        Some(i) => axum::Json(i.discovery(desk.config.mode == Mode::Local)).into_response(),
        None => error(StatusCode::NOT_FOUND, "this desk is not an issuer"),
    }
}
