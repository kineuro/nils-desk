// SPDX-License-Identifier: AGPL-3.0-only

//! Wave 4c §7.7 and §5.5: the desk's part of the assistant pane. A browser
//! never holds a token, so the pane cannot push one itself: the desk mints
//! or refreshes the person's bearer, as it does for every proxied call, and
//! hands it to the assistant for one conversation, before the one it took
//! on the last prompt expires.

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use crate::Shared;
use crate::proxy::{bearer, same_origin};
use crate::session;

fn error(status: StatusCode, message: impl Into<String>) -> Response {
    (status, axum::Json(json!({"error": message.into()}))).into_response()
}

/// `POST /desk/assistant/conversations/{id}/token`: the person's fresh
/// bearer, pushed to the assistant for that conversation.
pub async fn push_token(
    State(desk): State<Shared>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Response {
    if let Err(why) = same_origin(&desk.config.origin, &headers) {
        return error(StatusCode::FORBIDDEN, why);
    }
    let Some(up) = crate::proxy::assistant_upstream(&desk) else {
        return error(StatusCode::NOT_FOUND, "this deployment has no assistant");
    };
    if !matches!(desk.config.mode, crate::config::Mode::Off) {
        let (s, _) = session::resolve(&desk, &headers);
        let Some(s) = s else {
            return error(StatusCode::UNAUTHORIZED, "no session; log in at the desk");
        };
        if !session::person(&desk, &s).holds("assist") {
            return error(
                StatusCode::FORBIDDEN,
                "the assistant needs the assist entitlement",
            );
        }
    }
    let token = match bearer(&desk, &up, &headers).await {
        Ok(Some(t)) => t,
        Ok(None) => {
            return error(
                StatusCode::NOT_FOUND,
                "this desk holds no token for the assistant",
            );
        }
        Err(e) => return error(StatusCode::UNAUTHORIZED, e),
    };
    let target = format!(
        "{}/conversations/{}/token",
        up.url.trim_end_matches('/'),
        urlencoding(&id)
    );
    match desk
        .http
        .post(&target)
        .json(&json!({"token": token}))
        .send()
        .await
    {
        Ok(r) => {
            let status =
                StatusCode::from_u16(r.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
            let body: Value = r.json().await.unwrap_or(Value::Null);
            (status, axum::Json(body)).into_response()
        }
        Err(e) => error(
            StatusCode::BAD_GATEWAY,
            format!("the assistant did not answer: {e}"),
        ),
    }
}

fn urlencoding(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}
