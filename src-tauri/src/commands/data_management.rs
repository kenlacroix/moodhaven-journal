//! Data management commands for MoodHaven Journal
//!
//! Provides factory reset, export, and import functionality.

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use pbkdf2::pbkdf2_hmac;
use rand::{rngs::OsRng, RngCore};
use rusqlite::Connection;
use sha2::Sha256;
use std::fs;
use tauri::{AppHandle, Manager, State};
use zeroize::Zeroizing;

use crate::commands::peer_sync_engine::SyncEngineState;
use crate::db::{self, Database};
use crate::{AppLockState, DbKeyState, TwoFactorPendingState};

/// Mark the session as unlocked.
/// Enforces that both authentication factors were completed in Rust — a compromised
/// frontend cannot bypass 2FA by calling this directly after verify_password.
/// If the database is still unencrypted and a derived key is available in DbKeyState,
/// triggers the one-time migration to SQLCipher before setting the unlocked flag.
/// Also starts the TCP peer sync server on first unlock (deferred from app startup
/// so the server is not listening before the user has authenticated).
#[tauri::command]
pub fn unlock_app(
    app: AppHandle,
    lock: State<'_, AppLockState>,
    twofa: State<'_, TwoFactorPendingState>,
    db: State<'_, Database>,
    db_key: State<'_, DbKeyState>,
    sync_engine: State<'_, SyncEngineState>,
) -> Result<(), String> {
    if !twofa.is_fully_authenticated() {
        return Err("Authentication incomplete: password verification or 2FA not done".to_string());
    }

    // One-time migration: encrypt the database the first time an existing user unlocks
    // after upgrading to a build with SQLCipher. Also runs for fresh installs on first unlock.
    if !db.is_encrypted() {
        if let Some(key_bytes) = db_key.get() {
            let key = Zeroizing::new(key_bytes);
            // Retrieve the PBKDF2 salt from the settings table (accessible while unencrypted).
            let salt_b64 = db::get_password_hash(&db)?
                .map(|s| s.password_salt)
                .unwrap_or_default();
            if !salt_b64.is_empty() {
                match db.encrypt_in_place(&key, &salt_b64) {
                    Ok(()) => log::info!("[sqlcipher] Database encrypted successfully"),
                    Err(e) => {
                        log::error!("[sqlcipher] encrypt_in_place FAILED: {e}");
                        return Err(e);
                    }
                }
            } else {
                log::error!("[sqlcipher] migration skipped: password_salt is empty");
            }
        } else {
            log::warn!("[sqlcipher] migration skipped: no derived key in DbKeyState at unlock");
        }
    }

    *lock.0.lock().map_err(|e| e.to_string())? = false;

    // Start the sync server post-unlock so it's not advertising before auth.
    // peer_start_sync_server is idempotent — safe to call on subsequent unlocks.
    if let Err(e) = crate::commands::peer_sync_engine::peer_start_sync_server(app, sync_engine) {
        log::warn!("[sync] Post-unlock sync server start failed: {e}");
    }

    Ok(())
}

/// Mark the session as locked. Resets all pending auth state and zeroizes the key.
#[tauri::command]
pub fn lock_app(
    lock: State<'_, AppLockState>,
    twofa: State<'_, TwoFactorPendingState>,
    db_key: State<'_, DbKeyState>,
    db: State<'_, Database>,
    session_bridge: State<'_, crate::commands::session_bridge::SessionBridge>,
    restore_arm: State<'_, crate::commands::peer_sync_engine::RestoreArmState>,
    rekey: State<'_, crate::RekeyInProgress>,
) -> Result<(), String> {
    *lock.0.lock().map_err(|e| e.to_string())? = true;
    twofa.reset();
    db_key.clear();
    // Disarm any pending full-DB restore so an armed-then-locked device won't serve one.
    restore_arm.clear();
    // Wipe any unconsumed writer-window password so plaintext never survives a lock.
    session_bridge.clear();

    // If a `change_master_password` is mid-flight it OWNS the write-gate and the keyed
    // connection. Disarming the gate here would re-open the write window, and releasing the
    // key would swap the live connection out from under the running rekey (risking corruption
    // or stranded rows). Leave both to the change's own completion — its `DisarmOnDrop` clears
    // the gate and it installs the new-keyed connection. The session is still marked locked, so
    // the UI locks; the brief key-in-memory window until the change finishes (seconds) is an
    // acceptable trade against data loss.
    if rekey.is_armed() {
        log::warn!(
            "[lock] change_master_password in flight — deferring write-gate disarm + key release"
        );
        return Ok(());
    }
    rekey.disarm();
    // Release the keyed SQLCipher connection so SQLCipher zeroes the raw 256-bit key it
    // held for the connection's lifetime — otherwise the key persists in the connection's
    // memory after lock and is recoverable from a process memory dump. No-op for an
    // unencrypted DB (the placeholder swap simply drops a non-keyed connection). Best-effort:
    // a swap failure must not block locking the session.
    if db.is_encrypted() {
        if let Err(e) = db.release_key() {
            log::warn!("[sqlcipher] release_key on lock failed: {e}");
        }
    }
    Ok(())
}

