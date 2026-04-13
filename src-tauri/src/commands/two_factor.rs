//! Two-Factor Authentication commands for MoodHaven Journal
//!
//! Supports TOTP (Time-based One-Time Password) and backup codes.
//! WebAuthn registration/verification happens on the frontend.

use crate::db::Database;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::State;
use totp_rs::{Algorithm, Secret, TOTP};

/// TOTP setup data returned to frontend
#[derive(Debug, Serialize, Deserialize)]
pub struct TotpSetupData {
    pub secret: String,       // Base32 secret for manual entry
    pub qr_code_url: String,  // otpauth:// URL for QR code generation
    pub issuer: String,       // "MoodHaven Journal"
    pub account_name: String, // User identifier
}

/// Backup codes returned after 2FA setup
#[derive(Debug, Serialize, Deserialize)]
pub struct BackupCodes {
    pub codes: Vec<String>,   // 10 plaintext codes (shown once)
    pub generated_at: String, // ISO timestamp
}

/// 2FA status for frontend
#[derive(Debug, Serialize, Deserialize)]
pub struct TwoFactorStatus {
    pub enabled: bool,
    pub method: Option<String>, // "totp", "webauthn", "both"
    pub has_backup_codes: bool,
    pub enabled_date: Option<String>,
}

/// WebAuthn credential storage
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WebAuthnCredential {
    pub id: String,         // Base64 credential ID
    pub public_key: String, // Base64 public key
    pub created_at: String,
}

// ============================================================================
// Internal Helpers
// ============================================================================

/// Generate a random TOTP secret
fn generate_totp_secret_internal() -> Result<String, String> {
    let secret = Secret::generate_secret();
    Ok(secret.to_encoded().to_string())
}

/// Create TOTP instance from secret
fn create_totp(secret: &str) -> Result<TOTP, String> {
    let secret_bytes = Secret::Encoded(secret.to_string())
        .to_bytes()
        .map_err(|e| format!("Invalid secret: {}", e))?;

    TOTP::new(
        Algorithm::SHA1,
        6,  // 6 digits
        1,  // 1 step (30 seconds)
        30, // 30 second period
        secret_bytes,
        Some("MoodHaven Journal".to_string()),
        "user@moodhaven".to_string(),
    )
    .map_err(|e| format!("Failed to create TOTP: {}", e))
}

/// Generate 10 random backup codes
fn generate_backup_codes_internal() -> Vec<String> {
    let mut rng = rand::thread_rng();
    (0..10)
        .map(|_| {
            // Generate 8-character alphanumeric codes (easy to type)
            let code: String = (0..8)
                .map(|_| {
                    let idx = rng.gen_range(0..36);
                    if idx < 10 {
                        (b'0' + idx) as char
                    } else {
                        (b'A' + idx - 10) as char
                    }
                })
                .collect();
            // Format as XXXX-XXXX for readability
            format!("{}-{}", &code[0..4], &code[4..8])
        })
        .collect()
}

/// Hash a backup code for storage
fn hash_backup_code(code: &str) -> String {
    // Normalize: remove dashes, uppercase
    let normalized = code.replace('-', "").to_uppercase();
    let mut hasher = Sha256::new();
    hasher.update(normalized.as_bytes());
    hex::encode(hasher.finalize())
}

// We need hex encoding for the hash
mod hex {
    pub fn encode(bytes: impl AsRef<[u8]>) -> String {
        bytes
            .as_ref()
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect()
    }
}

// ============================================================================
// Database Operations
// ============================================================================

/// Get current 2FA settings from database
fn get_2fa_row(db: &Database) -> Result<Option<TwoFactorRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let result = conn.query_row(
        "SELECT enabled, method, totp_secret, webauthn_credentials, backup_codes, created_at
         FROM two_factor_auth WHERE id = 1",
        [],
        |row| {
            Ok(TwoFactorRow {
                enabled: row.get::<_, i32>(0)? == 1,
                method: row.get(1)?,
                totp_secret: row.get(2)?,
                webauthn_credentials: row.get(3)?,
                backup_codes: row.get(4)?,
                created_at: row.get(5)?,
            })
        },
    );

    match result {
        Ok(row) => Ok(Some(row)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Query failed: {}", e)),
    }
}

