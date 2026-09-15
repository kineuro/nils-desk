// SPDX-License-Identifier: AGPL-3.0-only

//! The desk's one SQLite file: sessions with the tokens they hold, the
//! people seen and their display names (§5.9), the local users of `local`
//! mode (§5.1), and the groups people are given pages by, with the grants a
//! person holds on their own.

use std::collections::{BTreeMap, BTreeSet};
use std::sync::Mutex;

use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};

use crate::grants::{self, Access, Detail};

pub struct Store {
    conn: Mutex<Connection>,
}

/// What a provider said about a person at sign-in, in `oidc` mode: the
/// groups of `groups_claim`, the legacy entitlements of `roles_claim`, and
/// the name they sign in with. Kept in the session, and on the person for
/// the identity page.
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Claims {
    #[serde(default)]
    pub groups: Vec<String>,
    #[serde(default)]
    pub roles: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
}

/// A group: a name, what it gives, and under `oidc` the provider groups it
/// follows.
#[derive(Debug, Clone)]
pub struct Group {
    pub id: i64,
    pub name: String,
    pub access: Access,
    pub follows: Vec<String>,
    pub made_at: String,
}

impl Group {
    pub fn as_json(&self, members: Vec<String>) -> Value {
        json!({
            "id": self.id,
            "name": self.name,
            "grants": self.access.list(),
            "detail": self.access.detail.as_str(),
            "follows": self.follows,
            "members": members,
        })
    }
}

/// Everything a person's access is computed from, read at once.
#[derive(Debug, Clone, Default)]
pub struct Book {
    pub groups: Vec<Group>,
    /// Subject and group id.
    pub members: Vec<(String, i64)>,
    /// A person's own grants and own detail.
    pub own: BTreeMap<String, (BTreeSet<String>, Option<Detail>)>,
}

/// A person's access and where it came from.
#[derive(Debug, Clone, Default)]
pub struct Resolved {
    pub access: Access,
    /// The groups the person is a member of, by id.
    pub member: Vec<i64>,
    /// The groups the person reaches through their provider's groups.
    pub followed: Vec<i64>,
    pub own: BTreeSet<String>,
    pub own_detail: Option<Detail>,
}

impl Book {
    /// A person's access: the union of their groups' grants and their own,
    /// with the highest detail. Under `oidc` (`claims` given) their groups
    /// include every group that follows one of the provider's groups, and a
    /// legacy entitlement stands for its set.
    pub fn resolve(&self, subject: &str, claims: Option<&Claims>) -> Resolved {
        let member: Vec<i64> = self
            .members
            .iter()
            .filter(|(s, _)| s == subject)
            .map(|(_, g)| *g)
            .collect();
        let followed: Vec<i64> = match claims {
            Some(c) => self
                .groups
                .iter()
                .filter(|g| {
                    !member.contains(&g.id) && g.follows.iter().any(|f| c.groups.contains(f))
                })
                .map(|g| g.id)
                .collect(),
            None => Vec::new(),
        };
        let mut access = Access::default();
        for g in &self.groups {
            if member.contains(&g.id) || followed.contains(&g.id) {
                access.add(&g.access);
            }
        }
        let (own, own_detail) = self.own.get(subject).cloned().unwrap_or_default();
        access.add(&Access {
            grants: own.clone(),
            detail: own_detail.unwrap_or_default(),
        });
        if let Some(c) = claims {
            access.add(&grants::of_names(c.roles.iter().map(String::as_str)));
        }
        Resolved {
            access,
            member,
            followed,
            own,
            own_detail,
        }
    }

    pub fn group(&self, id: i64) -> Option<&Group> {
        self.groups.iter().find(|g| g.id == id)
    }

    pub fn group_named(&self, name: &str) -> Option<&Group> {
        self.groups.iter().find(|g| g.name == name)
    }

    /// The names of groups by id, in the order the groups were made.
    pub fn names(&self, ids: &[i64]) -> Vec<String> {
        self.groups
            .iter()
            .filter(|g| ids.contains(&g.id))
            .map(|g| g.name.clone())
            .collect()
    }

    pub fn members_of(&self, id: i64) -> Vec<String> {
        self.members
            .iter()
            .filter(|(_, g)| *g == id)
            .map(|(s, _)| s.clone())
            .collect()
    }
}

