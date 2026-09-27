// SPDX-License-Identifier: AGPL-3.0-only

//! `oidc` mode: the provider through the authorization code grant with PKCE
//! (Wave 4c §5.1, §5.4). The desk is a confidential client: it holds the
//! secret, and the person's access and refresh tokens live in the session
//! row, refreshed before their expiry so a person the provider no longer
//! signs in is refused. The id token is verified against the provider's
//! JWKS; it says who the person is, the groups they are in (`groups_claim`)
//! and any legacy entitlements (`roles_claim`). The parts receive the token
//! the desk mints, never the provider's.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::Engine as _;
use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{Algorithm, DecodingKey, Validation};
use serde_json::{Value, json};

use crate::config::Oidc;

pub struct Client {
    pub config: Oidc,
    secret: String,
    http: reqwest::Client,
    discovery: Mutex<Option<(Instant, Value)>>,
    jwks: Mutex<Option<(Instant, JwkSet)>>,
}

/// Why a refresh gave no fresh token.
#[derive(Debug)]
pub enum Refresh {
    /// The provider no longer signs this person in with this sign-in.
    Ended(String),
    /// The provider could not be asked; the sign-in may still stand.
    Failed(String),
}

impl Refresh {
    pub fn message(self) -> String {
        match self {
            Refresh::Ended(m) | Refresh::Failed(m) => m,
        }
    }
}