#[derive(Debug)]
struct TwoFactorRow {
    enabled: bool,
    method: Option<String>,
    totp_secret: Option<String>,
    #[allow(dead_code)]
    webauthn_credentials: Option<String>,
    backup_codes: Option<String>,
    created_at: String,
}

/// Store pending TOTP secret (before verification)
fn store_pending_totp(db: &Database, secret: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO two_factor_auth (id, enabled, totp_secret, updated_at)
         VALUES (1, 0, ?1, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
             totp_secret = ?1,
             updated_at = datetime('now')",
        rusqlite::params![secret],
    )
    .map_err(|e| format!("Failed to store TOTP secret: {}", e))?;

    Ok(())
}

/// Enable TOTP with verified code
fn enable_totp_in_db(db: &Database, backup_codes_json: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE two_factor_auth SET
             enabled = 1,
             method = CASE
                 WHEN method = 'webauthn' THEN 'both'
                 ELSE 'totp'
             END,
             backup_codes = ?1,
             updated_at = datetime('now')
         WHERE id = 1",
        rusqlite::params![backup_codes_json],
    )
    .map_err(|e| format!("Failed to enable TOTP: {}", e))?;

    Ok(())
}

/// Update backup codes in database
fn update_backup_codes(db: &Database, backup_codes_json: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE two_factor_auth SET backup_codes = ?1, updated_at = datetime('now') WHERE id = 1",
        rusqlite::params![backup_codes_json],
    )
    .map_err(|e| format!("Failed to update backup codes: {}", e))?;

    Ok(())
}

/// Disable 2FA completely
fn disable_2fa_in_db(db: &Database) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM two_factor_auth WHERE id = 1", [])
        .map_err(|e| format!("Failed to disable 2FA: {}", e))?;

    Ok(())
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Generate a new TOTP secret and return setup data
#[tauri::command]
pub fn generate_totp_secret(db: State<Database>) -> Result<TotpSetupData, String> {
    let secret = generate_totp_secret_internal()?;
    let totp = create_totp(&secret)?;

    // Store the pending secret
    store_pending_totp(&db, &secret)?;

    Ok(TotpSetupData {
        secret: secret.clone(),
        qr_code_url: totp.get_url(),
        issuer: "MoodHaven Journal".to_string(),
        account_name: "user@moodhaven".to_string(),
    })
}

/// Verify a TOTP code against the pending secret
#[tauri::command]
pub fn verify_totp_code(db: State<Database>, code: String) -> Result<bool, String> {
    let row = get_2fa_row(&db)?.ok_or_else(|| "No 2FA setup in progress".to_string())?;

    let secret = row
        .totp_secret
        .ok_or_else(|| "No TOTP secret found".to_string())?;

    let totp = create_totp(&secret)?;

    // Verify with some time tolerance (1 step before/after)
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Time error: {}", e))?
        .as_secs();

    // Check current, previous, and next time step
    for offset in [-30i64, 0, 30] {
        let time = (now as i64 + offset) as u64;
        let expected = totp.generate(time);
        if expected == code {
            return Ok(true);
        }
    }

    Ok(false)
}

/// Enable TOTP after successful verification
#[tauri::command]
pub fn enable_totp(db: State<Database>, code: String) -> Result<BackupCodes, String> {
    // First verify the code
    if !verify_totp_code(db.clone(), code)? {
        return Err("Invalid verification code".to_string());
    }

    // Generate backup codes
    let codes = generate_backup_codes_internal();
    let hashed_codes: Vec<String> = codes.iter().map(|c| hash_backup_code(c)).collect();
    let backup_codes_json = serde_json::to_string(&hashed_codes)
        .map_err(|e| format!("JSON serialization failed: {}", e))?;

    // Enable TOTP in database
    enable_totp_in_db(&db, &backup_codes_json)?;

    Ok(BackupCodes {
        codes,
        generated_at: chrono::Utc::now().to_rfc3339(),
    })
}

