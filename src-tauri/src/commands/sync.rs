//! Multi-device sync commands for MoodBloom
//!
//! Provides lightweight entry metadata for manifest diffing, and a granular
//! upsert command for applying entries received from a remote device.

use crate::db::Database;
use tauri::State;
use serde::{Deserialize, Serialize};

/// Lightweight entry metadata used by the sync engine manifest diff.
#[derive(Debug, Serialize, Deserialize)]
pub struct SyncEntryMeta {
    pub id: String,
    pub updated_at: String,
}

/// Return `(id, updated_at)` for every entry — no content loaded.
/// Used to build the local half of the manifest diff without decrypting anything.
#[tauri::command]
pub fn get_entry_timestamps(db: State<Database>) -> Result<Vec<SyncEntryMeta>, String> {
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
pub fn upsert_entry_from_sync(db: State<Database>, entry_json: String) -> Result<(), String> {
    // Deserialize as a generic Value so we can pick out fields without
    // reproducing the full JournalEntryRow struct in this module.
    let v: serde_json::Value = serde_json::from_str(&entry_json)
        .map_err(|e| format!("Invalid entry JSON: {}", e))?;

    let id = v["id"].as_str().ok_or("Missing id")?;
    let updated_at = v["updated_at"].as_str().ok_or("Missing updated_at")?;
    let created_at = v["created_at"].as_str().ok_or("Missing created_at")?;
    let mood = v["mood"].as_i64().unwrap_or(3).clamp(1, 5) as i32;
    let privacy_mode = v["privacy_mode"].as_i64().unwrap_or(0).clamp(0, 2) as i32;
    let pinned = v["pinned"].as_bool().unwrap_or(false) as i32;
    let book_id = v["book_id"].as_str().unwrap_or("default");
    let location_weather = v["location_weather"].as_str();

    // Re-serialize encrypted_content as compact JSON for storage
    let ec = v.get("encrypted_content").ok_or("Missing encrypted_content")?;
    let ec_json = serde_json::to_string(ec)
        .map_err(|e| format!("Failed to re-serialize encrypted_content: {}", e))?;

    // Tags: array of strings (may be absent on older entries)
    let tags: Vec<String> = v["tags"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|t| t.as_str().map(|s| s.to_string()))
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let existing_updated_at: Option<String> = conn.query_row(
        "SELECT updated_at FROM journal_entries WHERE id = ?1",
        rusqlite::params![id],
        |row| row.get(0),
    ).ok();

    match existing_updated_at {
        None => {
            conn.execute(
                "INSERT INTO journal_entries \
                 (id, encrypted_content, mood, privacy_mode, location_weather, \
                  book_id, pinned, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                rusqlite::params![
                    id, ec_json, mood, privacy_mode, location_weather,
                    book_id, pinned, created_at, updated_at
                ],
            ).map_err(|e| e.to_string())?;
            upsert_tags_for_entry(&conn, id, &tags)?;
        }
        Some(ref local) if updated_at > local.as_str() => {
            conn.execute(
                "UPDATE journal_entries \
                 SET encrypted_content = ?2, mood = ?3, privacy_mode = ?4, \
                     location_weather = ?5, book_id = ?6, pinned = ?7, updated_at = ?8 \
                 WHERE id = ?1",
                rusqlite::params![
                    id, ec_json, mood, privacy_mode, location_weather,
                    book_id, pinned, updated_at
                ],
            ).map_err(|e| e.to_string())?;
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
    ).map_err(|e| e.to_string())?;

    for name in tags {
        conn.execute(
            "INSERT OR IGNORE INTO tags (name) VALUES (?1)",
            rusqlite::params![name],
        ).map_err(|e| e.to_string())?;

        let tag_id: i32 = conn.query_row(
            "SELECT id FROM tags WHERE name = ?1",
            rusqlite::params![name],
            |row| row.get(0),
        ).map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params![entry_id, tag_id],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}
