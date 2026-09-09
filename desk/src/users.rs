// SPDX-License-Identifier: AGPL-3.0-only

//! The local users of `local` mode: argon2id passwords, entitlements an
//! admin grants and revokes, and the first user created by
//! `nils-desk user add --admin`.

use argon2::Argon2;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};

use crate::store::{Store, User};

pub const ENTITLEMENTS: &[&str] = &["reader", "reviewer", "operator", "admin", "assist"];

pub fn hash(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut rand_core::OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| e.to_string())
}

pub fn verify(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .map(|h| {
            Argon2::default()
                .verify_password(password.as_bytes(), &h)
                .is_ok()
        })
        .unwrap_or(false)
}

pub fn check_entitlements(list: &[String]) -> Result<(), String> {
    for e in list {
        if !ENTITLEMENTS.contains(&e.as_str()) {
            return Err(format!(
                "{e} is not an entitlement; those are {}",
                ENTITLEMENTS.join(", ")
            ));
        }
    }
    Ok(())
}

pub fn add(
    store: &Store,
    username: &str,
    password: &str,
    display: Option<&str>,
    entitlements: &[String],
    admin: bool,
) -> Result<(), String> {
    if username.is_empty()
        || !username
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
    {
        return Err("a username is letters, digits, dots, dashes and underscores".into());
    }
    if password.len() < 8 {
        return Err("a password is at least eight characters".into());
    }
    check_entitlements(entitlements)?;
    let mut list: Vec<String> = entitlements.to_vec();
    if admin && !list.iter().any(|e| e == "admin") {
        list.push("admin".into());
    }
    store.user_add(
        username,
        &hash(password)?,
        display.unwrap_or(username),
        &list,
        admin,
    )
}

/// The user, when the password holds.
pub fn login(store: &Store, username: &str, password: &str) -> Option<User> {
    let (user, stored) = store.user(username)?;
    verify(password, &stored).then_some(user)
}
