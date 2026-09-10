// SPDX-License-Identifier: AGPL-3.0-only

//! `nils-desk register --authentik URL --token FILE`: the idempotent
//! registration of Wave 4c §5.7. It creates, or finds, the application, the
//! OAuth2 provider with a signing key, the policy binding of the groups that
//! may use it, the five entitlements bound to the groups the operator names,
//! and attaches the entitlements scope mapping; then it prints the trust
//! flag and the role flags to paste into the engine's command line. A second
//! run changes nothing.

use serde_json::{Value, json};

pub const ENTITLEMENTS: &[&str] = &["reader", "reviewer", "operator", "admin", "assist"];

pub struct Plan {
    pub authentik: String,
    pub slug: String,
    pub name: String,
    /// The desk's origin: the redirect URI is `{origin}/desk/callback`.
    pub origin: String,
    /// Groups that may use the application at all.
    pub allow: Vec<String>,
    /// Entitlement to group.
    pub bind: Vec<(String, String)>,
}

pub struct Registered {
    pub issuer: String,
    pub client_id: String,
    pub client_secret: String,
    pub jwks: String,
    pub created: Vec<String>,
    pub found: Vec<String>,
}

pub struct Api {
    base: String,
    token: String,
    http: reqwest::Client,
}

impl Api {
    pub fn new(base: &str, token: &str) -> Api {
        Api {
            base: base.trim_end_matches('/').to_string(),
            token: token.trim().to_string(),
            http: reqwest::Client::new(),
        }
    }

    async fn get(&self, path: &str) -> Result<Value, String> {
        let url = format!("{}/api/v3{path}", self.base);
        let r = self
            .http
            .get(&url)
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(|e| format!("{url}: {e}"))?;
        let status = r.status();
        let body: Value = r.json().await.unwrap_or(Value::Null);
        if !status.is_success() {
            return Err(format!("GET {path} answered {status}: {body}"));
        }
        Ok(body)
    }

    async fn post(&self, path: &str, body: &Value) -> Result<Value, String> {
        let url = format!("{}/api/v3{path}", self.base);
        let r = self
            .http
            .post(&url)
            .bearer_auth(&self.token)
            .json(body)
            .send()
            .await
            .map_err(|e| format!("{url}: {e}"))?;
        let status = r.status();
        let out: Value = r.json().await.unwrap_or(Value::Null);
        if !status.is_success() {
            return Err(format!("POST {path} answered {status}: {out}"));
        }
        Ok(out)
    }

    async fn patch(&self, path: &str, body: &Value) -> Result<Value, String> {
        let url = format!("{}/api/v3{path}", self.base);
        let r = self
            .http
            .patch(&url)
            .bearer_auth(&self.token)
            .json(body)
            .send()
            .await
            .map_err(|e| format!("{url}: {e}"))?;
        let status = r.status();
        let out: Value = r.json().await.unwrap_or(Value::Null);
        if !status.is_success() {
            return Err(format!("PATCH {path} answered {status}: {out}"));
        }
        Ok(out)
    }

    /// The one object of a listing whose fields equal the query's pairs,
    /// matched here rather than trusted to the server's filters: not every
    /// listing filters on every field, and a wrong "found" is the one
    /// mistake an idempotent script must not make.
    async fn first(&self, path: &str) -> Result<Option<Value>, String> {
        let checks: Vec<(String, String)> = path
            .split_once('?')
            .map(|(_, q)| {
                url::form_urlencoded::parse(q.as_bytes())
                    .map(|(k, v)| (k.into_owned(), v.into_owned()))
                    .collect()
            })
            .unwrap_or_default();
        let sep = if path.contains('?') { '&' } else { '?' };
        let page = self.get(&format!("{path}{sep}page_size=200")).await?;
        Ok(page["results"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|r| checks.iter().all(|(k, v)| field_is(r, k, v)))
            .cloned())
    }
}

async fn flow(api: &Api, designation: &str, prefer: &str) -> Result<String, String> {
    let page = api
        .get(&format!(
            "/flows/instances/?designation={designation}&page_size=50"
        ))
        .await?;
    let flows = page["results"].as_array().cloned().unwrap_or_default();
    let pick = flows
        .iter()
        .find(|f| f["slug"] == prefer)
        .or_else(|| flows.first())
        .ok_or_else(|| format!("the provider has no {designation} flow"))?;
    Ok(pick["pk"].as_str().unwrap_or("").to_string())
}

async fn group(api: &Api, name: &str) -> Result<String, String> {
    let g = api
        .first(&format!("/core/groups/?name={}", urlencode(name)))
        .await?
        .ok_or_else(|| format!("no group named {name} at the provider"))?;
    Ok(g["pk"].as_str().unwrap_or("").to_string())
}

