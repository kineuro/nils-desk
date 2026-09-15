// SPDX-License-Identifier: AGPL-3.0-only

//! nils-desk: one process, the only origin a person's browser talks to
//! (`kineuro/nils`, `docs/specs/wave4c-the-assistant.md`, §7.1). It holds
//! the session and the tokens, serves the front end from bytes compiled
//! into the binary, proxies every part on one origin, and composes the
//! deployment capabilities document every control is a predicate over.

pub mod assistant;
pub mod capabilities;
pub mod config;
pub mod grants;
pub mod identity;
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
use axum::routing::{any, get, post, put};

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
    /// `local` and `oidc` modes: the desk as the issuer of the parts' tokens.
    pub issuer: Option<issuer::Issuer>,
    /// `oidc` mode: the provider.
    pub oidc: Option<oidc::Client>,
}

pub type Shared = Arc<Desk>;

/// A desk from its configuration file: the paths in it read as relative to
/// it, the store opened, the client built. This is what every command uses,
/// so that a command run from anywhere opens the same store as the service.
pub fn start_at(path: &std::path::Path) -> Result<Shared, String> {
    from_config(Config::read(path)?)
}

/// A desk from its configuration text, with relative paths taken as they
/// are written, which means relative to wherever this runs.
pub fn start(text: &str) -> Result<Shared, String> {
    from_config(Config::parse(text)?)
}

/// How people sign in, as far as a session depends on it: the mode, the
/// provider of an `oidc` desk, and the origin and audience the desk mints
/// its tokens for. An `oidc` desk that passed on the provider's tokens held
/// sessions that knew no groups, so a desk that signs for its people signs
/// them out once.
pub fn sign_in_of(config: &Config) -> String {
    match config.mode {
        config::Mode::Off => "off".to_string(),
        config::Mode::Local => format!("local {} {}", config.origin, config.local.audience),
        config::Mode::Oidc => match &config.oidc {
            Some(o) => format!(
                "oidc {} {} signed {} {}",
                o.issuer, o.client_id, config.origin, config.local.audience
            ),
            None => "oidc".to_string(),
        },
    }
}

fn from_config(config: Config) -> Result<Shared, String> {
    let store = store::Store::open(&config.store)?;
    // a session holds only under the way of signing in it was made with
    store.sign_in(&sign_in_of(&config));
    let http = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let issuer = match config.mode {
        config::Mode::Local | config::Mode::Oidc => Some(issuer::Issuer::open(
            &config.local.key,
            &config.origin,
            &config.local.audience,
        )?),
        config::Mode::Off => None,
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
            get(identity::users_list).post(identity::users_add),
        )
        .route(
            "/desk/users/{name}/entitlements",
            put(identity::users_entitlements),
        )
        .route("/desk/people", get(identity::people_list))
        .route(
            "/desk/groups",
            get(identity::groups_list).post(identity::groups_add),
        )
        .route(
            "/desk/groups/{id}",
            put(identity::groups_set).delete(identity::groups_remove),
        )
        .route("/desk/access", get(identity::access_list))
        .route("/desk/access/{subject}", put(identity::access_set))
        .route("/desk/results", get(results::list).post(results::record))
        .route("/desk/lineage", post(results::lineage))
        .route("/desk/custody", get(results::custody))
        .route("/desk/export/{handle}", get(results::export))
        .route(
            "/desk/assistant/conversations/{id}/token",
            post(assistant::push_token),
        )
        .route("/get", get(web::get_script))
        .route("/.well-known/jwks.json", get(session::jwks))
        .route("/.well-known/openid-configuration", get(session::discovery))
        .route("/api/{*rest}", any(proxy::engine))
        .route("/kvasir/{*rest}", any(proxy::kvasir))
        .route("/assistant/{*rest}", any(proxy::assistant))
        .route("/supervise/{*rest}", any(proxy::supervisor))
        .route("/apps/{app}/{*rest}", any(proxy::app))
        .fallback(web::serve)
        .with_state(desk)
}