/// A change to groups or to what a person holds, made only when it leaves
/// somebody holding `identity:work`.
#[derive(Debug, Clone)]
pub enum Change {
    GroupAdd {
        name: String,
        access: Access,
        follows: Vec<String>,
    },
    GroupSet {
        id: i64,
        name: String,
        access: Access,
        follows: Vec<String>,
    },
    GroupRemove {
        id: i64,
    },
    /// A person's groups and own grants, replaced.
    Access {
        subject: String,
        groups: Vec<i64>,
        grants: BTreeSet<String>,
        detail: Option<Detail>,
    },
}

/// Why a change was not made.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Refused {
    /// Something named that is not so: an unknown group in a body, a name
    /// taken.
    Invalid(String),
    /// The group or the person changed is not there.
    Unknown(String),
    /// Nobody would hold `identity:work` afterwards.
    Nobody,
    Store(String),
}

impl std::fmt::Display for Refused {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Refused::Invalid(m) | Refused::Unknown(m) | Refused::Store(m) => f.write_str(m),
            Refused::Nobody => f.write_str(
                "that would leave nobody who may change people and groups (identity:work)",
            ),
        }
    }
}

/// The four groups an install starts with, from the ladder's sets.
pub const LADDER_GROUPS: &[(&str, &str)] = &[
    ("Readers", "reader"),
    ("Reviewers", "reviewer"),
    ("Operators", "operator"),
    ("Admins", "admin"),
];

/// What a ladder group gives: its step's set, and for Admins the assistant too.
pub fn ladder_group_access(step: &str) -> Access {
    let mut a = grants::set(step).unwrap_or_default();
    if step == "admin" {
        a.add(&grants::set(grants::ASSIST).unwrap_or_default());
    }
    a
}

fn strings(text: &str) -> Vec<String> {
    serde_json::from_str(text).unwrap_or_default()
}

fn has_column(conn: &Connection, table: &str, column: &str) -> bool {
    conn.prepare(&format!("PRAGMA table_info({table})"))
        .and_then(|mut st| {
            st.query_map([], |r| r.get::<_, String>(1))
                .map(|rows| rows.flatten().any(|c| c == column))
        })
        .unwrap_or(false)
}

#[derive(Debug, Clone)]
pub struct Session {
    pub id: String,
    pub subject: String,
    pub display: String,
    /// What the provider said at sign-in, under `oidc`; nothing otherwise.
    pub claims: Claims,
    /// What the session holds for the parts: the token the desk last minted
    /// for the person, with its expiry and what it carried, and in `oidc`
    /// mode the provider's access and refresh tokens and their expiry.
    /// Never sent to a browser.
    pub tokens: Value,
}

#[derive(Debug, Clone)]
pub struct User {
    pub username: String,
    pub display: String,
}

fn now_iso() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_default()
}

fn later_iso(hours: i64) -> String {
    (time::OffsetDateTime::now_utc() + time::Duration::hours(hours))
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_default()
}

