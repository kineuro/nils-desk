// SPDX-License-Identifier: AGPL-3.0-only

//! The deployment capabilities document (Wave 4c §4.3), the one object
//! every section, control and menu item is a predicate over, as
//! `contracts/suite/v3/capabilities.schema.json` fixes it: the engine's own
//! document verbatim, Kvasir's, the assistant's and each app's (or their
//! absence), the person, and the desk with the named states of §7.2.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::extract::State;
use axum::http::{HeaderMap, header};
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use crate::config::Upstream;
use crate::{OPENAPI, OPENAPI_FLOOR, SUITE, SUITE_FLOOR, Shared, VERSION, session};

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
    /// Which side of this desk the engine is on, `"ahead"` or `"behind"`, so
    /// that the shell says which of the two is the older without working it
    /// out from the numbers again.
    pub direction: &'static str,
    pub message: String,
}

/// The engine's own document, with the desk's bearer.
pub async fn engine(desk: &Shared) -> Result<Value, String> {
    fetch(desk, &desk.config.engine, "/api/capabilities").await
}

/// The engine's document as one person: with the bearer the session opens
/// (Wave 4c §5.5), so the grants and the doors are that person's. In `off`
/// mode the bearer is the desk's own.
pub async fn engine_as(desk: &Shared, headers: &HeaderMap) -> Result<Value, String> {
    let up = &desk.config.engine;
    let token = match crate::proxy::bearer(desk, up, headers).await {
        Ok(t) => t,
        Err(why) => return Err(format!("/api/capabilities: {why}")),
    };
    let with = Upstream {
        url: up.url.clone(),
        token,
    };
    fetch(desk, &with, "/api/capabilities").await
}

