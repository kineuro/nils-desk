// SPDX-License-Identifier: AGPL-3.0-only

//! The three identity modes (Wave 4c §5.1, §5.7 to §5.9): `local`, where the
//! desk is a small issuer and the engine cannot tell; `oidc`, against a fake
//! provider through the authorization code grant with PKCE; and the
//! registration script against a fake Authentik, idempotent on its second
//! run. Two users on a laptop in local mode; a person renamed at the
//! provider moves no row.

use std::sync::{Arc, Mutex};

use axum::Router;
use axum::extract::{Query, Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::{any, get, post};
use serde_json::{Value, json};

/// A fake engine that echoes the bearer it saw.
async fn fake_engine() -> String {
    let app = Router::new()
        .route(
            "/api/capabilities",
            get(|| async {
                axum::Json(json!({
                    "engine": {"name": "nils", "version": "1.0.0-alpha.0"},
                    "contracts": {"openapi": "3", "review_item": "4", "pack": "4", "suite": "1", "mcp": "1"},
                    "doors": ["GET /api/capabilities", "POST /api/jobs", "GET /api/jobs", "POST /api/ask/run", "GET /api/ask/handles", "GET /api/packs"],
                    "policy": [], "auth": "oidc", "principal": "x", "roles": [], "registry": {"epoch": 1}, "packs": [],
                }))
            }),
        )
        .route(
            "/api/jobs",
            any(|headers: HeaderMap, _req: Request| async move {
                let bearer = headers.get("authorization").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
                (StatusCode::ACCEPTED, axum::Json(json!({"bearer": bearer})))
            }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    url
}

/// A desk on a free port from the configuration text, with `{origin}` and
/// `{dir}` filled in.
async fn desk(text: &str) -> (String, Arc<nils_desk::Desk>, std::path::PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().to_path_buf();
    std::mem::forget(dir);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let text = text
        .replace("{origin}", &origin)
        .replace("{dir}", &path.display().to_string());
    let shared = nils_desk::start(&text).unwrap();
    let app = nils_desk::router(shared.clone());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (origin, shared, path)
}

fn cookie_of(r: &reqwest::Response) -> String {
    r.headers()
        .get("set-cookie")
        .and_then(|v| v.to_str().ok())
        .and_then(|c| c.split(';').next())
        .unwrap_or("")
        .to_string()
}

#[tokio::test]
async fn two_users_on_a_laptop_in_local_mode_and_the_engine_cannot_tell() {
    let engine = fake_engine().await;
    let text = format!(
        "origin = \"{{origin}}\"\nmode = \"local\"\nstore = \"{{dir}}/desk.sqlite\"\n[local]\nkey = \"{{dir}}/desk.key\"\n[engine]\nurl = \"{engine}\"\n"
    );
    let (origin, shared, dir) = desk(&text).await;
    // the key was made at first start, readable by the desk's account only
    let meta = std::fs::metadata(dir.join("desk.key")).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(meta.permissions().mode() & 0o777, 0o600);
    }
    // the first user is the admin; the second holds nothing yet
    nils_desk::users::add(
        &shared.store,
        "anna",
        "correct horse battery",
        Some("Anna"),
        &[],
        true,
    )
    .unwrap();
    nils_desk::users::add(
        &shared.store,
        "bo",
        "another long password",
        Some("Bo"),
        &[],
        false,
    )
    .unwrap();
    assert!(
        nils_desk::users::add(
            &shared.store,
            "bo",
            "another long password",
            None,
            &[],
            false
        )
        .is_err(),
        "no duplicate"
    );
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();

    // nobody: the document names the login, the shell names the state
    let doc: Value = client
        .get(format!("{origin}/desk/capabilities"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(doc["desk"]["signed_in"], false, "{doc}");
    assert_eq!(doc["desk"]["login"]["kind"], "password", "{doc}");
    assert_eq!(doc["person"]["entitlements"], json!([]));
    // a wrong password
    let r = client
        .post(format!("{origin}/desk/login"))
        .json(&json!({"username": "anna", "password": "wrong"}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 401);
    // anna logs in
    let r = client
        .post(format!("{origin}/desk/login"))
        .json(&json!({"username": "anna", "password": "correct horse battery"}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    let anna = cookie_of(&r);
    assert!(anna.starts_with("nils_desk="));
    let doc: Value = client
        .get(format!("{origin}/desk/capabilities"))
        .header("cookie", &anna)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(doc["person"]["display_name"], "Anna");
    assert_eq!(doc["person"]["entitlements"], json!(["admin"]), "{doc}");
    assert_eq!(doc["desk"]["signed_in"], true);

    // a proxied write carries a token the desk minted for anna, which the
    // engine verifies against the desk's own JWKS
    let r = client
        .post(format!("{origin}/api/jobs"))
        .header("cookie", &anna)
        .header("x-nils-desk", "1")
        .header("origin", &origin)
        .body("{}")
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 202);
    let got: Value = r.json().await.unwrap();
    let token = got["bearer"]
        .as_str()
        .unwrap()
        .strip_prefix("Bearer ")
        .expect("a bearer")
        .to_string();
    let jwks: jsonwebtoken::jwk::JwkSet = client
        .get(format!("{origin}/.well-known/jwks.json"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let header = jsonwebtoken::decode_header(&token).unwrap();
    let jwk = jwks
        .find(header.kid.as_deref().unwrap())
        .expect("the key the token names");
    let key = jsonwebtoken::DecodingKey::from_jwk(jwk).unwrap();
    let mut v = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::EdDSA);
    v.set_issuer(&[origin.as_str()]);
    v.set_audience(&["nils"]);
    let claims = jsonwebtoken::decode::<Value>(&token, &key, &v)
        .unwrap()
        .claims;
    assert_eq!(claims["sub"], "anna");
    assert_eq!(
        claims["roles"],
        json!(["admin"]),
        "no wider than the stored entitlements: {claims}"
    );
    assert!(
        claims["exp"].as_i64().unwrap() - claims["iat"].as_i64().unwrap() <= 15 * 60,
        "fifteen minutes"
    );
    let disc: Value = client
        .get(format!("{origin}/.well-known/openid-configuration"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(disc["issuer"], origin);

    // bo logs in and holds nothing: the unbound person, never a 403 body
    let r = client
        .post(format!("{origin}/desk/login"))
        .json(&json!({"username": "bo", "password": "another long password"}))
        .send()
        .await
        .unwrap();
    let bo = cookie_of(&r);
    let doc: Value = client
        .get(format!("{origin}/desk/capabilities"))
        .header("cookie", &bo)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(doc["person"]["entitlements"], json!([]), "{doc}");
    // bo is no admin: the users page refuses
    let r = client
        .get(format!("{origin}/desk/users"))
        .header("cookie", &bo)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403);
    // anna grants bo reader and assist on the settings page; a grant shows at once
    let r = client
        .put(format!("{origin}/desk/users/bo/entitlements"))
        .header("cookie", &anna)
        .header("x-nils-desk", "1")
        .header("origin", &origin)
        .json(&json!({"entitlements": ["reader", "assist"]}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200, "{}", r.text().await.unwrap());
    let doc: Value = client
        .get(format!("{origin}/desk/capabilities"))
        .header("cookie", &bo)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        doc["person"]["entitlements"],
        json!(["reader", "assist"]),
        "{doc}"
    );
    // and bo's next proxied call carries them
    let r = client
        .get(format!("{origin}/api/jobs"))
        .header("cookie", &bo)
        .send()
        .await
        .unwrap();
    let got: Value = r.json().await.unwrap();
    let token = got["bearer"]
        .as_str()
        .unwrap()
        .strip_prefix("Bearer ")
        .unwrap()
        .to_string();
    let claims = jsonwebtoken::decode::<Value>(&token, &key, &v)
        .unwrap()
        .claims;
    assert_eq!(claims["roles"], json!(["reader", "assist"]));
    // an unknown entitlement is refused; an admin does not revoke their own
    let r = client
        .put(format!("{origin}/desk/users/bo/entitlements"))
        .header("cookie", &anna)
        .header("x-nils-desk", "1")
        .header("origin", &origin)
        .json(&json!({"entitlements": ["king"]}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 400);
    let r = client
        .put(format!("{origin}/desk/users/anna/entitlements"))
        .header("cookie", &anna)
        .header("x-nils-desk", "1")
        .header("origin", &origin)
        .json(&json!({"entitlements": ["reader"]}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 400);
    // the users page lists both
    let list: Value = client
        .get(format!("{origin}/desk/users"))
        .header("cookie", &anna)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(list["users"].as_array().unwrap().len(), 2);
    // the command line's login: a token of one day
    let r = client
        .post(format!("{origin}/desk/cli-login"))
        .json(&json!({"username": "bo", "password": "another long password"}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    let t: Value = r.json().await.unwrap();
    let claims = jsonwebtoken::decode::<Value>(t["token"].as_str().unwrap(), &key, &v)
        .unwrap()
        .claims;
    assert!(claims["exp"].as_i64().unwrap() - claims["iat"].as_i64().unwrap() >= 23 * 3600);
    // logout ends the session
    let r = client
        .post(format!("{origin}/desk/logout"))
        .header("cookie", &bo)
        .header("x-nils-desk", "1")
        .header("origin", &origin)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 204);
    let doc: Value = client
        .get(format!("{origin}/desk/capabilities"))
        .header("cookie", &bo)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(doc["desk"]["signed_in"], false);
}

/// A fake provider: discovery, JWKS with an EdDSA key, an authorization
/// endpoint that redirects straight back with a code, and a token endpoint
/// that checks PKCE, the secret and the redirect, then mints an id token
/// for whoever the test says the person is.
struct Provider {
    issuer: Mutex<String>,
    key: ed25519_dalek::SigningKey,
    codes: Mutex<Vec<(String, String)>>,
    /// The person the provider answers for: subject, name, roles.
    person: Mutex<(String, String, Vec<String>)>,
    tokens_minted: Mutex<u32>,
}

async fn fake_provider() -> (String, Arc<Provider>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let issuer = format!("http://{}", listener.local_addr().unwrap());
    let p = Arc::new(Provider {
        issuer: Mutex::new(issuer.clone()),
        key: ed25519_dalek::SigningKey::generate(&mut rand_core::OsRng),
        codes: Mutex::new(Vec::new()),
        person: Mutex::new((
            "subject-1".into(),
            "Anna Andersson".into(),
            vec!["reviewer".into(), "assist".into()],
        )),
        tokens_minted: Mutex::new(0),
    });
    let iss = issuer.clone();
    let app = Router::new()
        .route(
            "/.well-known/openid-configuration",
            get({
                let iss = iss.clone();
                move || async move {
                    axum::Json(json!({
                        "issuer": iss,
                        "authorization_endpoint": format!("{iss}/authorize"),
                        "token_endpoint": format!("{iss}/token"),
                        "jwks_uri": format!("{iss}/jwks"),
                    }))
                }
            }),
        )
        .route(
            "/jwks",
            get(|State(p): State<Arc<Provider>>| async move {
                use base64::Engine as _;
                let x = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(p.key.verifying_key().to_bytes());
                axum::Json(json!({"keys": [{"kty": "OKP", "crv": "Ed25519", "x": x, "kid": "k1", "alg": "EdDSA", "use": "sig"}]}))
            }),
        )
        .route(
            "/authorize",
            get(|State(p): State<Arc<Provider>>, Query(q): Query<std::collections::HashMap<String, String>>| async move {
                assert_eq!(q["response_type"], "code");
                assert_eq!(q["code_challenge_method"], "S256");
                assert!(q["scope"].contains("openid"));
                let code = format!("code-{}", p.codes.lock().unwrap().len() + 1);
                p.codes.lock().unwrap().push((code.clone(), q["code_challenge"].clone()));
                Redirect::to(&format!("{}?code={code}&state={}", q["redirect_uri"], q["state"])).into_response()
            }),
        )
        .route(
            "/token",
            post(|State(p): State<Arc<Provider>>, axum::Form(f): axum::Form<std::collections::HashMap<String, String>>| async move {
                use base64::Engine as _;
                use ed25519_dalek::pkcs8::EncodePrivateKey;
                if f["client_secret"] != "the-client-secret" {
                    return (StatusCode::UNAUTHORIZED, axum::Json(json!({"error": "invalid_client"}))).into_response();
                }
                let (sub, name, roles) = p.person.lock().unwrap().clone();
                if f["grant_type"] == "authorization_code" {
                    let codes = p.codes.lock().unwrap();
                    let Some((_, challenge)) = codes.iter().find(|(c, _)| *c == f["code"]) else {
                        return (StatusCode::BAD_REQUEST, axum::Json(json!({"error": "invalid_grant"}))).into_response();
                    };
                    let want = {
                        use sha2::Digest;
                        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(sha2::Sha256::digest(f["code_verifier"].as_bytes()))
                    };
                    if *challenge != want {
                        return (StatusCode::BAD_REQUEST, axum::Json(json!({"error": "invalid_grant", "error_description": "pkce"}))).into_response();
                    }
                }
                *p.tokens_minted.lock().unwrap() += 1;
                let n = *p.tokens_minted.lock().unwrap();
                let now = time::OffsetDateTime::now_utc().unix_timestamp();
                let pem = p.key.to_pkcs8_pem(ed25519_dalek::pkcs8::spki::der::pem::LineEnding::LF).unwrap();
                let enc = jsonwebtoken::EncodingKey::from_ed_pem(pem.as_bytes()).unwrap();
                let mut header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::EdDSA);
                header.kid = Some("k1".into());
                let iss = p.issuer.lock().unwrap().clone();
                let claims = json!({"iss": iss, "aud": "desk-client", "sub": sub, "name": name, "preferred_username": "anna", "email": "anna@example.org", "roles": roles, "iat": now, "exp": now + 900});
                let id_token = jsonwebtoken::encode(&header, &claims, &enc).unwrap();
                axum::Json(json!({"access_token": format!("access-{n}"), "refresh_token": format!("refresh-{n}"), "expires_in": if f["grant_type"] == "authorization_code" { 30 } else { 900 }, "id_token": id_token, "token_type": "Bearer"})).into_response()
            }),
        )
        .with_state(p.clone());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (issuer, p)
}

#[tokio::test]
async fn oidc_mode_logs_in_through_the_provider_with_pkce_and_a_renamed_person_moves_no_row() {
    let engine = fake_engine().await;
    let (issuer, provider) = fake_provider().await;
    // the fake signs its id tokens with the placeholder issuer; patch it in
    let text = format!(
        "origin = \"{{origin}}\"\nmode = \"oidc\"\nstore = \"{{dir}}/desk.sqlite\"\n[engine]\nurl = \"{engine}\"\n[oidc]\nissuer = \"{issuer}\"\nclient_id = \"desk-client\"\nclient_secret = \"the-client-secret\"\n"
    );
    // the id token's iss is written by the fake as the literal issuer
    let (origin, shared, _) = desk(&text).await;
    let _ = shared;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    // nobody yet: the login is a redirect
    let doc: Value = client
        .get(format!("{origin}/desk/capabilities"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(doc["desk"]["login"]["kind"], "redirect");
    // to the provider, with PKCE and state
    let r = client
        .get(format!("{origin}/desk/login"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 303, "a redirect to the provider");
    let to = r
        .headers()
        .get("location")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    assert!(to.starts_with(&format!("{issuer}/authorize?")), "{to}");
    assert!(to.contains("code_challenge_method=S256"));
    // the provider sends the browser back with a code
    let r = client.get(&to).send().await.unwrap();
    assert_eq!(r.status(), 303);
    let back = r
        .headers()
        .get("location")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    assert!(
        back.starts_with(&format!("{origin}/desk/callback?")),
        "{back}"
    );
    // a callback with a state the desk did not begin is refused
    let r = client
        .get(format!("{origin}/desk/callback?code=x&state=nope"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 400);
    // the real callback: a session, the display name recorded at first sight
    let r = client.get(&back).send().await.unwrap();
    assert_eq!(r.status(), 303, "{}", r.text().await.unwrap());
    let anna = cookie_of(&r);
    let doc: Value = client
        .get(format!("{origin}/desk/capabilities"))
        .header("cookie", &anna)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(doc["person"]["subject"], "subject-1", "{doc}");
    assert_eq!(doc["person"]["display_name"], "Anna Andersson");
    assert_eq!(doc["person"]["entitlements"], json!(["reviewer", "assist"]));
    // a proxied call carries the person's access token, refreshed before
    // expiry: the code grant gave thirty seconds, so the first call refreshes
    let r = client
        .get(format!("{origin}/api/jobs"))
        .header("cookie", &anna)
        .send()
        .await
        .unwrap();
    let got: Value = r.json().await.unwrap();
    assert_eq!(got["bearer"], "Bearer access-2", "refreshed once: {got}");
    let r = client
        .get(format!("{origin}/api/jobs"))
        .header("cookie", &anna)
        .send()
        .await
        .unwrap();
    let got: Value = r.json().await.unwrap();
    assert_eq!(
        got["bearer"], "Bearer access-2",
        "and kept while fresh: {got}"
    );
    // a person renamed at the provider: the same subject, a new display, no new row
    *provider.person.lock().unwrap() = (
        "subject-1".into(),
        "Anna Bergström".into(),
        vec!["reviewer".into(), "assist".into()],
    );
    let r = client
        .get(format!("{origin}/desk/login"))
        .send()
        .await
        .unwrap();
    let to = r
        .headers()
        .get("location")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    let back = client
        .get(&to)
        .send()
        .await
        .unwrap()
        .headers()
        .get("location")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    let r = client.get(&back).send().await.unwrap();
    let again = cookie_of(&r);
    let doc: Value = client
        .get(format!("{origin}/desk/capabilities"))
        .header("cookie", &again)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(doc["person"]["subject"], "subject-1");
    assert_eq!(doc["person"]["display_name"], "Anna Bergström");
    let people = shared.store.people();
    assert_eq!(people.len(), 1, "one row for one subject: {people:?}");
    assert_eq!(people[0].1, "Anna Bergström");
}

/// A fake Authentik: the objects the registration creates, in memory.
#[derive(Default)]
struct Ak {
    objects: Mutex<std::collections::BTreeMap<String, Vec<Value>>>,
    posts: Mutex<u32>,
}

async fn fake_authentik() -> (String, Arc<Ak>) {
    let ak = Arc::new(Ak::default());
    {
        let mut o = ak.objects.lock().unwrap();
        o.insert("/flows/instances/".into(), vec![
            json!({"pk": "f-auth", "slug": "default-provider-authorization-implicit-consent", "designation": "authorization"}),
            json!({"pk": "f-inv", "slug": "default-provider-invalidation-flow", "designation": "invalidation"}),
        ]);
        o.insert(
            "/core/groups/".into(),
            vec![
                json!({"pk": "g-staff", "name": "staff"}),
                json!({"pk": "g-ops", "name": "neuro-ops"}),
            ],
        );
        o.insert("/propertymappings/provider/scope/".into(), ["openid", "email", "profile", "offline_access", "entitlements"].iter().map(|s| json!({"pk": format!("m-{s}"), "scope_name": s, "managed": format!("goauthentik.io/providers/oauth2/scope-{s}")})).collect());
    }
    async fn list(
        State(ak): State<Arc<Ak>>,
        axum::extract::Path(path): axum::extract::Path<String>,
        Query(q): Query<std::collections::HashMap<String, String>>,
    ) -> Response {
        let path = format!("/{}/", path.trim_matches('/'));
        let o = ak.objects.lock().unwrap();
        let rows: Vec<Value> = o
            .get(&path)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|r| {
                q.iter().filter(|(k, _)| *k != "page_size").all(|(k, v)| {
                    r.get(k)
                        .map(|x| match x {
                            Value::String(s) => s == v,
                            other => format!("{other}") == *v,
                        })
                        .unwrap_or(false)
                })
            })
            .collect();
        axum::Json(json!({"results": rows})).into_response()
    }
    async fn create(
        State(ak): State<Arc<Ak>>,
        axum::extract::Path(path): axum::extract::Path<String>,
        axum::Json(body): axum::Json<Value>,
    ) -> Response {
        *ak.posts.lock().unwrap() += 1;
        let path = format!("/{}/", path.trim_matches('/'));
        let mut o = ak.objects.lock().unwrap();
        let n = o.values().map(Vec::len).sum::<usize>() + 1;
        let mut row = body.clone();
        let target = if path.ends_with("generate/") {
            "/crypto/certificatekeypairs/".to_string()
        } else {
            path.clone()
        };
        row["pk"] = json!(format!("pk-{n}"));
        if target == "/providers/oauth2/" {
            row["client_id"] = json!("client-abc");
            row["client_secret"] = json!("secret-xyz");
        }
        if target == "/core/applications/" {
            row["pk"] = json!(format!("app-{n}"));
        }
        if target == "/core/application_entitlements/" {
            row["pbm_uuid"] = json!(format!("ent-{n}"));
        }
        if target == "/crypto/certificatekeypairs/" {
            row["name"] = body["common_name"].clone();
        }
        o.entry(target).or_default().push(row.clone());
        (StatusCode::CREATED, axum::Json(row)).into_response()
    }
    async fn patch(
        State(ak): State<Arc<Ak>>,
        axum::extract::Path(path): axum::extract::Path<String>,
        axum::Json(body): axum::Json<Value>,
    ) -> Response {
        let full = format!("/{}/", path.trim_matches('/'));
        let (coll, pk) = full
            .trim_end_matches('/')
            .rsplit_once('/')
            .map(|(c, p)| (format!("{c}/"), p.to_string()))
            .unwrap();
        let mut o = ak.objects.lock().unwrap();
        let rows = o.entry(coll).or_default();
        for r in rows.iter_mut() {
            if r["pk"] == pk || r["slug"] == pk {
                for (k, v) in body.as_object().unwrap() {
                    r[k] = v.clone();
                }
                return axum::Json(r.clone()).into_response();
            }
        }
        StatusCode::NOT_FOUND.into_response()
    }
    let app = Router::new()
        .route("/api/v3/{*path}", get(list).post(create).patch(patch))
        .with_state(ak.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (url, ak)
}

#[tokio::test]
async fn the_registration_creates_everything_once_and_a_second_run_changes_nothing() {
    let (url, ak) = fake_authentik().await;
    let api = nils_desk::register::Api::new(&url, "token");
    let plan = nils_desk::register::Plan {
        authentik: url.clone(),
        slug: "nils".into(),
        name: "NILS".into(),
        origin: "https://desk.example.org".into(),
        allow: vec!["staff".into()],
        bind: vec![
            ("reader".into(), "staff".into()),
            ("operator".into(), "neuro-ops".into()),
            ("assist".into(), "staff".into()),
        ],
    };
    let r = nils_desk::register::register(&api, &plan).await.unwrap();
    assert_eq!(r.client_id, "client-abc");
    assert_eq!(r.client_secret, "secret-xyz");
    assert_eq!(r.issuer, format!("{url}/application/o/nils/"));
    assert!(r.found.is_empty(), "{:?}", r.found);
    assert!(r.created.iter().any(|c| c == "provider"));
    assert!(r.created.iter().any(|c| c == "entitlement assist"));
    let flags = r.flags();
    assert!(
        flags.contains("--oidc-trust issuer=")
            && flags.contains("audience=client-abc")
            && flags.contains("--oidc-groups-claim roles --role reader=reader"),
        "{flags}"
    );
    let posts = *ak.posts.lock().unwrap();
    // key, provider, application, one allow binding, five entitlements, three bindings
    assert_eq!(posts, 1 + 1 + 1 + 1 + 5 + 3, "{:?}", r.created);
    {
        let o = ak.objects.lock().unwrap();
        let p = &o["/providers/oauth2/"][0];
        assert_eq!(
            p["redirect_uris"][0]["url"],
            "https://desk.example.org/desk/callback"
        );
        assert_eq!(p["access_token_validity"], "minutes=15");
        assert_eq!(p["refresh_token_validity"], "days=30");
        assert_eq!(p["property_mappings"].as_array().unwrap().len(), 5);
        assert_eq!(p["client_type"], "confidential");
    }
    // the second run
    let r2 = nils_desk::register::register(&api, &plan).await.unwrap();
    assert!(r2.created.is_empty(), "{:?}", r2.created);
    assert_eq!(
        *ak.posts.lock().unwrap(),
        posts,
        "nothing posted the second time"
    );
    assert_eq!(r2.client_id, r.client_id);
}