/// Helper used by guarded commands — returns Err if the session is locked.
use super::require_unlocked;

/// Optional filters for selective export.
/// All fields are optional; absent means "no filter" (export all).
#[derive(serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExportFilter {
    pub tags: Option<Vec<String>>,
    pub mood_min: Option<i32>,
    pub mood_max: Option<i32>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

/// Return the path to the rotating log file, or None if the file has not been created yet.
#[tauri::command]
pub fn get_log_path(app: AppHandle) -> Option<String> {
    let log_file = app.path().app_log_dir().ok()?.join("moodhaven.log");
    if log_file.exists() {
        Some(log_file.to_string_lossy().into_owned())
    } else {
        None
    }
}

/// Open the log directory in the platform file manager.
///
/// Uses platform-native launchers (same pattern as open_media_attachment) to
/// bypass the tauri-plugin-shell open-regex, which only allows http/mailto/tel URLs.
#[tauri::command]
pub fn open_log_folder(app: AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("app_log_dir: {e}"))?;

    let dir_str = dir.to_str().ok_or("Non-UTF8 log dir path")?.to_string();

    // Pick the platform launcher (no desktop equivalent of `xdg-open` exists on
    // mobile, where this is UI-gated behind `isDesktop` anyway — return the path
    // as a defensive fallback rather than silently no-op'ing).
    let launcher = if cfg!(target_os = "macos") {
        "open"
    } else if cfg!(target_os = "windows") {
        "explorer"
    } else if cfg!(target_os = "linux") {
        "xdg-open"
    } else {
        return Err(format!(
            "Opening the log folder isn't supported on this platform. Logs are stored at: {dir_str}"
        ));
    };

    std::process::Command::new(launcher)
        .arg(&dir_str)
        .spawn()
        .map_err(|e| format!("{launcher}: {e}"))?;

    Ok(())
}

/// Set the runtime log level and persist it so it is restored on next startup.
/// Accepted values: "error", "warn", "info", "debug". Returns Err on unknown input.
#[tauri::command]
pub fn set_log_level(db: tauri::State<'_, Database>, level: String) -> Result<(), String> {
    let filter = match level.as_str() {
        "error" => log::LevelFilter::Error,
        "warn" => log::LevelFilter::Warn,
        "info" => log::LevelFilter::Info,
        "debug" => log::LevelFilter::Debug,
        other => return Err(format!("unknown log level: {other}")),
    };
    log::set_max_level(filter);
    let conn = db.conn.lock().map_err(|e| format!("db lock: {e}"))?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('log_level', ?1, CURRENT_TIMESTAMP)",
        [&level],
    )
    .map_err(|e| format!("set_log_level db: {e}"))?;
    Ok(())
}

/// Exit the application (used after factory reset)
#[tauri::command]
pub fn exit_app(db_key: State<'_, DbKeyState>) {
    db_key.clear();
    std::process::exit(0);
}

/// Relaunch the application (used after factory reset to return to first-run).
/// Clears the in-memory DB key, then restarts the process so it reinitializes
/// from the now-empty data directory and lands on the setup wizard.
#[tauri::command]
pub fn relaunch_app(app: AppHandle, db_key: State<'_, DbKeyState>) {
    db_key.clear();
    app.restart();
}

