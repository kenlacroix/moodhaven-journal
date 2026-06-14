//! Multi-device sync commands for MoodHaven Journal
//!
//! Provides lightweight entry metadata for manifest diffing, and a granular
//! upsert command for applying entries received from a remote device.

use crate::db::Database;
use crate::AppLockState;
use serde::{Deserialize, Serialize};
use tauri::State;

use super::require_unlocked;

// ── Sync field validation ─────────────────────────────────────────────────────

const ALLOWED_CAPSULE_TYPES: &[&str] = &["letter", "vault", "anniversary"];
/// Maximum number of seconds a peer's `updated_at` may be ahead of local clock.
/// 10 s accommodates minor clock skew without letting an attacker manipulate LWW ordering.
const MAX_FUTURE_SECS: i64 = 10;
const MAX_TAG_COUNT: usize = 50;
const MAX_TAG_LEN: usize = 64;
const MAX_BOOK_ID_LEN: usize = 64;
const UUID_LEN: usize = 36; // xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

/// Returns Err if `s` doesn't look like a UUID (length + hyphen positions only —
/// no regex dep required). This blocks path-style or SQL-injection IDs.
fn validate_id(s: &str) -> Result<(), String> {
    if s.len() != UUID_LEN {
        return Err(format!("Invalid id length: {}", s.len()));
    }
    for (i, c) in s.chars().enumerate() {
        match i {
            8 | 13 | 18 | 23 => {
                if c != '-' {
                    return Err("Invalid id format".to_string());
                }
            }
            _ => {
                if !c.is_ascii_hexdigit() {
                    return Err("Invalid id character".to_string());
                }
            }
        }
    }
    Ok(())
}

/// Returns Err if `s` doesn't look like an ISO 8601 timestamp (basic length / char check).
fn validate_timestamp(s: &str, field: &str) -> Result<(), String> {
    // Minimum: "2006-01-02T15:04:05" = 19 chars; maximum reasonable length = 35
    if s.len() < 19 || s.len() > 35 {
        return Err(format!("Invalid {field} timestamp length"));
    }
    if !s
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || ":-+TZ.".contains(c))
    {
        return Err(format!("Invalid characters in {field}"));
    }
    Ok(())
}

/// Lightweight entry metadata used by the sync engine manifest diff.
#[derive(Debug, Serialize, Deserialize)]
pub struct SyncEntryMeta {
    pub id: String,
    pub updated_at: String,
}

