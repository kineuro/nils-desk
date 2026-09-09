// SPDX-License-Identifier: AGPL-3.0-only

//! The session: a cookie (`Secure` behind https, `HttpOnly`, `SameSite=Lax`)
//! naming a row in the store. In `off` mode the one person is the operator
//! at the keyboard, holding every entitlement, and a session is made on the
//! first visit.

use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use crate::config::Mode;
use crate::{Shared, store::Session};

pub const COOKIE: &str = "nils_desk";
const HOURS: i64 = 12;

/// The person of a session, as the capabilities document names them
/// (`contracts/suite/v1/capabilities.schema.json`, `person`).
#[derive(Debug, Clone)]
pub struct Person {
    pub subject: String,
    pub display_name: String,
    pub entitlements: Vec<&'static str>,
}

impl Person {
    pub fn roles(&self) -> Vec<&'static str> {
        self.entitlements
            .iter()
            .copied()
            .filter(|e| *e != "assist")
            .collect()
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

/// The session of a request, made on the first visit in `off` mode. The
/// second value is a cookie to set when one was made.
pub fn resolve(desk: &Shared, headers: &HeaderMap) -> (Session, Option<HeaderValue>) {
    if let Some(id) = cookie(headers)
        && let Some(s) = desk.store.get(&id)
    {
        return (s, None);
    }
    match desk.config.mode {
        Mode::Off => {
            let s = desk
                .store
                .create("operator", "the operator", HOURS)
                .unwrap_or_else(|_| Session {
                    id: String::new(),
                    subject: "operator".into(),
                    display: "the operator".into(),
                });
            let secure = if desk.config.origin.starts_with("https://") {
                "; Secure"
            } else {
                ""
            };
            let set = format!(
                "{COOKIE}={}; Path=/; HttpOnly; SameSite=Lax; Max-Age={}{secure}",
                s.id,
                HOURS * 3600
            );
            (s, HeaderValue::from_str(&set).ok())
        }
        _ => unreachable!("only off mode is built"),
    }
}

pub fn person(desk: &Shared, session: &Session) -> Person {
    match desk.config.mode {
        Mode::Off => Person {
            subject: session.subject.clone(),
            display_name: session.display.clone(),
            entitlements: vec!["reader", "reviewer", "operator", "admin", "assist"],
        },
        _ => unreachable!("only off mode is built"),
    }
}

fn cookie(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    raw.split(';')
        .map(str::trim)
        .find_map(|c| c.strip_prefix(COOKIE).and_then(|r| r.strip_prefix('=')))
        .map(str::to_string)
}

pub async fn door(State(desk): State<Shared>, headers: HeaderMap) -> Response {
    let (session, set) = resolve(&desk, &headers);
    let person = person(&desk, &session);
    let mut r =
        axum::Json(json!({"person": person.as_json(), "mode": desk.config.mode.to_string()}))
            .into_response();
    if let Some(v) = set {
        r.headers_mut().insert(header::SET_COOKIE, v);
    }
    r
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
