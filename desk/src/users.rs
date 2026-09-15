// SPDX-License-Identifier: AGPL-3.0-only

//! The local users of `local` mode: argon2id passwords, and what a person is
//! given when added: groups, grants of their own and a detail. The first
//! user, made by `nils-desk user add <name> --admin`, joins Admins, which
//! holds every grant.

use std::collections::BTreeSet;

use argon2::Argon2;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};

use crate::grants::{self, Detail};
use crate::store::{Change, Store, User, ladder_group_access};

/// The ladder's names and `assist`, which `--entitlement` and the users
/// doors still take for one release, each standing for its set.
pub const ENTITLEMENTS: &[&str] = &["reader", "reviewer", "operator", "admin", "assist"];

/// The group `--admin` puts a person in.
pub const ADMINS: &str = "Admins";

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

/// What a person is given: groups by id, grants and a detail of their own,
/// and for one release entitlements, each standing for its set; `admin`
/// puts them in Admins.
#[derive(Debug, Clone, Default)]
pub struct Given {
    pub groups: Vec<i64>,
    pub grants: Vec<String>,
    pub detail: Option<Detail>,
    pub entitlements: Vec<String>,
    pub admin: bool,
}

impl Given {
    /// The grants and the detail this gives the person alone: the grants
    /// named, with each entitlement's set.
    pub fn own(&self) -> Result<(BTreeSet<String>, Option<Detail>), String> {
        let mut own = grants::check(&self.grants)?;
        check_entitlements(&self.entitlements)?;
        let mut detail = self.detail;
        if !self.entitlements.is_empty() {
            let sets = grants::of_names(self.entitlements.iter().map(String::as_str));
            own.extend(sets.grants);
            detail = Some(detail.map_or(sets.detail, |d| d.max(sets.detail)));
        }
        Ok((own, detail))
    }
}

/// Groups by name, as the command line names them.
pub fn group_ids(store: &Store, names: &[String]) -> Result<Vec<i64>, String> {
    let book = store.book();
    names
        .iter()
        .map(|n| {
            book.group_named(n.trim())
                .map(|g| g.id)
                .ok_or_else(|| format!("no group named {n}"))
        })
        .collect()
}

/// Admins, made again from the admin set and the assistant when the install
/// has no group by that name.
pub fn admins(store: &Store) -> Result<i64, String> {
    if let Some(g) = store.book().group_named(ADMINS) {
        return Ok(g.id);
    }
    store
        .change(
            false,
            Change::GroupAdd {
                name: ADMINS.into(),
                access: ladder_group_access("admin"),
                follows: Vec::new(),
            },
        )
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("{ADMINS} was not made"))
}

pub fn add(
    store: &Store,
    username: &str,
    password: &str,
    display: Option<&str>,
    given: &Given,
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
    let (own, detail) = given.own()?;
    let book = store.book();
    if let Some(bad) = given.groups.iter().find(|g| book.group(**g).is_none()) {
        return Err(format!("no group {bad}"));
    }
    store.user_add(username, &hash(password)?, display.unwrap_or(username))?;
    let mut groups = given.groups.clone();
    if given.admin {
        groups.push(admins(store)?);
    }
    store
        .change(
            false,
            Change::Access {
                subject: username.to_string(),
                groups,
                grants: own,
                detail,
            },
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// The user, when the password holds.
pub fn login(store: &Store, username: &str, password: &str) -> Option<User> {
    let (user, stored) = store.user(username)?;
    verify(password, &stored).then_some(user)
}
