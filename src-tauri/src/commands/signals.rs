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
use crate::AppLockState;
use tauri::State;

use super::require_unlocked;

const VALID_SIGNAL_TYPES: &[&str] = &["mood_tap", "health_snapshot", "still_trigger", "manual"];
const VALID_SOURCES: &[&str] = &["wear_os", "oura", "manual", "stillhaven"];
const MAX_PAYLOAD_BYTES: usize = 10_240; // 10 KB — mood_tap payloads are tiny; cap tightened for safety

/// Create a new encrypted signal
#[tauri::command]
pub fn create_signal(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    id: String,
    timestamp: String,
    signal_type: String,
    source: String,
    // payload: JSON-serialised EncryptedContent — encrypted by TypeScript before this call
    payload: String,
) -> Result<SignalRow, String> {
    require_unlocked(&lock)?;
    if id.is_empty() {
        return Err("Signal id must not be empty".to_string());
    }
    if !VALID_SIGNAL_TYPES.contains(&signal_type.as_str()) {
        return Err(format!("Unknown signal_type: {signal_type}"));
    }
    if !VALID_SOURCES.contains(&source.as_str()) {
        return Err(format!("Unknown source: {source}"));
    }
    if payload.len() > MAX_PAYLOAD_BYTES {
        return Err(format!(
            "Signal payload too large ({} bytes, max {})",
            payload.len(),
            MAX_PAYLOAD_BYTES
        ));
    }
    db::create_signal(&db, &id, &timestamp, &signal_type, &source, &payload)
}

/// List signals, optionally filtered by type
#[tauri::command]
pub fn list_signals(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    signal_type: Option<String>,
    limit: Option<i32>,
) -> Result<Vec<SignalRow>, String> {
    require_unlocked(&lock)?;
    db::list_signals(&db, signal_type.as_deref(), limit)
}

/// Link an existing signal to a journal reflection entry (many-to-many)
#[tauri::command]
pub fn link_signal_to_entry(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    reflection_id: String,
    signal_id: String,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    db::link_signal_to_entry(&db, &reflection_id, &signal_id)
}

/// Get all signals attached to a journal entry
#[tauri::command]
pub fn list_entry_signals(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    reflection_id: String,
) -> Result<Vec<SignalRow>, String> {
    require_unlocked(&lock)?;
    db::list_entry_signals(&db, &reflection_id)
}

/// Delete a signal
#[tauri::command]
pub fn delete_signal(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    id: String,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    db::delete_signal(&db, &id)
}

/// Get unsynced entries from the sync_log (for incremental sync engines)
#[tauri::command]
pub fn get_unsynced_log(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    limit: Option<i32>,
) -> Result<Vec<SyncLogRow>, String> {
    require_unlocked(&lock)?;
    db::get_unsynced_log(&db, limit)
}

/// Mark sync_log rows as synced up to (and including) the given log id
#[tauri::command]
pub fn mark_sync_log_synced(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    up_to_id: i64,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    db::mark_sync_log_synced(&db, up_to_id)
}