impl Store {
    pub fn open(path: &std::path::Path) -> Result<Store, String> {
        if let Some(dir) = path.parent().filter(|d| !d.as_os_str().is_empty()) {
            std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        }
        let conn = Connection::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS session (
                 id TEXT PRIMARY KEY,
                 subject TEXT NOT NULL,
                 display TEXT NOT NULL,
                 entitlements TEXT NOT NULL DEFAULT '[]',
                 tokens TEXT NOT NULL DEFAULT '{}',
                 created_at TEXT NOT NULL,
                 expires_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS person (
                 subject TEXT PRIMARY KEY,
                 display TEXT NOT NULL,
                 first_seen_at TEXT NOT NULL,
                 last_seen_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS user (
                 username TEXT PRIMARY KEY,
                 password_hash TEXT NOT NULL,
                 display TEXT NOT NULL,
                 entitlements TEXT NOT NULL DEFAULT '[]',
                 admin INTEGER NOT NULL DEFAULT 0,
                 created_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS pending (
                 state TEXT PRIMARY KEY,
                 verifier TEXT NOT NULL,
                 created_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS result (
                 handle INTEGER PRIMARY KEY,
                 document INTEGER NOT NULL,
                 subject TEXT NOT NULL,
                 made_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS lineage (
                 document INTEGER PRIMARY KEY,
                 parent INTEGER NOT NULL,
                 subject TEXT NOT NULL,
                 made_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS grp (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 name TEXT NOT NULL UNIQUE,
                 grants TEXT NOT NULL DEFAULT '[]',
                 detail TEXT NOT NULL DEFAULT 'plain',
                 follows TEXT NOT NULL DEFAULT '[]',
                 made_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS member (
                 subject TEXT NOT NULL,
                 grp INTEGER NOT NULL,
                 PRIMARY KEY (subject, grp)
             );
             CREATE TABLE IF NOT EXISTS own (
                 subject TEXT PRIMARY KEY,
                 grants TEXT NOT NULL DEFAULT '[]',
                 detail TEXT
             );",
        )
        .map_err(|e| e.to_string())?;
        // what a provider said at sign-in, beside a session and a person
        for table in ["session", "person"] {
            if !has_column(&conn, table, "claims") {
                conn.execute_batch(&format!(
                    "ALTER TABLE {table} ADD COLUMN claims TEXT NOT NULL DEFAULT '{{}}'"
                ))
                .map_err(|e| e.to_string())?;
            }
        }
        migrate(&conn)?;
        Ok(Store {
            conn: Mutex::new(conn),
        })
    }

    // --- sessions

    pub fn create(
        &self,
        subject: &str,
        display: &str,
        claims: &Claims,
        tokens: &Value,
        hours: i64,
    ) -> Result<Session, String> {
        let id = token();
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "INSERT INTO session (id, subject, display, claims, tokens, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                subject,
                display,
                serde_json::to_string(claims).unwrap_or_default(),
                tokens.to_string(),
                now_iso(),
                later_iso(hours)
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(Session {
            id,
            subject: subject.into(),
            display: display.into(),
            claims: claims.clone(),
            tokens: tokens.clone(),
        })
    }

    pub fn get(&self, id: &str) -> Option<Session> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.query_row(
            "SELECT id, subject, display, claims, tokens FROM session WHERE id = ?1 AND expires_at > ?2",
            params![id, now_iso()],
            |r| {
                Ok(Session {
                    id: r.get(0)?,
                    subject: r.get(1)?,
                    display: r.get(2)?,
                    claims: serde_json::from_str(&r.get::<_, String>(3)?).unwrap_or_default(),
                    tokens: serde_json::from_str(&r.get::<_, String>(4)?).unwrap_or(Value::Null),
                })
            },
        )
        .ok()
    }

    pub fn set_tokens(&self, id: &str, tokens: &Value) {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let _ = conn.execute(
            "UPDATE session SET tokens = ?1 WHERE id = ?2",
            params![tokens.to_string(), id],
        );
    }

    pub fn delete(&self, id: &str) {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let _ = conn.execute("DELETE FROM session WHERE id = ?1", params![id]);
    }

    /// How people sign in, as this desk runs now. A session made under
    /// another way of signing in names a person this desk no longer knows
    /// that way: a desk that now keeps passwords still holding the operator
    /// of `off` mode, or a token minted for an origin it no longer answers
    /// at. So a change clears every session and every login in flight; true
    /// when it did. A store from a desk that recorded nothing counts as a
    /// change.
    pub fn sign_in(&self, how: &str) -> bool {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let _ = conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
        );
        let was: Option<String> = conn
            .query_row("SELECT value FROM meta WHERE key = 'sign_in'", [], |r| {
                r.get(0)
            })
            .optional()
            .ok()
            .flatten();
        if was.as_deref() == Some(how) {
            return false;
        }
        let _ = conn.execute_batch("DELETE FROM session; DELETE FROM pending;");
        let _ = conn.execute(
            "INSERT INTO meta (key, value) VALUES ('sign_in', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![how],
        );
        true
    }

    /// Whether the desk keeps anyone who signs in with a password.
    pub fn has_users(&self) -> bool {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.query_row("SELECT EXISTS(SELECT 1 FROM user)", [], |r| {
            r.get::<_, i64>(0)
        })
        .map(|n| n != 0)
        .unwrap_or(false)
    }

    // --- people: the display name beside the subject, at first sight

    /// A sign-in: the display name, and what the provider said this time.
    pub fn saw(&self, subject: &str, display: &str, claims: &Claims) {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let now = now_iso();
        let _ = conn.execute(
            "INSERT INTO person (subject, display, first_seen_at, last_seen_at, claims) VALUES (?1, ?2, ?3, ?3, ?4)
             ON CONFLICT(subject) DO UPDATE SET display = excluded.display, last_seen_at = excluded.last_seen_at, claims = excluded.claims",
            params![subject, display, now, serde_json::to_string(claims).unwrap_or_default()],
        );
    }

    pub fn people(&self) -> Vec<(String, String, String)> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut st = match conn
            .prepare("SELECT subject, display, first_seen_at FROM person ORDER BY first_seen_at")
        {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default()
    }

    /// When each subject last signed in; a local user's subject is the username.
    pub fn last_seen(&self) -> std::collections::HashMap<String, String> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut st = match conn.prepare("SELECT subject, last_seen_at FROM person") {
            Ok(s) => s,
            Err(_) => return std::collections::HashMap::new(),
        };
        st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default()
    }

    /// How many sessions are open now, whoever holds them.
    pub fn open_sessions(&self) -> i64 {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.query_row(
            "SELECT COUNT(*) FROM session WHERE expires_at > ?1",
            params![now_iso()],
            |r| r.get(0),
        )
        .unwrap_or(0)
    }

    // --- local users

    /// A user and their password; what they hold is given as a change.
    pub fn user_add(&self, username: &str, hash: &str, display: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "INSERT INTO user (username, password_hash, display, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![username, hash, display, now_iso()],
        )
        .map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                format!("a user named {username} exists")
            } else {
                e.to_string()
            }
        })?;
        Ok(())
    }

    pub fn user(&self, username: &str) -> Option<(User, String)> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.query_row(
            "SELECT username, password_hash, display FROM user WHERE username = ?1",
            params![username],
            |r| {
                Ok((
                    User {
                        username: r.get(0)?,
                        display: r.get(2)?,
                    },
                    r.get(1)?,
                ))
            },
        )
        .optional()
        .ok()
        .flatten()
    }

    pub fn users(&self) -> Vec<User> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut st = match conn.prepare("SELECT username, display FROM user ORDER BY username") {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        st.query_map([], |r| {
            Ok(User {
                username: r.get(0)?,
                display: r.get(1)?,
            })
        })
        .map(|rows| rows.flatten().collect())
        .unwrap_or_default()
    }

    pub fn user_set_password(&self, username: &str, hash: &str) -> Result<bool, String> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let n = conn
            .execute(
                "UPDATE user SET password_hash = ?1 WHERE username = ?2",
                params![hash, username],
            )
            .map_err(|e| e.to_string())?;
        Ok(n == 1)
    }

    // --- the pending authorisations of the oidc flow

    pub fn pending_put(&self, state: &str, verifier: &str) {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let _ = conn.execute(
            "DELETE FROM pending WHERE created_at < ?1",
            params![later_iso(-1)],
        );
        let _ = conn.execute(
            "INSERT INTO pending (state, verifier, created_at) VALUES (?1, ?2, ?3)",
            params![state, verifier, now_iso()],
        );
    }

    pub fn pending_take(&self, state: &str) -> Option<String> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let v: Option<String> = conn
            .query_row(
                "SELECT verifier FROM pending WHERE state = ?1",
                params![state],
                |r| r.get(0),
            )
            .optional()
            .ok()
            .flatten();
        let _ = conn.execute("DELETE FROM pending WHERE state = ?1", params![state]);
        v
    }
}

