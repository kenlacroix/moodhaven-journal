use rusqlite::params;
use serde::{Deserialize, Serialize};

use super::Database;

/// A signal row as returned from the database
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SignalRow {
    pub id: String,
    pub timestamp: String,
    pub signal_type: String,
    pub source: String,
    /// JSON-encoded EncryptedContent — decrypted by the TypeScript layer
    pub payload: String,
    pub synced: bool,
    pub created_at: String,
}

/// Sync log row
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncLogRow {
    pub id: i64,
    pub object_id: String,
    pub object_type: String,
    pub action: String,
    pub created_at: String,
}

/// Create a new signal record
pub fn create_signal(
    db: &Database,
    id: &str,
    timestamp: &str,
    signal_type: &str,
    source: &str,
    payload: &str,
) -> Result<SignalRow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO signals (id, timestamp, type, source, payload)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, timestamp, signal_type, source, payload],
    )
    .map_err(|e| format!("Failed to create signal: {}", e))?;

    let row = conn
        .query_row(
            "SELECT id, timestamp, type, source, payload, synced, created_at
             FROM signals WHERE id = ?1",
            params![id],
            |r| {
                Ok(SignalRow {
                    id: r.get(0)?,
                    timestamp: r.get(1)?,
                    signal_type: r.get(2)?,
                    source: r.get(3)?,
                    payload: r.get(4)?,
                    synced: r.get::<_, i32>(5)? != 0,
                    created_at: r.get(6)?,
                })
            },
        )
        .map_err(|e| format!("Failed to fetch created signal: {}", e))?;

    Ok(row)
}

/// Every signal's `id` + encrypted `payload`, with NO limit — for the change-password re-key
/// sweep. Unlike `list_signals` (defaults to 200, caps at 1000), this returns the full set so
/// `change_master_password` re-encrypts every signal; any omission would leave that signal
/// undecryptable under the new password.
pub fn get_all_signal_blobs(db: &Database) -> Result<Vec<(String, String)>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, payload FROM signals ORDER BY id ASC")
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, String)> = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

/// List signals, optionally filtered by type
pub fn list_signals(
    db: &Database,
    signal_type: Option<&str>,
    limit: Option<i32>,
) -> Result<Vec<SignalRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let lim = limit.unwrap_or(200).min(1000);

    let rows: Vec<SignalRow> = if let Some(st) = signal_type {
        let mut stmt = conn
            .prepare(
                "SELECT id, timestamp, type, source, payload, synced, created_at
                 FROM signals WHERE type = ?1
                 ORDER BY timestamp DESC LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let collected: Vec<SignalRow> = stmt
            .query_map(params![st, lim], |r| {
                Ok(SignalRow {
                    id: r.get(0)?,
                    timestamp: r.get(1)?,
                    signal_type: r.get(2)?,
                    source: r.get(3)?,
                    payload: r.get(4)?,
                    synced: r.get::<_, i32>(5)? != 0,
                    created_at: r.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        collected
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, timestamp, type, source, payload, synced, created_at
                 FROM signals ORDER BY timestamp DESC LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let collected: Vec<SignalRow> = stmt
            .query_map(params![lim], |r| {
                Ok(SignalRow {
                    id: r.get(0)?,
                    timestamp: r.get(1)?,
                    signal_type: r.get(2)?,
                    source: r.get(3)?,
                    payload: r.get(4)?,
                    synced: r.get::<_, i32>(5)? != 0,
                    created_at: r.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        collected
    };

    Ok(rows)
}

/// Link a signal to a journal reflection entry
pub fn link_signal_to_entry(
    db: &Database,
    reflection_id: &str,
    signal_id: &str,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR IGNORE INTO reflection_signals (reflection_id, signal_id)
         VALUES (?1, ?2)",
        params![reflection_id, signal_id],
    )
    .map_err(|e| format!("Failed to link signal: {}", e))?;

    Ok(())
}

/// Get all signals linked to a journal entry
pub fn list_entry_signals(db: &Database, reflection_id: &str) -> Result<Vec<SignalRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.timestamp, s.type, s.source, s.payload, s.synced, s.created_at
             FROM signals s
             INNER JOIN reflection_signals rs ON rs.signal_id = s.id
             WHERE rs.reflection_id = ?1
             ORDER BY s.timestamp ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<SignalRow> = stmt
        .query_map(params![reflection_id], |r| {
            Ok(SignalRow {
                id: r.get(0)?,
                timestamp: r.get(1)?,
                signal_type: r.get(2)?,
                source: r.get(3)?,
                payload: r.get(4)?,
                synced: r.get::<_, i32>(5)? != 0,
                created_at: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

/// Delete a signal (and cascade through reflection_signals)
pub fn delete_signal(db: &Database, id: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM signals WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete signal: {}", e))?;

    Ok(())
}

/// Get unsynced sync_log entries (for incremental sync engines)
pub fn get_unsynced_log(db: &Database, limit: Option<i32>) -> Result<Vec<SyncLogRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(500).min(2000);

    let mut stmt = conn
        .prepare(
            "SELECT id, object_id, object_type, action, created_at
             FROM sync_log WHERE synced = 0
             ORDER BY id ASC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<SyncLogRow> = stmt
        .query_map(params![lim], |r| {
            Ok(SyncLogRow {
                id: r.get(0)?,
                object_id: r.get(1)?,
                object_type: r.get(2)?,
                action: r.get(3)?,
                created_at: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

/// Mark sync_log rows as synced up to a given log id
pub fn mark_sync_log_synced(db: &Database, up_to_id: i64) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE sync_log SET synced = 1 WHERE id <= ?1 AND synced = 0",
        params![up_to_id],
    )
    .map_err(|e| format!("Failed to mark sync log synced: {}", e))?;

    Ok(())
}
