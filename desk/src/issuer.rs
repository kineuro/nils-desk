// SPDX-License-Identifier: AGPL-3.0-only

//! `local` mode: the desk as a small issuer (Wave 4c §5.1, C46). An EdDSA
//! key generated at first start and readable by the desk's account only, a
//! JWKS at `/.well-known/jwks.json`, a discovery document, and tokens of
//! fifteen minutes minted only for the subject that just authenticated with
//! entitlements no wider than the ones stored for that user. The engine and
//! Kvasir cannot tell this from a provider, which is the point.

use base64::Engine as _;
use ed25519_dalek::SigningKey;
use ed25519_dalek::pkcs8::{DecodePrivateKey, EncodePrivateKey};
use jsonwebtoken::{Algorithm, EncodingKey, Header};
use serde_json::{Value, json};

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

    pub fn discovery(&self) -> Value {
        json!({
            "issuer": self.origin,
            "jwks_uri": format!("{}/.well-known/jwks.json", self.origin),
            "token_endpoint": format!("{}/desk/cli-login", self.origin),
            "response_types_supported": ["token"],
            "subject_types_supported": ["public"],
            "id_token_signing_alg_values_supported": ["EdDSA"],
            "claims_supported": ["sub", "preferred_username", "name", "roles"],
        })
    }

    /// A token for the person who just authenticated: the subject, the
    /// display, the entitlements stored for them, and nothing wider.
    pub fn mint(
        &self,
        subject: &str,
        display: &str,
        entitlements: &[String],
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
            "preferred_username": subject,
            "name": display,
            "roles": entitlements,
        });
        let mut header = Header::new(Algorithm::EdDSA);
        header.kid = Some(self.kid.clone());
        jsonwebtoken::encode(&header, &claims, &self.encoding)
            .map(|t| (t, exp))
            .map_err(|e| e.to_string())
    }
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
