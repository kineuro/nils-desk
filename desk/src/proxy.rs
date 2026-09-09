// SPDX-License-Identifier: AGPL-3.0-only

//! The proxy: `/api/*` to the engine, `/kvasir/*`, `/assistant/*` and
//! `/apps/{id}/*` to the parts, with the bearer the desk holds attached and
//! the cross-origin defences of Wave 4c §5.4: every non-GET needs the header
//! `X-Nils-Desk: 1`, which a cross-origin form cannot send, and an `Origin`
//! or `Referer` that matches the desk's own origin.

use axum::body::Body;
use axum::extract::{Path, Request, State};
use axum::http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use serde_json::json;

use crate::Shared;
use crate::config::{Mode, Upstream};
use crate::session;

/// The bearer a proxied call carries (Wave 4c §5.4, §5.5).
async fn bearer(
    desk: &Shared,
    up: &Upstream,
    headers: &HeaderMap,
) -> Result<Option<String>, String> {
    match desk.config.mode {
        Mode::Off => Ok(up.token.clone()),
        Mode::Local => {
            let (s, _) = session::resolve(desk, headers);
            let s = s.ok_or("no session; log in at the desk")?;
            let issuer = desk.issuer.as_ref().ok_or("the desk is not an issuer")?;
            let now = time::OffsetDateTime::now_utc().unix_timestamp();
            if let (Some(t), Some(exp)) =
                (s.tokens["access"].as_str(), s.tokens["expires_at"].as_i64())
                && exp - now > 60
            {
                return Ok(Some(t.to_string()));
            }
            let person = session::person(desk, &s);
            let (t, exp) = issuer.mint(
                &person.subject,
                &person.display_name,
                &person.entitlements,
                crate::issuer::TOKEN_MINUTES,
            )?;
            desk.store
                .set_tokens(&s.id, &json!({"access": t, "expires_at": exp}));
            Ok(Some(t))
        }
        Mode::Oidc => {
            let (s, _) = session::resolve(desk, headers);
            let s = s.ok_or("no session; log in at the desk")?;
            let client = desk.oidc.as_ref().ok_or("the desk has no provider")?;
            let tokens = match client.refresh(&s.tokens).await? {
                Some(fresh) => {
                    desk.store.set_tokens(&s.id, &fresh);
                    fresh
                }
                None => s.tokens.clone(),
            };
            Ok(tokens["access"].as_str().map(str::to_string))
        }
    }
}

const BODY_LIMIT: usize = 64 << 20;

pub async fn engine(
    State(desk): State<Shared>,
    Path(rest): Path<String>,
    req: Request,
) -> Response {
    let up = desk.config.engine.clone();
    forward(&desk, &up, &format!("/api/{rest}"), req).await
}

pub async fn kvasir(
    State(desk): State<Shared>,
    Path(rest): Path<String>,
    req: Request,
) -> Response {
    match desk.config.kvasir.clone() {
        Some(up) => forward(&desk, &up, &format!("/{rest}"), req).await,
        None => absent("kvasir"),
    }
}

pub async fn assistant(
    State(desk): State<Shared>,
    Path(rest): Path<String>,
    req: Request,
) -> Response {
    match desk.config.assistant.clone() {
        Some(up) => forward(&desk, &up, &format!("/{rest}"), req).await,
        None => absent("the assistant"),
    }
}

pub async fn app(
    State(desk): State<Shared>,
    Path((app, rest)): Path<(String, String)>,
    req: Request,
) -> Response {
    match desk.config.app(&app) {
        Some(a) => {
            let up = Upstream {
                url: a.url.clone(),
                token: None,
            };
            forward(&desk, &up, &format!("/{rest}"), req).await
        }
        None => absent(&format!("an app named {app}")),
    }
}

fn absent(what: &str) -> Response {
    (
        StatusCode::NOT_FOUND,
        axum::Json(json!({"error": format!("this deployment has no {what}")})),
    )
        .into_response()
}

/// Whether a writing request came from the desk's own front end.
pub fn same_origin(origin: &str, headers: &HeaderMap) -> Result<(), &'static str> {
    if headers.get("x-nils-desk").and_then(|v| v.to_str().ok()) != Some("1") {
        return Err(
            "a write through the desk carries X-Nils-Desk: 1, which a cross-origin form cannot send",
        );
    }
    let origin = origin.trim_end_matches('/');
    if let Some(o) = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
        return if o.trim_end_matches('/') == origin {
            Ok(())
        } else {
            Err("the request's Origin is not this desk")
        };
    }
    if let Some(r) = headers.get(header::REFERER).and_then(|v| v.to_str().ok()) {
        return if r.starts_with(origin) && r[origin.len()..].starts_with('/')
            || r.trim_end_matches('/') == origin
        {
            Ok(())
        } else {
            Err("the request's Referer is not this desk")
        };
    }
    Err("a write through the desk carries an Origin or a Referer, and this one carried neither")
}

fn hop_by_hop(name: &HeaderName) -> bool {
    matches!(
        name.as_str(),
        "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
            | "host"
            | "cookie"
            | "authorization"
            | "content-length"
    )
}

async fn forward(desk: &Shared, up: &Upstream, path: &str, req: Request) -> Response {
    let method = req.method().clone();
    let headers = req.headers().clone();
    if !matches!(method, Method::GET | Method::HEAD | Method::OPTIONS)
        && let Err(why) = same_origin(&desk.config.origin, &headers)
    {
        return (StatusCode::FORBIDDEN, axum::Json(json!({"error": why}))).into_response();
    }
    let uri: Uri = req.uri().clone();
    let target = format!(
        "{}{}{}",
        up.url.trim_end_matches('/'),
        path,
        uri.query().map(|q| format!("?{q}")).unwrap_or_default()
    );
    let body = match axum::body::to_bytes(req.into_body(), BODY_LIMIT).await {
        Ok(b) => b,
        Err(_) => {
            return (
                StatusCode::PAYLOAD_TOO_LARGE,
                axum::Json(json!({"error": "the body is over the desk's limit"})),
            )
                .into_response();
        }
    };
    let mut out = desk.http.request(method, &target);
    for (name, value) in &headers {
        if !hop_by_hop(name) && !name.as_str().starts_with("x-nils-desk") {
            out = out.header(name, value);
        }
    }
    // The bearer: the desk's own in `off` mode; the person's in the others,
    // minted by the desk's issuer or held from the provider and refreshed
    // before its expiry. A browser never sees either.
    match bearer(desk, up, &headers).await {
        Ok(Some(t)) => out = out.bearer_auth(t),
        Ok(None) => {}
        Err(e) => {
            return (StatusCode::UNAUTHORIZED, axum::Json(json!({"error": e}))).into_response();
        }
    }
    let resp = match out.body(body).send().await {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                axum::Json(json!({"error": format!("{} did not answer: {e}", up.url)})),
            )
                .into_response();
        }
    };
    let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let mut builder = Response::builder().status(status);
    for (name, value) in resp.headers() {
        if !hop_by_hop(name)
            && name != header::SET_COOKIE
            && let Ok(v) = HeaderValue::from_bytes(value.as_bytes())
        {
            builder = builder.header(name, v);
        }
    }
    // Streamed through: an event stream or a large document arrives as it
    // is produced, never buffered whole in the desk.
    builder
        .body(Body::from_stream(resp.bytes_stream()))
        .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
}
