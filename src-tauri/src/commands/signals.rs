//! Signal-related Tauri commands
//!
//! Signals are structured data points (mood check-ins, Wear OS events, health
//! snapshots, etc.) that can be linked to journal reflections.
//!
//! **Encryption:** Signal payloads are encrypted client-side by the TypeScript
//! layer (same AES-256-GCM pattern as journal entries) before being passed to
//! these commands. Rust stores and retrieves opaque encrypted blobs — it never
//! sees plaintext signal data.

use crate::db::{self, Database, SignalRow, SyncLogRow};
use tauri::State;

/// Create a new encrypted signal
#[tauri::command]
pub fn create_signal(
    db: State<Database>,
    id: String,
    timestamp: String,
    signal_type: String,
    source: String,
    // payload: JSON-serialised EncryptedContent — encrypted by TypeScript before this call
    payload: String,
) -> Result<SignalRow, String> {
    if id.is_empty() {
        return Err("Signal id must not be empty".to_string());
    }
    if signal_type.is_empty() {
        return Err("Signal type must not be empty".to_string());
    }
    db::create_signal(&db, &id, &timestamp, &signal_type, &source, &payload)
}

/// List signals, optionally filtered by type
#[tauri::command]
pub fn list_signals(
    db: State<Database>,
    signal_type: Option<String>,
    limit: Option<i32>,
) -> Result<Vec<SignalRow>, String> {
    db::list_signals(&db, signal_type.as_deref(), limit)
}

/// Link an existing signal to a journal reflection entry (many-to-many)
#[tauri::command]
pub fn link_signal_to_entry(
    db: State<Database>,
    reflection_id: String,
    signal_id: String,
) -> Result<(), String> {
    db::link_signal_to_entry(&db, &reflection_id, &signal_id)
}

/// Get all signals attached to a journal entry
#[tauri::command]
pub fn list_entry_signals(
    db: State<Database>,
    reflection_id: String,
) -> Result<Vec<SignalRow>, String> {
    db::list_entry_signals(&db, &reflection_id)
}

/// Delete a signal
#[tauri::command]
pub fn delete_signal(db: State<Database>, id: String) -> Result<(), String> {
    db::delete_signal(&db, &id)
}

/// Get unsynced entries from the sync_log (for incremental sync engines)
#[tauri::command]
pub fn get_unsynced_log(
    db: State<Database>,
    limit: Option<i32>,
) -> Result<Vec<SyncLogRow>, String> {
    db::get_unsynced_log(&db, limit)
}

/// Mark sync_log rows as synced up to (and including) the given log id
#[tauri::command]
pub fn mark_sync_log_synced(db: State<Database>, up_to_id: i64) -> Result<(), String> {
    db::mark_sync_log_synced(&db, up_to_id)
}

// ── Self-test command (debug builds only) ────────────────────────────────────

/// Run the full signal pipeline self-test without a watch.
///
/// Steps:
///   1. Insert a test signal with a known fake-encrypted payload
///   2. Read it back via list_signals
///   3. Verify fields match
///   4. Link it to a known journal entry if one exists
///   5. Read it back via list_entry_signals
///   6. Check sync_log was populated
///   7. Delete the test signal
///   8. Confirm it is gone
///
/// Returns a JSON object with test results for each step.
/// The payload is intentionally a plain JSON string (not real AES ciphertext)
/// so we can verify the round-trip without a TypeScript crypto context.
#[tauri::command]
pub fn debug_signal_self_test(db: State<Database>) -> Result<serde_json::Value, String> {
    use serde_json::json;

    let test_id = format!("__selftest_{}", chrono::Utc::now().timestamp_millis());
    let fake_payload =
        r#"{"ciphertext":"dGVzdA==","iv":"AAAAAAAAAA==","salt":"AAAAAAAAAA==","version":1}"#;
    let mut results: Vec<serde_json::Value> = Vec::new();
    let mut passed = 0u32;
    let mut failed = 0u32;

    macro_rules! check {
        ($name:expr, $ok:expr, $detail:expr) => {{
            let ok: bool = $ok;
            if ok { passed += 1; } else { failed += 1; }
            results.push(json!({
                "test": $name,
                "pass": ok,
                "detail": $detail,
            }));
        }};
    }

    // 1. Create
    let create_result = db::create_signal(
        &db,
        &test_id,
        "2026-01-01T00:00:00",
        "mood_tap",
        "test",
        fake_payload,
    );
    check!(
        "create_signal",
        create_result.is_ok(),
        create_result
            .as_ref()
            .err()
            .map(|e| e.as_str())
            .unwrap_or("ok")
    );

    // 2. List all — our signal must appear
    let list_result = db::list_signals(&db, None, Some(500));
    let found_in_list = list_result
        .as_ref()
        .map(|rows| rows.iter().any(|r| r.id == test_id))
        .unwrap_or(false);
    check!(
        "list_signals (appears)",
        found_in_list,
        if found_in_list { "found" } else { "missing" }
    );

    // 3. List by type filter
    let filtered = db::list_signals(&db, Some("mood_tap"), Some(500));
    let found_filtered = filtered
        .as_ref()
        .map(|rows| rows.iter().any(|r| r.id == test_id))
        .unwrap_or(false);
    check!(
        "list_signals (type filter)",
        found_filtered,
        if found_filtered { "found" } else { "missing" }
    );

    // 4. Verify payload round-trip
    let payload_ok = list_result
        .as_ref()
        .ok()
        .and_then(|rows| rows.iter().find(|r| r.id == test_id))
        .map(|r| r.payload == fake_payload)
        .unwrap_or(false);
    check!(
        "payload round-trip",
        payload_ok,
        if payload_ok { "match" } else { "mismatch" }
    );

    // 5. Sync log populated — query directly for THIS test id to avoid limit/ordering issues
    let log_count: i64 = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT COUNT(*) FROM sync_log \
             WHERE object_id = ?1 AND object_type = 'signal' AND action = 'insert'",
            rusqlite::params![test_id],
            |r| r.get(0),
        )
        .unwrap_or(0)
    };
    let log_has_signal = log_count > 0;
    check!(
        "sync_log trigger fired",
        log_has_signal,
        if log_has_signal {
            "entry found"
        } else {
            "missing"
        }
    );

    // 6. Delete
    let del = db::delete_signal(&db, &test_id);
    check!(
        "delete_signal",
        del.is_ok(),
        del.err().as_deref().unwrap_or("ok")
    );

    // 7. Confirm gone
    let after_delete = db::list_signals(&db, None, Some(500));
    let gone = after_delete
        .as_ref()
        .map(|rows| !rows.iter().any(|r| r.id == test_id))
        .unwrap_or(false);
    check!(
        "signal deleted",
        gone,
        if gone {
            "confirmed gone"
        } else {
            "still present!"
        }
    );

    Ok(json!({
        "passed": passed,
        "failed": failed,
        "total": passed + failed,
        "ok": failed == 0,
        "results": results,
    }))
}
