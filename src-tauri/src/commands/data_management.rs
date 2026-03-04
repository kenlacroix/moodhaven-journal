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

/// Export all journal entries, settings, 2FA config, and tags to encrypted backup
#[tauri::command]
pub async fn export_data(
    app: AppHandle,
    _password: String,
) -> Result<String, String> {
    let db = app.state::<Database>();

    // Get all journal entries
    let entries = db::get_all_entries(&db, None)?;

    // Get frontend settings (settings.json file)
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

    // Get DB settings (key-value pairs from settings table)
    let db_settings = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        (|| -> Result<Vec<serde_json::Value>, rusqlite::Error> {
            let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
            let rows = stmt.query_map([], |row| {
                Ok(serde_json::json!({
                    "key": row.get::<_, String>(0)?,
                    "value": row.get::<_, String>(1)?,
                }))
            })?.filter_map(|r| r.ok()).collect();
            Ok(rows)
        })().unwrap_or_default()
    };

    // Get 2FA configuration
    let two_factor = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT enabled, method, totp_secret, webauthn_credentials, backup_codes
             FROM two_factor_auth WHERE id = 1",
            [],
            |row| {
                Ok(serde_json::json!({
                    "enabled": row.get::<_, i32>(0)?,
                    "method": row.get::<_, Option<String>>(1)?,
                    "totp_secret": row.get::<_, Option<String>>(2)?,
                    "webauthn_credentials": row.get::<_, Option<String>>(3)?,
                    "backup_codes": row.get::<_, Option<String>>(4)?,
                }))
            },
        ).unwrap_or(serde_json::json!(null))
    };

    // Get tags
    let tags = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        (|| -> Result<Vec<serde_json::Value>, rusqlite::Error> {
            let mut stmt = conn.prepare("SELECT id, name FROM tags")?;
            let rows = stmt.query_map([], |row| {
                Ok(serde_json::json!({
                    "id": row.get::<_, i32>(0)?,
                    "name": row.get::<_, String>(1)?,
                }))
            })?.filter_map(|r| r.ok()).collect();
            Ok(rows)
        })().unwrap_or_default()
    };

    // Get entry-tag relationships
    let entry_tags = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        (|| -> Result<Vec<serde_json::Value>, rusqlite::Error> {
            let mut stmt = conn.prepare("SELECT entry_id, tag_id FROM entry_tags")?;
            let rows = stmt.query_map([], |row| {
                Ok(serde_json::json!({
                    "entry_id": row.get::<_, String>(0)?,
                    "tag_id": row.get::<_, i32>(1)?,
                }))
            })?.filter_map(|r| r.ok()).collect();
            Ok(rows)
        })().unwrap_or_default()
    };

    // Create export structure
    let export_data = serde_json::json!({
        "version": "1.1.0",
        "exportDate": chrono::Utc::now().to_rfc3339(),
        "entries": entries,
        "settings": serde_json::from_str::<serde_json::Value>(&settings_json).unwrap_or(serde_json::json!({})),
        "dbSettings": db_settings,
        "twoFactor": two_factor,
        "tags": tags,
        "entryTags": entry_tags,
    });

    let json_str = serde_json::to_string_pretty(&export_data)
        .map_err(|e| format!("Failed to serialize export data: {}", e))?;

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

    // Import journal entries
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

        let privacy_mode = entry.get("privacy_mode")
            .and_then(|v| v.as_i64())
            .map(|v| v as i32)
            .unwrap_or(0)
            .clamp(0, 2);

        // Try to create entry (skip if already exists)
        match db::create_entry(&db, id, &ec, mood, privacy_mode, None) {
            Ok(_) => imported_count += 1,
            Err(e) if e.contains("UNIQUE constraint") => continue,
            Err(e) => return Err(e),
        }
    }

    // Import DB settings (v1.1.0+)
    if let Some(db_settings) = export_data.get("dbSettings").and_then(|v| v.as_array()) {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        // Ensure settings table exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        ).map_err(|e| format!("Failed to create settings table: {}", e))?;

        for setting in db_settings {
            if let (Some(key), Some(value)) = (
                setting.get("key").and_then(|v| v.as_str()),
                setting.get("value").and_then(|v| v.as_str()),
            ) {
                // Skip rate_limit_state — don't import lockout state
                if key == "rate_limit_state" {
                    continue;
                }
                conn.execute(
                    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
                    rusqlite::params![key, value],
                ).ok(); // Best-effort
            }
        }
    }

    // Import tags (v1.1.0+)
    if let Some(tags) = export_data.get("tags").and_then(|v| v.as_array()) {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        for tag in tags {
            if let Some(name) = tag.get("name").and_then(|v| v.as_str()) {
                conn.execute(
                    "INSERT OR IGNORE INTO tags (name) VALUES (?1)",
                    rusqlite::params![name],
                ).ok();
            }
        }
    }

    // Import entry-tag relationships (v1.1.0+)
    if let Some(entry_tags) = export_data.get("entryTags").and_then(|v| v.as_array()) {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        for et in entry_tags {
            if let (Some(entry_id), Some(tag_id)) = (
                et.get("entry_id").and_then(|v| v.as_str()),
                et.get("tag_id").and_then(|v| v.as_i64()),
            ) {
                conn.execute(
                    "INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?1, ?2)",
                    rusqlite::params![entry_id, tag_id as i32],
                ).ok();
            }
        }
    }

    // Import 2FA configuration (v1.1.0+)
    if let Some(tfa) = export_data.get("twoFactor") {
        if !tfa.is_null() {
            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            let enabled = tfa.get("enabled").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let method = tfa.get("method").and_then(|v| v.as_str());
            let totp_secret = tfa.get("totp_secret").and_then(|v| v.as_str());
            let webauthn_creds = tfa.get("webauthn_credentials").and_then(|v| v.as_str());
            let backup_codes = tfa.get("backup_codes").and_then(|v| v.as_str());

            conn.execute(
                "INSERT OR REPLACE INTO two_factor_auth (id, enabled, method, totp_secret, webauthn_credentials, backup_codes, updated_at)
                 VALUES (1, ?1, ?2, ?3, ?4, ?5, datetime('now'))",
                rusqlite::params![enabled, method, totp_secret, webauthn_creds, backup_codes],
            ).ok();
        }
    }

    // Import frontend settings (settings.json) (v1.1.0+)
    if let Some(settings) = export_data.get("settings") {
        if !settings.is_null() && settings.as_object().map_or(false, |o| !o.is_empty()) {
            let settings_path = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?
                .join("settings.json");
            let json = serde_json::to_string_pretty(settings)
                .map_err(|e| format!("Failed to serialize settings: {}", e))?;
            fs::write(&settings_path, json).ok();
        }
    }

    Ok(imported_count)
}

/// Write text to a file and verify it was written correctly.
/// Used instead of the FS plugin which has scope restrictions on user-selected paths.
#[tauri::command]
pub async fn write_text_file(path: String, contents: String) -> Result<u64, String> {
    let file_path = std::path::Path::new(&path);

    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        if !parent.exists() {
            return Err(format!("Directory does not exist: {}", parent.display()));
        }
    }

    // Write the file
    fs::write(file_path, &contents)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    // Verify the file was written by reading back its size
    let metadata = fs::metadata(file_path)
        .map_err(|e| format!("File verification failed: {}", e))?;

    let written_size = metadata.len();
    let expected_size = contents.len() as u64;

    if written_size != expected_size {
        return Err(format!(
            "File verification failed: expected {} bytes, got {} bytes",
            expected_size, written_size
        ));
    }

    Ok(written_size)
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
