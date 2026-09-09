// SPDX-License-Identifier: AGPL-3.0-only

//! nils-desk: one process, the only origin a person's browser talks to
//! (`kineuro/nils`, `docs/specs/wave4c-the-assistant.md`, §7.1). It holds
//! the session and the tokens, serves the front end from bytes compiled
//! into the binary, proxies every part on one origin, and composes the
//! deployment capabilities document every control is a predicate over.

pub mod capabilities;
pub mod config;
pub mod proxy;
pub mod session;
pub mod store;
pub mod web;

use std::sync::Arc;

use axum::Router;
use axum::routing::{any, get, post};

pub use config::Config;

/// The contract versions this desk was generated from (Wave 4c §6.7).
pub const OPENAPI: &str = "3";
pub const SUITE: &str = "1";
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Everything a request handler reaches.
pub struct Desk {
    pub config: Config,
    pub store: store::Store,
    pub http: reqwest::Client,
    pub caps: capabilities::Cache,
}

pub type Shared = Arc<Desk>;

/// A desk from its configuration text: the store opened, the client built.
pub fn start(text: &str) -> Result<Shared, String> {
    let config = Config::parse(text)?;
    let store = store::Store::open(&config.store)?;
    let http = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    Ok(Arc::new(Desk {
        config,
        store,
        http,
        caps: capabilities::Cache::default(),
    }))
}

/// The router: the desk's own doors, the proxied parts, the front end.
pub fn router(desk: Shared) -> Router {
    Router::new()
        .route("/desk/capabilities", get(capabilities::door))
        .route("/desk/session", get(session::door))
        .route("/desk/logout", post(session::logout))
        .route("/api/{*rest}", any(proxy::engine))
        .route("/kvasir/{*rest}", any(proxy::kvasir))
        .route("/assistant/{*rest}", any(proxy::assistant))
        .route("/apps/{app}/{*rest}", any(proxy::app))
        .fallback(web::serve)
        .with_state(desk)
}
