// SPDX-License-Identifier: AGPL-3.0-only

//! The desk against a fake engine: the capabilities document composes the
//! parts and their absence, a cross-origin write is refused, a same-origin
//! write is proxied with the desk's bearer, and an engine speaking a
//! contract the desk does not is refused by name (Wave 4c §7.1, §7.2,
//! §5.4, §6.7).

use std::sync::Arc;

use axum::Router;
use axum::extract::Request;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{any, get};
use serde_json::{Value, json};

/// A fake engine: capabilities with the given contract versions, a jobs
/// door that echoes what it got and the bearer it saw.
async fn fake_engine(openapi: &'static str) -> String {
    let app = Router::new()
        .route(
            "/api/capabilities",
            get(move || async move {
                axum::Json(json!({
                    "engine": {"name": "nils", "version": "1.0.0-alpha.0"},
                    "contracts": {"openapi": openapi, "review_item": "4", "pack": "4", "suite": "1", "mcp": "1"},
                    "doors": ["GET /api/capabilities", "POST /api/jobs", "GET /api/jobs", "POST /api/ask/run", "GET /api/ask/handles", "GET /api/packs"],
                    "policy": [], "auth": "token", "principal": "desk@lab",
                    "roles": ["reader", "reviewer", "operator", "admin"],
                    "registry": {"epoch": 7}, "packs": [{"name": "mri", "version": "0.1.1"}],
                }))
            }),
        )
        .route(
            "/api/jobs",
            any(|headers: HeaderMap, req: Request| async move {
                let bearer = headers.get("authorization").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
                let body = axum::body::to_bytes(req.into_body(), 1 << 20).await.unwrap();
                (StatusCode::ACCEPTED, axum::Json(json!({"job": 1, "state": "queued", "bearer": bearer, "got": String::from_utf8_lossy(&body)})))
            }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    url
}

async fn desk(engine: &str, assistant: Option<&str>) -> (String, Arc<nils_desk::Desk>) {
    let dir = tempfile::tempdir().unwrap();
    let store = dir.path().join("desk.sqlite");
    std::mem::forget(dir);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let mut text = format!(
        "origin = \"{origin}\"\nstore = \"{}\"\n[engine]\nurl = \"{engine}\"\ntoken = \"a-desk-token-of-length-x\"\n",
        store.display()
    );
    if let Some(a) = assistant {
        text += &format!("[assistant]\nurl = \"{a}\"\n");
    }
    let shared = nils_desk::start(&text).unwrap();
    let app = nils_desk::router(shared.clone());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (origin, shared)
}

#[tokio::test]
async fn the_document_composes_the_parts_and_their_absence() {
    let engine = fake_engine("3").await;
    let (origin, _) = desk(&engine, None).await;
    let client = reqwest::Client::new();
    let r = client
        .get(format!("{origin}/desk/capabilities"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    assert!(
        r.headers().get("set-cookie").is_some(),
        "a session on the first visit"
    );
    let doc: Value = r.json().await.unwrap();
    assert_eq!(doc["engine"]["engine"]["name"], "nils", "{doc}");
    assert_eq!(doc["engine"]["registry"]["epoch"], 7);
    assert!(doc["assistant"].is_null(), "no assistant answered: {doc}");
    assert!(doc["kvasir"].is_null());
    assert_eq!(
        doc["person"]["entitlements"],
        json!(["reader", "reviewer", "operator", "admin", "assist"])
    );
    assert_eq!(doc["desk"]["mode"], "off");
    assert_eq!(doc["desk"]["engine_reachable"], true);
    assert!(doc["desk"]["contract_mismatch"].is_null(), "{doc}");
    // the suite's required keys of the engine part are there
    for key in [
        "engine",
        "contracts",
        "doors",
        "policy",
        "auth",
        "principal",
        "roles",
        "registry",
        "packs",
    ] {
        assert!(!doc["engine"][key].is_null(), "{key}");
    }
}

#[tokio::test]
async fn a_cross_origin_write_is_refused_and_a_same_origin_one_is_proxied_with_the_bearer() {
    let engine = fake_engine("3").await;
    let (origin, _) = desk(&engine, None).await;
    let client = reqwest::Client::new();
    let body = r#"{"command": ["backup"]}"#;
    // a form post from elsewhere: no desk header
    let r = client
        .post(format!("{origin}/api/jobs"))
        .header("origin", "https://evil.example")
        .body(body)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403, "{}", r.text().await.unwrap());
    // the header but another origin
    let r = client
        .post(format!("{origin}/api/jobs"))
        .header("x-nils-desk", "1")
        .header("origin", "https://evil.example")
        .body(body)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403);
    // the header and neither origin nor referer
    let r = client
        .post(format!("{origin}/api/jobs"))
        .header("x-nils-desk", "1")
        .body(body)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403);
    // the desk's own front end
    let r = client
        .post(format!("{origin}/api/jobs"))
        .header("x-nils-desk", "1")
        .header("origin", &origin)
        .body(body)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 202);
    let doc: Value = r.json().await.unwrap();
    assert_eq!(
        doc["bearer"], "Bearer a-desk-token-of-length-x",
        "the desk's token, never the browser's: {doc}"
    );
    assert_eq!(doc["got"], body);
    // a read needs nothing
    let r = client
        .get(format!("{origin}/api/capabilities"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    // a part this deployment has not got
    let r = client
        .get(format!("{origin}/assistant/capabilities"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 404);
}

#[tokio::test]
async fn an_engine_speaking_a_contract_the_desk_does_not_is_refused_by_name() {
    let engine = fake_engine("2").await;
    let text = format!(
        "origin = \"http://127.0.0.1:1\"\nstore = \":memory:\"\n[engine]\nurl = \"{engine}\"\n"
    );
    let shared = nils_desk::start(&text).unwrap();
    let caps = nils_desk::capabilities::engine(&shared).await.unwrap();
    let e = nils_desk::capabilities::check(&caps).expect_err("refused");
    assert!(e.major);
    assert!(e.message.contains("openapi 2 against 3"), "{}", e.message);
    assert!(e.message.contains("does not start"), "{}", e.message);
    // an engine ahead of the desk is a warning the shell shows, not a refusal
    let ahead = fake_engine("4").await;
    let text = format!(
        "origin = \"http://127.0.0.1:1\"\nstore = \":memory:\"\n[engine]\nurl = \"{ahead}\"\n"
    );
    let shared = nils_desk::start(&text).unwrap();
    let caps = nils_desk::capabilities::engine(&shared).await.unwrap();
    let m = nils_desk::capabilities::check(&caps)
        .unwrap()
        .expect("a warning");
    assert!(!m.major);
    assert!(m.message.contains("ahead"), "{}", m.message);
}

#[tokio::test]
async fn a_registered_app_that_answers_is_in_the_document_and_one_that_does_not_is_its_absence() {
    let engine = fake_engine("3").await;
    let app = Router::new().route(
        "/capabilities",
        get(|| async { axum::Json(json!({"version": "1"})) }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let app_url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let text = format!(
        "origin = \"http://127.0.0.1:1\"\nstore = \":memory:\"\n[engine]\nurl = \"{engine}\"\n[[apps]]\nid = \"pipelines\"\ntitle = \"Analysis pipelines\"\nurl = \"{app_url}\"\nentitlement = \"operator\"\n[[apps]]\nid = \"silent\"\ntitle = \"Silent\"\nurl = \"http://127.0.0.1:9\"\nentitlement = \"reader\"\n"
    );
    let shared = nils_desk::start(&text).unwrap();
    let person = nils_desk::session::Person {
        subject: "anna".into(),
        display_name: "Anna".into(),
        entitlements: vec!["operator".to_string()],
    };
    let doc = nils_desk::capabilities::document(&shared, &person).await;
    let apps = doc["apps"].as_array().unwrap();
    assert_eq!(apps.len(), 2, "{doc}");
    assert_eq!(apps[0]["id"], "pipelines");
    assert_eq!(apps[0]["capabilities"]["version"], "1");
    assert!(apps[1]["capabilities"].is_null(), "absence is null: {doc}");
}
