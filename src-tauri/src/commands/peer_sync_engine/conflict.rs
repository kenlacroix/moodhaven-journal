//! Database helpers for the peer sync engine: manifest reads, LWW upserts, and
//! sync-state tracking. All conflict resolution uses last-write-wins on updated_at.

use rusqlite::Connection;

use crate::db::JournalEntryRow;

use super::protocol::{SyncBookRow, SyncMeta, SyncSignalRow};

// Maximum seconds a peer's `updated_at` may be ahead of local clock.
const MAX_FUTURE_SECS: i64 = 10;

/// Parse and validate a peer-supplied timestamp. Returns Err if the value cannot
/// be parsed as RFC 3339 or is more than MAX_FUTURE_SECS ahead of now — both of
/// which are signs of a malformed or malicious payload.
fn parse_peer_timestamp(ts: &str) -> Result<chrono::DateTime<chrono::Utc>, String> {
    let dt = chrono::DateTime::parse_from_rfc3339(ts)
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .or_else(|_| {
            // SQLite `datetime('now')` / CURRENT_TIMESTAMP schema defaults emit a
            // naive "YYYY-MM-DD HH:MM:SS" (no 'T', no timezone) — treat as UTC.
            // Both fallbacks require time components, so date-only strings (e.g.
            // "9999-12-31") are still rejected.
            chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%d %H:%M:%S")
                .or_else(|_| chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%dT%H:%M:%S"))
                .map(|naive| naive.and_utc())
        })
        .map_err(|_| format!("invalid timestamp: {ts:?}"))?;
    let limit = chrono::Utc::now() + chrono::TimeDelta::seconds(MAX_FUTURE_SECS);
    if dt > limit {
        return Err(format!("timestamp too far in future: {ts:?}"));
    }
    Ok(dt)
}

// ── Manifest helpers ──────────────────────────────────────────────────────────

pub fn db_get_entries_manifest(conn: &Connection) -> Result<Vec<SyncMeta>, String> {
    let mut stmt = conn
        .prepare("SELECT id, updated_at FROM journal_entries ORDER BY updated_at DESC")
        .map_err(|e| format!("prepare entries manifest: {e}"))?;
    let rows = stmt
        .query_map([], |r| {
            Ok(SyncMeta {
                id: r.get(0)?,
                updated_at: r.get(1)?,
            })
        })
        .map_err(|e| format!("query entries manifest: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("collect entries manifest: {e}"))
}

pub fn db_get_books_manifest(conn: &Connection) -> Result<Vec<SyncMeta>, String> {
    let mut stmt = conn
        .prepare("SELECT id, COALESCE(updated_at, created_at) FROM books ORDER BY id")
        .map_err(|e| format!("prepare books manifest: {e}"))?;
    let rows = stmt
        .query_map([], |r| {
            Ok(SyncMeta {
                id: r.get(0)?,
                updated_at: r.get(1)?,
            })
        })
        .map_err(|e| format!("query books manifest: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("collect books manifest: {e}"))
}

pub fn db_get_signals_manifest(conn: &Connection) -> Result<Vec<SyncMeta>, String> {
    let mut stmt = conn
        .prepare("SELECT id, created_at FROM signals ORDER BY created_at DESC")
        .map_err(|e| format!("prepare signals manifest: {e}"))?;
    let rows = stmt
        .query_map([], |r| {
            Ok(SyncMeta {
                id: r.get(0)?,
                updated_at: r.get(1)?,
            })
        })
        .map_err(|e| format!("query signals manifest: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("collect signals manifest: {e}"))
}

/// Returns manifest items for whitelisted settings keys that exist in the DB.
pub fn db_get_settings_manifest(conn: &Connection) -> Result<Vec<SyncMeta>, String> {
    let result: rusqlite::Result<(String, String)> = conn.query_row(
        "SELECT key, updated_at FROM settings WHERE key = 'app_settings'",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    );
    match result {
        Ok((key, updated_at)) => Ok(vec![SyncMeta {
            id: key,
            updated_at,
        }]),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(vec![]),
        Err(e) => Err(format!("query settings manifest: {e}")),
    }
}

// ── Full-row fetchers ─────────────────────────────────────────────────────────

pub fn db_get_books_full(conn: &Connection, ids: &[String]) -> Result<Vec<SyncBookRow>, String> {
    if ids.is_empty() {
        return Ok(vec![]);
    }
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "SELECT id, name, emoji, color, sort_order, description, settings, \
                created_at, COALESCE(updated_at, created_at) \
         FROM books WHERE id IN ({placeholders})"
    );
    conn.prepare(&sql)
        .map_err(|e| format!("prepare books full: {e}"))?
        .query_map(rusqlite::params_from_iter(ids.iter()), |r| {
            Ok(SyncBookRow {
                id: r.get(0)?,
                name: r.get(1)?,
                emoji: r.get(2)?,
                color: r.get(3)?,
                sort_order: r.get(4)?,
                description: r.get(5)?,
                settings: r.get(6)?,
                created_at: r.get(7)?,
                updated_at: r.get(8)?,
            })
        })
        .map_err(|e| format!("query books full: {e}"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("collect books full: {e}"))
}

pub fn db_get_signals_full(
    conn: &Connection,
    ids: &[String],
) -> Result<Vec<SyncSignalRow>, String> {
    if ids.is_empty() {
        return Ok(vec![]);
    }
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "SELECT id, timestamp, type, source, payload, created_at \
         FROM signals WHERE id IN ({placeholders})"
    );
    conn.prepare(&sql)
        .map_err(|e| format!("prepare signals full: {e}"))?
        .query_map(rusqlite::params_from_iter(ids.iter()), |r| {
            Ok(SyncSignalRow {
                id: r.get(0)?,
                timestamp: r.get(1)?,
                signal_type: r.get(2)?,
                source: r.get(3)?,
                payload: r.get(4)?,
                created_at: r.get(5)?,
            })
        })
        .map_err(|e| format!("query signals full: {e}"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("collect signals full: {e}"))
}

pub fn db_get_entries_full(
    conn: &Connection,
    ids: &[String],
) -> Result<Vec<JournalEntryRow>, String> {
    if ids.is_empty() {
        return Ok(vec![]);
    }
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "SELECT je.id, je.encrypted_content, je.mood, je.privacy_mode, \
                je.location_weather, je.book_id, je.pinned, \
                je.created_at, je.updated_at, \
                je.sealed_until, je.capsule_type, je.linked_original_id, je.unsealed_at, \
                je.status, je.session_id, je.word_count, \
                COALESCE(GROUP_CONCAT(t.name, ','), '') AS tags \
         FROM journal_entries je \
         LEFT JOIN entry_tags et ON et.entry_id = je.id \
         LEFT JOIN tags t ON t.id = et.tag_id \
         WHERE je.id IN ({placeholders}) \
         GROUP BY je.id"
    );
    conn.prepare(&sql)
        .map_err(|e| format!("prepare entries full: {e}"))?
        .query_map(rusqlite::params_from_iter(ids.iter()), |r| {
            let ec_json: String = r.get(1)?;
            let tags_str: Option<String> = r.get(16)?;
            let tags = crate::db::parse_tags(tags_str);
            let ec: crate::db::EncryptedContent = serde_json::from_str(&ec_json).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    1,
                    rusqlite::types::Type::Text,
                    Box::new(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        e.to_string(),
                    )),
                )
            })?;
            Ok(JournalEntryRow {
                id: r.get(0)?,
                encrypted_content: Some(ec),
                mood: r.get(2)?,
                privacy_mode: r.get(3)?,
                location_weather: r.get(4)?,
                book_id: r
                    .get::<_, Option<String>>(5)?
                    .unwrap_or_else(|| "default".to_string()),
                pinned: r.get::<_, i32>(6)? != 0,
                created_at: r.get(7)?,
                updated_at: r.get(8)?,
                sealed_until: r.get(9)?,
                capsule_type: r.get(10)?,
                linked_original_id: r.get(11)?,
                unsealed_at: r.get(12)?,
                tags,
                status: r.get(13).ok().flatten(),
                session_id: r.get(14).ok().flatten(),
                word_count: r.get(15).ok().flatten(),
            })
        })
        .map_err(|e| format!("query entries full: {e}"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("collect entries full: {e}"))
}

pub fn db_get_setting_for_sync(
    conn: &Connection,
    key: &str,
) -> Result<Option<(String, String)>, String> {
    let result: rusqlite::Result<(String, String)> = conn.query_row(
        "SELECT value, updated_at FROM settings WHERE key = ?1",
        rusqlite::params![key],
        |r| Ok((r.get(0)?, r.get(1)?)),
    );
    match result {
        Ok(pair) => Ok(Some(pair)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("query setting: {e}")),
    }
}

// ── LWW upserts ───────────────────────────────────────────────────────────────

pub fn db_upsert_book(conn: &Connection, row: &SyncBookRow) -> Result<bool, String> {
    let remote_ts = parse_peer_timestamp(&row.updated_at)?;

    let existing: Option<String> = conn
        .query_row(
            "SELECT COALESCE(updated_at, created_at) FROM books WHERE id = ?1",
            rusqlite::params![row.id],
            |r| r.get(0),
        )
        .ok();

    match existing {
        None => {
            conn.execute(
                "INSERT INTO books \
                 (id, name, emoji, color, sort_order, description, settings, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                rusqlite::params![
                    row.id, row.name, row.emoji, row.color, row.sort_order,
                    row.description, row.settings, row.created_at, row.updated_at
                ],
            )
            .map_err(|e| format!("insert book: {e}"))?;
            Ok(true)
        }
        Some(ref local)
            if {
                parse_peer_timestamp(local)
                    .map(|local_ts| remote_ts > local_ts)
                    .unwrap_or(false)
            } =>
        {
            conn.execute(
                "UPDATE books \
                 SET name = ?2, emoji = ?3, color = ?4, sort_order = ?5, \
                     description = ?6, settings = ?7, updated_at = ?8 \
                 WHERE id = ?1",
                rusqlite::params![
                    row.id,
                    row.name,
                    row.emoji,
                    row.color,
                    row.sort_order,
                    row.description,
                    row.settings,
                    row.updated_at
                ],
            )
            .map_err(|e| format!("update book: {e}"))?;
            Ok(true)
        }
        _ => Ok(false), // local is same age or newer — skip
    }
}

/// Signals are immutable — INSERT OR IGNORE; returns true if a new row was inserted.
pub fn db_insert_signal_if_new(conn: &Connection, row: &SyncSignalRow) -> Result<bool, String> {
    let changes = conn
        .execute(
            "INSERT OR IGNORE INTO signals (id, timestamp, type, source, payload, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                row.id,
                row.timestamp,
                row.signal_type,
                row.source,
                row.payload,
                row.created_at
            ],
        )
        .map_err(|e| format!("insert signal: {e}"))?;
    Ok(changes > 0)
}

/// Merge whitelisted fields from `remote` JSON into `local` JSON.
/// Non-whitelisted fields (credentials, device-specific prefs) are never overwritten.
pub fn merge_settings_json(local_json: &str, remote_json: &str) -> Result<String, String> {
    let mut local: serde_json::Value =
        serde_json::from_str(local_json).map_err(|e| format!("parse local settings: {e}"))?;
    let remote: serde_json::Value =
        serde_json::from_str(remote_json).map_err(|e| format!("parse remote settings: {e}"))?;

    // Take these top-level sections entirely from remote
    for section in &["journal", "reminders"] {
        if let Some(v) = remote.get(*section) {
            local[section] = v.clone();
        }
    }
    // Take only ai.features and ai.consent from remote (not ai.openai / ai.localAI / ai.enabled)
    if let Some(remote_ai) = remote.get("ai") {
        if let Some(local_ai) = local.get_mut("ai") {
            for sub in &["features", "consent"] {
                if let Some(v) = remote_ai.get(*sub) {
                    local_ai[sub] = v.clone();
                }
            }
        }
    }
    // Take specific appearance fields from remote (not theme — that's per-device)
    if let Some(remote_app) = remote.get("appearance") {
        if let Some(local_app) = local.get_mut("appearance") {
            for field in &["compactMode", "animationsEnabled"] {
                if let Some(v) = remote_app.get(*field) {
                    local_app[field] = v.clone();
                }
            }
        }
    }

    serde_json::to_string(&local).map_err(|e| format!("serialize merged settings: {e}"))
}

/// Keys that may be synced from a remote peer.  Any setting key sent by a peer
/// that is NOT in this list is silently dropped.  This prevents a compromised
/// trusted device from injecting arbitrary rows (e.g. `password_hash`,
/// `totp_secret`, or service credentials) into the local settings table.
const SYNC_ALLOWED_SETTINGS: &[&str] = &["app_settings"];

/// Upsert a setting received from a peer, applying whitelist merge for app_settings.
/// Returns true if the local DB was changed.
pub fn db_upsert_setting(
    conn: &Connection,
    key: &str,
    remote_value: &str,
    remote_updated_at: &str,
) -> Result<bool, String> {
    if !SYNC_ALLOWED_SETTINGS.contains(&key) {
        log::warn!(
            "[sync] Peer attempted to sync disallowed setting key {:?} — dropped",
            key
        );
        return Ok(false);
    }
    let remote_ts = parse_peer_timestamp(remote_updated_at)?;
    let local = db_get_setting_for_sync(conn, key)?;
    let new_value = match &local {
        None => remote_value.to_string(),
        Some((local_value, local_updated_at)) => {
            let local_is_newer = parse_peer_timestamp(local_updated_at)
                .map(|local_ts| local_ts >= remote_ts)
                .unwrap_or(true);
            if local_is_newer {
                return Ok(false); // local is same age or newer
            }
            if key == "app_settings" {
                merge_settings_json(local_value, remote_value)?
            } else {
                remote_value.to_string()
            }
        }
    };

    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)",
        rusqlite::params![key, new_value, remote_updated_at],
    )
    .map_err(|e| format!("upsert setting: {e}"))?;
    Ok(true)
}

