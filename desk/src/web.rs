// SPDX-License-Identifier: AGPL-3.0-only

//! The front end, from bytes compiled into the binary: `web/dist`, built by
//! vite before the binary is. A path that is not a file is the app's, so the
//! app routes it (a single page).

use axum::http::{HeaderMap, HeaderValue, StatusCode, Uri, header};
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

/// A request's path answered from the embedded build: the file as the
/// browser accepts it (brotli, then gzip, then as it is, from the copies vite
/// wrote beside each file), cached for a year where its name carries its
/// hash, and revalidated by its ETag otherwise. A path that is no file is the
/// app's, answered with `index.html`, which is never kept; a missing hashed
/// asset is a 404, so a page from an older build never caches HTML as script.
pub async fn serve(uri: Uri, headers: HeaderMap) -> Response {
    let path = uri.path().trim_start_matches('/');
    let accept = headers
        .get(header::ACCEPT_ENCODING)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let if_none_match = headers
        .get(header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok());
    answer(path, accept, if_none_match)
}

fn answer(path: &str, accept: &str, if_none_match: Option<&str>) -> Response {
    let asked = if path.is_empty() { "index.html" } else { path };
    let file = if Dist::get(asked).is_some() {
        asked
    } else if asked.starts_with("assets/") {
        return (StatusCode::NOT_FOUND, "no such asset in this build").into_response();
    } else {
        "index.html"
    };
    let Some(plain) = Dist::get(file) else {
        return (
            StatusCode::NOT_FOUND,
            "the front end is not built into this binary",
        )
            .into_response();
    };
    let mime = mime_guess::from_path(file).first_or_octet_stream();
    let (body, encoding) =
        match encoding_for(accept, |e| Dist::get(&format!("{file}.{e}")).is_some()) {
            Some((ext, name)) => (
                Dist::get(&format!("{file}.{ext}")).unwrap_or(plain.clone()),
                Some(name),
            ),
            None => (plain.clone(), None),
        };
    let hash = plain.metadata.sha256_hash();
    let etag = format!(
        "\"{}{}\"",
        hash[..12]
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>(),
        encoding.map(|e| format!("-{e}")).unwrap_or_default()
    );
    let mut h = HeaderMap::new();
    h.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static(cache_control(file)),
    );
    h.insert(header::VARY, HeaderValue::from_static("Accept-Encoding"));
    if let Ok(v) = HeaderValue::from_str(&etag) {
        h.insert(header::ETAG, v);
    }
    if if_none_match.is_some_and(|m| m.split(',').any(|t| t.trim() == etag || t.trim() == "*")) {
        return (StatusCode::NOT_MODIFIED, h).into_response();
    }
    if let Ok(v) = HeaderValue::from_str(mime.as_ref()) {
        h.insert(header::CONTENT_TYPE, v);
    }
    if let Some(e) = encoding {
        h.insert(header::CONTENT_ENCODING, HeaderValue::from_static(e));
    }
    (h, body.data.into_owned()).into_response()
}

/// The copy to send for an `Accept-Encoding`: brotli where it is accepted and
/// was written, then gzip; as (file extension, content coding).
fn encoding_for(accept: &str, has: impl Fn(&str) -> bool) -> Option<(&'static str, &'static str)> {
    let accepted = |coding: &str| {
        accept.split(',').any(|part| {
            let mut it = part.split(';');
            let name = it.next().unwrap_or("").trim();
            let zero = it.any(|p| {
                p.trim()
                    .strip_prefix("q=")
                    .and_then(|q| q.trim().parse::<f32>().ok())
                    .is_some_and(|q| q <= 0.0)
            });
            name.eq_ignore_ascii_case(coding) && !zero
        })
    };
    [("br", "br"), ("gz", "gzip")]
        .into_iter()
        .find(|(ext, name)| accepted(name) && has(ext))
}

/// How long a browser keeps a file: a year, never revalidated, where vite
/// named it by its content; otherwise asked again each time (by its ETag).
fn cache_control(file: &str) -> &'static str {
    if hashed(file) {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    }
}