/// Return `(id, updated_at)` for every entry — no content loaded.
/// Used to build the local half of the manifest diff without decrypting anything.
#[tauri::command]
pub fn get_entry_timestamps(
    db: State<Database>,
    lock: State<'_, AppLockState>,
) -> Result<Vec<SyncEntryMeta>, String> {
    require_unlocked(&lock)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, updated_at FROM journal_entries ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;

    let metas: Vec<SyncEntryMeta> = stmt
        .query_map([], |row| {
            Ok(SyncEntryMeta {
                id: row.get(0)?,
                updated_at: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(metas)
}

/// Insert or update a single entry received from a remote device.
///
/// - If the entry doesn't exist locally → INSERT.
/// - If the remote `updated_at` is strictly newer → UPDATE.
/// - Otherwise (local is same age or newer) → no-op (local wins).
///
/// `entry_json` must be a JSON-serialised `JournalEntryRow` (same shape
/// that `get_journal_entry` / `get_all_journal_entries` returns).
#[tauri::command]
pub fn upsert_entry_from_sync(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    rekey: State<'_, crate::RekeyInProgress>,
    entry_json: String,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    super::require_no_rekey(&rekey)?;
    // Deserialize as a generic Value so we can pick out fields without
    // reproducing the full JournalEntryRow struct in this module.
    let v: serde_json::Value =
        serde_json::from_str(&entry_json).map_err(|e| format!("Invalid entry JSON: {}", e))?;

    let id = v["id"].as_str().ok_or("Missing id")?;
    validate_id(id)?;

    let updated_at = v["updated_at"].as_str().ok_or("Missing updated_at")?;
    validate_timestamp(updated_at, "updated_at")?;
    // Reject timestamps too far in the future — prevents a malicious peer
    // from injecting a far-future updated_at that always wins LWW resolution.
    if let Ok(ts) = chrono::DateTime::parse_from_rfc3339(updated_at) {
        let limit = chrono::Utc::now() + chrono::TimeDelta::seconds(MAX_FUTURE_SECS);
        if ts.with_timezone(&chrono::Utc) > limit {
            return Err(
                "updated_at is too far in the future — possible LWW manipulation".to_string(),
            );
        }
    }

    let created_at = v["created_at"].as_str().ok_or("Missing created_at")?;
    validate_timestamp(created_at, "created_at")?;

    let mood = v["mood"].as_i64().unwrap_or(3).clamp(1, 5) as i32;
    let privacy_mode = v["privacy_mode"].as_i64().unwrap_or(0).clamp(0, 2) as i32;
    let pinned = v["pinned"].as_bool().unwrap_or(false) as i32;

    let book_id = v["book_id"].as_str().unwrap_or("default");
    if book_id.len() > MAX_BOOK_ID_LEN {
        return Err(format!("book_id exceeds max length ({})", MAX_BOOK_ID_LEN));
    }

    let word_count: Option<i64> = v["word_count"].as_i64();

    if let Some(ct) = v["capsule_type"].as_str() {
        if !ct.is_empty() && !ALLOWED_CAPSULE_TYPES.contains(&ct) {
            return Err(format!("Invalid capsule_type: {:?}", ct));
        }
    }

    if let Some(su) = v["sealed_until"].as_str() {
        validate_timestamp(su, "sealed_until")?;
    }

    let location_weather = v["location_weather"].as_str();

    // Re-serialize encrypted_content as compact JSON for storage
    let ec = v
        .get("encrypted_content")
        .ok_or("Missing encrypted_content")?;
    let ec_json = serde_json::to_string(ec)
        .map_err(|e| format!("Failed to re-serialize encrypted_content: {}", e))?;

    // Tags: array of strings (may be absent on older entries)
    let tags: Vec<String> = v["tags"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|t| t.as_str().map(|s| s.to_string()))
                .filter(|s| !s.is_empty() && s.len() <= MAX_TAG_LEN)
                .collect()
        })
        .unwrap_or_default();
    if tags.len() > MAX_TAG_COUNT {
        return Err(format!("Too many tags (max {})", MAX_TAG_COUNT));
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let existing_updated_at: Option<String> = conn
        .query_row(
            "SELECT updated_at FROM journal_entries WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .ok();

    match existing_updated_at {
        None => {
            conn.execute(
                "INSERT INTO journal_entries \
                 (id, encrypted_content, mood, privacy_mode, location_weather, \
                  book_id, pinned, word_count, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                rusqlite::params![
                    id,
                    ec_json,
                    mood,
                    privacy_mode,
                    location_weather,
                    book_id,
                    pinned,
                    word_count,
                    created_at,
                    updated_at
                ],
            )
            .map_err(|e| e.to_string())?;
            upsert_tags_for_entry(&conn, id, &tags)?;
        }
        Some(ref local) if updated_at > local.as_str() => {
            conn.execute(
                "UPDATE journal_entries \
                 SET encrypted_content = ?2, mood = ?3, privacy_mode = ?4, \
                     location_weather = ?5, book_id = ?6, pinned = ?7, \
                     word_count = ?9, updated_at = ?8 \
                 WHERE id = ?1",
                rusqlite::params![
                    id,
                    ec_json,
                    mood,
                    privacy_mode,
                    location_weather,
                    book_id,
                    pinned,
                    updated_at,
                    word_count
                ],
            )
            .map_err(|e| e.to_string())?;
            upsert_tags_for_entry(&conn, id, &tags)?;
        }
        _ => {} // local is same age or newer — skip
    }

    Ok(())
}

/// Replace tag associations for an entry (delete-all then re-insert).
fn upsert_tags_for_entry(
    conn: &rusqlite::Connection,
    entry_id: &str,
    tags: &[String],
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM entry_tags WHERE entry_id = ?1",
        rusqlite::params![entry_id],
    )
    .map_err(|e| e.to_string())?;

    for name in tags {
        conn.execute(
            "INSERT OR IGNORE INTO tags (name) VALUES (?1)",
            rusqlite::params![name],
        )
        .map_err(|e| e.to_string())?;

        let tag_id: i32 = conn
            .query_row(
                "SELECT id FROM tags WHERE name = ?1",
                rusqlite::params![name],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params![entry_id, tag_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
