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
    /// Other addresses this same desk answers at: a machine's own address
    /// beside the loopback, a host name beside an address. A write carrying
    /// one of them is the desk's own write (§5.4); everything the desk
    /// advertises, mints and redirects to stays the canonical `origin`.
    #[serde(default)]
    pub also_origins: Vec<String>,
    /// `off`, `local` or `oidc` (Wave 4c §5.1).
    #[serde(default = "default_mode")]
    pub mode: Mode,
    /// The one SQLite file: sessions, display names, local users.
    #[serde(default = "default_store")]
    pub store: std::path::PathBuf,
    pub engine: Upstream,
    pub kvasir: Option<Upstream>,
    pub assistant: Option<Upstream>,
    /// Wave 5 §10.4: the supervisor on this host, reached under `/supervise/` by an admin.
    #[serde(default)]
    pub supervisor: Option<Upstream>,
    #[serde(default)]
    pub apps: Vec<App>,
    /// `local` mode: the desk as a small issuer (C46).
    #[serde(default)]
    pub local: Local,
    /// `oidc` mode: the provider.
    pub oidc: Option<Oidc>,
    /// Wave 4c §7.4, §7.6: the entitlement an export needs, or `off`. The
    /// engine still authorises every page read against the caller.
    #[serde(default = "default_export")]
    pub export: String,
}

impl Config {
    /// Every address a write may come from: the canonical origin first.
    pub fn origins(&self) -> Vec<&str> {
        let mut out = vec![self.origin.as_str()];
        out.extend(self.also_origins.iter().map(String::as_str));
        out
    }
}

fn default_export() -> String {
    "reader".into()
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
        let mut c = Config::parse(&text)?;
        c.beside(path.parent().unwrap_or(std::path::Path::new(".")));
        Ok(c)
    }

    /// Every relative path in the configuration is relative to the
    /// configuration, not to wherever the command happened to be run.
    ///
    /// The service has a working directory and never noticed the
    /// difference. A person running `nils-desk user add --config
    /// <path>` from their home directory did: it made a second store
    /// there, said the person was added, and the desk they meant went on
    /// refusing them with nothing to say why.
    pub fn beside(&mut self, dir: &std::path::Path) {
        fn under(dir: &std::path::Path, path: &mut std::path::PathBuf) {
            if path.is_relative() {
                *path = dir.join(&*path);
            }
        }
        under(dir, &mut self.store);
        under(dir, &mut self.local.key);
        if let Some(oidc) = &mut self.oidc
            && let Some(file) = &mut oidc.client_secret_file
        {
            under(dir, file);
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    /// A relative path in the configuration is relative to the
    /// configuration. The service never noticed, because it is given a
    /// working directory; a person running a command from their own
    /// directory made a second store there and was then refused by the
    /// desk they meant, with nothing said.
    #[test]
    fn a_relative_path_is_relative_to_the_configuration() {
        let dir = std::path::Path::new("/srv/nils/desk");
        let mut c = Config::parse(
            r#"
bind = "127.0.0.1:7200"
origin = "http://127.0.0.1:7200"
mode = "local"
store = "nils-desk.sqlite"

[local]
key = "nils-desk.key"

[engine]
url = "http://127.0.0.1:8437"
"#,
        )
        .expect("the configuration parses");
        c.beside(dir);
        assert_eq!(c.store, dir.join("nils-desk.sqlite"));
        assert_eq!(c.local.key, dir.join("nils-desk.key"));
    }

    /// A path someone spelled out in full is left as it is.
    #[test]
    fn an_absolute_path_is_left_alone() {
        let mut c = Config::parse(
            r#"
bind = "127.0.0.1:7200"
origin = "http://127.0.0.1:7200"
mode = "local"
store = "/var/lib/nils-desk/store.sqlite"

[local]
key = "/etc/nils/desk.key"

[engine]
url = "http://127.0.0.1:8437"
"#,
        )
        .expect("the configuration parses");
        c.beside(std::path::Path::new("/srv/nils/desk"));
        assert_eq!(
            c.store,
            std::path::Path::new("/var/lib/nils-desk/store.sqlite")
        );
        assert_eq!(c.local.key, std::path::Path::new("/etc/nils/desk.key"));
    }
}