pub fn db_upsert_tags(conn: &Connection, entry_id: &str, tags: &[String]) -> Result<(), String> {
    if tags.is_empty() {
        return Ok(());
    }
    for tag_name in tags {
        let tag_name = tag_name.trim();
        if tag_name.is_empty() {
            continue;
        }
        // Ensure tag exists
        conn.execute(
            "INSERT OR IGNORE INTO tags (id, name) VALUES (lower(hex(randomblob(8))), ?1)",
            rusqlite::params![tag_name],
        )
        .map_err(|e| format!("insert tag: {e}"))?;

        // Get tag id
        let tag_id: String = conn
            .query_row(
                "SELECT id FROM tags WHERE name = ?1",
                rusqlite::params![tag_name],
                |r| r.get(0),
            )
            .map_err(|e| format!("get tag id: {e}"))?;

        // Link tag to entry
        conn.execute(
            "INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params![entry_id, tag_id],
        )
        .map_err(|e| format!("link tag: {e}"))?;
    }
    Ok(())
}

pub fn db_upsert_entry(conn: &Connection, row: &JournalEntryRow) -> Result<bool, String> {
    let ec = row
        .encrypted_content
        .as_ref()
        .ok_or("encrypted_content is None — cannot sync sealed entry")?;
    let ec_json = serde_json::to_string(ec).map_err(|e| format!("serialize ec: {e}"))?;

    // Validate and parse incoming timestamp before any LWW comparison.
    // Rejects date-only strings ("9999-12-31") and far-future timestamps that
    // would permanently win every conflict, preventing LWW bypass attacks.
    let remote_ts = parse_peer_timestamp(&row.updated_at)?;

    // Check existing updated_at
    let existing: Option<String> = conn
        .query_row(
            "SELECT updated_at FROM journal_entries WHERE id = ?1",
            rusqlite::params![row.id],
            |r| r.get(0),
        )
        .ok();

    match existing {
        None => {
            // INSERT — trigger only fires on UPDATE, so updated_at is preserved as-is
            conn.execute(
                "INSERT INTO journal_entries \
                 (id, encrypted_content, mood, privacy_mode, location_weather, \
                  book_id, pinned, created_at, updated_at, \
                  sealed_until, capsule_type, linked_original_id, unsealed_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                rusqlite::params![
                    row.id,
                    ec_json,
                    row.mood,
                    row.privacy_mode,
                    row.location_weather,
                    row.book_id,
                    row.pinned as i32,
                    row.created_at,
                    row.updated_at,
                    row.sealed_until,
                    row.capsule_type,
                    row.linked_original_id,
                    row.unsealed_at,
                ],
            )
            .map_err(|e| format!("insert entry: {e}"))?;
            db_upsert_tags(conn, &row.id, &row.tags)?;
            Ok(true)
        }
        Some(ref local)
            if {
                // Parse local timestamp for comparison; fall back to "remote loses" on parse error.
                parse_peer_timestamp(local)
                    .map(|local_ts| remote_ts > local_ts)
                    .unwrap_or(false)
            } =>
        {
            // UPDATE — set updated_at explicitly so the trigger (WHEN NEW.updated_at = OLD.updated_at) doesn't fire
            conn.execute(
                "UPDATE journal_entries \
                 SET encrypted_content = ?2, mood = ?3, privacy_mode = ?4, \
                     location_weather = ?5, book_id = ?6, pinned = ?7, updated_at = ?8, \
                     sealed_until = ?9, capsule_type = ?10, \
                     linked_original_id = ?11, unsealed_at = ?12 \
                 WHERE id = ?1",
                rusqlite::params![
                    row.id,
                    ec_json,
                    row.mood,
                    row.privacy_mode,
                    row.location_weather,
                    row.book_id,
                    row.pinned as i32,
                    row.updated_at,
                    row.sealed_until,
                    row.capsule_type,
                    row.linked_original_id,
                    row.unsealed_at,
                ],
            )
            .map_err(|e| format!("update entry: {e}"))?;
            db_upsert_tags(conn, &row.id, &row.tags)?;
            Ok(true)
        }
        _ => Ok(false), // local is same age or newer — skip
    }
}

