// SPDX-License-Identifier: AGPL-3.0-only

//! The desk's configuration file, `nils-desk.toml`.

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    /// Where to listen.
    #[serde(default = "default_bind")]
    pub bind: String,
    /// The origin a browser reaches the desk at, scheme and host; what the
    /// cross-origin defences of §5.4 compare against, and the issuer of the
    /// tokens the desk mints in `local` mode.
    pub origin: String,
    /// `off`, `local` or `oidc` (Wave 4c §5.1).
    #[serde(default = "default_mode")]
    pub mode: Mode,
    /// The one SQLite file: sessions, display names, local users.
    #[serde(default = "default_store")]
    pub store: std::path::PathBuf,
    pub engine: Upstream,
    pub kvasir: Option<Upstream>,
    pub assistant: Option<Upstream>,
    #[serde(default)]
    pub apps: Vec<App>,
    /// `local` mode: the desk as a small issuer (C46).
    #[serde(default)]
    pub local: Local,
    /// `oidc` mode: the provider.
    pub oidc: Option<Oidc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Off,
    Local,
    Oidc,
}

impl std::fmt::Display for Mode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Mode::Off => "off",
            Mode::Local => "local",
            Mode::Oidc => "oidc",
        })
    }
}

/// A part the desk proxies: its URL and, in `off` mode, the bearer the desk
/// holds for it. In `local` and `oidc` modes the person's own token goes.
#[derive(Debug, Clone, Deserialize)]
pub struct Upstream {
    pub url: String,
    #[serde(default)]
    pub token: Option<String>,
}

/// An app registry entry (Wave 4c §4.4; `contracts/suite/v1/app.schema.json`).
#[derive(Debug, Clone, Deserialize)]
pub struct App {
    pub id: String,
    pub title: String,
    pub url: String,
    pub entitlement: String,
    #[serde(default = "default_capabilities")]
    pub capabilities: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Local {
    /// The EdDSA signing key, PEM, generated at first start and readable by
    /// the desk's account only.
    #[serde(default = "default_key")]
    pub key: std::path::PathBuf,
    /// The audience the minted tokens carry, which the engine's trust entry
    /// names.
    #[serde(default = "default_audience")]
    pub audience: String,
}

impl Default for Local {
    fn default() -> Local {
        Local {
            key: default_key(),
            audience: default_audience(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Oidc {
    /// The issuer URL, whose `/.well-known/openid-configuration` says the rest.
    pub issuer: String,
    pub client_id: String,
    /// The confidential client's secret, or a file that holds it.
    #[serde(default)]
    pub client_secret: Option<String>,
    #[serde(default)]
    pub client_secret_file: Option<std::path::PathBuf>,
    #[serde(default = "default_scopes")]
    pub scopes: Vec<String>,
    /// The claim that carries the entitlements, plain strings.
    #[serde(default = "default_roles_claim")]
    pub roles_claim: String,
}

fn default_bind() -> String {
    "127.0.0.1:7200".into()
}
fn default_mode() -> Mode {
    Mode::Off
}
fn default_store() -> std::path::PathBuf {
    "nils-desk.sqlite".into()
}
fn default_capabilities() -> String {
    "/capabilities".into()
}
fn default_key() -> std::path::PathBuf {
    "nils-desk.key".into()
}
fn default_audience() -> String {
    "nils".into()
}
fn default_scopes() -> Vec<String> {
    [
        "openid",
        "profile",
        "email",
        "offline_access",
        "entitlements",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
}
fn default_roles_claim() -> String {
    "roles".into()
}

impl Config {
    pub fn read(path: &std::path::Path) -> Result<Config, String> {
        let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
        Config::parse(&text)
    }

    pub fn parse(text: &str) -> Result<Config, String> {
        let c: Config = toml::from_str(text).map_err(|e| format!("nils-desk.toml: {e}"))?;
        if !c.origin.starts_with("http://") && !c.origin.starts_with("https://") {
            return Err("origin: scheme and host, as a browser sees it".into());
        }
        if c.mode == Mode::Oidc && c.oidc.is_none() {
            return Err(
                "mode oidc needs an [oidc] table: issuer, client_id and the client secret".into(),
            );
        }
        if let Some(o) = &c.oidc
            && o.client_secret.is_none()
            && o.client_secret_file.is_none()
        {
            return Err("[oidc]: client_secret or client_secret_file".into());
        }
        for a in &c.apps {
            if !a
                .id
                .chars()
                .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
            {
                return Err(format!(
                    "apps: {} is not an id (lower case letters, digits, dashes)",
                    a.id
                ));
            }
        }
        Ok(c)
    }

    pub fn app(&self, id: &str) -> Option<&App> {
        self.apps.iter().find(|a| a.id == id)
    }

    pub fn client_secret(&self) -> Result<String, String> {
        let o = self.oidc.as_ref().ok_or("no [oidc] table")?;
        if let Some(s) = &o.client_secret {
            return Ok(s.clone());
        }
        let f = o
            .client_secret_file
            .as_ref()
            .ok_or("[oidc]: client_secret or client_secret_file")?;
        std::fs::read_to_string(f)
            .map(|s| s.trim().to_string())
            .map_err(|e| format!("{}: {e}", f.display()))
    }
}
