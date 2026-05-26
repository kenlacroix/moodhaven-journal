//! StillHaven — somatic session commands
//!
//! Manages sessions, activation samples, and session lifecycle (complete / abandon).
//! All commands require an unlocked session.

use crate::db::{
    self, Database, StillActivationSampleRow, StillSessionRow, StillSessionWithSamples,
};
use crate::AppLockState;
use tauri::State;

fn require_unlocked(lock: &State<'_, AppLockState>) -> Result<(), String> {
    if lock.is_locked() {
        Err("Session is locked".to_string())
    } else {
        Ok(())
    }
}

/// Create a new somatic session (call before starting the bilateral engine).
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn still_create_session(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    id: String,
    protocol: String,
    environment: String,
    bilateral_mode: String,
    duration_seconds: i64,
    started_at: String,
) -> Result<StillSessionRow, String> {
    require_unlocked(&lock)?;
    if id.is_empty() {
        return Err("Session id must not be empty".to_string());
    }
    let valid_protocols = ["general_activation", "fake_danger"];
    if !valid_protocols.contains(&protocol.as_str()) {
        return Err(format!("Unknown protocol: {protocol}"));
    }
    db::still_create_session(
        &db,
        &id,
        &protocol,
        &environment,
        &bilateral_mode,
        duration_seconds,
        &started_at,
    )
}

/// Record a pre- or post-session activation sample.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn still_record_activation(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    session_id: String,
    phase: String,
    activation: i64,
    hrv_manual: Option<i64>,
    hrv_source: Option<String>,
    note: Option<String>,
) -> Result<StillActivationSampleRow, String> {
    require_unlocked(&lock)?;
    if phase != "pre" && phase != "post" {
        return Err(format!("Invalid phase: {phase}"));
    }
    if !(1..=10).contains(&activation) {
        return Err("Activation must be between 1 and 10".to_string());
    }
    db::still_record_activation(
        &db,
        &session_id,
        &phase,
        activation,
        hrv_manual,
        hrv_source.as_deref(),
        note.as_deref(),
    )
}

/// Mark a session as completed.
#[tauri::command]
pub fn still_complete_session(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    id: String,
    completed_at: String,
    duration_seconds: i64,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    db::still_complete_session(&db, &id, &completed_at, duration_seconds)
}

/// Mark a session as abandoned (user closed mid-session).
#[tauri::command]
pub fn still_abandon_session(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    id: String,
    abandoned_at: String,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    db::still_abandon_session(&db, &id, &abandoned_at)
}

/// List recent sessions, newest first.
#[tauri::command]
pub fn still_list_sessions(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    limit: Option<i32>,
) -> Result<Vec<StillSessionRow>, String> {
    require_unlocked(&lock)?;
    db::still_list_sessions(&db, limit)
}

/// Get a session with its activation samples.
#[tauri::command]
pub fn still_get_session_with_samples(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    id: String,
) -> Result<Option<StillSessionWithSamples>, String> {
    require_unlocked(&lock)?;
    db::still_get_session_with_samples(&db, &id)
}
