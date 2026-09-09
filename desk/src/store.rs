// SPDX-License-Identifier: AGPL-3.0-only

//! The desk's one SQLite file: sessions now, display names, preferences and
//! local users with B2.

use std::sync::Mutex;

use rusqlite::{Connection, params};

pub struct Store {
    conn: Mutex<Connection>,
}

#[derive(Debug, Clone)]
pub struct Session {
    pub id: String,
    pub subject: String,
    pub display: String,
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
                 created_at TEXT NOT NULL,
                 expires_at TEXT NOT NULL
             );",
        )
        .map_err(|e| e.to_string())?;
        Ok(Store {
            conn: Mutex::new(conn),
        })
    }

    pub fn create(&self, subject: &str, display: &str, hours: i64) -> Result<Session, String> {
        let id = token();
        let now = time::OffsetDateTime::now_utc();
        let fmt = time::format_description::well_known::Rfc3339;
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "INSERT INTO session (id, subject, display, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                id,
                subject,
                display,
                now.format(&fmt).unwrap_or_default(),
                (now + time::Duration::hours(hours)).format(&fmt).unwrap_or_default()
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(Session {
            id,
            subject: subject.into(),
            display: display.into(),
        })
    }

    pub fn get(&self, id: &str) -> Option<Session> {
        let now = time::OffsetDateTime::now_utc()
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_default();
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.query_row(
            "SELECT id, subject, display FROM session WHERE id = ?1 AND expires_at > ?2",
            params![id, now],
            |r| {
                Ok(Session {
                    id: r.get(0)?,
                    subject: r.get(1)?,
                    display: r.get(2)?,
                })
            },
        )
        .ok()
    }

    pub fn delete(&self, id: &str) {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let _ = conn.execute("DELETE FROM session WHERE id = ?1", params![id]);
    }
}

/// Thirty two random bytes, as hex: a session id nobody guesses.
fn token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