/// Factory reset - wipe all app data and return to first-run state.
/// Intentionally does NOT require unlock — this is the "forgot password / erase
/// everything" escape hatch and must work from the lock screen.
#[tauri::command]
pub async fn factory_reset(app: AppHandle, db: State<'_, Database>) -> Result<bool, String> {
    // Wipe any in-memory session-bridge password before erasing on-disk data.
    if let Some(bridge) = app.try_state::<crate::commands::session_bridge::SessionBridge>() {
        bridge.clear();
    }

    // Get database path
    let db_path = db::get_db_path(&app)?;

    // Get app data directory
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    // Release the live SQLite handle BEFORE touching the file. On Windows the OS
    // denies rename/delete of a file the process holds open (os error 5/32), which
    // previously made factory_reset fail outright ("failed to reset"). Swap the
    // stored connection for an in-memory placeholder so the original Connection
    // drops and releases the OS file handle — mirrors encrypt_in_place's pattern.
    if let Ok(mut conn) = db.conn.lock() {
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        if let Ok(placeholder) = Connection::open_in_memory() {
            *conn = placeholder; // original connection drops here, releasing the handle
        }
    }

    // Remove a file, retrying briefly (Windows may keep the handle for a moment
    // after the Connection drops), then falling back to a rename-to-.old that the
    // startup orphan sweep finishes once the OS finally releases the handle.
    let remove_with_fallback =
        |target: &std::path::Path, orphan: &std::path::Path| -> Result<(), String> {
            for attempt in 0..5u8 {
                if !target.exists() || fs::remove_file(target).is_ok() {
                    return Ok(());
                }
                if attempt == 4 {
                    return fs::rename(target, orphan)
                        .map_err(|e| format!("Failed to remove database: {e}"));
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Ok(())
        };

    // Delete the database file. With the handle released above, plain removal
    // succeeds on all platforms; the .old rename is retained only as a last resort.
    if db_path.exists() {
        remove_with_fallback(&db_path, &db_path.with_extension("db.old"))?;
    }
    for suffix in ["-wal", "-shm"] {
        let side = app_data.join(format!("moodhaven.db{suffix}"));
        if side.exists() {
            let orphan = app_data.join(format!("moodhaven.db{suffix}.old"));
            let _ = remove_with_fallback(&side, &orphan); // sidecars are non-fatal
        }
    }

    // Delete settings file if it exists
    let settings_path = app_data.join("settings.json");
    if settings_path.exists() {
        fs::remove_file(&settings_path).map_err(|e| format!("Failed to delete settings: {}", e))?;
    }

    // Delete any other app data files
    // All app-data paths to remove. Directories are removed recursively;
    // missing entries are silently skipped. Errors are non-fatal — a partial
    // reset is still better than a failed one.
    let files_to_delete = [
        "keys.bin",
        "cache.db",
        "logs",
        "peer_key.bin",
        "trusted_devices.json",
        "device.json",       // Ed25519 public key metadata (low-sensitivity but stale)
        "pw_lockout.json",   // Password rate-limiter state — reset with the app
        "pin_lockout.json",  // PIN rate-limiter state — reset with the app
        "db_state.json",     // SQLCipher encryption state — must be removed with the DB
        "db_state.json.tmp", // Atomic write tmp — may survive a crash during state write
        "moodhaven.db-wal",  // SQLite WAL frames — may contain plaintext pre-migration entries
        "moodhaven.db-shm",  // SQLite shared-memory index for WAL
        "moodhaven_enc.db",  // Encrypted export tmp — survives interrupted migrations
        "moodhaven_old.db",  // Windows-only rename backup — may survive interrupted migrations
        "voice_memos",       // Encrypted audio files from watch companion
        "voice_memos_incoming", // Staging directory for incoming watch audio
        "media",             // Encrypted media attachments
        "moodhaven_restore.pending", // Staged full-restore DB file — must not re-apply after reset
        "moodhaven_restore.pending.sha256", // Integrity check file for the above
        "moodhaven_restore.pending.dbstate", // db_state salt companion for the staged restore
        "moodhaven.db.old",  // Windows rename-on-reset orphan — cleaned up on next fresh start
        "moodhaven.db-wal.old", // Renamed WAL sidecar (Windows reset) — swept at startup
        "moodhaven.db-shm.old", // Renamed SHM sidecar (Windows reset) — swept at startup
        "cloud_token_key.bin", // OAuth token encryption key fallback (keyring-unavailable path)
    ];
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

    // Delete media preview cache — open_media_attachment decrypts to a temp file here.
    // sweep_preview_temp() runs at startup but not during reset; explicitly clear it.
    if let Ok(cache_dir) = app.path().app_cache_dir() {
        fs::remove_dir_all(cache_dir.join("mb_preview")).ok();
    }

    // Delete the rotating log file from app_log_dir (may differ from app_data_dir on macOS/Linux)
    if let Ok(log_dir) = app.path().app_log_dir() {
        let log_file = log_dir.join("moodhaven.log");
        if log_file.exists() {
            fs::remove_file(&log_file).ok();
        }
    }

    // Best-effort: clear OS keyring entries so the reset truly returns to
    // first-run state. The cloud token encryption key and the biometric
    // session credential would otherwise survive (stale secrets — the data
    // they protect is gone, but a reset should not leave them behind).
    for account in [
        crate::commands::cloud_providers::TOKEN_KEYRING_ACCOUNT,
        crate::commands::biometric::KEYRING_ACCOUNT,
    ] {
        if let Ok(entry) = keyring::Entry::new(crate::commands::KEYRING_SERVICE, account) {
            let _ = entry.delete_password();
        }
    }

    Ok(true)
}

// Matches frontend crypto.ts constants exactly so WebCrypto decrypt() is interoperable.
const EXPORT_PBKDF2_ROUNDS: u32 = 600_000;
const EXPORT_SALT_LEN: usize = 16; // 128 bits — matches WebCrypto SALT_LENGTH
const EXPORT_NONCE_LEN: usize = 12; // 96 bits — matches WebCrypto IV_LENGTH

/// Encrypt `plaintext` (the base64-encoded export payload) using PBKDF2-HMAC-SHA256 +
/// AES-256-GCM with parameters matching the frontend WebCrypto encrypt() in crypto.ts.
/// Returns a JSON envelope that the frontend decrypt() can unwrap without modification.
fn encrypt_export_payload(plaintext: &str, password: &str) -> Result<String, String> {
    let mut salt = [0u8; EXPORT_SALT_LEN];
    let mut nonce_bytes = [0u8; EXPORT_NONCE_LEN];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce_bytes);

    let mut key = Zeroizing::new([0u8; 32]);
    pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, EXPORT_PBKDF2_ROUNDS, &mut *key);

    let cipher = Aes256Gcm::new_from_slice(&*key).map_err(|e| format!("cipher init: {e}"))?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|_| "export encryption failed".to_string())?;

    let envelope = serde_json::json!({
        "format": "moodhaven-encrypted-v1",
        "payload": {
            "ciphertext": general_purpose::STANDARD.encode(&ciphertext),
            "iv": general_purpose::STANDARD.encode(nonce_bytes),
            "salt": general_purpose::STANDARD.encode(salt),
            "version": 1
        }
    });
    serde_json::to_string(&envelope).map_err(|e| format!("serialize: {e}"))
}

