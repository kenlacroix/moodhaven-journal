//! Database helpers for the peer sync engine: manifest reads, LWW upserts, and
//! sync-state tracking. All conflict resolution uses last-write-wins on updated_at.

use rusqlite::Connection;

use crate::db::JournalEntryRow;

use super::protocol::{SyncBookRow, SyncMeta, SyncSignalRow};

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
            let tags_str: Option<String> = r.get(13)?;
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
                status: None,
                session_id: None,
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
        Some(ref local) if row.updated_at.as_str() > local.as_str() => {
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

/// Upsert a setting received from a peer, applying whitelist merge for app_settings.
/// Returns true if the local DB was changed.
pub fn db_upsert_setting(
    conn: &Connection,
    key: &str,
    remote_value: &str,
    remote_updated_at: &str,
) -> Result<bool, String> {
    let local = db_get_setting_for_sync(conn, key)?;
    let new_value = match &local {
        None => remote_value.to_string(),
        Some((local_value, local_updated_at)) => {
            if remote_updated_at <= local_updated_at.as_str() {
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
        Some(ref local) if row.updated_at.as_str() > local.as_str() => {
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
