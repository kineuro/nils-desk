// SPDX-License-Identifier: AGPL-3.0-only

//! The desk's one SQLite file: sessions with the tokens they hold, the
//! people seen and their display names (§5.9), and the local users of
//! `local` mode (§5.1).

use std::sync::Mutex;

use rusqlite::{Connection, OptionalExtension, params};
use serde_json::Value;

pub struct Store {
    conn: Mutex<Connection>,
}

#[derive(Debug, Clone)]
pub struct Session {
    pub id: String,
    pub subject: String,
    pub display: String,
    /// The entitlements at login, plain strings.
    pub entitlements: Vec<String>,
    /// What the session holds for the parts: in `oidc` mode the provider's
    /// access and refresh tokens and their expiry; in `local` mode the last
    /// minted token and its expiry. Never sent to a browser.
    pub tokens: Value,
}

#[derive(Debug, Clone)]
pub struct User {
    pub username: String,
    pub display: String,
    pub entitlements: Vec<String>,
    pub admin: bool,
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
             );",
        )
        .map_err(|e| e.to_string())?;
        Ok(Store {
            conn: Mutex::new(conn),
        })
    }

    // --- sessions

    pub fn create(
        &self,
        subject: &str,
        display: &str,
        entitlements: &[String],
        tokens: &Value,
        hours: i64,
    ) -> Result<Session, String> {
        let id = token();
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "INSERT INTO session (id, subject, display, entitlements, tokens, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                subject,
                display,
                serde_json::to_string(entitlements).unwrap_or_default(),
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
            entitlements: entitlements.to_vec(),
            tokens: tokens.clone(),
        })
    }

    pub fn get(&self, id: &str) -> Option<Session> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.query_row(
            "SELECT id, subject, display, entitlements, tokens FROM session WHERE id = ?1 AND expires_at > ?2",
            params![id, now_iso()],
            |r| {
                Ok(Session {
                    id: r.get(0)?,
                    subject: r.get(1)?,
                    display: r.get(2)?,
                    entitlements: serde_json::from_str(&r.get::<_, String>(3)?).unwrap_or_default(),
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

    // --- people: the display name beside the subject, at first sight

    pub fn saw(&self, subject: &str, display: &str) {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let now = now_iso();
        let _ = conn.execute(
            "INSERT INTO person (subject, display, first_seen_at, last_seen_at) VALUES (?1, ?2, ?3, ?3)
             ON CONFLICT(subject) DO UPDATE SET display = excluded.display, last_seen_at = excluded.last_seen_at",
            params![subject, display, now],
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

    // --- local users

    pub fn user_add(
        &self,
        username: &str,
        hash: &str,
        display: &str,
        entitlements: &[String],
        admin: bool,
    ) -> Result<(), String> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "INSERT INTO user (username, password_hash, display, entitlements, admin, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![username, hash, display, serde_json::to_string(entitlements).unwrap_or_default(), admin as i64, now_iso()],
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
            "SELECT username, password_hash, display, entitlements, admin FROM user WHERE username = ?1",
            params![username],
            |r| {
                Ok((
                    User {
                        username: r.get(0)?,
                        display: r.get(2)?,
                        entitlements: serde_json::from_str(&r.get::<_, String>(3)?).unwrap_or_default(),
                        admin: r.get::<_, i64>(4)? != 0,
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
        let mut st = match conn
            .prepare("SELECT username, display, entitlements, admin FROM user ORDER BY username")
        {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        st.query_map([], |r| {
            Ok(User {
                username: r.get(0)?,
                display: r.get(1)?,
                entitlements: serde_json::from_str(&r.get::<_, String>(2)?).unwrap_or_default(),
                admin: r.get::<_, i64>(3)? != 0,
            })
        })
        .map(|rows| rows.flatten().collect())
        .unwrap_or_default()
    }

    pub fn user_set_entitlements(
        &self,
        username: &str,
        entitlements: &[String],
    ) -> Result<bool, String> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let n = conn
            .execute(
                "UPDATE user SET entitlements = ?1 WHERE username = ?2",
                params![
                    serde_json::to_string(entitlements).unwrap_or_default(),
                    username
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(n == 1)
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