pub struct Authenticated {
    pub subject: String,
    pub display: String,
    pub email: Option<String>,
    /// The name the person signs in with at the provider.
    pub username: Option<String>,
    /// The provider's groups, from `groups_claim`.
    pub groups: Vec<String>,
    /// The legacy entitlements, from `roles_claim`.
    pub roles: Vec<String>,
    /// What the session keeps: access, refresh, expires_at (unix seconds).
    pub tokens: Value,
}

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// The strings of a claim that is an array; nothing otherwise.
fn strings(claim: &Value) -> Vec<String> {
    claim
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

impl Client {
    pub fn new(config: Oidc, secret: String, http: reqwest::Client) -> Client {
        Client {
            config,
            secret,
            http,
            discovery: Mutex::new(None),
            jwks: Mutex::new(None),
        }
    }

    async fn discovery(&self) -> Result<Value, String> {
        if let Some((at, d)) = self
            .discovery
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
            && at.elapsed() < Duration::from_secs(3600)
        {
            return Ok(d);
        }
        let url = format!(
            "{}/.well-known/openid-configuration",
            self.config.issuer.trim_end_matches('/')
        );
        let d: Value = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("{url}: {e}"))?
            .json()
            .await
            .map_err(|e| format!("{url}: {e}"))?;
        *self.discovery.lock().unwrap_or_else(|e| e.into_inner()) =
            Some((Instant::now(), d.clone()));
        Ok(d)
    }

    async fn jwks(&self, refetch: bool) -> Result<JwkSet, String> {
        if !refetch
            && let Some((at, j)) = self.jwks.lock().unwrap_or_else(|e| e.into_inner()).clone()
            && at.elapsed() < Duration::from_secs(3600)
        {
            return Ok(j);
        }
        let d = self.discovery().await?;
        let url = d["jwks_uri"]
            .as_str()
            .ok_or("the discovery document names no jwks_uri")?
            .to_string();
        let j: JwkSet = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("{url}: {e}"))?
            .json()
            .await
            .map_err(|e| format!("{url}: {e}"))?;
        *self.jwks.lock().unwrap_or_else(|e| e.into_inner()) = Some((Instant::now(), j.clone()));
        Ok(j)
    }

    /// The authorization URL for a fresh state and verifier, which the
    /// caller keeps until the callback. `choose` asks the provider to sign
    /// the person in afresh (`prompt=login`), whoever it signs in already,
    /// so a person can pick another account.
    pub async fn begin(
        &self,
        redirect: &str,
        choose: bool,
    ) -> Result<(String, String, String), String> {
        let d = self.discovery().await?;
        let endpoint = d["authorization_endpoint"]
            .as_str()
            .ok_or("the discovery document names no authorization_endpoint")?;
        let state = crate::store::token();
        let verifier = crate::store::token();
        let challenge = {
            use sha2::Digest;
            b64(&sha2::Sha256::digest(verifier.as_bytes()))
        };
        let mut u = url::Url::parse(endpoint).map_err(|e| e.to_string())?;
        u.query_pairs_mut()
            .append_pair("response_type", "code")
            .append_pair("client_id", &self.config.client_id)
            .append_pair("redirect_uri", redirect)
            .append_pair("scope", &self.config.scopes.join(" "))
            .append_pair("state", &state)
            .append_pair("code_challenge", &challenge)
            .append_pair("code_challenge_method", "S256");
        if choose {
            u.query_pairs_mut().append_pair("prompt", "login");
        }
        Ok((u.to_string(), state, verifier))
    }

    /// The callback: the code for the tokens, the id token verified, the
    /// person read from its claims.
    pub async fn finish(
        &self,
        code: &str,
        verifier: &str,
        redirect: &str,
    ) -> Result<Authenticated, String> {
        let d = self.discovery().await?;
        let endpoint = d["token_endpoint"]
            .as_str()
            .ok_or("the discovery document names no token_endpoint")?
            .to_string();
        let r = self
            .http
            .post(&endpoint)
            .form(&[
                ("grant_type", "authorization_code"),
                ("code", code),
                ("redirect_uri", redirect),
                ("client_id", &self.config.client_id),
                ("client_secret", &self.secret),
                ("code_verifier", verifier),
            ])
            .send()
            .await
            .map_err(|e| format!("{endpoint}: {e}"))?;
        let status = r.status();
        let body: Value = r.json().await.unwrap_or(Value::Null);
        if !status.is_success() {
            return Err(format!(
                "the token endpoint answered {status}: {}",
                body["error"].as_str().unwrap_or("")
            ));
        }
        let id_token = body["id_token"]
            .as_str()
            .ok_or("the token answer carries no id_token")?;
        let claims = self.verify(id_token).await?;
        let access = body["access_token"]
            .as_str()
            .ok_or("the token answer carries no access_token")?;
        let expires_in = body["expires_in"].as_i64().unwrap_or(900);
        let now = time::OffsetDateTime::now_utc().unix_timestamp();
        Ok(Authenticated {
            subject: claims["sub"].as_str().unwrap_or("").to_string(),
            display: claims["name"]
                .as_str()
                .or(claims["preferred_username"].as_str())
                .unwrap_or("")
                .to_string(),
            email: claims["email"].as_str().map(str::to_string),
            username: claims["preferred_username"].as_str().map(str::to_string),
            groups: strings(&claims[&self.config.groups_claim]),
            roles: strings(&claims[&self.config.roles_claim]),
            tokens: json!({
                "access": access,
                "refresh": body["refresh_token"],
                "expires_at": now + expires_in,
                // kept for the logout, which names the person to the provider
                "id_token": id_token,
                // the provider's session the person signed in with, which a
                // back-channel logout and each refresh are checked against
                "sid": claims["sid"],
            }),
        })
    }

    /// A fresh access token when the held one is near its expiry, which is
    /// also when the desk asks the provider again whether the sign-in still
    /// stands: a refused refresh, an id token for another subject, or one
    /// that no longer names the provider's session the person signed in
    /// with (`sid`, which the provider drops once that session has ended)
    /// is [`Refresh::Ended`], and the desk's session ends with it.
    pub async fn refresh(&self, tokens: &Value, subject: &str) -> Result<Option<Value>, Refresh> {
        let now = time::OffsetDateTime::now_utc().unix_timestamp();
        if tokens["expires_at"].as_i64().unwrap_or(0) - now > 60 {
            return Ok(None);
        }
        let Some(refresh) = tokens["refresh"].as_str() else {
            return Ok(None);
        };
        let d = self.discovery().await.map_err(Refresh::Failed)?;
        let endpoint = d["token_endpoint"]
            .as_str()
            .ok_or_else(|| Refresh::Failed("no token_endpoint".into()))?
            .to_string();
        let r = self
            .http
            .post(&endpoint)
            .form(&[
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh),
                ("client_id", &self.config.client_id),
                ("client_secret", &self.secret),
            ])
            .send()
            .await
            .map_err(|e| Refresh::Failed(e.to_string()))?;
        if r.status().is_client_error() {
            return Err(Refresh::Ended(format!(
                "the provider refused the refresh: {}",
                r.status()
            )));
        }
        if !r.status().is_success() {
            return Err(Refresh::Failed(format!(
                "the refresh was not answered: {}",
                r.status()
            )));
        }
        let body: Value = r.json().await.map_err(|e| Refresh::Failed(e.to_string()))?;
        if let Some(id_token) = body["id_token"].as_str() {
            let claims = self.verify(id_token).await.map_err(Refresh::Failed)?;
            if claims["sub"].as_str() != Some(subject) {
                return Err(Refresh::Ended(
                    "the provider answered for another person".into(),
                ));
            }
            if let Some(sid) = tokens["sid"].as_str()
                && claims["sid"].as_str() != Some(sid)
            {
                return Err(Refresh::Ended(
                    "the provider's session this sign-in came from has ended".into(),
                ));
            }
        }
        let expires_in = body["expires_in"].as_i64().unwrap_or(900);
        Ok(Some(json!({
            "access": body["access_token"],
            "refresh": body["refresh_token"].as_str().unwrap_or(refresh),
            "expires_at": now + expires_in,
            // the id token of the sign-in: a refresh never changes who the session is
            "id_token": tokens["id_token"],
            "sid": tokens["sid"],
        })))
    }

    /// A back-channel logout token (OpenID Connect Back-Channel Logout 1.0)
    /// verified: signed by the provider for this client, carrying the
    /// logout event and no nonce. The subject and the provider's session it
    /// ends, at least one of them.
    pub async fn logout_token(
        &self,
        token: &str,
    ) -> Result<(Option<String>, Option<String>), String> {
        let claims = self.verify(token).await?;
        if !claims["events"]["http://schemas.openid.net/event/backchannel-logout"].is_object() {
            return Err("the token carries no back-channel logout event".into());
        }
        if !claims["nonce"].is_null() {
            return Err("a logout token carries no nonce".into());
        }
        let sub = claims["sub"].as_str().map(str::to_string);
        let sid = claims["sid"].as_str().map(str::to_string);
        if sub.is_none() && sid.is_none() {
            return Err("the token names neither a subject nor a session".into());
        }
        Ok((sub, sid))
    }

    /// Where the browser goes to end the person's session at the provider
    /// too (OpenID Connect RP-initiated logout), coming back to `back`;
    /// none when the provider names no `end_session_endpoint`.
    pub async fn end_session(&self, id_token: Option<&str>, back: &str) -> Option<String> {
        let d = self.discovery().await.ok()?;
        let endpoint = d["end_session_endpoint"].as_str()?;
        let mut u = url::Url::parse(endpoint).ok()?;
        {
            let mut q = u.query_pairs_mut();
            q.append_pair("client_id", &self.config.client_id);
            // the provider takes a way back only beside the id token it issued
            if let Some(t) = id_token {
                q.append_pair("id_token_hint", t);
                q.append_pair("post_logout_redirect_uri", back);
            }
        }
        Some(u.to_string())
    }

    /// The id token against the provider's keys: the key by id, refetched
    /// once on a miss; the issuer and the audience checked.
    async fn verify(&self, token: &str) -> Result<Value, String> {
        let header =
            jsonwebtoken::decode_header(token).map_err(|e| format!("the id token: {e}"))?;
        let kid = header.kid.clone().unwrap_or_default();
        let mut set = self.jwks(false).await?;
        if set.find(&kid).is_none() {
            set = self.jwks(true).await?;
        }
        let jwk = set
            .find(&kid)
            .ok_or_else(|| format!("the provider publishes no key {kid}"))?;
        let key = DecodingKey::from_jwk(jwk).map_err(|e| e.to_string())?;
        let alg = jwk
            .common
            .key_algorithm
            .and_then(|a| a.to_string().parse::<Algorithm>().ok())
            .unwrap_or(header.alg);
        let mut v = Validation::new(alg);
        v.set_issuer(&[
            self.config.issuer.trim_end_matches('/'),
            &self.config.issuer,
        ]);
        v.set_audience(&[self.config.client_id.as_str()]);
        let data = jsonwebtoken::decode::<Value>(token, &key, &v)
            .map_err(|e| format!("the id token: {e}"))?;
        Ok(data.claims)
    }
}