/// Thirty two random bytes, as hex: a session id nobody guesses.
pub fn token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

// --- Wave 4c §7.4: the desk's own record of which document a run came
// from and which document followed which, so a result can be told stale
// when its document moved on. Ids only; the engine holds the content.
impl Store {
    pub fn result_put(&self, handle: i64, document: i64, subject: &str) {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let _ = conn.execute(
            "INSERT OR REPLACE INTO result (handle, document, subject, made_at) VALUES (?1, ?2, ?3, ?4)",
            params![handle, document, subject, now_iso()],
        );
    }

    pub fn results(&self) -> Vec<(i64, i64, String, String)> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut st = match conn
            .prepare("SELECT handle, document, subject, made_at FROM result ORDER BY handle DESC")
        {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default()
    }

    pub fn lineage_put(&self, document: i64, parent: i64, subject: &str) {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let _ = conn.execute(
            "INSERT OR IGNORE INTO lineage (document, parent, subject, made_at) VALUES (?1, ?2, ?3, ?4)",
            params![document, parent, subject, now_iso()],
        );
    }

    pub fn lineage(&self) -> Vec<(i64, i64)> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut st = match conn.prepare("SELECT document, parent FROM lineage ORDER BY document") {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        st.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default()
    }
}

// --- groups, members and the grants a person holds on their own

