use rusqlite::params;
use serde::{Deserialize, Serialize};

use super::Database;

/// A voice memo row as returned from the database
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VoiceMemoRow {
    pub id: String,
    pub timestamp: String,
    pub duration_ms: i64,
    /// Optional heart-rate JSON captured at recording time: `{"hr":78}`
    pub health_json: Option<String>,
    /// Relative path from app_data_dir, e.g. `voice_memos/<id>.m4a`
    pub file_path: String,
    /// Whisper.cpp transcription (null until processed)
    pub transcription: Option<String>,
    /// Linked journal entry id (null until user attaches it)
    pub entry_id: Option<String>,
    /// Origin: "watch" | "phone"
    pub source: String,
    pub created_at: String,
}

/// Insert a voice memo record.
/// `file_path` is the relative path stored in the DB (`voice_memos/<id>.m4a`).
pub fn create_voice_memo(
    db: &Database,
    id: &str,
    timestamp: &str,
    duration_ms: i64,
    health_json: Option<&str>,
    file_path: &str,
    source: &str,
) -> Result<VoiceMemoRow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO voice_memos
             (id, timestamp, duration_ms, health_json, file_path, source, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6,
                 strftime('%Y-%m-%dT%H:%M:%S','now','localtime'))",
        params![id, timestamp, duration_ms, health_json, file_path, source],
    )
    .map_err(|e| format!("Failed to insert voice memo: {}", e))?;

    conn.query_row(
        "SELECT id, timestamp, duration_ms, health_json, file_path,
                transcription, entry_id, source, created_at
         FROM voice_memos WHERE id = ?1",
        params![id],
        |r| {
            Ok(VoiceMemoRow {
                id: r.get(0)?,
                timestamp: r.get(1)?,
                duration_ms: r.get(2)?,
                health_json: r.get(3)?,
                file_path: r.get(4)?,
                transcription: r.get(5)?,
                entry_id: r.get(6)?,
                source: r.get(7)?,
                created_at: r.get(8)?,
            })
        },
    )
    .map_err(|e| format!("Failed to fetch created voice memo: {}", e))
}

/// List voice memos, newest first, up to `limit` rows.
pub fn list_voice_memos(db: &Database, limit: Option<i32>) -> Result<Vec<VoiceMemoRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(100).min(1000);

    let mut stmt = conn
        .prepare(
            "SELECT id, timestamp, duration_ms, health_json, file_path,
                    transcription, entry_id, source, created_at
             FROM voice_memos
             ORDER BY timestamp DESC
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![lim], |r| {
            Ok(VoiceMemoRow {
                id: r.get(0)?,
                timestamp: r.get(1)?,
                duration_ms: r.get(2)?,
                health_json: r.get(3)?,
                file_path: r.get(4)?,
                transcription: r.get(5)?,
                entry_id: r.get(6)?,
                source: r.get(7)?,
                created_at: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

/// Get a single voice memo by id.
pub fn get_voice_memo(db: &Database, id: &str) -> Result<Option<VoiceMemoRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let result = conn.query_row(
        "SELECT id, timestamp, duration_ms, health_json, file_path,
                transcription, entry_id, source, created_at
         FROM voice_memos WHERE id = ?1",
        params![id],
        |r| {
            Ok(VoiceMemoRow {
                id: r.get(0)?,
                timestamp: r.get(1)?,
                duration_ms: r.get(2)?,
                health_json: r.get(3)?,
                file_path: r.get(4)?,
                transcription: r.get(5)?,
                entry_id: r.get(6)?,
                source: r.get(7)?,
                created_at: r.get(8)?,
            })
        },
    );

    match result {
        Ok(row) => Ok(Some(row)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Query failed: {}", e)),
    }
}

/// Delete a voice memo record (caller is responsible for deleting the file).
pub fn delete_voice_memo(db: &Database, id: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM voice_memos WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete voice memo: {}", e))?;

    Ok(())
}

/// Patch the transcription text for a voice memo.
/// On first write (raw_transcription IS NULL), also populates raw_transcription
/// so the original whisper output is preserved even if transcription is later edited.
pub fn patch_voice_memo_transcription(
    db: &Database,
    id: &str,
    transcription: &str,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE voice_memos
         SET transcription = ?1,
             raw_transcription = CASE WHEN raw_transcription IS NULL THEN ?1 ELSE raw_transcription END
         WHERE id = ?2",
        params![transcription, id],
    )
    .map_err(|e| format!("Failed to patch transcription: {}", e))?;

    Ok(())
}

/// Link a voice memo to a journal entry.
pub fn link_voice_memo_to_entry(
    db: &Database,
    memo_id: &str,
    entry_id: &str,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE voice_memos SET entry_id = ?1 WHERE id = ?2",
        params![entry_id, memo_id],
    )
    .map_err(|e| format!("Failed to link voice memo: {}", e))?;

    Ok(())
}
