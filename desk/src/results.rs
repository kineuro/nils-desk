// SPDX-License-Identifier: AGPL-3.0-only

//! Wave 4c §7.4: the desk's part of the result surface. The engine holds
//! the handles and pages their rows; the desk records which document a run
//! came from and which document followed which (ids only), so a result can
//! be told stale, and it exports a handle as CSV by paging the engine's
//! rows door under the caller's own identity, so every page carries the
//! engine's read audit and the purpose the person typed.

use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use crate::Shared;
use crate::proxy::{bearer, same_origin};
use crate::session::{self, Person};

fn error(status: StatusCode, message: impl Into<String>) -> Response {
    (status, axum::Json(json!({"error": message.into()}))).into_response()
}

fn who(desk: &Shared, headers: &HeaderMap) -> Result<Person, Box<Response>> {
    let (session, _) = session::resolve(desk, headers);
    let s = session.ok_or_else(|| {
        Box::new(error(
            StatusCode::UNAUTHORIZED,
            "no session; log in at the desk",
        ))
    })?;
    let p = session::person(desk, &s);
    if !p.holds("reader") {
        return Err(Box::new(error(
            StatusCode::FORBIDDEN,
            "no entitlement opens the results",
        )));
    }
    Ok(p)
}

/// `GET /desk/results`: the desk's record of runs and of document lineage.
pub async fn list(State(desk): State<Shared>, headers: HeaderMap) -> Response {
    if let Err(r) = who(&desk, &headers) {
        return *r;
    }
    let results: Vec<Value> = desk
        .store
        .results()
        .into_iter()
        .map(|(handle, document, subject, made_at)| json!({"handle": handle, "document": document, "subject": subject, "made_at": made_at}))
        .collect();
    let lineage: Vec<Value> = desk
        .store
        .lineage()
        .into_iter()
        .map(|(document, parent)| json!({"document": document, "parent": parent}))
        .collect();
    axum::Json(
        json!({"results": results, "lineage": lineage, "export": export_of(&desk, &headers)}),
    )
    .into_response()
}

fn export_of(desk: &Shared, headers: &HeaderMap) -> Value {
    match who(desk, headers) {
        Ok(p) if desk.config.export != "off" && p.holds(&desk.config.export) => {
            Value::from(desk.config.export.clone())
        }
        _ => Value::Null,
    }
}

/// `POST /desk/results {handle, document}`: a run happened from a document.
pub async fn record(State(desk): State<Shared>, headers: HeaderMap, body: String) -> Response {
    if let Err(why) = same_origin(&desk.config.origin, &headers) {
        return error(StatusCode::FORBIDDEN, why);
    }
    let p = match who(&desk, &headers) {
        Ok(p) => p,
        Err(r) => return *r,
    };
    let doc: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
    match (doc["handle"].as_i64(), doc["document"].as_i64()) {
        (Some(h), Some(d)) => {
            desk.store.result_put(h, d, &p.subject);
            StatusCode::NO_CONTENT.into_response()
        }
        _ => error(StatusCode::BAD_REQUEST, "handle and document, both ids"),
    }
}

/// `POST /desk/lineage {document, parent}`: an apply made a child.
pub async fn lineage(State(desk): State<Shared>, headers: HeaderMap, body: String) -> Response {
    if let Err(why) = same_origin(&desk.config.origin, &headers) {
        return error(StatusCode::FORBIDDEN, why);
    }
    let p = match who(&desk, &headers) {
        Ok(p) => p,
        Err(r) => return *r,
    };
    let doc: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
    match (doc["document"].as_i64(), doc["parent"].as_i64()) {
        (Some(d), Some(parent)) if d != parent => {
            desk.store.lineage_put(d, parent, &p.subject);
            StatusCode::NO_CONTENT.into_response()
        }
        _ => error(
            StatusCode::BAD_REQUEST,
            "document and parent, two different ids",
        ),
    }
}

#[derive(serde::Deserialize)]
pub struct ExportQuery {
    pub purpose: Option<String>,
}

