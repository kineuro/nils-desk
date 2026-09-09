// SPDX-License-Identifier: AGPL-3.0-only

//! The deployment capabilities document (Wave 4c §4.3), the one object
//! every section, control and menu item is a predicate over, as
//! `contracts/suite/v1/capabilities.schema.json` fixes it: the engine's own
//! document verbatim, Kvasir's, the assistant's and each app's (or their
//! absence), the person, and the desk with the named states of §7.2.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::extract::State;
use axum::http::{HeaderMap, header};
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use crate::config::Upstream;
use crate::{OPENAPI, SUITE, Shared, VERSION, session};

const FRESH: Duration = Duration::from_secs(5);

/// The parts' documents, fetched together and kept briefly.
#[derive(Default)]
pub struct Cache {
    inner: Mutex<Option<(Instant, Parts)>>,
}

#[derive(Clone)]
pub struct Parts {
    pub engine: Result<Value, String>,
    pub kvasir: Option<Value>,
    pub assistant: Option<Value>,
    pub apps: Vec<(String, Option<Value>)>,
}

#[derive(Debug)]
pub struct Mismatch {
    pub found: Value,
    pub speaks: Value,
    pub major: bool,
    pub message: String,
}

/// The engine's own document, with the desk's bearer.
pub async fn engine(desk: &Shared) -> Result<Value, String> {
    fetch(desk, &desk.config.engine, "/api/capabilities").await
}

async fn fetch(desk: &Shared, up: &Upstream, path: &str) -> Result<Value, String> {
    let mut req = desk
        .http
        .get(format!("{}{path}", up.url.trim_end_matches('/')))
        .timeout(Duration::from_secs(5));
    if let Some(t) = &up.token {
        req = req.bearer_auth(t);
    }
    let r = req.send().await.map_err(|e| e.to_string())?;
    if !r.status().is_success() {
        return Err(format!("{path} answered {}", r.status()));
    }
    r.json().await.map_err(|e| e.to_string())
}

/// The engine's contract versions against this desk's (Wave 4c §6.7): a
/// version the desk does not speak refuses, by name; an engine ahead of the
/// desk is a warning the shell also shows.
pub fn check(engine: &Value) -> Result<Option<Mismatch>, Box<Mismatch>> {
    let found = json!({
        "openapi": engine["contracts"]["openapi"].as_str().unwrap_or(""),
        "suite": engine["contracts"]["suite"].as_str().unwrap_or(""),
    });
    let speaks = json!({"openapi": OPENAPI, "suite": SUITE});
    let num = |v: &Value| v.as_str().and_then(|s| s.trim().parse::<u32>().ok());
    let mut behind = Vec::new();
    let mut ahead = Vec::new();
    for name in ["openapi", "suite"] {
        let (f, s) = (num(&found[name]), num(&speaks[name]).unwrap_or(0));
        match f {
            None => behind.push(format!("{name} (the engine names none)")),
            Some(f) if f < s => behind.push(format!("{name} {f} against {s}")),
            Some(f) if f > s => ahead.push(format!("{name} {f} against {s}")),
            _ => {}
        }
    }
    if !behind.is_empty() {
        let message = format!(
            "contract mismatch: the engine speaks {} and this desk speaks openapi {OPENAPI} and suite {SUITE}; the desk does not start",
            behind.join(", ")
        );
        return Err(Box::new(Mismatch {
            found,
            speaks,
            major: true,
            message,
        }));
    }
    if !ahead.is_empty() {
        let message = format!(
            "the engine is ahead of this desk: {}; what the desk does not know it does not show",
            ahead.join(", ")
        );
        return Ok(Some(Mismatch {
            found,
            speaks,
            major: false,
            message,
        }));
    }
    Ok(None)
}

async fn parts(desk: &Shared) -> Parts {
    if let Some((at, p)) = desk
        .caps
        .inner
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
        && at.elapsed() < FRESH
    {
        return p;
    }
    let engine = engine(desk).await;
    let kvasir = match &desk.config.kvasir {
        Some(up) => fetch(desk, up, "/v1/config").await.ok(),
        None => None,
    };
    let assistant = match &desk.config.assistant {
        Some(up) => fetch(desk, up, "/capabilities").await.ok(),
        None => None,
    };
    let mut apps = Vec::new();
    for a in &desk.config.apps {
        let up = Upstream {
            url: a.url.clone(),
            token: None,
        };
        apps.push((a.id.clone(), fetch(desk, &up, &a.capabilities).await.ok()));
    }
    let p = Parts {
        engine,
        kvasir,
        assistant,
        apps,
    };
    *desk.caps.inner.lock().unwrap_or_else(|e| e.into_inner()) = Some((Instant::now(), p.clone()));
    p
}

/// The document for one person.
pub async fn document(desk: &Shared, person: &session::Person) -> Value {
    let p = parts(desk).await;
    let (engine, reachable, mismatch) = match &p.engine {
        Ok(e) => {
            let m = match check(e) {
                Ok(None) => Value::Null,
                Ok(Some(m)) => {
                    json!({"found": m.found, "speaks": m.speaks, "major": m.major, "message": m.message})
                }
                Err(m) => {
                    json!({"found": m.found, "speaks": m.speaks, "major": m.major, "message": m.message})
                }
            };
            (e.clone(), true, m)
        }
        Err(_) => (Value::Null, false, Value::Null),
    };
    json!({
        "engine": engine,
        "kvasir": p.kvasir,
        "assistant": p.assistant,
        "apps": p.apps.iter().map(|(id, caps)| {
            let a = desk.config.app(id);
            json!({"id": id, "title": a.map(|a| a.title.clone()), "entitlement": a.map(|a| a.entitlement.clone()), "capabilities": caps})
        }).collect::<Vec<_>>(),
        "person": person.as_json(),
        "desk": {
            "version": VERSION,
            "mode": desk.config.mode.to_string(),
            "contracts": {"openapi": OPENAPI, "suite": SUITE},
            "engine_reachable": reachable,
            "contract_mismatch": mismatch,
        },
    })
}

pub async fn door(State(desk): State<Shared>, headers: HeaderMap) -> Response {
    let (session, set) = session::resolve(&desk, &headers);
    let person = session::person(&desk, &session);
    let doc = document(&desk, &person).await;
    let mut r = axum::Json(doc).into_response();
    if let Some(v) = set {
        r.headers_mut().insert(header::SET_COOKIE, v);
    }
    r
}
