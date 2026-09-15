// SPDX-License-Identifier: AGPL-3.0-only

//! The three identity modes (Wave 4c §5.1, §5.7 to §5.9): `local`, where the
//! desk is a small issuer and the engine cannot tell; `oidc`, against a fake
//! provider through the authorization code grant with PKCE, where the desk
//! signs for the person with what the provider's groups give; and the
//! registration script against a fake Authentik, idempotent on its second
//! run. Two users on a laptop in local mode; a person renamed at the
//! provider moves no row; groups and people changed through the identity
//! doors; the parts the desk opens by grant.

use std::sync::{Arc, Mutex};

use axum::Router;
use axum::extract::{Query, Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::{any, get, post};
use nils_desk::grants::{self, Access, Detail};
use nils_desk::store::{Change, Claims};
use nils_desk::users::Given;
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

/// A part that answers anything, and the bearer each call to it carried.
async fn fake_part() -> (String, Arc<Mutex<Vec<String>>>) {
    let heard = Arc::new(Mutex::new(Vec::new()));
    let log = heard.clone();
    let app = Router::new().fallback(move |headers: HeaderMap| {
        let log = log.clone();
        async move {
            let bearer = headers
                .get("authorization")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();
            log.lock().unwrap().push(bearer.clone());
            axum::Json(json!({ "bearer": bearer }))
        }
    });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (url, heard)
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

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap()
}

/// A write from the desk's own front end: the header a cross-origin form
/// cannot send, and the desk's own origin.
fn ours(r: reqwest::RequestBuilder, origin: &str) -> reqwest::RequestBuilder {
    r.header("x-nils-desk", "1").header("origin", origin)
}

async fn login(client: &reqwest::Client, origin: &str, username: &str, password: &str) -> String {
    let r = ours(client.post(format!("{origin}/desk/login")), origin)
        .json(&json!({"username": username, "password": password}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200, "{username} logs in");
    cookie_of(&r)
}

async fn get_json(client: &reqwest::Client, url: String, cookie: &str) -> Value {
    client
        .get(url)
        .header("cookie", cookie)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap()
}

/// The claims of a bearer the desk minted, verified against its own JWKS.
async fn claims_of(client: &reqwest::Client, origin: &str, bearer: &str) -> Value {
    let token = bearer.strip_prefix("Bearer ").expect("a bearer");
    let jwks: jsonwebtoken::jwk::JwkSet = client
        .get(format!("{origin}/.well-known/jwks.json"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let header = jsonwebtoken::decode_header(token).unwrap();
    let jwk = jwks
        .find(header.kid.as_deref().unwrap())
        .expect("the key the token names");
    let key = jsonwebtoken::DecodingKey::from_jwk(jwk).unwrap();
    let mut v = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::EdDSA);
    v.set_issuer(&[origin]);
    v.set_audience(&["nils"]);
    jsonwebtoken::decode::<Value>(token, &key, &v)
        .unwrap()
        .claims
}

/// The grants a list of names stands for, as the desk lists them.
fn grants_of(names: &[&str]) -> Value {
    json!(grants::of_names(names.iter().copied()).list())
}

fn admin() -> Given {
    Given {
        admin: true,
        ..Default::default()
    }
}

fn entitled(names: &[&str]) -> Given {
    Given {
        entitlements: names.iter().map(|n| n.to_string()).collect(),
        ..Default::default()
    }
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
    // the first user is an admin, in Admins; the second holds nothing yet
    nils_desk::users::add(
        &shared.store,
        "anna",
        "correct horse battery",
        Some("Anna"),
        &admin(),
    )
    .unwrap();
    nils_desk::users::add(
        &shared.store,
        "bo",
        "another long password",
        Some("Bo"),
        &Given::default(),
    )
    .unwrap();
    assert!(
        nils_desk::users::add(
            &shared.store,
            "bo",
            "another long password",
            None,
            &Given::default()
        )
        .is_err(),
        "no duplicate"
    );
    let client = client();

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
    assert_eq!(doc["person"]["grants"], json!([]));
    assert_eq!(doc["person"]["groups"], json!([]));
    // a login posted from another site is refused before the password is looked at
    let r = client
        .post(format!("{origin}/desk/login"))
        .json(&json!({"username": "anna", "password": "correct horse battery"}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403);
    let r = client
        .post(format!("{origin}/desk/login"))
        .header("x-nils-desk", "1")
        .header("origin", "https://evil.example")
        .json(&json!({"username": "anna", "password": "correct horse battery"}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403);
    // a wrong password
    let r = ours(client.post(format!("{origin}/desk/login")), &origin)
        .json(&json!({"username": "anna", "password": "wrong"}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 401);
    // anna logs in, and holds what Admins give
    let anna = login(&client, &origin, "anna", "correct horse battery").await;
    let doc = get_json(&client, format!("{origin}/desk/capabilities"), &anna).await;
    assert_eq!(doc["person"]["display_name"], "Anna");
    assert_eq!(doc["person"]["grants"], json!(grants::GRANTS), "{doc}");
    assert_eq!(doc["person"]["detail"], "sensitive");
    assert_eq!(doc["person"]["groups"], json!(["Admins"]));
    assert!(
        doc["person"].get("entitlements").is_none() && doc["person"].get("roles").is_none(),
        "{doc}"
    );
    assert_eq!(doc["desk"]["signed_in"], true);

    // a proxied write carries a token the desk minted for anna, which the
    // engine verifies against the desk's own JWKS
    let r = ours(client.post(format!("{origin}/api/jobs")), &origin)
        .header("cookie", &anna)
        .body("{}")
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 202);
    let got: Value = r.json().await.unwrap();
    let claims = claims_of(&client, &origin, got["bearer"].as_str().unwrap()).await;
    assert_eq!(claims["sub"], "anna");
    assert_eq!(claims["preferred_username"], "anna");
    assert_eq!(claims["name"], "Anna");
    assert_eq!(
        claims["grants"],
        json!(grants::GRANTS),
        "sorted, and no wider than what anna holds: {claims}"
    );
    assert_eq!(claims["detail"], "sensitive");
    assert!(claims.get("roles").is_none(), "no roles: {claims}");
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
    assert_eq!(disc["token_endpoint"], format!("{origin}/desk/cli-login"));
    let supported = disc["claims_supported"].as_array().unwrap();
    assert!(supported.contains(&json!("grants")) && supported.contains(&json!("detail")));

    // bo logs in and holds nothing: the unbound person, never a 403 body
    let bo = login(&client, &origin, "bo", "another long password").await;
    let doc = get_json(&client, format!("{origin}/desk/capabilities"), &bo).await;
    assert_eq!(doc["person"]["grants"], json!([]), "{doc}");
    // bo holds no identity:see: the users page refuses
    let r = client
        .get(format!("{origin}/desk/users"))
        .header("cookie", &bo)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403);
    // anna gives bo reader and assist through the users door of the ladder,
    // which answers for one release; it shows at once
    let r = ours(
        client.put(format!("{origin}/desk/users/bo/entitlements")),
        &origin,
    )
    .header("cookie", &anna)
    .json(&json!({"entitlements": ["reader", "assist"]}))
    .send()
    .await
    .unwrap();
    assert_eq!(r.status(), 200);
    let body: Value = r.json().await.unwrap();
    assert_eq!(body["entitlements"], json!(["reader", "assist"]), "{body}");
    let doc = get_json(&client, format!("{origin}/desk/capabilities"), &bo).await;
    assert_eq!(
        doc["person"]["grants"],
        grants_of(&["reader", "assist"]),
        "{doc}"
    );
    assert_eq!(doc["person"]["detail"], "plain");
    // and bo's next proxied call carries them
    let got: Value = client
        .get(format!("{origin}/api/jobs"))
        .header("cookie", &bo)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let claims = claims_of(&client, &origin, got["bearer"].as_str().unwrap()).await;
    assert_eq!(claims["grants"], grants_of(&["reader", "assist"]));
    assert_eq!(claims["detail"], "plain");
    // an unknown entitlement is refused; so is taking identity:work from the only person holding it
    let r = ours(
        client.put(format!("{origin}/desk/users/bo/entitlements")),
        &origin,
    )
    .header("cookie", &anna)
    .json(&json!({"entitlements": ["king"]}))
    .send()
    .await
    .unwrap();
    assert_eq!(r.status(), 400);
    let r = ours(
        client.put(format!("{origin}/desk/users/anna/entitlements")),
        &origin,
    )
    .header("cookie", &anna)
    .json(&json!({"entitlements": ["reader"]}))
    .send()
    .await
    .unwrap();
    assert_eq!(r.status(), 409);
    let body: Value = r.json().await.unwrap();
    assert!(body["error"].is_string(), "{body}");
    // the users page lists both, in entitlements
    let list = get_json(&client, format!("{origin}/desk/users"), &anna).await;
    let users = list["users"].as_array().unwrap();
    assert_eq!(users.len(), 2);
    // each with when they last signed in, and the sessions open now
    assert!(users.iter().all(|u| u["last_seen"].is_string()), "{list}");
    assert!(
        list["sessions_open"].as_i64().is_some_and(|n| n >= 2),
        "{list}"
    );
    let a = users.iter().find(|u| u["username"] == "anna").unwrap();
    assert_eq!(a["entitlements"], json!(["admin", "assist"]));
    assert_eq!(a["admin"], true);
    // the command line's login: a token of one day, with what bo holds
    let r = client
        .post(format!("{origin}/desk/cli-login"))
        .json(&json!({"username": "bo", "password": "another long password"}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    let t: Value = r.json().await.unwrap();
    let bearer = format!("Bearer {}", t["token"].as_str().unwrap());
    let claims = claims_of(&client, &origin, &bearer).await;
    assert!(claims["exp"].as_i64().unwrap() - claims["iat"].as_i64().unwrap() >= 23 * 3600);
    assert_eq!(claims["grants"], grants_of(&["reader", "assist"]));
    // logout from another site is refused; from the desk it ends the session
    let r = client
        .post(format!("{origin}/desk/logout"))
        .header("cookie", &bo)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403);
    let r = ours(client.post(format!("{origin}/desk/logout")), &origin)
        .header("cookie", &bo)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 204);
    let doc = get_json(&client, format!("{origin}/desk/capabilities"), &bo).await;
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
    /// The person the provider answers for: subject, name, roles, groups.
    person: Mutex<(String, String, Vec<String>, Vec<String>)>,
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
            vec!["staff".into()],
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
                let (sub, name, roles, groups) = p.person.lock().unwrap().clone();
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
                let claims = json!({"iss": iss, "aud": "desk-client", "sub": sub, "name": name, "preferred_username": "anna", "email": "anna@example.org", "roles": roles, "groups": groups, "iat": now, "exp": now + 900});
                let id_token = jsonwebtoken::encode(&header, &claims, &enc).unwrap();
                axum::Json(json!({"access_token": format!("access-{n}"), "refresh_token": format!("refresh-{n}"), "expires_in": if f["grant_type"] == "authorization_code" { 30 } else { 900 }, "id_token": id_token, "token_type": "Bearer"})).into_response()
            }),
        )
        .with_state(p.clone());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (issuer, p)
}

/// Through the provider and back: the desk's login redirect, the provider's
/// redirect with a code, and the callback that makes the session.
async fn sign_in(client: &reqwest::Client, origin: &str, issuer: &str) -> String {
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
    // the profile scope, which carries the groups a person is in
    assert!(to.contains("profile"), "{to}");
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
    let r = client.get(&back).send().await.unwrap();
    assert_eq!(r.status(), 303, "{}", r.text().await.unwrap());
    cookie_of(&r)
}

#[tokio::test]
async fn oidc_mode_signs_in_at_the_provider_and_the_desk_signs_for_the_person_it_names() {
    let engine = fake_engine().await;
    let (issuer, provider) = fake_provider().await;
    let text = format!(
        "origin = \"{{origin}}\"\nmode = \"oidc\"\nstore = \"{{dir}}/desk.sqlite\"\n[local]\nkey = \"{{dir}}/desk.key\"\n[engine]\nurl = \"{engine}\"\n[oidc]\nissuer = \"{issuer}\"\nclient_id = \"desk-client\"\nclient_secret = \"the-client-secret\"\n"
    );
    let (origin, shared, _) = desk(&text).await;
    let client = client();
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
    // the desk signs here too: its issuer answers, the settings name the
    // groups claim, and the engine is told to trust the desk beside the provider
    let signing = &doc["desk"]["settings"]["signing"];
    assert_eq!(signing["groups_claim"], "groups", "{signing}");
    assert_eq!(signing["roles_claim"], "roles", "{signing}");
    assert_eq!(signing["audience"], "nils", "{signing}");
    let flags = doc["desk"]["settings"]["engine_flags"].as_str().unwrap();
    assert!(
        flags.contains(&format!("--oidc-trust issuer={origin},audience=nils,"))
            && flags.contains(&format!(
                "--oidc-trust issuer={issuer},audience=desk-client,"
            )),
        "{flags}"
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
    assert!(
        disc["token_endpoint"].is_null(),
        "no passwords here: {disc}"
    );
    // a callback with a state the desk did not begin is refused
    let r = client
        .get(format!("{origin}/desk/callback?code=x&state=nope"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 400);
    // the real sign-in: a session, the display name recorded at first sight,
    // and the legacy entitlements of the roles claim standing for their sets
    let anna = sign_in(&client, &origin, &issuer).await;
    let doc = get_json(&client, format!("{origin}/desk/capabilities"), &anna).await;
    assert_eq!(doc["person"]["subject"], "subject-1", "{doc}");
    assert_eq!(doc["person"]["display_name"], "Anna Andersson");
    assert_eq!(doc["person"]["grants"], grants_of(&["reviewer", "assist"]));
    assert_eq!(doc["person"]["detail"], "quasi");
    assert_eq!(doc["person"]["groups"], json!([]));
    // a proxied call carries the desk's token, not the provider's: the
    // provider's own token is still refreshed before its expiry, and the code
    // grant gave thirty seconds, so the first call refreshes it once
    let first: Value = client
        .get(format!("{origin}/api/jobs"))
        .header("cookie", &anna)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let first = first["bearer"].as_str().unwrap().to_string();
    assert!(!first.contains("access-"), "{first}");
    assert_eq!(*provider.tokens_minted.lock().unwrap(), 2, "refreshed once");
    let claims = claims_of(&client, &origin, &first).await;
    let host = issuer.trim_start_matches("http://");
    assert_eq!(
        claims["sub"],
        format!("subject-1@{host}"),
        "the principal the parts knew anna by: {claims}"
    );
    assert_eq!(claims["preferred_username"], "anna");
    assert_eq!(claims["name"], "Anna Andersson");
    assert_eq!(claims["grants"], grants_of(&["reviewer", "assist"]));
    assert_eq!(claims["detail"], "quasi");
    assert!(claims.get("roles").is_none(), "{claims}");
    // and kept while fresh and while it says what anna holds
    let again: Value = client
        .get(format!("{origin}/api/jobs"))
        .header("cookie", &anna)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(again["bearer"], first);
    assert_eq!(*provider.tokens_minted.lock().unwrap(), 2);
    // a group the admin makes that follows the provider's staff group gives
    // anna what it holds at her next click
    let staff = shared
        .store
        .change(
            true,
            Change::GroupAdd {
                name: "Staff".into(),
                access: Access::new(["kvasir:work", "identity:see"], Detail::Plain),
                follows: vec!["staff".into()],
            },
        )
        .unwrap()
        .unwrap();
    let doc = get_json(&client, format!("{origin}/desk/capabilities"), &anna).await;
    assert_eq!(doc["person"]["groups"], json!(["Staff"]), "{doc}");
    let mut want = grants::of_names(["reviewer", "assist", "kvasir:work", "identity:see"]);
    want.detail = Detail::Quasi;
    assert_eq!(doc["person"]["grants"], json!(want.list()));
    let third: Value = client
        .get(format!("{origin}/api/jobs"))
        .header("cookie", &anna)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_ne!(third["bearer"], first, "minted again for what changed");
    let claims = claims_of(&client, &origin, third["bearer"].as_str().unwrap()).await;
    assert_eq!(claims["grants"], json!(want.list()));
    // the people who have signed in, with the groups their provider's groups reach
    let access = get_json(&client, format!("{origin}/desk/access"), &anna).await;
    assert_eq!(access["mode"], "oidc");
    let people = access["people"].as_array().unwrap();
    assert_eq!(people.len(), 1, "{access}");
    assert_eq!(people[0]["subject"], "subject-1");
    assert_eq!(people[0]["groups"], json!([]));
    assert_eq!(people[0]["followed"], json!([staff]));
    assert_eq!(people[0]["access"], want.as_json());
    assert_eq!(people[0]["sessions_open"], 1);

    // a person renamed at the provider: the same subject, a new display, no new row
    *provider.person.lock().unwrap() = (
        "subject-1".into(),
        "Anna Bergström".into(),
        vec!["reviewer".into(), "assist".into()],
        vec!["staff".into()],
    );
    let again = sign_in(&client, &origin, &issuer).await;
    let doc = get_json(&client, format!("{origin}/desk/capabilities"), &again).await;
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
        audience: "nils".into(),
    };
    let r = nils_desk::register::register(&api, &plan).await.unwrap();
    assert_eq!(r.client_id, "client-abc");
    assert_eq!(r.client_secret, "secret-xyz");
    assert_eq!(r.issuer, format!("{url}/application/o/nils/"));
    assert!(r.found.is_empty(), "{:?}", r.found);
    assert!(r.created.iter().any(|c| c == "provider"));
    assert!(r.created.iter().any(|c| c == "entitlement assist"));
    // the engine and Kvasir trust the desk's own issuer beside the provider
    let flags = r.flags();
    assert!(
        flags.contains("--oidc-trust issuer=https://desk.example.org,audience=nils,jwks=https://desk.example.org/.well-known/jwks.json")
            && flags.contains(&format!(
                "--oidc-trust issuer={url}/application/o/nils/,audience=client-abc,"
            ))
            && flags.contains("--oidc-groups-claim roles --role reader=reader"),
        "{flags}"
    );
    let kvasir = r.kvasir_auth();
    assert_eq!(kvasir["mode"], "oidc");
    assert_eq!(
        kvasir["trust"][0],
        json!({"issuer": "https://desk.example.org", "audience": "nils", "jwks": "https://desk.example.org/.well-known/jwks.json"})
    );
    assert_eq!(kvasir["trust"][1]["audience"], "client-abc");
    assert_eq!(kvasir["roles"]["admin"], "admin");
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
        // the profile scope carries the groups a person is in, which the desk's groups follow
        assert!(
            p["property_mappings"]
                .as_array()
                .unwrap()
                .contains(&json!("m-profile")),
            "{p}"
        );
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

#[tokio::test]
async fn a_change_of_sign_in_signs_everyone_out_and_an_empty_desk_says_so() {
    let engine = fake_engine().await;
    let dir = tempfile::tempdir().unwrap();
    let store = dir.path().join("desk.sqlite").display().to_string();
    let key = dir.path().join("desk.key").display().to_string();
    let off = format!(
        "origin = \"http://127.0.0.1:7200\"\nmode = \"off\"\nstore = \"{store}\"\n[engine]\nurl = \"{engine}\"\n"
    );
    let local = format!(
        "origin = \"http://127.0.0.1:7200\"\nmode = \"local\"\nstore = \"{store}\"\n[local]\nkey = \"{key}\"\n[engine]\nurl = \"{engine}\"\n"
    );

    // nobody signs in: a browser that opens the desk is the operator
    let desk = nils_desk::start(&off).unwrap();
    let operator = desk
        .store
        .create(
            "operator",
            "the operator",
            &Claims::default(),
            &json!({}),
            12,
        )
        .unwrap();
    assert!(desk.store.get(&operator.id).is_some());
    drop(desk);

    // the desk keeps its own people now: that browser is nobody, and nobody can sign in yet
    let desk = nils_desk::start(&local).unwrap();
    assert!(
        desk.store.get(&operator.id).is_none(),
        "the operator's session went with the change"
    );
    assert!(!desk.store.has_users());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let app = nils_desk::router(desk.clone());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let client = reqwest::Client::new();
    let doc: Value = client
        .get(format!("{url}/desk/capabilities"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(doc["desk"]["signed_in"], false);
    assert_eq!(
        doc["desk"]["login"]["nobody_yet"], true,
        "{}",
        doc["desk"]["login"]
    );

    // a session of a person the desk does not keep holds nothing, and is gone
    let ghost = desk
        .store
        .create("ghost", "Ghost", &Claims::default(), &json!({}), 12)
        .unwrap();
    let doc: Value = client
        .get(format!("{url}/desk/capabilities"))
        .header("cookie", format!("nils_desk={}", ghost.id))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(doc["desk"]["signed_in"], false);
    assert!(desk.store.get(&ghost.id).is_none());

    // once a person is kept the page stops saying so, and their session holds across a start with the same sign-in
    nils_desk::users::add(
        &desk.store,
        "anna",
        "correct horse battery",
        Some("Anna"),
        &admin(),
    )
    .unwrap();
    let anna = desk
        .store
        .create("anna", "Anna", &Claims::default(), &json!({}), 12)
        .unwrap();
    let doc: Value = client
        .get(format!("{url}/desk/capabilities"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(doc["desk"]["login"]["nobody_yet"], false);
    let again = nils_desk::start(&local).unwrap();
    assert!(again.store.get(&anna.id).is_some());
}

/// The chat, slice 2: the assistant keeps a person's conversations, so the
/// desk forwards its doors only for a person holding `assistant:use`.
#[tokio::test]
async fn the_assistant_is_reached_only_by_a_person_holding_assistant_use() {
    let engine = fake_engine().await;
    let seen = Arc::new(Mutex::new(Vec::<String>::new()));
    let log = seen.clone();
    let assistant = Router::new()
        .route(
            "/capabilities",
            get(|| async {
                axum::Json(json!({"assistant": {"name": "nils-assistant", "version": "0"}}))
            }),
        )
        .route(
            "/conversations",
            get(move |headers: HeaderMap| {
                let log = log.clone();
                async move {
                    let bearer = headers
                        .get("authorization")
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("")
                        .to_string();
                    log.lock().unwrap().push(bearer);
                    axum::Json(json!({"conversations": [], "next": null}))
                }
            }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let assistant_url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, assistant).await.unwrap() });
    let text = format!(
        "origin = \"{{origin}}\"\nmode = \"local\"\nstore = \"{{dir}}/desk.sqlite\"\n[local]\nkey = \"{{dir}}/desk.key\"\n[engine]\nurl = \"{engine}\"\n[assistant]\nurl = \"{assistant_url}\"\n"
    );
    let (origin, shared, _dir) = desk(&text).await;
    nils_desk::users::add(
        &shared.store,
        "anna",
        "correct horse battery",
        Some("Anna"),
        &entitled(&["reader", "assist"]),
    )
    .unwrap();
    nils_desk::users::add(
        &shared.store,
        "bo",
        "another long password",
        Some("Bo"),
        &entitled(&["reader"]),
    )
    .unwrap();
    // the first person setup adds, an admin with nothing else named, uses the assistant too
    nils_desk::users::add(
        &shared.store,
        "cy",
        "a third long password",
        Some("Cy"),
        &admin(),
    )
    .unwrap();
    let client = client();
    let mut cookies = Vec::new();
    for (name, password) in [
        ("anna", "correct horse battery"),
        ("bo", "another long password"),
        ("cy", "a third long password"),
    ] {
        cookies.push(login(&client, &origin, name, password).await);
    }
    let list = format!("{origin}/assistant/conversations");
    // nobody signed in, and bo without the assistant, are refused before the assistant hears a thing
    let r = client.get(&list).send().await.unwrap();
    assert_eq!(r.status(), 401);
    let r = client
        .get(&list)
        .header("cookie", &cookies[1])
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403);
    let body: Value = r.json().await.unwrap();
    assert!(
        body["error"]
            .as_str()
            .unwrap_or_default()
            .contains("assistant:use"),
        "{body}"
    );
    assert!(seen.lock().unwrap().is_empty());
    // anna holds it: forwarded, with the bearer the desk minted for her
    let r = client
        .get(&list)
        .header("cookie", &cookies[0])
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    let got = seen.lock().unwrap().clone();
    assert_eq!(got.len(), 1, "{got:?}");
    assert!(got[0].starts_with("Bearer "), "{got:?}");
    // cy, added with --admin alone, is in Admins, which hold the assistant, and is forwarded as well
    let r = client
        .get(&list)
        .header("cookie", &cookies[2])
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    assert_eq!(seen.lock().unwrap().len(), 2);
}

/// The chat, slice 5: a person holding `assistant:use` lists the people on
/// the desk to share a conversation with, everyone but themselves; a person
/// without it and nobody signed in are refused; a desk nobody signs in to
/// lists nobody.
#[tokio::test]
async fn the_people_on_the_desk_are_listed_for_a_person_holding_the_assistant() {
    let engine = fake_engine().await;
    let text = format!(
        "origin = \"{{origin}}\"\nmode = \"local\"\nstore = \"{{dir}}/desk.sqlite\"\n[local]\nkey = \"{{dir}}/desk.key\"\n[engine]\nurl = \"{engine}\"\n"
    );
    let (origin, shared, _dir) = desk(&text).await;
    for (name, password, display, entitlements) in [
        (
            "anna",
            "correct horse battery",
            "Anna",
            ["reviewer", "assist"],
        ),
        ("bo", "another long password", "Bo", ["reader", "reader"]),
        ("cy", "a third long password", "Cy", ["reader", "assist"]),
    ] {
        nils_desk::users::add(
            &shared.store,
            name,
            password,
            Some(display),
            &entitled(&entitlements),
        )
        .unwrap();
    }
    let client = client();
    let mut cookies = Vec::new();
    for (name, password) in [
        ("anna", "correct horse battery"),
        ("bo", "another long password"),
    ] {
        cookies.push(login(&client, &origin, name, password).await);
    }
    let people = format!("{origin}/desk/people");
    let r = client.get(&people).send().await.unwrap();
    assert_eq!(r.status(), 401);
    let r = client
        .get(&people)
        .header("cookie", &cookies[1])
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403);
    let r = client
        .get(&people)
        .header("cookie", &cookies[0])
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    let body: Value = r.json().await.unwrap();
    assert_eq!(
        body["people"],
        json!([{"subject": "bo", "display": "Bo"}, {"subject": "cy", "display": "Cy"}])
    );
    let off = format!(
        "origin = \"{{origin}}\"\nmode = \"off\"\nstore = \"{{dir}}/desk.sqlite\"\n[engine]\nurl = \"{engine}\"\n"
    );
    let (origin, _shared, _dir) = desk(&off).await;
    let r = client
        .get(format!("{origin}/desk/people"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 404);
}

/// A fake Kvasir whose catalog answers only a bearer, as Kvasir does wherever
/// people sign in, and the bearers it saw.
async fn fake_kvasir() -> (String, Arc<Mutex<Vec<String>>>) {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let kept = seen.clone();
    let app = Router::new().route(
        "/v1/config",
        get(move |headers: HeaderMap| {
            let kept = kept.clone();
            async move {
                let bearer = headers
                    .get("authorization")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("")
                    .to_string();
                kept.lock().unwrap().push(bearer.clone());
                if bearer.starts_with("Bearer ") {
                    axum::Json(json!({"baseUrl": "http://kvasir.test/v1", "models": [], "backends": [], "health": {"warming": false}, "kvasir": {"version": "1.0.0-alpha.4"}})).into_response()
                } else {
                    (
                        StatusCode::UNAUTHORIZED,
                        axum::Json(json!({"error": {"code": "unauthenticated", "message": "a bearer token of a trusted issuer"}})),
                    )
                        .into_response()
                }
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (url, seen)
}

#[tokio::test]
async fn kvasir_is_read_as_the_person_where_people_sign_in() {
    let engine = fake_engine().await;
    let (kvasir, seen) = fake_kvasir().await;
    let text = format!(
        "origin = \"{{origin}}\"\nmode = \"local\"\nstore = \"{{dir}}/desk.sqlite\"\n[local]\nkey = \"{{dir}}/desk.key\"\n[engine]\nurl = \"{engine}\"\n[kvasir]\nurl = \"{kvasir}\"\n"
    );
    let (origin, shared, _) = desk(&text).await;
    nils_desk::users::add(
        &shared.store,
        "anna",
        "correct horse battery",
        Some("Anna"),
        &admin(),
    )
    .unwrap();
    let client = client();

    // nobody signed in: Kvasir refused the desk's own read, which carries no credential
    let doc: Value = client
        .get(format!("{origin}/desk/capabilities"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(doc["kvasir"].is_null(), "{doc}");

    // signed in: the desk asks Kvasir with the person's own token, as its proxy does, and
    // the Kvasir page, the profile's subscription and Home's Kvasir have Kvasir to read
    let anna = login(&client, &origin, "anna", "correct horse battery").await;
    let doc = get_json(&client, format!("{origin}/desk/capabilities"), &anna).await;
    assert_eq!(doc["kvasir"]["kvasir"]["version"], "1.0.0-alpha.4", "{doc}");
    let bearers = seen.lock().unwrap().clone();
    assert!(
        bearers.iter().any(String::is_empty),
        "the desk's own read carried no credential: {bearers:?}"
    );
    assert!(
        bearers.iter().any(|b| b.starts_with("Bearer ")),
        "the person's read carried their token: {bearers:?}"
    );
}

/// The identity doors: groups made, changed and removed, people given
/// groups and grants of their own, each change from the desk's own origin
/// by a person holding identity:work, and none that leaves nobody holding it.
#[tokio::test]
async fn groups_and_people_change_through_the_identity_doors() {
    let engine = fake_engine().await;
    let text = format!(
        "origin = \"{{origin}}\"\nmode = \"local\"\nstore = \"{{dir}}/desk.sqlite\"\n[local]\nkey = \"{{dir}}/desk.key\"\n[engine]\nurl = \"{engine}\"\n"
    );
    let (origin, shared, _dir) = desk(&text).await;
    nils_desk::users::add(
        &shared.store,
        "anna",
        "correct horse battery",
        Some("Anna"),
        &admin(),
    )
    .unwrap();
    nils_desk::users::add(
        &shared.store,
        "bo",
        "another long password",
        Some("Bo"),
        &Given::default(),
    )
    .unwrap();
    let client = client();
    let anna = login(&client, &origin, "anna", "correct horse battery").await;
    let bo = login(&client, &origin, "bo", "another long password").await;
    let url = |path: &str| format!("{origin}{path}");

    // reading needs identity:see
    let r = client.get(url("/desk/groups")).send().await.unwrap();
    assert_eq!(r.status(), 401);
    let r = client
        .get(url("/desk/groups"))
        .header("cookie", &bo)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403);
    let groups = get_json(&client, url("/desk/groups"), &anna).await;
    let list = groups["groups"].as_array().unwrap();
    let names: Vec<&str> = list.iter().map(|g| g["name"].as_str().unwrap()).collect();
    assert_eq!(names, ["Readers", "Reviewers", "Operators", "Admins"]);
    let group = |name: &str| list.iter().find(|g| g["name"] == name).unwrap().clone();
    let (readers, admins) = (
        group("Readers")["id"].as_i64().unwrap(),
        group("Admins")["id"].as_i64().unwrap(),
    );
    assert_eq!(
        group("Readers"),
        json!({"id": readers, "name": "Readers", "grants": grants_of(&["reader"]), "detail": "plain", "follows": [], "members": []})
    );
    assert_eq!(group("Admins")["members"], json!(["anna"]));

    // making a group: from the desk's own origin, by a person holding identity:work
    let scanners = json!({"name": "Scanner people", "grants": ["data:work", "review:see"], "detail": "quasi", "follows": ["neuro-scanner"]});
    let r = client
        .post(url("/desk/groups"))
        .header("cookie", &anna)
        .json(&scanners)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403, "not from the desk's own origin");
    let r = ours(client.post(url("/desk/groups")), &origin)
        .header("cookie", &bo)
        .json(&scanners)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403, "bo holds no identity:work");
    let r = ours(client.post(url("/desk/groups")), &origin)
        .header("cookie", &anna)
        .json(&scanners)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 201);
    let made: Value = r.json().await.unwrap();
    let scanner = made["id"].as_i64().unwrap();
    assert_eq!(
        made,
        json!({"id": scanner, "name": "Scanner people", "grants": ["data:see", "data:work", "review:see"], "detail": "quasi", "follows": ["neuro-scanner"], "members": []})
    );
    for (body, why) in [
        (scanners.clone(), "a name taken"),
        (
            json!({"name": "Coffee", "grants": ["coffee:work"]}),
            "a grant outside the vocabulary",
        ),
        (
            json!({"name": "All", "grants": [], "detail": "everything"}),
            "a detail outside the order",
        ),
        (json!({"grants": []}), "no name"),
    ] {
        let r = ours(client.post(url("/desk/groups")), &origin)
            .header("cookie", &anna)
            .json(&body)
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), 400, "{why}");
        let e: Value = r.json().await.unwrap();
        assert!(e["error"].is_string(), "{why}: {e}");
    }
    // changing it
    let r = ours(client.put(url(&format!("/desk/groups/{scanner}"))), &origin)
        .header("cookie", &anna)
        .json(&json!({"name": "Scanners", "grants": ["data:work"], "detail": "plain"}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    let set: Value = r.json().await.unwrap();
    assert_eq!(
        set,
        json!({"id": scanner, "name": "Scanners", "grants": ["data:see", "data:work"], "detail": "plain", "follows": [], "members": []})
    );
    let r = ours(client.put(url("/desk/groups/999")), &origin)
        .header("cookie", &anna)
        .json(&json!({"name": "Nine", "grants": []}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 404);
    let r = client
        .put(url(&format!("/desk/groups/{scanner}")))
        .header("cookie", &anna)
        .json(&json!({"name": "Scanners", "grants": []}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403);

    // the people, with their groups, what they hold alone and what it adds up to
    let access = get_json(&client, url("/desk/access"), &anna).await;
    assert_eq!(access["mode"], "local");
    assert!(
        access["sessions_open"].as_i64().is_some_and(|n| n >= 2),
        "{access}"
    );
    let people = access["people"].as_array().unwrap();
    assert_eq!(people.len(), 2);
    let row = |who: &str| people.iter().find(|p| p["subject"] == who).unwrap().clone();
    let a = row("anna");
    assert_eq!(a["display"], "Anna");
    assert_eq!(a["groups"], json!([admins]));
    assert_eq!(a["followed"], json!([]));
    assert_eq!(a["grants"], json!([]));
    assert!(a["detail"].is_null());
    assert_eq!(
        a["access"],
        json!({"grants": grants::GRANTS, "detail": "sensitive"})
    );
    assert!(a["last_seen_at"].is_string());
    assert_eq!(a["sessions_open"], 1);
    assert_eq!(
        row("bo")["access"],
        json!({"grants": [], "detail": "plain"})
    );

    // anna gives bo two groups and the assistant alone; bo's next click has them
    let r = ours(client.put(url("/desk/access/bo")), &origin)
        .header("cookie", &anna)
        .json(
            &json!({"groups": [scanner, readers], "grants": ["assistant:use"], "detail": "quasi"}),
        )
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    let b: Value = r.json().await.unwrap();
    assert_eq!(b["subject"], "bo");
    assert_eq!(b["groups"], json!([readers, scanner]));
    assert_eq!(b["grants"], json!(["assistant:use"]));
    assert_eq!(b["detail"], "quasi");
    assert_eq!(
        b["access"],
        json!({"grants": ["assistant:use", "data:see", "data:work", "query:see", "query:work"], "detail": "quasi"})
    );
    let doc = get_json(&client, url("/desk/capabilities"), &bo).await;
    assert_eq!(doc["person"]["groups"], json!(["Readers", "Scanners"]));
    assert_eq!(doc["person"]["grants"], b["access"]["grants"]);
    assert_eq!(doc["person"]["detail"], "quasi");
    for (path, body, status, why) in [
        (
            "/desk/access/bo",
            json!({"groups": [999], "grants": []}),
            400,
            "a group that is not there",
        ),
        (
            "/desk/access/bo",
            json!({"groups": [], "grants": ["assistant:see"]}),
            400,
            "a grant outside the vocabulary",
        ),
        (
            "/desk/access/bo",
            json!({"grants": []}),
            400,
            "no groups named",
        ),
        (
            "/desk/access/zed",
            json!({"groups": [], "grants": []}),
            404,
            "nobody by that name",
        ),
    ] {
        let r = ours(client.put(url(path)), &origin)
            .header("cookie", &anna)
            .json(&body)
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), status, "{why}");
    }
    let r = client
        .put(url("/desk/access/bo"))
        .header("cookie", &anna)
        .json(&json!({"groups": [], "grants": []}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403);

    // nobody is left without identity:work
    let r = ours(client.put(url("/desk/access/anna")), &origin)
        .header("cookie", &anna)
        .json(&json!({"groups": [], "grants": [], "detail": null}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 409);
    let e: Value = r.json().await.unwrap();
    assert!(e["error"].is_string(), "{e}");
    let r = ours(
        client.delete(url(&format!("/desk/groups/{admins}"))),
        &origin,
    )
    .header("cookie", &anna)
    .send()
    .await
    .unwrap();
    assert_eq!(r.status(), 409);
    let r = ours(client.put(url(&format!("/desk/groups/{admins}"))), &origin)
        .header("cookie", &anna)
        .json(&json!({"name": "Admins", "grants": ["query:see"]}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 409);
    // once bo is in Admins too, anna may leave, and her next click no longer reads people
    for (who, groups) in [("bo", admins), ("anna", readers)] {
        let r = ours(client.put(url(&format!("/desk/access/{who}"))), &origin)
            .header("cookie", &anna)
            .json(&json!({"groups": [groups], "grants": []}))
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), 200, "{who}");
    }
    let r = client
        .get(url("/desk/groups"))
        .header("cookie", &anna)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403);

    // removing a group
    let path = url(&format!("/desk/groups/{scanner}"));
    let r = client
        .delete(&path)
        .header("cookie", &bo)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403);
    let r = ours(client.delete(&path), &origin)
        .header("cookie", &bo)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 204);
    let r = ours(client.delete(&path), &origin)
        .header("cookie", &bo)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 404);

    // adding a person with their groups and a grant of their own
    let r = ours(client.post(url("/desk/users")), &origin)
        .header("cookie", &bo)
        .json(&json!({"username": "cy", "password": "a third long password", "display": "Cy", "groups": [readers], "grants": ["assistant:use"], "detail": null}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 201);
    let c: Value = r.json().await.unwrap();
    assert_eq!(
        c,
        json!({"subject": "cy", "display": "Cy", "groups": [readers], "followed": [], "grants": ["assistant:use"], "detail": null, "access": {"grants": grants_of(&["reader", "assist"]), "detail": "plain"}, "last_seen_at": null, "sessions_open": 0})
    );
    let r = ours(client.post(url("/desk/users")), &origin)
        .header("cookie", &bo)
        .json(&json!({"username": "dy", "password": "a fourth long password", "groups": [999]}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 400);
    assert!(shared.store.user("dy").is_none(), "nobody half made");
    let r = client
        .post(url("/desk/users"))
        .header("cookie", &bo)
        .json(&json!({"username": "ey", "password": "a fifth long password"}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403);
    let cy = login(&client, &origin, "cy", "a third long password").await;
    let doc = get_json(&client, url("/desk/capabilities"), &cy).await;
    assert_eq!(doc["person"]["groups"], json!(["Readers"]));
}

/// A part the desk opens by grant: the assistant for `assistant:use`, the
/// supervisor for `install:work`, an app for the grant or the ladder name it
/// names; each refused before it hears a thing.
#[tokio::test]
async fn the_desk_opens_the_assistant_the_supervisor_and_apps_by_grant() {
    let engine = fake_engine().await;
    let (assistant, heard_assistant) = fake_part().await;
    let (supervisor, heard_supervisor) = fake_part().await;
    let (app, heard_app) = fake_part().await;
    let text = format!(
        "origin = \"{{origin}}\"\nmode = \"local\"\nstore = \"{{dir}}/desk.sqlite\"\n[local]\nkey = \"{{dir}}/desk.key\"\n[engine]\nurl = \"{engine}\"\n[assistant]\nurl = \"{assistant}\"\n[supervisor]\nurl = \"{supervisor}\"\ntoken = \"the-supervisors-token\"\n[[apps]]\nid = \"ops\"\ntitle = \"Operations\"\nurl = \"{app}\"\nentitlement = \"operator\"\n[[apps]]\nid = \"models\"\ntitle = \"Models\"\nurl = \"{app}\"\nentitlement = \"kvasir:see\"\n"
    );
    let (origin, shared, _dir) = desk(&text).await;
    let operators = shared.store.book().group_named("Operators").unwrap().id;
    let people = [
        (
            "anna",
            Given {
                grants: vec!["assistant:use".into()],
                ..Default::default()
            },
        ),
        (
            "bo",
            Given {
                groups: vec![operators],
                ..Default::default()
            },
        ),
        (
            "cy",
            Given {
                grants: vec!["install:work".into()],
                ..Default::default()
            },
        ),
    ];
    let client = client();
    let mut who = std::collections::HashMap::new();
    for (name, given) in people {
        nils_desk::users::add(&shared.store, name, "a long enough password", None, &given).unwrap();
        who.insert(
            name,
            login(&client, &origin, name, "a long enough password").await,
        );
    }
    let get = |path: &str, cookie: Option<&String>| {
        let mut r = client.get(format!("{origin}{path}"));
        if let Some(c) = cookie {
            r = r.header("cookie", c);
        }
        r.send()
    };
    // nobody signed in reaches none of them
    for path in [
        "/assistant/conversations",
        "/supervise/status",
        "/apps/ops/runs",
        "/apps/models/list",
    ] {
        assert_eq!(get(path, None).await.unwrap().status(), 401, "{path}");
    }
    for (path, name, status) in [
        ("/assistant/conversations", "anna", 200),
        ("/assistant/conversations", "bo", 403),
        ("/assistant/conversations", "cy", 403),
        ("/supervise/status", "anna", 403),
        ("/supervise/status", "bo", 403),
        ("/supervise/status", "cy", 200),
        ("/apps/ops/runs", "anna", 403),
        ("/apps/ops/runs", "bo", 200),
        ("/apps/ops/runs", "cy", 403),
        ("/apps/models/list", "anna", 403),
        ("/apps/models/list", "bo", 200),
        ("/apps/models/list", "cy", 403),
    ] {
        let r = get(path, who.get(name)).await.unwrap();
        assert_eq!(r.status(), status, "{name} at {path}");
        if status == 403 {
            let e: Value = r.json().await.unwrap();
            assert!(
                e["error"].as_str().is_some_and(|m| m.contains("needs")),
                "{e}"
            );
        }
    }
    // what each part heard: the desk's token for the person, the supervisor its own
    let heard = heard_assistant.lock().unwrap().clone();
    assert_eq!(heard.len(), 1, "{heard:?}");
    let claims = claims_of(&client, &origin, &heard[0]).await;
    assert_eq!(claims["sub"], "anna");
    assert_eq!(claims["grants"], json!(["assistant:use"]));
    let heard = heard_supervisor.lock().unwrap().clone();
    assert_eq!(heard, ["Bearer the-supervisors-token"]);
    let heard = heard_app.lock().unwrap().clone();
    assert_eq!(heard.len(), 2, "{heard:?}");
    let claims = claims_of(&client, &origin, &heard[0]).await;
    assert_eq!(claims["sub"], "bo");
    assert_eq!(claims["grants"], grants_of(&["operator"]));
    assert_eq!(claims["detail"], "sensitive");
    // the token pushed to the assistant for a conversation is for a person holding the assistant
    let push = format!("{origin}/desk/assistant/conversations/c1/token");
    let r = ours(client.post(&push), &origin)
        .header("cookie", &who["bo"])
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403);
    let r = ours(client.post(&push), &origin)
        .header("cookie", &who["anna"])
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    // a grant given applies at the next click
    shared
        .store
        .change(
            false,
            Change::Access {
                subject: "bo".into(),
                groups: vec![operators],
                grants: grants::normalise(["assistant:use"]),
                detail: None,
            },
        )
        .unwrap();
    let r = get("/assistant/conversations", who.get("bo"))
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
}