/// Once, when the desk first starts with groups: an install with none gets
/// the four groups of the ladder's sets, each local user joins the group of
/// their top step, and `assist` becomes that user's own grant. Recorded in
/// `meta`, so a group removed later is not made again.
fn migrate(conn: &Connection) -> Result<(), String> {
    let e = |e: rusqlite::Error| e.to_string();
    let done: Option<String> = conn
        .query_row("SELECT value FROM meta WHERE key = 'groups'", [], |r| {
            r.get(0)
        })
        .optional()
        .map_err(e)?;
    if done.is_some() {
        return Ok(());
    }
    let tx = conn.unchecked_transaction().map_err(e)?;
    let now = now_iso();
    let any: i64 = tx
        .query_row("SELECT COUNT(*) FROM grp", [], |r| r.get(0))
        .map_err(e)?;
    if any == 0 {
        for (name, step) in LADDER_GROUPS {
            let a = ladder_group_access(step);
            tx.execute(
                "INSERT INTO grp (name, grants, detail, follows, made_at) VALUES (?1, ?2, ?3, '[]', ?4)",
                params![name, json!(a.list()).to_string(), a.detail.as_str(), now],
            )
            .map_err(e)?;
        }
    }
    let users: Vec<(String, String)> = {
        let mut st = tx
            .prepare("SELECT username, entitlements FROM user")
            .map_err(e)?;
        let rows: Vec<(String, String)> = st
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(e)?
            .flatten()
            .collect();
        rows
    };
    for (username, entitlements) in users {
        let held = strings(&entitlements);
        if let Some((name, _)) = LADDER_GROUPS
            .iter()
            .rev()
            .find(|(_, step)| held.iter().any(|h| h == step))
        {
            tx.execute(
                "INSERT OR IGNORE INTO member (subject, grp) SELECT ?1, id FROM grp WHERE name = ?2",
                params![username, name],
            )
            .map_err(e)?;
        }
        if held.iter().any(|h| h == grants::ASSIST) {
            tx.execute(
                "INSERT OR IGNORE INTO own (subject, grants, detail) VALUES (?1, ?2, NULL)",
                params![username, json!(["assistant:use"]).to_string()],
            )
            .map_err(e)?;
        }
    }
    tx.execute(
        "INSERT INTO meta (key, value) VALUES ('groups', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![now],
    )
    .map_err(e)?;
    tx.commit().map_err(e)
}

fn book_in(conn: &Connection) -> Book {
    let mut book = Book::default();
    if let Ok(mut st) =
        conn.prepare("SELECT id, name, grants, detail, follows, made_at FROM grp ORDER BY id")
    {
        book.groups = st
            .query_map([], |r| {
                let grants: String = r.get(2)?;
                let detail: String = r.get(3)?;
                let follows: String = r.get(4)?;
                Ok(Group {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    access: Access::new(
                        strings(&grants).iter().map(String::as_str),
                        Detail::read(Some(&detail)),
                    ),
                    follows: strings(&follows),
                    made_at: r.get(5)?,
                })
            })
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default();
    }
    if let Ok(mut st) = conn.prepare("SELECT subject, grp FROM member ORDER BY subject, grp") {
        book.members = st
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default();
    }
    if let Ok(mut st) = conn.prepare("SELECT subject, grants, detail FROM own") {
        book.own = st
            .query_map([], |r| {
                let subject: String = r.get(0)?;
                let grants: String = r.get(1)?;
                let detail: Option<String> = r.get(2)?;
                Ok((
                    subject,
                    (
                        grants::normalise(strings(&grants).iter().map(String::as_str)),
                        detail.as_deref().and_then(Detail::parse),
                    ),
                ))
            })
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default();
    }
    book
}

