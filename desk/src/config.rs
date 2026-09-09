// SPDX-License-Identifier: AGPL-3.0-only

//! The desk's configuration file, `nils-desk.toml`.

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    /// Where to listen.
    #[serde(default = "default_bind")]
    pub bind: String,
    /// The origin a browser reaches the desk at, scheme and host; what the
    /// cross-origin defences of §5.4 compare against.
    pub origin: String,
    /// `off` in this slice; `local` and `oidc` arrive with B2.
    #[serde(default = "default_mode")]
    pub mode: Mode,
    /// The one SQLite file: sessions, display names, preferences.
    #[serde(default = "default_store")]
    pub store: std::path::PathBuf,
    pub engine: Upstream,
    pub kvasir: Option<Upstream>,
    pub assistant: Option<Upstream>,
    #[serde(default)]
    pub apps: Vec<App>,
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

/// A part the desk proxies: its URL and, in `off` and `token` modes, the
/// bearer the desk holds for it.
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

impl Config {
    pub fn read(path: &std::path::Path) -> Result<Config, String> {
        let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
        Config::parse(&text)
    }

    pub fn parse(text: &str) -> Result<Config, String> {
        let c: Config = toml::from_str(text).map_err(|e| format!("nils-desk.toml: {e}"))?;
        if c.mode != Mode::Off {
            return Err(format!(
                "mode {} is not built yet; this desk runs in off mode",
                c.mode
            ));
        }
        if !c.origin.starts_with("http://") && !c.origin.starts_with("https://") {
            return Err("origin: scheme and host, as a browser sees it".into());
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
}
