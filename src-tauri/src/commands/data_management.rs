//! Data management commands for MoodBloom
//!
//! Provides factory reset, export, and import functionality.

use tauri::{AppHandle, Manager};
use std::fs;

use crate::db::{self, Database};

/// Exit the application (used after factory reset)
#[tauri::command]
pub fn exit_app() {
    std::process::exit(0);
}

/// Factory reset - wipe all app data and return to first-run state
#[tauri::command]
pub async fn factory_reset(app: AppHandle) -> Result<bool, String> {
    // Get database path
    let db_path = db::get_db_path(&app)?;

    // Get app data directory
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    // Close database connection by dropping the state
    // Note: This requires the app to be restarted after reset

    // Delete database file
    if db_path.exists() {
        fs::remove_file(&db_path)
            .map_err(|e| format!("Failed to delete database: {}", e))?;
    }

    // Delete settings file if it exists
    let settings_path = app_data.join("settings.json");
    if settings_path.exists() {
        fs::remove_file(&settings_path)
            .map_err(|e| format!("Failed to delete settings: {}", e))?;
    }

    // Delete any other app data files
    let files_to_delete = ["keys.bin", "cache.db", "logs"];
    for file in files_to_delete {
        let path = app_data.join(file);
        if path.exists() {
            if path.is_dir() {
                fs::remove_dir_all(&path).ok();
            } else {
                fs::remove_file(&path).ok();
            }
        }
    }

    Ok(true)
}

/// Export all journal entries to encrypted backup
#[tauri::command]
pub async fn export_data(
    app: AppHandle,
    _password: String,
) -> Result<String, String> {
    let db = app.state::<Database>();

    // Get all entries
    let entries = db::get_all_entries(&db, None)?;

    // Get settings
    let settings_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("settings.json");

    let settings_json = if settings_path.exists() {
        fs::read_to_string(&settings_path).unwrap_or_else(|_| "{}".to_string())
    } else {
        "{}".to_string()
    };

    // Create export structure
    let export_data = serde_json::json!({
        "version": "1.0.0",
        "exportDate": chrono::Utc::now().to_rfc3339(),
        "entries": entries,
        "settings": serde_json::from_str::<serde_json::Value>(&settings_json).unwrap_or(serde_json::json!({})),
    });

    // For now, return base64-encoded JSON (TODO: add encryption layer)
    let json_str = serde_json::to_string_pretty(&export_data)
        .map_err(|e| format!("Failed to serialize export data: {}", e))?;

    // Simple base64 encoding (TODO: proper encryption with password)
    use base64::{Engine as _, engine::general_purpose};
    let encoded = general_purpose::STANDARD.encode(json_str.as_bytes());

    Ok(encoded)
}

/// Import entries from backup file
#[tauri::command]
pub async fn import_data(
    app: AppHandle,
    data: String,
    _password: String,
) -> Result<i32, String> {
    let db = app.state::<Database>();

    // Decode base64 (TODO: decrypt with password)
    use base64::{Engine as _, engine::general_purpose};
    let decoded = general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("Failed to decode backup data: {}", e))?;

    let json_str = String::from_utf8(decoded)
        .map_err(|e| format!("Invalid backup data encoding: {}", e))?;

    let export_data: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse backup data: {}", e))?;

    // Validate version
    let version = export_data.get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

    if !version.starts_with("1.") {
        return Err(format!("Unsupported backup version: {}", version));
    }

    // Import entries
    let entries = export_data.get("entries")
        .and_then(|e| e.as_array())
        .ok_or("Invalid backup format: missing entries")?;

    let mut imported_count = 0;

    for entry in entries {
        let id = entry.get("id")
            .and_then(|v| v.as_str())
            .ok_or("Invalid entry: missing id")?;

        let encrypted_content = entry.get("encrypted_content")
            .ok_or("Invalid entry: missing encrypted_content")?;

        let ec: db::EncryptedContent = serde_json::from_value(encrypted_content.clone())
            .map_err(|e| format!("Invalid encrypted content: {}", e))?;

        let mood = entry.get("mood")
            .and_then(|v| v.as_i64())
            .ok_or("Invalid entry: missing mood")? as i32;

        // Try to create entry (skip if already exists)
        match db::create_entry(&db, id, &ec, mood) {
            Ok(_) => imported_count += 1,
            Err(e) if e.contains("UNIQUE constraint") => continue,
            Err(e) => return Err(e),
        }
    }

    Ok(imported_count)
}

/// Get database statistics for export info
#[tauri::command]
pub async fn get_data_stats(app: AppHandle) -> Result<serde_json::Value, String> {
    let db = app.state::<Database>();

    let (avg_mood, total_entries) = db::get_overall_stats(&db)?;

    Ok(serde_json::json!({
        "totalEntries": total_entries,
        "averageMood": avg_mood,
    }))
}