/// Export journal entries, settings, 2FA config, and tags to encrypted backup.
/// Accepts optional filters (tags, mood range, date range) for selective export.
/// When `password` is provided the payload is encrypted (AES-256-GCM) before
/// returning; when omitted (full-backup callers) the raw base64 is returned for
/// the caller to wrap with its own encryption envelope.
#[tauri::command]
pub async fn export_data(
    app: AppHandle,
    password: Option<String>,
    filter: Option<ExportFilter>,
) -> Result<String, String> {
    let lock = app.state::<AppLockState>();
    require_unlocked(&lock)?;
    let db = app.state::<Database>();

    // Flush any pending WAL frames before reading, so the export is consistent
    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(FULL)");
    }

    // Get entries — full set or filtered
    let all_entries = db::get_all_entries(&db, None)?;
    let entries = if let Some(f) = filter {
        all_entries
            .into_iter()
            .filter(|e| {
                // Mood range filter
                if let Some(min) = f.mood_min {
                    if e.mood < min {
                        return false;
                    }
                }
                if let Some(max) = f.mood_max {
                    if e.mood > max {
                        return false;
                    }
                }
                // Date range filter (lexicographic on ISO 8601)
                if let Some(ref start) = f.start_date {
                    if e.created_at.as_str() < start.as_str() {
                        return false;
                    }
                }
                if let Some(ref end) = f.end_date {
                    if e.created_at.as_str() > end.as_str() {
                        return false;
                    }
                }
                // Tag filter: entry must have ALL specified tags
                if let Some(ref tags) = f.tags {
                    if !tags.is_empty() {
                        let entry_tags: std::collections::HashSet<&str> =
                            e.tags.iter().map(|t| t.as_str()).collect();
                        if !tags.iter().all(|t| entry_tags.contains(t.as_str())) {
                            return false;
                        }
                    }
                }
                true
            })
            .collect()
    } else {
        all_entries
    };

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
            let rows = stmt
                .query_map([], |row| {
                    Ok(serde_json::json!({
                        "key": row.get::<_, String>(0)?,
                        "value": row.get::<_, String>(1)?,
                    }))
                })?
                .filter_map(|r| r.ok())
                .collect();
            Ok(rows)
        })()
        .unwrap_or_default()
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
        )
        .unwrap_or(serde_json::json!(null))
    };

    // Get tags
    let tags = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        (|| -> Result<Vec<serde_json::Value>, rusqlite::Error> {
            let mut stmt = conn.prepare("SELECT id, name FROM tags")?;
            let rows = stmt
                .query_map([], |row| {
                    Ok(serde_json::json!({
                        "id": row.get::<_, i32>(0)?,
                        "name": row.get::<_, String>(1)?,
                    }))
                })?
                .filter_map(|r| r.ok())
                .collect();
            Ok(rows)
        })()
        .unwrap_or_default()
    };

    // Get entry-tag relationships
    let entry_tags = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        (|| -> Result<Vec<serde_json::Value>, rusqlite::Error> {
            let mut stmt = conn.prepare("SELECT entry_id, tag_id FROM entry_tags")?;
            let rows = stmt
                .query_map([], |row| {
                    Ok(serde_json::json!({
                        "entry_id": row.get::<_, String>(0)?,
                        "tag_id": row.get::<_, i32>(1)?,
                    }))
                })?
                .filter_map(|r| r.ok())
                .collect();
            Ok(rows)
        })()
        .unwrap_or_default()
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

    let encoded = general_purpose::STANDARD.encode(json_str.as_bytes());

    match password {
        Some(pw) => encrypt_export_payload(&encoded, &pw),
        None => Ok(encoded),
    }
}

