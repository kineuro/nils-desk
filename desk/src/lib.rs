// SPDX-License-Identifier: AGPL-3.0-only

//! nils-desk: one process, the only origin a person's browser talks to
//! (`kineuro/nils`, `docs/specs/wave4c-the-assistant.md`, §7.1). It holds
//! the session and the tokens, serves the front end from bytes compiled
//! into the binary, proxies every part on one origin, and composes the
//! deployment capabilities document every control is a predicate over.

pub mod capabilities;
pub mod config;
pub mod issuer;
pub mod oidc;
pub mod proxy;
pub mod register;
pub mod results;
pub mod session;
pub mod store;
pub mod users;
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
    /// `local` mode: the desk as an issuer.
    pub issuer: Option<issuer::Issuer>,
    /// `oidc` mode: the provider.
    pub oidc: Option<oidc::Client>,
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
    let issuer = match config.mode {
        config::Mode::Local => Some(issuer::Issuer::open(
            &config.local.key,
            &config.origin,
            &config.local.audience,
        )?),
        _ => None,
    };
    let oidc = match (config.mode, &config.oidc) {
        (config::Mode::Oidc, Some(o)) => Some(oidc::Client::new(
            o.clone(),
            config.client_secret()?,
            http.clone(),
        )),
        _ => None,
    };
    Ok(Arc::new(Desk {
        config,
        store,
        http,
        caps: capabilities::Cache::default(),
        issuer,
        oidc,
    }))
}

/// The router: the desk's own doors, the proxied parts, the front end.
pub fn router(desk: Shared) -> Router {
    Router::new()
        .route("/desk/capabilities", get(capabilities::door))
        .route("/desk/session", get(session::door))
        .route("/desk/login", get(session::begin).post(session::login))
        .route("/desk/callback", get(session::callback))
        .route("/desk/cli-login", post(session::cli_login))
        .route("/desk/logout", post(session::logout))
        .route(
            "/desk/users",
            get(session::users_list).post(session::users_add),
        )
        .route(
            "/desk/users/{name}/entitlements",
            axum::routing::put(session::users_entitlements),
        )
        .route("/desk/results", get(results::list).post(results::record))
        .route("/desk/lineage", post(results::lineage))
        .route("/desk/export/{handle}", get(results::export))
        .route("/.well-known/jwks.json", get(session::jwks))
        .route("/.well-known/openid-configuration", get(session::discovery))
        .route("/api/{*rest}", any(proxy::engine))
        .route("/kvasir/{*rest}", any(proxy::kvasir))
        .route("/assistant/{*rest}", any(proxy::assistant))
        .route("/apps/{app}/{*rest}", any(proxy::app))
        .fallback(web::serve)
        .with_state(desk)
}
