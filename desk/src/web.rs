// SPDX-License-Identifier: AGPL-3.0-only

//! The front end, from bytes compiled into the binary: `web/dist`, built by
//! vite before the binary is. A path that is not a file is the app's, so the
//! app routes it (a single page).

use axum::http::{StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "../web/dist"]
struct Dist;

/// The installer, at `/get`, so that `curl -fsSL https://<this desk>/get | sh`
/// installs the engine, its packs and, with `--with-desk`, the desk. It is
/// served to anyone: a person installing NILS has no session yet.
pub async fn get_script() -> Response {
    (
        [(header::CONTENT_TYPE, "text/x-shellscript; charset=utf-8")],
        include_str!("../../install/get.sh"),
    )
        .into_response()
}

pub async fn serve(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let file = if path.is_empty() { "index.html" } else { path };
    match Dist::get(file).or_else(|| Dist::get("index.html")) {
        Some(f) => {
            let mime = mime_guess::from_path(if Dist::get(file).is_some() {
                file
            } else {
                "index.html"
            })
            .first_or_octet_stream();
            (
                [(header::CONTENT_TYPE, mime.as_ref().to_string())],
                f.data.into_owned(),
            )
                .into_response()
        }
        None => (
            StatusCode::NOT_FOUND,
            "the front end is not built into this binary",
        )
            .into_response(),
    }
}