/// Kvasir's catalog as one person: with the bearer the session opens, as the
/// desk's proxy sends it (Wave 4c §5.5). Where people sign in, Kvasir refuses
/// a read with no credential, and a desk that asked only with its own took
/// Kvasir for absent and hid the Kvasir page.
pub async fn kvasir_as(desk: &Shared, headers: &HeaderMap) -> Result<Value, String> {
    let Some(up) = &desk.config.kvasir else {
        return Err("/v1/config: no Kvasir is configured".to_string());
    };
    let token = match crate::proxy::bearer(desk, up, headers).await {
        Ok(t) => t,
        Err(why) => return Err(format!("/v1/config: {why}")),
    };
    let with = Upstream {
        url: up.url.clone(),
        token,
    };
    fetch(desk, &with, "/v1/config").await
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

/// The engine's contract versions against this desk's (Wave 4c §6.7, record
/// 28). The floor decides, not the version the desk was generated from: an
/// engine below the floor is refused by name, since the desk needs doors it
/// does not serve. An engine at or above the floor and below what the desk
/// was generated from is older and still usable, because a contract only ever
/// adds doors and the desk asks whether a door is served before it uses one;
/// that is a note, never a refusal. An engine ahead of the desk is a warning
/// the shell also shows.
pub fn check(engine: &Value) -> Result<Option<Mismatch>, Box<Mismatch>> {
    let found = json!({
        "openapi": engine["contracts"]["openapi"].as_str().unwrap_or(""),
        "suite": engine["contracts"]["suite"].as_str().unwrap_or(""),
    });
    let speaks = json!({"openapi": OPENAPI, "suite": SUITE});
    let floor = json!({"openapi": OPENAPI_FLOOR, "suite": SUITE_FLOOR});
    let num = |v: &Value| v.as_str().and_then(|s| s.trim().parse::<u32>().ok());
    // below the floor, so a door the desk needs is missing: the desk refuses
    let mut under = Vec::new();
    // at or above the floor and behind this desk: usable, and worth saying
    let mut older = Vec::new();
    let mut ahead = Vec::new();
    for name in ["openapi", "suite"] {
        let s = num(&speaks[name]).unwrap_or(0);
        let bottom = num(&floor[name]).unwrap_or(0);
        match num(&found[name]) {
            None => under.push(format!("{name} (the engine names none)")),
            Some(f) if f < bottom => under.push(format!("{name} {f} against {bottom}")),
            Some(f) if f < s => older.push(format!("{name} {f} against {s}")),
            Some(f) if f > s => ahead.push(format!("{name} {f} against {s}")),
            _ => {}
        }
    }
    if !under.is_empty() {
        let message = format!(
            "contract mismatch: the engine speaks {}, and this desk needs at least openapi {OPENAPI_FLOOR} and suite {SUITE_FLOOR}; the desk does not start",
            under.join(", ")
        );
        return Err(Box::new(Mismatch {
            found,
            speaks,
            major: true,
            direction: "behind",
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
            direction: "ahead",
            message,
        }));
    }
    if !older.is_empty() {
        let message = format!(
            "the engine is older than this desk: {}; it serves every door the desk needs, and what it does not serve the desk does not show",
            older.join(", ")
        );
        return Ok(Some(Mismatch {
            found,
            speaks,
            major: false,
            direction: "behind",
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

/// §7.6: the flags to paste on `nils serve` where people sign in: the
/// desk's own issuer, whose tokens carry the grants and the detail the
/// engine reads as they are and whose subjects it keeps as they are, and in
/// `oidc` mode the provider beside it, whose own tokens (the command line's)
/// still map their groups through `--role` and whose subjects the engine
/// qualifies. None in `off` mode.
fn engine_flags(desk: &Shared) -> Value {
    let origin = desk.config.origin.trim_end_matches('/');
    let own = format!(
        "--oidc-trust issuer={origin},audience={a},jwks={origin}/.well-known/jwks.json,keep_subject=true",
        a = desk.config.local.audience
    );
    match desk.config.mode {
        crate::config::Mode::Off => Value::Null,
        crate::config::Mode::Local => Value::from(format!("--auth oidc {own}")),
        crate::config::Mode::Oidc => match &desk.config.oidc {
            Some(o) => {
                let roles = crate::grants::LADDER
                    .iter()
                    .map(|r| format!("--role {r}={r}"))
                    .collect::<Vec<_>>()
                    .join(" ");
                Value::from(format!(
                    "--auth oidc {own} --oidc-trust issuer={i},audience={a},jwks={i}/jwks/ --oidc-groups-claim {c} {roles}",
                    i = o.issuer.trim_end_matches('/'),
                    a = o.client_id,
                    c = o.roles_claim
                ))
            }
            None => Value::Null,
        },
    }
}

/// The document for one person.
pub async fn document(
    desk: &Shared,
    person: &session::Person,
    headers: Option<&HeaderMap>,
) -> Value {
    let mut p = parts(desk).await;
    // the engine is asked as the person when there is one: its answer is theirs, not the desk's
    if let Some(h) = headers
        && !person.subject.is_empty()
    {
        p.engine = engine_as(desk, h).await;
        // where the desk's own read of Kvasir had nothing, as wherever Kvasir signs people in, it asks as the person
        if p.kvasir.is_none() && desk.config.kvasir.is_some() {
            p.kvasir = kvasir_as(desk, h).await.ok();
        }
    }
    let (engine, reachable, mismatch) = match &p.engine {
        Ok(e) => {
            let m = match check(e) {
                Ok(None) => Value::Null,
                Ok(Some(m)) => {
                    json!({"found": m.found, "speaks": m.speaks, "major": m.major, "direction": m.direction, "message": m.message})
                }
                Err(m) => {
                    json!({"found": m.found, "speaks": m.speaks, "major": m.major, "direction": m.direction, "message": m.message})
                }
            };
            (e.clone(), true, m)
        }
        // an engine that answered 401 or 403 is reachable; it refused this person's bearer, or the probe had none
        Err(m) => (
            Value::Null,
            m.contains("401") || m.contains("403"),
            Value::Null,
        ),
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
            "login": match desk.config.mode {
                crate::config::Mode::Off => Value::Null,
                // nobody_yet: the desk keeps no one to sign in, so the login page says how to add the first person
                crate::config::Mode::Local => json!({"kind": "password", "url": "/desk/login", "nobody_yet": !desk.store.has_users()}),
                crate::config::Mode::Oidc => json!({"kind": "redirect", "url": "/desk/login"}),
            },
            "signed_in": !person.subject.is_empty(),
            // §7.4: whether this person may export, by the desk's setting
            "export": if desk.config.export != "off" && person.holds_name(&desk.config.export) { Value::from(desk.config.export.clone()) } else { Value::Null },
            // §7.6: the desk's own settings, read only here; each is owned
            // and enforced by the desk and changed in its configuration file
            "settings": {
                "origin": desk.config.origin,
                "engine_url": desk.config.engine.url,
                "kvasir_url": desk.config.kvasir.as_ref().map(|u| u.url.clone()),
                "supervisor_url": desk.config.supervisor.as_ref().map(|u| u.url.clone()),
                "assistant_url": desk.config.assistant.as_ref().map(|u| u.url.clone()),
                "session_hours": session::HOURS,
                "token_minutes": crate::issuer::TOKEN_MINUTES,
                "cli_token_hours": crate::issuer::CLI_TOKEN_HOURS,
                "export": desk.config.export,
                "store": desk.config.store.display().to_string(),
                // Wave 5 §10.5: the other addresses this desk answers at, and how it signs people in; never a secret
                "also_origins": desk.config.also_origins,
                // where people sign in the desk signs the parts' tokens with its own key, under oidc too
                "signing": match desk.config.mode {
                    crate::config::Mode::Local => json!({"key": desk.config.local.key.display().to_string(), "audience": desk.config.local.audience}),
                    crate::config::Mode::Oidc => desk.config.oidc.as_ref().map_or(Value::Null, |o| json!({"issuer": o.issuer, "client_id": o.client_id, "roles_claim": o.roles_claim, "groups_claim": o.groups_claim, "key": desk.config.local.key.display().to_string(), "audience": desk.config.local.audience})),
                    crate::config::Mode::Off => Value::Null,
                },
                "retention": "sessions expire after the session lifetime; display names, local users, the record of runs and document lineage are kept until removed with the desk stopped; groups and what each person holds are kept until an admin changes them",
                "engine_flags": engine_flags(desk),
            },
        },
    })
}

pub async fn door(State(desk): State<Shared>, headers: HeaderMap) -> Response {
    let (session, set) = session::resolve(&desk, &headers);
    let person = match &session {
        Some(s) => session::person(&desk, s),
        None => session::nobody(),
    };
    let doc = document(&desk, &person, Some(&headers)).await;
    let mut r = axum::Json(doc).into_response();
    if let Some(v) = set {
        r.headers_mut().insert(header::SET_COOKIE, v);
    }
    r
}