/// The people the guard counts: in `oidc` mode everyone who has signed in,
/// with what their provider said last; otherwise the local users.
fn people_in(conn: &Connection, oidc: bool) -> Vec<(String, Option<Claims>)> {
    let sql = if oidc {
        "SELECT subject, claims FROM person"
    } else {
        "SELECT username, NULL FROM user"
    };
    let mut st = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    st.query_map([], |r| {
        let subject: String = r.get(0)?;
        let claims: Option<String> = r.get(1)?;
        Ok((
            subject,
            claims.map(|c| serde_json::from_str(&c).unwrap_or_default()),
        ))
    })
    .map(|rows| rows.flatten().collect())
    .unwrap_or_default()
}

/// A change as it is kept: names trimmed, provider groups once each, group
/// ids once each.
fn tidy(change: Change) -> Result<Change, Refused> {
    fn name_of(name: String) -> Result<String, Refused> {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(Refused::Invalid("a group has a name".into()));
        }
        Ok(name)
    }
    fn follows_of(follows: Vec<String>) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        for f in follows {
            let f = f.trim().to_string();
            if !f.is_empty() && !out.contains(&f) {
                out.push(f);
            }
        }
        out
    }
    Ok(match change {
        Change::GroupAdd {
            name,
            access,
            follows,
        } => Change::GroupAdd {
            name: name_of(name)?,
            access,
            follows: follows_of(follows),
        },
        Change::GroupSet {
            id,
            name,
            access,
            follows,
        } => Change::GroupSet {
            id,
            name: name_of(name)?,
            access,
            follows: follows_of(follows),
        },
        Change::Access {
            subject,
            mut groups,
            grants,
            detail,
        } => {
            groups.sort_unstable();
            groups.dedup();
            Change::Access {
                subject,
                groups,
                grants,
                detail,
            }
        }
        other => other,
    })
}

/// Everyone who has signed in at this desk.
#[derive(Debug, Clone)]
pub struct Seen {
    pub subject: String,
    pub display: String,
    pub last_seen_at: String,
    pub claims: Claims,
}

impl Store {
    pub fn book(&self) -> Book {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        book_in(&conn)
    }

    /// A person's access now; `claims` under `oidc`.
    pub fn access(&self, subject: &str, claims: Option<&Claims>) -> Resolved {
        self.book().resolve(subject, claims)
    }

    /// Everyone who has signed in, in the order they first did.
    pub fn seen(&self) -> Vec<Seen> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut st = match conn.prepare(
            "SELECT subject, display, last_seen_at, claims FROM person ORDER BY first_seen_at",
        ) {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        st.query_map([], |r| {
            Ok(Seen {
                subject: r.get(0)?,
                display: r.get(1)?,
                last_seen_at: r.get(2)?,
                claims: serde_json::from_str(&r.get::<_, String>(3)?).unwrap_or_default(),
            })
        })
        .map(|rows| rows.flatten().collect())
        .unwrap_or_default()
    }