/// Generate new backup codes (replaces existing)
#[tauri::command]
pub fn regenerate_backup_codes(db: State<Database>) -> Result<BackupCodes, String> {
    let row = get_2fa_row(&db)?.ok_or_else(|| "2FA not enabled".to_string())?;

    if !row.enabled {
        return Err("2FA not enabled".to_string());
    }

    let codes = generate_backup_codes_internal();
    let hashed_codes: Vec<String> = codes.iter().map(|c| hash_backup_code(c)).collect();
    let backup_codes_json = serde_json::to_string(&hashed_codes)
        .map_err(|e| format!("JSON serialization failed: {}", e))?;

    update_backup_codes(&db, &backup_codes_json)?;

    Ok(BackupCodes {
        codes,
        generated_at: chrono::Utc::now().to_rfc3339(),
    })
}

/// Verify a backup code (single-use)
#[tauri::command]
pub fn verify_backup_code(db: State<Database>, code: String) -> Result<bool, String> {
    let row = get_2fa_row(&db)?.ok_or_else(|| "2FA not enabled".to_string())?;

    let backup_codes_json = row
        .backup_codes
        .ok_or_else(|| "No backup codes found".to_string())?;

    let mut hashed_codes: Vec<String> = serde_json::from_str(&backup_codes_json)
        .map_err(|e| format!("Invalid backup codes data: {}", e))?;

    let code_hash = hash_backup_code(&code);

    // Find and remove the used code
    if let Some(pos) = hashed_codes.iter().position(|h| h == &code_hash) {
        hashed_codes.remove(pos);

        // Update the database with remaining codes
        let updated_json = serde_json::to_string(&hashed_codes)
            .map_err(|e| format!("JSON serialization failed: {}", e))?;
        update_backup_codes(&db, &updated_json)?;

        Ok(true)
    } else {
        Ok(false)
    }
}

/// Get remaining backup codes count
#[tauri::command]
pub fn get_backup_codes_count(db: State<Database>) -> Result<i32, String> {
    let row = get_2fa_row(&db)?;

    match row {
        Some(r) => {
            let count = r
                .backup_codes
                .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
                .map_or(0, |codes| codes.len());
            Ok(count as i32)
        }
        None => Ok(0),
    }
}

/// Get current 2FA status
#[tauri::command]
pub fn get_2fa_status(db: State<Database>) -> Result<TwoFactorStatus, String> {
    let row = get_2fa_row(&db)?;

    match row {
        Some(r) => {
            let has_backup_codes = r
                .backup_codes
                .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
                .is_some_and(|codes| !codes.is_empty());

            Ok(TwoFactorStatus {
                enabled: r.enabled,
                method: r.method,
                has_backup_codes,
                enabled_date: if r.enabled { Some(r.created_at) } else { None },
            })
        }
        None => Ok(TwoFactorStatus {
            enabled: false,
            method: None,
            has_backup_codes: false,
            enabled_date: None,
        }),
    }
}

/// Disable 2FA (requires password verification done on frontend)
#[tauri::command]
pub fn disable_2fa(db: State<Database>) -> Result<bool, String> {
    disable_2fa_in_db(&db)?;
    Ok(true)
}

/// Verify TOTP code for login (returns true if valid)
#[tauri::command]
pub fn verify_2fa_totp(db: State<Database>, code: String) -> Result<bool, String> {
    let row = get_2fa_row(&db)?.ok_or_else(|| "2FA not enabled".to_string())?;

    if !row.enabled {
        return Err("2FA not enabled".to_string());
    }

    let method = row.method.as_deref();
    if method != Some("totp") && method != Some("both") {
        return Err("TOTP not configured".to_string());
    }

    let secret = row
        .totp_secret
        .ok_or_else(|| "No TOTP secret found".to_string())?;

    let totp = create_totp(&secret)?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Time error: {}", e))?
        .as_secs();

    // Check current, previous, and next time step for tolerance
    for offset in [-30i64, 0, 30] {
        let time = (now as i64 + offset) as u64;
        let expected = totp.generate(time);
        if expected == code {
            return Ok(true);
        }
    }

    Ok(false)
}
