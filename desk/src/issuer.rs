// SPDX-License-Identifier: AGPL-3.0-only

//! The desk as a small issuer (Wave 4c §5.1, C46), in `local` and `oidc`
//! modes alike: an EdDSA key generated at first start and readable by the
//! desk's account only, a JWKS at `/.well-known/jwks.json`, a discovery
//! document, and tokens of fifteen minutes minted only for the person of a
//! session, carrying the grants and the detail the desk resolves for them
//! now and no roles. The engine, Kvasir and the assistant read those claims
//! as they are from an issuer they trust.

use base64::Engine as _;
use ed25519_dalek::SigningKey;
use ed25519_dalek::pkcs8::{DecodePrivateKey, EncodePrivateKey};
use jsonwebtoken::{Algorithm, EncodingKey, Header};
use serde_json::{Value, json};

use crate::grants::Access;

pub const TOKEN_MINUTES: i64 = 15;
pub const CLI_TOKEN_HOURS: i64 = 24;

pub struct Issuer {
    key: SigningKey,
    encoding: EncodingKey,
    pub kid: String,
    pub origin: String,
    pub audience: String,
}

impl Issuer {
    /// The key from the file, or a new one written there with mode 600.
    pub fn open(path: &std::path::Path, origin: &str, audience: &str) -> Result<Issuer, String> {
        let pem = match std::fs::read_to_string(path) {
            Ok(p) => p,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                let key = SigningKey::generate(&mut rand_core::OsRng);
                let pem = key
                    .to_pkcs8_pem(ed25519_dalek::pkcs8::spki::der::pem::LineEnding::LF)
                    .map_err(|e| e.to_string())?;
                write_private(path, pem.as_bytes())?;
                pem.to_string()
            }
            Err(e) => return Err(format!("{}: {e}", path.display())),
        };
        let key =
            SigningKey::from_pkcs8_pem(&pem).map_err(|e| format!("{}: {e}", path.display()))?;
        let encoding = EncodingKey::from_ed_pem(pem.as_bytes()).map_err(|e| e.to_string())?;
        let public = key.verifying_key().to_bytes();
        let kid = hex(&sha2_256(&public)[..8]);
        Ok(Issuer {
            key,
            encoding,
            kid,
            origin: origin.trim_end_matches('/').to_string(),
            audience: audience.to_string(),
        })
    }

    pub fn jwks(&self) -> Value {
        let x = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(self.key.verifying_key().to_bytes());
        json!({"keys": [{"kty": "OKP", "crv": "Ed25519", "x": x, "kid": self.kid, "alg": "EdDSA", "use": "sig"}]})
    }

    /// The discovery document; the command line's token door is named only
    /// where the desk keeps passwords.
    pub fn discovery(&self, cli_login: bool) -> Value {
        let mut d = json!({
            "issuer": self.origin,
            "jwks_uri": format!("{}/.well-known/jwks.json", self.origin),
            "response_types_supported": ["token"],
            "subject_types_supported": ["public"],
            "id_token_signing_alg_values_supported": ["EdDSA"],
            "claims_supported": ["sub", "preferred_username", "name", "grants", "detail"],
        });
        if cli_login {
            d["token_endpoint"] = Value::from(format!("{}/desk/cli-login", self.origin));
        }
        d
    }

    /// A token for a person: the subject the parts know them by, the name
    /// they sign in with, their display name, and the grants (sorted) and
    /// the detail they hold now, nothing wider.
    pub fn mint(
        &self,
        subject: &str,
        username: &str,
        display: &str,
        access: &Access,
        minutes: i64,
    ) -> Result<(String, i64), String> {
        let now = time::OffsetDateTime::now_utc().unix_timestamp();
        let exp = now + minutes * 60;
        let claims = json!({
            "iss": self.origin,
            "aud": self.audience,
            "sub": subject,
            "iat": now,
            "exp": exp,
            "preferred_username": username,
            "name": display,
            "grants": access.list(),
            "detail": access.detail.as_str(),
        });
        let mut header = Header::new(Algorithm::EdDSA);
        header.kid = Some(self.kid.clone());
        jsonwebtoken::encode(&header, &claims, &self.encoding)
            .map(|t| (t, exp))
            .map_err(|e| e.to_string())
    }
}

/// The subject a provider's person is known by to the parts: the provider's
/// subject at the provider's host, as the engine and Kvasir qualified the
/// provider's own tokens before the desk signed for its people, so the
/// principal in the engine's history and in Kvasir's subscriptions stays.
pub fn principal(issuer: &str, subject: &str) -> String {
    let host = issuer
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .split('/')
        .next()
        .unwrap_or_default();
    format!("{subject}@{host}")
}

fn write_private(path: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut f = opts
        .open(path)
        .map_err(|e| format!("{}: {e}", path.display()))?;
    f.write_all(bytes).map_err(|e| e.to_string())
}

fn sha2_256(bytes: &[u8]) -> [u8; 32] {
    use sha2::Digest;
    sha2::Sha256::digest(bytes).into()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A provider's subject is qualified by the provider's host, its port
    /// kept, as the engine names the node of a trusted issuer.
    #[test]
    fn a_providers_subject_is_qualified_by_its_host() {
        assert_eq!(
            principal("https://id.example.org/application/o/nils/", "8c1f2a"),
            "8c1f2a@id.example.org"
        );
        assert_eq!(
            principal("http://127.0.0.1:9000", "subject-1"),
            "subject-1@127.0.0.1:9000"
        );
    }
}
