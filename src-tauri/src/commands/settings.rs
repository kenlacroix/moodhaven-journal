//! Settings commands for MoodBloom
//!
//! Handles persisting and loading user settings using the database.

use crate::db::Database;
use rusqlite::Row;
use serde::{Deserialize, Serialize};
use std::sync::PoisonError;
use tauri::State;

/// Settings stored in the database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredSettings {
    pub key: String,
    pub value: String, // JSON string
}

/// Get a setting by key
#[tauri::command]
pub fn get_setting(db: State<Database>, key: String) -> Result<Option<String>, String> {
    let conn = db.conn.lock().map_err(|e: PoisonError<_>| e.to_string())?;

    // Create settings table if it doesn't exist
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .map_err(|e: rusqlite::Error| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT value FROM settings WHERE key = ?1")
        .map_err(|e: rusqlite::Error| e.to_string())?;

    let result: Result<String, rusqlite::Error> = stmt.query_row([&key], |row: &Row| row.get(0));

    match result {
        Ok(value) => Ok(Some(value)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Set a setting by key
#[tauri::command]
pub fn set_setting(db: State<Database>, key: String, value: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e: PoisonError<_>| e.to_string())?;

    // Create settings table if it doesn't exist
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .map_err(|e: rusqlite::Error| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
        [&key, &value],
    )
    .map_err(|e: rusqlite::Error| e.to_string())?;

    Ok(())
}

/// Delete a setting by key
#[tauri::command]
pub fn delete_setting(db: State<Database>, key: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e: PoisonError<_>| e.to_string())?;

    conn.execute("DELETE FROM settings WHERE key = ?1", [&key])
        .map_err(|e: rusqlite::Error| e.to_string())?;

    Ok(())
}

/// Get all settings
#[tauri::command]
pub fn get_all_settings(db: State<Database>) -> Result<Vec<StoredSettings>, String> {
    let conn = db.conn.lock().map_err(|e: PoisonError<_>| e.to_string())?;

    // Create settings table if it doesn't exist
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .map_err(|e: rusqlite::Error| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT key, value FROM settings")
        .map_err(|e: rusqlite::Error| e.to_string())?;

    let settings = stmt
        .query_map([], |row: &Row| {
            Ok(StoredSettings {
                key: row.get(0)?,
                value: row.get(1)?,
            })
        })
        .map_err(|e: rusqlite::Error| e.to_string())?
        .filter_map(|r: Result<StoredSettings, rusqlite::Error>| r.ok())
        .collect();

    Ok(settings)
}

/// Get app version from Cargo.toml
#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