/// Import entries from backup file
#[tauri::command]
pub async fn import_data(app: AppHandle, data: String) -> Result<i32, String> {
    let lock = app.state::<AppLockState>();
    require_unlocked(&lock)?;
    let db = app.state::<Database>();

    let decoded = general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("Failed to decode backup data: {}", e))?;

    let json_str =
        String::from_utf8(decoded).map_err(|e| format!("Invalid backup data encoding: {}", e))?;

    let export_data: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse backup data: {}", e))?;

    // Validate version
    let version = export_data
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

    const ALLOWED_IMPORT_VERSIONS: &[&str] = &["1.0", "1.1", "1.1.0", "1.2", "1.3"];
    if !ALLOWED_IMPORT_VERSIONS.contains(&version) {
        return Err(format!("Unsupported backup version: {}", version));
    }

    // Import journal entries
    let entries = export_data
        .get("entries")
        .and_then(|e| e.as_array())
        .ok_or("Invalid backup format: missing entries")?;

    let mut imported_count = 0;

    // Begin an explicit transaction so the entire entry import is atomic.
    // We lock once for BEGIN, then release so the per-entry helpers can acquire
    // the lock independently (rusqlite is non-reentrant).
    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute_batch("BEGIN IMMEDIATE")
            .map_err(|e| format!("Failed to begin import transaction: {}", e))?;
    }

    let import_result: Result<(), String> = (|| {
        for entry in entries {
            let id = entry
                .get("id")
                .and_then(|v| v.as_str())
                .ok_or("Invalid entry: missing id")?;

            let encrypted_content = entry
                .get("encrypted_content")
                .ok_or("Invalid entry: missing encrypted_content")?;

            let ec: db::EncryptedContent = serde_json::from_value(encrypted_content.clone())
                .map_err(|e| format!("Invalid encrypted content: {}", e))?;

            let mood = (entry
                .get("mood")
                .and_then(|v| v.as_i64())
                .ok_or("Invalid entry: missing mood")? as i32)
                .clamp(1, 5);

            let privacy_mode = entry
                .get("privacy_mode")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32)
                .unwrap_or(0)
                .clamp(0, 2);

            let location_weather = entry.get("location_weather").and_then(|v| v.as_str());

            let book_id = entry.get("book_id").and_then(|v| v.as_str());

            let word_count = entry
                .get("word_count")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32);

            // Try to create entry (skip if already exists)
            match db::create_entry(
                &db,
                id,
                &ec,
                mood,
                privacy_mode,
                location_weather,
                book_id,
                word_count,
            ) {
                Ok(_) => imported_count += 1,
                Err(e) if e.contains("UNIQUE constraint") => continue,
                Err(e) => return Err(e),
            }

            // Restore fields that create_entry does not write: timestamps, pinned, capsule columns.
            let created_at = entry
                .get("created_at")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let updated_at = entry
                .get("updated_at")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            // Reject malformed or missing timestamps — both fields are required.
            let valid_ts =
                |s: &str| !s.is_empty() && chrono::DateTime::parse_from_rfc3339(s).is_ok();
            if !valid_ts(created_at) || !valid_ts(updated_at) {
                return Err(format!(
                    "Invalid timestamps in entry {id}: created_at={created_at:?}, updated_at={updated_at:?}"
                ));
            }
            let pinned: i32 = if entry
                .get("pinned")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
            {
                1
            } else {
                0
            };
            let sealed_until = entry.get("sealed_until").and_then(|v| v.as_str());
            let capsule_type = entry
                .get("capsule_type")
                .and_then(|v| v.as_str())
                .and_then(|ct| {
                    const VALID: &[&str] = &["letter", "vault", "anniversary"];
                    if VALID.contains(&ct) {
                        Some(ct)
                    } else {
                        None
                    }
                });
            let linked_original_id = entry.get("linked_original_id").and_then(|v| v.as_str());
            let unsealed_at = entry.get("unsealed_at").and_then(|v| v.as_str());

            {
                let conn = db.conn.lock().map_err(|e| e.to_string())?;
                conn.execute(
                    "UPDATE journal_entries
                     SET created_at = ?2, updated_at = ?3, pinned = ?4,
                         sealed_until = ?5, capsule_type = ?6,
                         linked_original_id = ?7, unsealed_at = ?8
                     WHERE id = ?1",
                    rusqlite::params![
                        id,
                        created_at,
                        updated_at,
                        pinned,
                        sealed_until,
                        capsule_type,
                        linked_original_id,
                        unsealed_at
                    ],
                )
                .map_err(|e| format!("Failed to restore entry metadata: {}", e))?;
            }
        }
        Ok(())
    })();

    match import_result {
        Ok(()) => {
            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            conn.execute_batch("COMMIT")
                .map_err(|e| format!("Failed to commit import transaction: {}", e))?;
        }
        Err(e) => {
            if let Ok(conn) = db.conn.lock() {
                let _ = conn.execute_batch("ROLLBACK");
            }
            return Err(e);
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
        )
        .map_err(|e| format!("Failed to create settings table: {}", e))?;

        for setting in db_settings {
            if let (Some(key), Some(value)) = (
                setting.get("key").and_then(|v| v.as_str()),
                setting.get("value").and_then(|v| v.as_str()),
            ) {
                // Allowlist: only restore keys that are safe to import across devices.
                // All device-specific, auth, and runtime keys are excluded.
                const IMPORT_ALLOWED_KEYS: &[&str] = &["app_settings"];
                if !IMPORT_ALLOWED_KEYS.contains(&key) {
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
                )
                .ok();
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
                )
                .ok();
            }
        }
    }

    // Import 2FA configuration (v1.1.0+)
    // Only restore 2FA config if this device has no 2FA enabled — overwriting
    // an active 2FA setup from a backup would silently disable the user's protection.
    if let Some(tfa) = export_data.get("twoFactor") {
        if !tfa.is_null() {
            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            let existing_2fa_enabled: bool = conn
                .query_row(
                    "SELECT enabled FROM two_factor_auth WHERE id = 1",
                    [],
                    |row| row.get::<_, i32>(0),
                )
                .map(|v| v != 0)
                .unwrap_or(false);
            if !existing_2fa_enabled {
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
    }

    // Import frontend settings (settings.json) (v1.1.0+)
    if let Some(settings) = export_data.get("settings") {
        if !settings.is_null() && settings.as_object().is_some_and(|o| !o.is_empty()) {
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

/// Canonicalize a user-selected path and reject any that traverse into sensitive
/// system or shell-config locations. Shared by `write_text_file` and `read_text_file`
/// so both honor the identical guard. For not-yet-existing files the parent is
/// canonicalized and the filename re-joined.
fn guard_user_file_path(path: &str) -> Result<std::path::PathBuf, String> {
    let file_path = std::path::Path::new(path);

    let canonical = if file_path.exists() {
        file_path
            .canonicalize()
            .map_err(|e| format!("Cannot resolve path: {}", e))?
    } else if let Some(parent) = file_path.parent() {
        let canonical_parent = parent
            .canonicalize()
            .map_err(|_| format!("Directory does not exist: {}", parent.display()))?;
        canonical_parent.join(file_path.file_name().ok_or("Invalid filename")?)
    } else {
        return Err("Invalid path".to_string());
    };

    // Block sensitive system and shell-config paths using component-based matching so
    // that ".ssh" in a directory name elsewhere does not false-match.
    // Lowercased for case-insensitive matching on Windows.
    let blocked_by_component = canonical.components().any(|c| {
        let name = c.as_os_str().to_str().unwrap_or("").to_lowercase();
        matches!(
            name.as_str(),
            ".ssh" | ".gnupg" | ".aws" | ".config"
            // Windows: block auto-start and system folders anywhere in the path so
            // that e.g. C:\Users\x\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\
            // is caught even though it doesn't start with C:\Windows\.
            | "startup" | "system32" | "syswow64"
        )
    });
    // Also block absolute system path prefixes that must match from the root.
    let canonical_str = canonical.to_string_lossy().to_lowercase();
    #[cfg(not(target_os = "windows"))]
    let blocked_by_prefix = ["/etc/", "/usr/", "/bin/", "/sbin/", "/lib"]
        .iter()
        .any(|p| canonical_str.starts_with(p));
    #[cfg(target_os = "windows")]
    let blocked_by_prefix = [
        "c:\\windows\\",
        "c:\\program files",
        "c:\\program files (x86)",
        "c:\\programdata",
        "c:\\users\\all users",
    ]
    .iter()
    // Use `contains` for mid-path Windows system dirs (e.g. Roaming\Microsoft\Windows\...)
    .any(|p| canonical_str.starts_with(p))
        || ["\\windows\\", "\\microsoft\\windows\\"]
            .iter()
            .any(|p| canonical_str.contains(p));
    // Block shell config dot-files by name (not directory components).
    let blocked_by_filename = canonical
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| matches!(n, ".bashrc" | ".bash_profile" | ".zshrc" | ".profile"))
        .unwrap_or(false);

    if blocked_by_component || blocked_by_prefix || blocked_by_filename {
        return Err(format!(
            "Access to '{}' is not permitted",
            canonical.display()
        ));
    }

    Ok(canonical)
}

/// Write text to a file and verify it was written correctly.
/// Used instead of the FS plugin which has scope restrictions on user-selected paths.
/// Rejects paths that traverse into sensitive system or shell-config locations.
#[tauri::command]
pub async fn write_text_file(
    path: String,
    contents: String,
    lock: State<'_, AppLockState>,
) -> Result<u64, String> {
    require_unlocked(&lock)?;
    let canonical = guard_user_file_path(&path)?;
    let file_path = canonical.as_path();

    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        if !parent.exists() {
            return Err(format!("Directory does not exist: {}", parent.display()));
        }
    }

    // Write the file
    fs::write(file_path, &contents).map_err(|e| format!("Failed to write file: {}", e))?;

    // Verify the file was written by reading back its size
    let metadata =
        fs::metadata(file_path).map_err(|e| format!("File verification failed: {}", e))?;

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

/// Write binary bytes (base64-encoded by the frontend) to a user-selected path.
/// Mirrors `write_text_file`'s path guard; used by the recovery-key PDF export so a
/// binary PDF can be written to a path the user picks via the save dialog (the FS
/// plugin's scope restrictions block arbitrary user-selected paths).
#[tauri::command]
pub async fn write_binary_file(
    path: String,
    contents_base64: String,
    lock: State<'_, AppLockState>,
) -> Result<u64, String> {
    require_unlocked(&lock)?;
    let canonical = guard_user_file_path(&path)?;
    let file_path = canonical.as_path();

    if let Some(parent) = file_path.parent() {
        if !parent.exists() {
            return Err(format!("Directory does not exist: {}", parent.display()));
        }
    }

    let bytes = general_purpose::STANDARD
        .decode(contents_base64.as_bytes())
        .map_err(|e| format!("Invalid base64 payload: {}", e))?;

    fs::write(file_path, &bytes).map_err(|e| format!("Failed to write file: {}", e))?;

    let metadata =
        fs::metadata(file_path).map_err(|e| format!("File verification failed: {}", e))?;
    let written_size = metadata.len();
    let expected_size = bytes.len() as u64;
    if written_size != expected_size {
        return Err(format!(
            "File verification failed: expected {} bytes, got {} bytes",
            expected_size, written_size
        ));
    }

    Ok(written_size)
}

/// Read a UTF-8 text file from a user-selected path. Honors the same path guard as
/// `write_text_file`. Used by BYO-Cloud folder sync to read back the encrypted backup
/// blob from a user-picked sync folder (one the OS keeps mirrored to iCloud/Drive/etc.).
#[tauri::command]
pub async fn read_text_file(path: String, lock: State<'_, AppLockState>) -> Result<String, String> {
    require_unlocked(&lock)?;
    let canonical = guard_user_file_path(&path)?;
    if !canonical.exists() {
        return Err(format!("File does not exist: {}", canonical.display()));
    }
    fs::read_to_string(&canonical).map_err(|e| format!("Failed to read file: {}", e))
}

/// Get database statistics for export info
#[tauri::command]
pub async fn get_data_stats(
    app: AppHandle,
    lock: State<'_, AppLockState>,
) -> Result<serde_json::Value, String> {
    require_unlocked(&lock)?;
    let db = app.state::<Database>();

    let (avg_mood, total_entries) = db::get_overall_stats(&db)?;

    Ok(serde_json::json!({
        "totalEntries": total_entries,
        "averageMood": avg_mood,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decrypt_export_payload(envelope_json: &str, password: &str) -> Result<String, String> {
        let envelope: serde_json::Value =
            serde_json::from_str(envelope_json).map_err(|e| format!("parse envelope: {e}"))?;
        let payload = envelope.get("payload").ok_or("missing payload field")?;
        let ciphertext = general_purpose::STANDARD
            .decode(payload["ciphertext"].as_str().ok_or("missing ciphertext")?)
            .map_err(|e| format!("decode ciphertext: {e}"))?;
        let nonce_bytes = general_purpose::STANDARD
            .decode(payload["iv"].as_str().ok_or("missing iv")?)
            .map_err(|e| format!("decode iv: {e}"))?;
        let salt = general_purpose::STANDARD
            .decode(payload["salt"].as_str().ok_or("missing salt")?)
            .map_err(|e| format!("decode salt: {e}"))?;
        if nonce_bytes.len() != EXPORT_NONCE_LEN {
            return Err(format!("invalid nonce len: {}", nonce_bytes.len()));
        }
        let mut key = Zeroizing::new([0u8; 32]);
        pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, EXPORT_PBKDF2_ROUNDS, &mut *key);
        let cipher = Aes256Gcm::new_from_slice(&*key).map_err(|e| format!("cipher: {e}"))?;
        let nonce = Nonce::from_slice(&nonce_bytes);
        let plaintext = cipher
            .decrypt(nonce, ciphertext.as_ref())
            .map_err(|_| "decryption failed — wrong password or corrupted data".to_string())?;
        String::from_utf8(plaintext).map_err(|e| format!("utf8: {e}"))
    }

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let plaintext = "SGVsbG8gV29ybGQ="; // base64 of "Hello World"
        let password = "s3cr3t-p@ssw0rd!";
        let encrypted = encrypt_export_payload(plaintext, password).unwrap();

        let envelope: serde_json::Value = serde_json::from_str(&encrypted).unwrap();
        assert_eq!(envelope["format"], "moodhaven-encrypted-v1");
        let payload = &envelope["payload"];
        assert!(payload["ciphertext"].is_string());
        assert!(payload["iv"].is_string());
        assert!(payload["salt"].is_string());
        assert_eq!(payload["version"], 1);

        let decrypted = decrypt_export_payload(&encrypted, password).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn wrong_password_fails() {
        let plaintext = "dGVzdA=="; // base64 of "test"
        let encrypted = encrypt_export_payload(plaintext, "correct-password").unwrap();
        let result = decrypt_export_payload(&encrypted, "wrong-password");
        assert!(result.is_err(), "decryption with wrong password must fail");
    }
}