// ── Sync state ────────────────────────────────────────────────────────────────

#[allow(dead_code)]
pub fn db_get_peer_sync_at(conn: &Connection, peer_id: &str) -> Result<Option<String>, String> {
    let result: rusqlite::Result<String> = conn.query_row(
        "SELECT last_sync_at FROM peer_sync_state WHERE peer_device_id = ?1",
        rusqlite::params![peer_id],
        |r| r.get(0),
    );
    match result {
        Ok(val) => Ok(Some(val)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("query peer_sync_at: {e}")),
    }
}

pub fn db_set_peer_sync_at(conn: &Connection, peer_id: &str, at: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO peer_sync_state (peer_device_id, last_sync_at) VALUES (?1, ?2)
         ON CONFLICT(peer_device_id) DO UPDATE SET last_sync_at = excluded.last_sync_at",
        rusqlite::params![peer_id, at],
    )
    .map_err(|e| format!("set peer sync at: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        db_insert_signal_if_new, db_upsert_book, db_upsert_entry, db_upsert_setting,
        merge_settings_json, parse_peer_timestamp,
    };
    use crate::commands::peer_sync_engine::protocol::{SyncBookRow, SyncSignalRow};
    use crate::db::journal::{EncryptedContent, JournalEntryRow};

    // ── Schema helpers ────────────────────────────────────────────────────────

    fn make_settings_conn() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, \
             updated_at TEXT DEFAULT CURRENT_TIMESTAMP);",
        )
        .unwrap();
        conn
    }

    fn make_entry_conn() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE journal_entries (
                id TEXT PRIMARY KEY,
                encrypted_content TEXT NOT NULL,
                mood INTEGER NOT NULL,
                privacy_mode INTEGER NOT NULL DEFAULT 0,
                location_weather TEXT,
                book_id TEXT NOT NULL DEFAULT 'default',
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                sealed_until TEXT,
                capsule_type TEXT,
                linked_original_id TEXT,
                unsealed_at TEXT
            );
            CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL);
            CREATE TABLE entry_tags (
                entry_id TEXT REFERENCES journal_entries(id) ON DELETE CASCADE,
                tag_id TEXT REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (entry_id, tag_id)
            );",
        )
        .unwrap();
        conn
    }

    fn make_books_conn() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE books (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                emoji TEXT NOT NULL DEFAULT '📔',
                color TEXT NOT NULL DEFAULT 'violet',
                sort_order INTEGER NOT NULL DEFAULT 0,
                description TEXT,
                settings TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT
            );",
        )
        .unwrap();
        conn
    }

    fn make_signals_conn() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE signals (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                type TEXT NOT NULL,
                source TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL
            );",
        )
        .unwrap();
        conn
    }

    fn stub_entry(id: &str, updated_at: &str) -> JournalEntryRow {
        JournalEntryRow {
            id: id.to_string(),
            encrypted_content: Some(EncryptedContent {
                ciphertext: "ct".into(),
                iv: "iv".into(),
                salt: "sa".into(),
                version: 1,
            }),
            mood: 3,
            privacy_mode: 0,
            location_weather: None,
            book_id: "default".into(),
            pinned: false,
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: updated_at.to_string(),
            tags: vec![],
            sealed_until: None,
            capsule_type: None,
            linked_original_id: None,
            unsealed_at: None,
            status: None,
            session_id: None,
            word_count: None,
        }
    }

    fn stub_book(id: &str, updated_at: &str) -> SyncBookRow {
        SyncBookRow {
            id: id.to_string(),
            name: "Test Book".into(),
            emoji: "📔".into(),
            color: "#8b5cf6".into(),
            sort_order: 0,
            description: None,
            settings: None,
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: updated_at.to_string(),
        }
    }

    fn stub_signal(id: &str) -> SyncSignalRow {
        SyncSignalRow {
            id: id.to_string(),
            timestamp: "2026-01-01T10:00:00Z".into(),
            signal_type: "mood_tap".into(),
            source: "watch".into(),
            payload: r#"{"ciphertext":"ct","iv":"iv","salt":"sa","version":1}"#.into(),
            created_at: "2026-01-01T10:00:00Z".into(),
        }
    }

    // ── parse_peer_timestamp ──────────────────────────────────────────────────

    #[test]
    fn past_timestamp_is_accepted() {
        let result = parse_peer_timestamp("2026-01-01T00:00:00Z");
        assert!(result.is_ok(), "a past timestamp must be accepted");
    }

    #[test]
    fn far_future_timestamp_is_rejected() {
        let result = parse_peer_timestamp("9999-12-31T23:59:59Z");
        assert!(
            result.is_err(),
            "far-future timestamp must be rejected (clock-skew attack guard)"
        );
        assert!(result.unwrap_err().contains("future"));
    }

    #[test]
    fn invalid_timestamp_format_is_rejected() {
        let result = parse_peer_timestamp("not-a-timestamp");
        assert!(result.is_err());
    }

    #[test]
    fn date_only_string_is_rejected() {
        let result = parse_peer_timestamp("9999-12-31");
        assert!(
            result.is_err(),
            "date-only string must not be accepted as a timestamp"
        );
    }

    // ── db_upsert_setting ─────────────────────────────────────────────────────

    #[test]
    fn allowed_key_is_accepted() {
        let conn = make_settings_conn();
        let result = db_upsert_setting(&conn, "app_settings", "{}", "2026-01-01T00:00:00Z");
        assert!(result.is_ok());
        assert!(result.unwrap());
    }

    #[test]
    fn disallowed_key_password_hash_is_dropped() {
        let conn = make_settings_conn();
        let result = db_upsert_setting(&conn, "password_hash", "evil", "2099-01-01T00:00:00Z");
        assert!(result.is_ok());
        assert!(!result.unwrap(), "password_hash must never be synced");
    }

    #[test]
    fn disallowed_key_is_dropped() {
        let conn = make_settings_conn();
        let result = db_upsert_setting(&conn, "password_hash", "evil", "2099-01-01T00:00:00Z");
        assert!(result.is_ok());
        assert!(!result.unwrap());
    }

    #[test]
    fn totp_secret_key_is_dropped() {
        let conn = make_settings_conn();
        let result = db_upsert_setting(
            &conn,
            "totp_secret",
            "JBSWY3DPEHPK3PXP",
            "2099-01-01T00:00:00Z",
        );
        assert!(result.is_ok());
        assert!(!result.unwrap(), "totp_secret must never be synced");
    }

    #[test]
    fn oura_pat_key_is_dropped() {
        let conn = make_settings_conn();
        let result = db_upsert_setting(&conn, "oura_pat", "secret_token", "2099-01-01T00:00:00Z");
        assert!(result.is_ok());
        assert!(!result.unwrap(), "oura_pat must never be synced");
    }

    #[test]
    fn far_future_timestamp_rejected_in_upsert_setting() {
        let conn = make_settings_conn();
        let result = db_upsert_setting(&conn, "app_settings", "{}", "9999-12-31T23:59:59Z");
        assert!(result.is_err(), "far-future timestamp must be rejected");
    }

    #[test]
    fn lww_older_value_not_applied() {
        let conn = make_settings_conn();
        let r1 = db_upsert_setting(&conn, "app_settings", "{\"v\":1}", "2026-01-02T00:00:00Z");
        assert!(r1.is_ok());
        assert!(r1.unwrap());
        let r2 = db_upsert_setting(&conn, "app_settings", "{\"v\":0}", "2026-01-01T00:00:00Z");
        assert!(r2.is_ok());
        assert!(!r2.unwrap(), "older remote must not overwrite newer local");
    }

    #[test]
    fn lww_newer_remote_overwrites_older_local() {
        let conn = make_settings_conn();
        let r1 = db_upsert_setting(&conn, "app_settings", r#"{"v":1}"#, "2026-01-01T00:00:00Z");
        assert!(r1.unwrap());
        let r2 = db_upsert_setting(&conn, "app_settings", r#"{"v":2}"#, "2026-01-02T00:00:00Z");
        assert!(r2.unwrap(), "newer remote must overwrite older local");
    }

    // ── merge_settings_json ───────────────────────────────────────────────────

    #[test]
    fn merge_copies_journal_section_from_remote() {
        let local = r#"{"journal":{"fontSize":14},"ai":{"enabled":false}}"#;
        let remote = r#"{"journal":{"fontSize":16},"ai":{"enabled":true}}"#;
        let merged: serde_json::Value =
            serde_json::from_str(&merge_settings_json(local, remote).unwrap()).unwrap();
        assert_eq!(
            merged["journal"]["fontSize"], 16,
            "journal section must come from remote"
        );
    }

    #[test]
    fn merge_does_not_copy_credentials_section() {
        let local = r#"{"openai":{"key":"local-key"},"journal":{}}"#;
        let remote = r#"{"openai":{"key":"injected-key"},"journal":{"x":1}}"#;
        let merged: serde_json::Value =
            serde_json::from_str(&merge_settings_json(local, remote).unwrap()).unwrap();
        assert_eq!(
            merged["openai"]["key"].as_str().unwrap_or(""),
            "local-key",
            "non-whitelisted credentials must not be overwritten"
        );
    }

    #[test]
    fn merge_copies_ai_features_not_ai_key() {
        let local = r#"{"ai":{"enabled":false,"features":{"contextualPrompts":false},"openai":{"key":"mine"}}}"#;
        let remote = r#"{"ai":{"enabled":true,"features":{"contextualPrompts":true},"openai":{"key":"theirs"}}}"#;
        let merged: serde_json::Value =
            serde_json::from_str(&merge_settings_json(local, remote).unwrap()).unwrap();
        assert_eq!(
            merged["ai"]["features"]["contextualPrompts"], true,
            "ai.features must come from remote"
        );
        assert_eq!(
            merged["ai"]["openai"]["key"].as_str().unwrap_or(""),
            "mine",
            "ai.openai must be preserved from local"
        );
    }

    #[test]
    fn merge_copies_reminders_from_remote() {
        let local = r#"{"reminders":{"enabled":false}}"#;
        let remote = r#"{"reminders":{"enabled":true,"time":"09:00"}}"#;
        let merged: serde_json::Value =
            serde_json::from_str(&merge_settings_json(local, remote).unwrap()).unwrap();
        assert_eq!(merged["reminders"]["enabled"], true);
    }

    #[test]
    fn merge_rejects_invalid_json() {
        assert!(merge_settings_json("not-json", "{}").is_err());
        assert!(merge_settings_json("{}", "also-not-json").is_err());
    }

    // ── db_upsert_entry ───────────────────────────────────────────────────────

    #[test]
    fn new_entry_is_inserted() {
        let conn = make_entry_conn();
        let changed = db_upsert_entry(&conn, &stub_entry("e-001", "2026-01-01T10:00:00Z")).unwrap();
        assert!(changed, "new entry must be inserted");
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM journal_entries WHERE id = 'e-001'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn remote_newer_entry_overwrites_local() {
        let conn = make_entry_conn();
        db_upsert_entry(&conn, &stub_entry("e-002", "2026-01-01T10:00:00Z")).unwrap();
        let changed = db_upsert_entry(&conn, &stub_entry("e-002", "2026-01-02T10:00:00Z")).unwrap();
        assert!(changed, "remote-newer entry must update local");
    }

    #[test]
    fn remote_older_entry_is_skipped() {
        let conn = make_entry_conn();
        db_upsert_entry(&conn, &stub_entry("e-003", "2026-01-10T10:00:00Z")).unwrap();
        let changed = db_upsert_entry(&conn, &stub_entry("e-003", "2026-01-01T10:00:00Z")).unwrap();
        assert!(!changed, "remote-older entry must not overwrite local");
    }

    #[test]
    fn equal_timestamps_are_skipped() {
        let conn = make_entry_conn();
        let ts = "2026-06-01T12:00:00Z";
        db_upsert_entry(&conn, &stub_entry("e-004", ts)).unwrap();
        let changed = db_upsert_entry(&conn, &stub_entry("e-004", ts)).unwrap();
        assert!(!changed, "equal timestamps must result in no change");
    }

    #[test]
    fn far_future_updated_at_is_rejected() {
        let conn = make_entry_conn();
        let entry = stub_entry("e-005", "9999-12-31T23:59:59Z");
        let result = db_upsert_entry(&conn, &entry);
        assert!(
            result.is_err(),
            "far-future updated_at must be rejected (LWW bypass guard)"
        );
    }

    /// Password-mismatch invariant: when a peer encrypts an entry under a
    /// different password, the sync engine still moves opaque ciphertext.
    /// db_upsert_entry must store the blob verbatim (it never decrypts) so the
    /// receiving device persists it without corruption. Frontend decryption
    /// fails gracefully later — that is out of scope here; what we assert is
    /// that the engine does not crash, error, or mangle the ciphertext.
    #[test]
    fn password_mismatch_blob_is_stored_verbatim_without_corruption() {
        let conn = make_entry_conn();

        // A blob "encrypted under a different password" — the engine treats
        // encrypted_content as an opaque envelope and never inspects it.
        let mut entry = stub_entry("e-mismatch", "2026-03-01T10:00:00Z");
        let foreign = EncryptedContent {
            ciphertext: "Zm9yZWlnbi1jaXBoZXJ0ZXh0".into(),
            iv: "Zm9yZWlnbi1pdg==".into(),
            salt: "Zm9yZWlnbi1zYWx0".into(),
            version: 1,
        };
        entry.encrypted_content = Some(foreign.clone());

        let changed = db_upsert_entry(&conn, &entry).expect("upsert must not error on foreign key");
        assert!(changed, "a new foreign-key entry must be inserted");

        // The stored envelope must be byte-for-byte what the peer sent.
        let stored_json: String = conn
            .query_row(
                "SELECT encrypted_content FROM journal_entries WHERE id = 'e-mismatch'",
                [],
                |r| r.get(0),
            )
            .expect("entry row must exist");
        let stored: EncryptedContent =
            serde_json::from_str(&stored_json).expect("stored envelope must round-trip as JSON");

        assert_eq!(stored.ciphertext, foreign.ciphertext);
        assert_eq!(stored.iv, foreign.iv);
        assert_eq!(stored.salt, foreign.salt);
        assert_eq!(stored.version, foreign.version);
    }

    // ── db_upsert_book ────────────────────────────────────────────────────────

    #[test]
    fn new_book_is_inserted() {
        let conn = make_books_conn();
        assert!(db_upsert_book(&conn, &stub_book("b-001", "2026-01-01T10:00:00Z")).unwrap());
    }

    #[test]
    fn remote_newer_book_overwrites_local() {
        let conn = make_books_conn();
        db_upsert_book(&conn, &stub_book("b-002", "2026-01-01T00:00:00Z")).unwrap();
        let changed = db_upsert_book(&conn, &stub_book("b-002", "2026-01-02T00:00:00Z")).unwrap();
        assert!(changed, "newer remote book must update local");
    }

    #[test]
    fn remote_older_book_is_skipped() {
        let conn = make_books_conn();
        db_upsert_book(&conn, &stub_book("b-003", "2026-01-10T00:00:00Z")).unwrap();
        let changed = db_upsert_book(&conn, &stub_book("b-003", "2026-01-01T00:00:00Z")).unwrap();
        assert!(!changed, "older remote book must not overwrite local");
    }

    // ── db_insert_signal_if_new ───────────────────────────────────────────────

    #[test]
    fn new_signal_is_inserted() {
        let conn = make_signals_conn();
        assert!(db_insert_signal_if_new(&conn, &stub_signal("sig-001")).unwrap());
    }

    #[test]
    fn duplicate_signal_is_idempotent() {
        let conn = make_signals_conn();
        db_insert_signal_if_new(&conn, &stub_signal("sig-002")).unwrap();
        let again = db_insert_signal_if_new(&conn, &stub_signal("sig-002")).unwrap();
        assert!(
            !again,
            "duplicate signal must be idempotent (INSERT OR IGNORE)"
        );
    }

    #[test]
    fn different_signals_are_both_inserted() {
        let conn = make_signals_conn();
        assert!(db_insert_signal_if_new(&conn, &stub_signal("sig-a")).unwrap());
        assert!(db_insert_signal_if_new(&conn, &stub_signal("sig-b")).unwrap());
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM signals", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 2);
    }
}