/// `GET /desk/export/{handle}?purpose=`: the handle's rows as CSV, paged
/// from the engine under the caller's identity. The engine refuses a handle
/// beyond the role's scope and audits every page with the purpose; the desk
/// adds its own setting of who may export at all.
pub async fn export(
    State(desk): State<Shared>,
    Path(handle): Path<i64>,
    Query(q): Query<ExportQuery>,
    headers: HeaderMap,
) -> Response {
    let p = match who(&desk, &headers) {
        Ok(p) => p,
        Err(r) => return *r,
    };
    if desk.config.export == "off" {
        return error(StatusCode::FORBIDDEN, "export is off on this desk");
    }
    if !p.holds(&desk.config.export) {
        return error(
            StatusCode::FORBIDDEN,
            format!(
                "export needs the {} entitlement on this desk",
                desk.config.export
            ),
        );
    }
    let up = desk.config.engine.clone();
    let token = match bearer(&desk, &up, &headers).await {
        Ok(t) => t,
        Err(e) => return error(StatusCode::UNAUTHORIZED, e),
    };
    let base = up.url.trim_end_matches('/').to_string();
    let get = |path: String| {
        let mut r = desk.http.get(format!("{base}{path}"));
        if let Some(t) = &token {
            r = r.bearer_auth(t);
        }
        r
    };
    // the handle first: its pages, and the engine's own refusal if any
    let meta = match get(format!("/api/ask/handles/{handle}")).send().await {
        Ok(r) => r,
        Err(e) => {
            return error(
                StatusCode::BAD_GATEWAY,
                format!("{} did not answer: {e}", up.url),
            );
        }
    };
    let status = meta.status();
    let meta: Value = meta.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        return (
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            axum::Json(meta),
        )
            .into_response();
    }
    let pages = meta["pages"].as_i64().unwrap_or(0);
    let columns: Vec<String> = meta["columns"]
        .as_array()
        .map(|c| {
            c.iter()
                .map(|x| x["name"].as_str().unwrap_or("").to_string())
                .collect()
        })
        .unwrap_or_default();
    let purpose = q.purpose.unwrap_or_default();
    let name = meta["name"].as_str().unwrap_or("result").replace(
        |c: char| !c.is_ascii_alphanumeric() && c != '-' && c != '_',
        "_",
    );
    let (tx, rx) = tokio::sync::mpsc::channel::<Result<bytes::Bytes, std::io::Error>>(4);
    let http = desk.http.clone();
    tokio::spawn(async move {
        let _ = tx
            .send(Ok(bytes::Bytes::from(csv_line(
                &columns
                    .iter()
                    .map(|c| Value::from(c.as_str()))
                    .collect::<Vec<_>>(),
            ))))
            .await;
        for page in 0..pages {
            let mut r = http
                .get(format!("{base}/api/ask/handles/{handle}/rows"))
                .query(&[("page", page.to_string()), ("purpose", purpose.clone())]);
            if let Some(t) = &token {
                r = r.bearer_auth(t);
            }
            let rows = match r.send().await {
                Ok(r) if r.status().is_success() => r.json::<Value>().await.unwrap_or(Value::Null),
                Ok(r) => {
                    let _ = tx
                        .send(Err(std::io::Error::other(format!(
                            "page {page}: the engine answered {}",
                            r.status()
                        ))))
                        .await;
                    return;
                }
                Err(e) => {
                    let _ = tx.send(Err(std::io::Error::other(e.to_string()))).await;
                    return;
                }
            };
            let mut chunk = String::new();
            for row in rows["rows"].as_array().unwrap_or(&Vec::new()) {
                chunk.push_str(&csv_line(row.as_array().unwrap_or(&Vec::new())));
            }
            if tx.send(Ok(bytes::Bytes::from(chunk))).await.is_err() {
                return;
            }
        }
    });
    let stream =
        futures_util::stream::unfold(rx, |mut rx| async move { rx.recv().await.map(|c| (c, rx)) });
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/csv; charset=utf-8")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"handle-{handle}-{name}.csv\""),
        )
        .header("x-nils-handle", handle.to_string())
        .body(Body::from_stream(stream))
        .unwrap_or_else(|_| {
            error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "the export could not start",
            )
        })
}

/// One CSV line: strings quoted when they need it, numbers bare, null empty,
/// anything else as JSON.
pub fn csv_line(values: &[Value]) -> String {
    let mut out = String::new();
    for (i, v) in values.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        let text = match v {
            Value::Null => String::new(),
            Value::String(s) => s.clone(),
            Value::Number(n) => n.to_string(),
            Value::Bool(b) => b.to_string(),
            other => other.to_string(),
        };
        if text.contains([',', '"', '\n', '\r']) {
            out.push('"');
            out.push_str(&text.replace('"', "\"\""));
            out.push('"');
        } else {
            out.push_str(&text);
        }
    }
    out.push_str("\r\n");
    out
}