/// A primary key as it goes into a path: a number or a string, never
/// JSON's quotes around it.
fn id(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

fn field_is(r: &Value, k: &str, v: &str) -> bool {
    match &r[k] {
        Value::String(s) => s == v,
        Value::Null => false,
        other => format!("{other}") == v,
    }
}

fn urlencode(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

pub async fn register(api: &Api, plan: &Plan) -> Result<Registered, String> {
    let mut created = Vec::new();
    let mut found = Vec::new();
    let origin = plan.origin.trim_end_matches('/');
    let redirect = format!("{origin}/desk/callback");

    // the signing key
    let key_name = format!("{} (signing)", plan.name);
    let key = match api
        .first(&format!(
            "/crypto/certificatekeypairs/?name={}",
            urlencode(&key_name)
        ))
        .await?
    {
        Some(k) => {
            found.push("signing key".into());
            k
        }
        None => {
            let k = api
                .post(
                    "/crypto/certificatekeypairs/generate/",
                    &json!({"common_name": key_name, "validity_days": 3650, "alg": "rsa"}),
                )
                .await?;
            created.push("signing key".into());
            k
        }
    };
    let key_pk = key["pk"].as_str().unwrap_or("").to_string();

    // the scope mappings: the standard ones and the entitlements
    let mappings = api
        .get("/propertymappings/provider/scope/?page_size=100")
        .await?;
    let want = [
        "openid",
        "email",
        "profile",
        "offline_access",
        "entitlements",
    ];
    let mut mapping_pks = Vec::new();
    for w in want {
        let m = mappings["results"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|m| {
                m["scope_name"] == w
                    && m["managed"]
                        .as_str()
                        .is_some_and(|s| s.starts_with("goauthentik.io/providers/oauth2/"))
            })
            .ok_or_else(|| format!("the provider has no managed scope mapping for {w}"))?;
        mapping_pks.push(m["pk"].clone());
    }

    // the provider
    let authorization = flow(
        api,
        "authorization",
        "default-provider-authorization-implicit-consent",
    )
    .await?;
    let invalidation = flow(api, "invalidation", "default-provider-invalidation-flow").await?;
    let provider_body = json!({
        "name": plan.name,
        "authorization_flow": authorization,
        "invalidation_flow": invalidation,
        "client_type": "confidential",
        // without these the provider allows no grant at all and the first
        // sign in fails as `invalid_request`, which says nothing about why
        "grant_types": ["authorization_code", "refresh_token"],
        "redirect_uris": [{"matching_mode": "strict", "url": redirect}],
        "signing_key": key_pk,
        "property_mappings": mapping_pks,
        "access_token_validity": "minutes=15",
        "refresh_token_validity": "days=30",
        "sub_mode": "hashed_user_id",
        "issuer_mode": "per_provider",
        "include_claims_in_id_token": true,
    });
    let provider = match api
        .first(&format!(
            "/providers/oauth2/?name={}",
            urlencode(&plan.name)
        ))
        .await?
    {
        Some(p) => {
            found.push("provider".into());
            let mut patch = provider_body.clone();
            patch.as_object_mut().map(|m| m.remove("name"));
            api.patch(&format!("/providers/oauth2/{}/", id(&p["pk"])), &patch)
                .await?
        }
        None => {
            created.push("provider".into());
            api.post("/providers/oauth2/", &provider_body).await?
        }
    };
    let provider_pk = provider["pk"].clone();

    // the application
    let app = match api
        .first(&format!(
            "/core/applications/?slug={}",
            urlencode(&plan.slug)
        ))
        .await?
    {
        Some(a) => {
            found.push("application".into());
            if a["provider"] != provider_pk {
                api.patch(
                    &format!("/core/applications/{}/", plan.slug),
                    &json!({"provider": provider_pk}),
                )
                .await?
            } else {
                a
            }
        }
        None => {
            created.push("application".into());
            api.post(
                "/core/applications/",
                &json!({"name": plan.name, "slug": plan.slug, "provider": provider_pk, "meta_launch_url": format!("{origin}/")}),
            )
            .await?
        }
    };
    let app_pk = app["pk"].as_str().unwrap_or("").to_string();

    // who may use it
    for g in &plan.allow {
        let gpk = group(api, g).await?;
        let bound = api
            .first(&format!("/policies/bindings/?target={app_pk}&group={gpk}"))
            .await?;
        if bound.is_none() {
            api.post(
                "/policies/bindings/",
                &json!({"target": app_pk, "group": gpk, "order": 0}),
            )
            .await?;
            created.push(format!("binding of {g} to the application"));
        } else {
            found.push(format!("binding of {g} to the application"));
        }
    }

    // the five entitlements, each bound to the group the operator named
    for e in ENTITLEMENTS {
        let ent = match api
            .first(&format!(
                "/core/application_entitlements/?app={app_pk}&name={e}"
            ))
            .await?
        {
            Some(x) => {
                found.push(format!("entitlement {e}"));
                x
            }
            None => {
                created.push(format!("entitlement {e}"));
                api.post(
                    "/core/application_entitlements/",
                    &json!({"app": app_pk, "name": e}),
                )
                .await?
            }
        };
        let ent_pk = ent["pbm_uuid"]
            .as_str()
            .or(ent["pk"].as_str())
            .unwrap_or("")
            .to_string();
        for (name, g) in plan.bind.iter().filter(|(n, _)| n == e) {
            let gpk = group(api, g).await?;
            let bound = api
                .first(&format!("/policies/bindings/?target={ent_pk}&group={gpk}"))
                .await?;
            if bound.is_none() {
                api.post(
                    "/policies/bindings/",
                    &json!({"target": ent_pk, "group": gpk, "order": 0}),
                )
                .await?;
                created.push(format!("{name} bound to {g}"));
            } else {
                found.push(format!("{name} bound to {g}"));
            }
        }
    }

    let issuer = format!("{}/application/o/{}/", api.base, plan.slug);
    Ok(Registered {
        jwks: format!("{issuer}jwks/"),
        issuer,
        client_id: provider["client_id"].as_str().unwrap_or("").to_string(),
        client_secret: provider["client_secret"].as_str().unwrap_or("").to_string(),
        created,
        found,
    })
}

impl Registered {
    /// The flags to paste: the engine's trust entry and its role map.
    pub fn flags(&self) -> String {
        let roles: Vec<String> = ["reader", "reviewer", "operator", "admin"]
            .iter()
            .map(|r| format!("--role {r}={r}"))
            .collect();
        format!(
            "--auth oidc --oidc-trust issuer={},audience={},jwks={} --oidc-groups-claim roles {}",
            self.issuer,
            self.client_id,
            self.jwks,
            roles.join(" ")
        )
    }
}