/// Whether a path is one of vite's hashed build files:
/// `assets/<name>-<hash>.<ext>`, the hash eight characters of base64url
/// (which may hold a `-` itself).
fn hashed(file: &str) -> bool {
    let Some(name) = file.strip_prefix("assets/") else {
        return false;
    };
    let Some((stem, _ext)) = name.rsplit_once('.') else {
        return false;
    };
    let b = stem.as_bytes();
    b.len() > 9
        && b[b.len() - 9] == b'-'
        && b[b.len() - 8..]
            .iter()
            .all(|c| c.is_ascii_alphanumeric() || *c == b'_' || *c == b'-')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn brotli_first_then_gzip_where_accepted_and_written() {
        let all = |_: &str| true;
        assert_eq!(
            encoding_for("gzip, deflate, br, zstd", all),
            Some(("br", "br"))
        );
        assert_eq!(encoding_for("gzip, deflate", all), Some(("gz", "gzip")));
        assert_eq!(
            encoding_for("br;q=0, gzip;q=0.5", all),
            Some(("gz", "gzip"))
        );
        assert_eq!(encoding_for("identity", all), None);
        assert_eq!(encoding_for("", all), None);
        // a file vite did not compress (too small, or no gain) goes as it is
        assert_eq!(
            encoding_for("br, gzip", |e| e == "gz"),
            Some(("gz", "gzip"))
        );
        assert_eq!(encoding_for("br", |_| false), None);
    }

    #[test]
    fn hashed_assets_are_kept_a_year_and_the_rest_revalidated() {
        assert!(hashed("assets/index-D_A6qJZv.js"));
        assert!(hashed("assets/Viewer-IUbMZq0F.js"));
        assert!(hashed("assets/index-DtJJ-QPY.css"));
        assert!(!hashed("index.html"));
        assert!(!hashed("favicon.svg"));
        assert!(!hashed("codecs/openjphjs.wasm"));
        assert!(!hashed("assets/plain.js"));
        assert!(!hashed("assets/a-short.js"));
        assert_eq!(
            cache_control("assets/index-D_A6qJZv.js"),
            "public, max-age=31536000, immutable"
        );
        assert_eq!(cache_control("index.html"), "no-cache");
    }

    fn header(r: &Response, name: header::HeaderName) -> Option<&str> {
        r.headers().get(name).and_then(|v| v.to_str().ok())
    }

    #[test]
    fn the_page_is_never_kept_and_comes_compressed_when_asked() {
        let Some(index) = Dist::get("index.html") else {
            return; // a binary built without the front end has nothing to serve
        };
        let r = answer("", "gzip", None);
        assert_eq!(r.status(), StatusCode::OK);
        assert_eq!(header(&r, header::CACHE_CONTROL), Some("no-cache"));
        assert_eq!(header(&r, header::VARY), Some("Accept-Encoding"));
        assert!(header(&r, header::CONTENT_TYPE).is_some_and(|t| t.starts_with("text/html")));
        // index.html is small: compressed only where vite wrote a copy
        let gz = Dist::get("index.html.gz").is_some();
        assert_eq!(header(&r, header::CONTENT_ENCODING), gz.then_some("gzip"));
        // an app route is the page, and is not kept either
        let r = answer("data/datasets/ms-a", "", None);
        assert_eq!(r.status(), StatusCode::OK);
        assert_eq!(header(&r, header::CACHE_CONTROL), Some("no-cache"));
        // the same page by its ETag: nothing to send
        let etag = header(&answer("", "", None), header::ETAG)
            .map(str::to_string)
            .unwrap();
        assert_eq!(
            answer("", "", Some(&etag)).status(),
            StatusCode::NOT_MODIFIED
        );
        assert!(!index.data.is_empty());
    }

    #[test]
    fn a_hashed_asset_is_immutable_brotli_when_accepted_and_a_missing_one_is_not_the_page() {
        assert_eq!(
            answer("assets/gone-AAAAAAAA.js", "br", None).status(),
            StatusCode::NOT_FOUND
        );
        let Some(js) = Dist::iter().find(|f| hashed(f) && f.ends_with(".js")) else {
            return;
        };
        let r = answer(&js, "gzip, deflate, br", None);
        assert_eq!(r.status(), StatusCode::OK);
        assert_eq!(
            header(&r, header::CACHE_CONTROL),
            Some("public, max-age=31536000, immutable")
        );
        assert!(header(&r, header::CONTENT_TYPE).is_some_and(|t| t.contains("javascript")));
        let br = Dist::get(&format!("{js}.br")).is_some();
        assert_eq!(header(&r, header::CONTENT_ENCODING), br.then_some("br"));
        let plain = answer(&js, "", None);
        assert_eq!(header(&plain, header::CONTENT_ENCODING), None);
        assert_ne!(header(&r, header::ETAG), header(&plain, header::ETAG));
    }
}