    /// How many sessions each subject holds open now.
    pub fn sessions_by_subject(&self) -> std::collections::HashMap<String, i64> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut st = match conn
            .prepare("SELECT subject, COUNT(*) FROM session WHERE expires_at > ?1 GROUP BY subject")
        {
            Ok(s) => s,
            Err(_) => return std::collections::HashMap::new(),
        };
        st.query_map(params![now_iso()], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })
        .map(|rows| rows.flatten().collect())
        .unwrap_or_default()
    }

    /// A change to groups or to what a person holds, made in one
    /// transaction, and refused when it would leave nobody holding
    /// `identity:work` where somebody did. A person is a local user, or in
    /// `oidc` mode someone who has signed in. The id of the group added or
    /// set, when the change was to one.
    pub fn change(&self, oidc: bool, change: Change) -> Result<Option<i64>, Refused> {
        let change = tidy(change)?;
        let mut conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let book = book_in(&conn);
        let people = people_in(&conn, oidc);
        let holders = |b: &Book| {
            people
                .iter()
                .filter(|(s, c)| b.resolve(s, c.as_ref()).access.holds("identity:work"))
                .count()
        };
        let mut after = book.clone();
        match &change {
            Change::GroupAdd {
                name,
                access,
                follows,
            } => {
                if book.group_named(name).is_some() {
                    return Err(Refused::Invalid(format!("a group named {name} exists")));
                }
                after.groups.push(Group {
                    id: 0,
                    name: name.clone(),
                    access: access.clone(),
                    follows: follows.clone(),
                    made_at: String::new(),
                });
            }
            Change::GroupSet {
                id,
                name,
                access,
                follows,
            } => {
                if book.groups.iter().any(|g| g.id != *id && g.name == *name) {
                    return Err(Refused::Invalid(format!("a group named {name} exists")));
                }
                let Some(g) = after.groups.iter_mut().find(|g| g.id == *id) else {
                    return Err(Refused::Unknown(format!("no group {id}")));
                };
                g.name = name.clone();
                g.access = access.clone();
                g.follows = follows.clone();
            }
            Change::GroupRemove { id } => {
                if book.group(*id).is_none() {
                    return Err(Refused::Unknown(format!("no group {id}")));
                }
                after.groups.retain(|g| g.id != *id);
                after.members.retain(|(_, g)| g != id);
            }
            Change::Access {
                subject,
                groups,
                grants,
                detail,
            } => {
                if !people.iter().any(|(s, _)| s == subject) {
                    return Err(Refused::Unknown(if oidc {
                        format!("nobody has signed in as {subject}")
                    } else {
                        format!("no user named {subject}")
                    }));
                }
                if let Some(bad) = groups.iter().find(|g| book.group(**g).is_none()) {
                    return Err(Refused::Invalid(format!("no group {bad}")));
                }
                after.members.retain(|(s, _)| s != subject);
                after
                    .members
                    .extend(groups.iter().map(|g| (subject.clone(), *g)));
                after.own.insert(subject.clone(), (grants.clone(), *detail));
            }
        }
        if holders(&book) > 0 && holders(&after) == 0 {
            return Err(Refused::Nobody);
        }
        let store = |e: rusqlite::Error| {
            if e.to_string().contains("UNIQUE") {
                Refused::Invalid("a group by that name exists".into())
            } else {
                Refused::Store(e.to_string())
            }
        };
        let tx = conn.transaction().map_err(store)?;
        let id = match &change {
            Change::GroupAdd {
                name,
                access,
                follows,
            } => {
                tx.execute(
                    "INSERT INTO grp (name, grants, detail, follows, made_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![name, json!(access.list()).to_string(), access.detail.as_str(), json!(follows).to_string(), now_iso()],
                )
                .map_err(store)?;
                Some(tx.last_insert_rowid())
            }
            Change::GroupSet {
                id,
                name,
                access,
                follows,
            } => {
                tx.execute(
                    "UPDATE grp SET name = ?1, grants = ?2, detail = ?3, follows = ?4 WHERE id = ?5",
                    params![name, json!(access.list()).to_string(), access.detail.as_str(), json!(follows).to_string(), id],
                )
                .map_err(store)?;
                Some(*id)
            }
            Change::GroupRemove { id } => {
                tx.execute("DELETE FROM member WHERE grp = ?1", params![id])
                    .map_err(store)?;
                tx.execute("DELETE FROM grp WHERE id = ?1", params![id])
                    .map_err(store)?;
                None
            }
            Change::Access {
                subject,
                groups,
                grants,
                detail,
            } => {
                tx.execute("DELETE FROM member WHERE subject = ?1", params![subject])
                    .map_err(store)?;
                for g in groups {
                    tx.execute(
                        "INSERT INTO member (subject, grp) VALUES (?1, ?2)",
                        params![subject, g],
                    )
                    .map_err(store)?;
                }
                if grants.is_empty() && detail.is_none() {
                    tx.execute("DELETE FROM own WHERE subject = ?1", params![subject])
                        .map_err(store)?;
                } else {
                    tx.execute(
                        "INSERT INTO own (subject, grants, detail) VALUES (?1, ?2, ?3)
                         ON CONFLICT(subject) DO UPDATE SET grants = excluded.grants, detail = excluded.detail",
                        params![subject, json!(grants).to_string(), detail.map(Detail::as_str)],
                    )
                    .map_err(store)?;
                }
                None
            }
        };
        tx.commit().map_err(store)?;
        Ok(id)
    }
}
