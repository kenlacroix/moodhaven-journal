//! Two-Factor Authentication commands for MoodHaven Journal
//!
//! Supports TOTP (Time-based One-Time Password) and backup codes.
//! WebAuthn registration/verification happens on the frontend.
//!
//! ## TOTP secret storage
//! The TOTP seed is encrypted with AES-256-GCM (key derived from the user's
//! password via PBKDF2-HMAC-SHA-256, 600 000 iterations) before being written
//! to `two_factor_auth.totp_secret`.  The stored blob format is:
//!   `enc:v1:<base64(16-byte salt)>:<base64(12-byte nonce)>:<base64(ciphertext)>`
//! Any value that does NOT start with `enc:v1:` is treated as a legacy
//! plaintext secret and accepted as-is so that existing installs can still
//! verify TOTP while the user re-enables 2FA to trigger re-encryption.

use crate::db::Database;
use crate::{PasswordRateLimiter, TotpUsedCodes, TwoFactorPendingState};
use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
use base64::Engine as _;
use hmac::Hmac;
use pbkdf2::pbkdf2;
use rand::Rng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::State;
use totp_rs::{Algorithm, Secret, TOTP};

const TOTP_PBKDF2_ITERATIONS: u32 = 600_000;
const TOTP_ENC_PREFIX: &str = "enc:v1:";

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
// TOTP Secret Encryption Helpers
// ============================================================================

/// Encrypt a TOTP seed with the user's password.
/// Output: `enc:v1:<base64(salt)>:<base64(nonce)>:<base64(ciphertext)>`
fn encrypt_totp_secret(secret: &str, password: &str) -> Result<String, String> {
    let mut salt = [0u8; 16];
    let mut nonce_bytes = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);

    let mut key = [0u8; 32];
    pbkdf2::<Hmac<Sha256>>(password.as_bytes(), &salt, TOTP_PBKDF2_ITERATIONS, &mut key)
        .map_err(|e| format!("pbkdf2: {e}"))?;

    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("aes init: {e}"))?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher
        .encrypt(nonce, secret.as_bytes())
        .map_err(|_| "totp encrypt failed".to_string())?;

    let b64 = base64::engine::general_purpose::STANDARD;
    Ok(format!(
        "{}{}.{}.{}",
        TOTP_ENC_PREFIX,
        b64.encode(salt),
        b64.encode(nonce_bytes),
        b64.encode(ct),
    ))
}

/// Decrypt a TOTP seed blob.
/// Accepts legacy plaintext secrets (no prefix) and returns them unchanged so
/// existing installs keep working until the user re-enables 2FA.
fn decrypt_totp_secret(stored: &str, password: &str) -> Result<String, String> {
    if !stored.starts_with(TOTP_ENC_PREFIX) {
        // Legacy plaintext — return as-is.
        return Ok(stored.to_string());
    }

    let payload = &stored[TOTP_ENC_PREFIX.len()..];
    let parts: Vec<&str> = payload.splitn(3, '.').collect();
    if parts.len() != 3 {
        return Err("malformed totp secret blob".to_string());
    }

    let b64 = base64::engine::general_purpose::STANDARD;
    let salt = b64
        .decode(parts[0])
        .map_err(|_| "bad salt b64".to_string())?;
    let nonce_bytes = b64
        .decode(parts[1])
        .map_err(|_| "bad nonce b64".to_string())?;
    let ct = b64.decode(parts[2]).map_err(|_| "bad ct b64".to_string())?;

    // Validate decoded lengths before use — Nonce::from_slice panics on wrong size.
    if nonce_bytes.len() != 12 {
        return Err(format!(
            "malformed totp blob: expected 12-byte nonce, got {}",
            nonce_bytes.len()
        ));
    }

    let mut key = [0u8; 32];
    pbkdf2::<Hmac<Sha256>>(password.as_bytes(), &salt, TOTP_PBKDF2_ITERATIONS, &mut key)
        .map_err(|e| format!("pbkdf2: {e}"))?;

    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("aes init: {e}"))?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ct.as_ref())
        .map_err(|_| "totp decrypt failed — wrong password or corrupted secret".to_string())?;

    String::from_utf8(plaintext).map_err(|_| "totp secret not valid utf-8".to_string())
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

// Backup code hash format v2: PBKDF2-HMAC-SHA-256 with per-code random salt.
// Stored as "pbkdf2:v2:{base64(16-byte salt)}:{base64(32-byte derived key)}"
//
// v1 (legacy) was bare SHA-256 with no salt — fast to crack offline.
// v2 hashes use 600k iterations, matching the password hash strength.
// Old v1 hashes are still verified for backward compat but never generated.
const BACKUP_CODE_PBKDF2_ITERATIONS: u32 = 600_000;
const BACKUP_V2_PREFIX: &str = "pbkdf2:v2:";

/// Hash a backup code using PBKDF2-HMAC-SHA-256 with a random per-code salt.
/// Replaces the legacy bare-SHA-256 approach which was brute-forceable in minutes.
fn hash_backup_code_v2(code: &str) -> String {
    let normalized = code.replace('-', "").to_uppercase();
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);

    let mut derived = [0u8; 32];
    pbkdf2::<Hmac<Sha256>>(
        normalized.as_bytes(),
        &salt,
        BACKUP_CODE_PBKDF2_ITERATIONS,
        &mut derived,
    )
    .expect("PBKDF2 is infallible for valid inputs");

    let b64 = base64::engine::general_purpose::STANDARD;
    format!(
        "{}{}:{}",
        BACKUP_V2_PREFIX,
        b64.encode(salt),
        b64.encode(derived)
    )
}

/// Verify a backup code against a stored hash.
/// Handles both v2 (PBKDF2) and legacy v1 (bare SHA-256) formats.
fn verify_backup_code_hash(code: &str, stored: &str) -> bool {
    let normalized = code.replace('-', "").to_uppercase();

    if let Some(rest) = stored.strip_prefix(BACKUP_V2_PREFIX) {
        // v2: "pbkdf2:v2:{salt_b64}:{hash_b64}"
        let parts: Vec<&str> = rest.splitn(2, ':').collect();
        if parts.len() != 2 {
            return false;
        }
        let b64 = base64::engine::general_purpose::STANDARD;
        let salt = match b64.decode(parts[0]) {
            Ok(s) => s,
            Err(_) => return false,
        };
        let stored_hash = match b64.decode(parts[1]) {
            Ok(h) => h,
            Err(_) => return false,
        };
        if stored_hash.len() != 32 {
            return false;
        }
        let mut derived = [0u8; 32];
        if pbkdf2::<Hmac<Sha256>>(
            normalized.as_bytes(),
            &salt,
            BACKUP_CODE_PBKDF2_ITERATIONS,
            &mut derived,
        )
        .is_err()
        {
            return false;
        }
        // Constant-time comparison
        derived
            .iter()
            .zip(stored_hash.iter())
            .fold(0u8, |acc, (a, b)| acc | (a ^ b))
            == 0
    } else {
        // v1 legacy: bare SHA-256 hex (no salt). Accept but log for migration tracking.
        let mut hasher = Sha256::new();
        hasher.update(normalized.as_bytes());
        let expected = hex_encode(hasher.finalize().as_slice());
        // Constant-time string comparison
        let a = expected.as_bytes();
        let b = stored.as_bytes();
        if a.len() != b.len() {
            return false;
        }
        a.iter()
            .zip(b.iter())
            .fold(0u8, |acc, (x, y)| acc | (x ^ y))
            == 0
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
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

/// Store pending TOTP secret encrypted with the user's password.
fn store_pending_totp(db: &Database, secret: &str, password: &str) -> Result<(), String> {
    let encrypted = encrypt_totp_secret(secret, password)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO two_factor_auth (id, enabled, totp_secret, updated_at)
         VALUES (1, 0, ?1, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
             totp_secret = ?1,
             updated_at = datetime('now')",
        rusqlite::params![encrypted],
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

/// Generate a new TOTP secret and return setup data.
/// `password` is used to encrypt the secret before storage.
#[tauri::command]
pub fn generate_totp_secret(
    db: State<Database>,
    password: String,
) -> Result<TotpSetupData, String> {
    if password.is_empty() {
        return Err("password required to store TOTP secret".to_string());
    }
    let secret = generate_totp_secret_internal()?;
    let totp = create_totp(&secret)?;

    store_pending_totp(&db, &secret, &password)?;

    Ok(TotpSetupData {
        secret: secret.clone(),
        qr_code_url: totp.get_url(),
        issuer: "MoodHaven Journal".to_string(),
        account_name: "user@moodhaven".to_string(),
    })
}

/// Verify a TOTP code against the pending secret.
/// `password` is required to decrypt the stored secret blob.
#[tauri::command]
pub fn verify_totp_code(
    db: State<Database>,
    code: String,
    password: String,
) -> Result<bool, String> {
    let row = get_2fa_row(&db)?.ok_or_else(|| "No 2FA setup in progress".to_string())?;

    let stored = row
        .totp_secret
        .ok_or_else(|| "No TOTP secret found".to_string())?;
    let secret = decrypt_totp_secret(&stored, &password)?;

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

/// Enable TOTP after successful verification.
/// `password` is required to decrypt the stored pending secret.
#[tauri::command]
pub fn enable_totp(
    db: State<Database>,
    code: String,
    password: String,
) -> Result<BackupCodes, String> {
    if !verify_totp_code(db.clone(), code, password)? {
        return Err("Invalid verification code".to_string());
    }

    // Generate backup codes
    let codes = generate_backup_codes_internal();
    let hashed_codes: Vec<String> = codes.iter().map(|c| hash_backup_code_v2(c)).collect();
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
    let hashed_codes: Vec<String> = codes.iter().map(|c| hash_backup_code_v2(c)).collect();
    let backup_codes_json = serde_json::to_string(&hashed_codes)
        .map_err(|e| format!("JSON serialization failed: {}", e))?;

    update_backup_codes(&db, &backup_codes_json)?;

    Ok(BackupCodes {
        codes,
        generated_at: chrono::Utc::now().to_rfc3339(),
    })
}

/// Verify a backup code (single-use).
/// Rate-limited via PasswordRateLimiter — same budget as password attempts.
/// Supports both v2 (PBKDF2) and legacy v1 (bare SHA-256) hash formats.
/// On success, marks 2FA complete in TwoFactorPendingState so unlock_app proceeds.
#[tauri::command]
pub fn verify_backup_code(
    db: State<Database>,
    rate_limiter: State<'_, PasswordRateLimiter>,
    twofa_state: State<'_, TwoFactorPendingState>,
    code: String,
) -> Result<bool, String> {
    // Apply the same rate limit used for password verification.
    rate_limiter
        .check()
        .map_err(|secs| format!("Too many failed attempts. Try again in {secs}s."))?;

    let result = (|| -> Result<bool, String> {
        let row = get_2fa_row(&db)?.ok_or_else(|| "2FA not enabled".to_string())?;

        let backup_codes_json = row
            .backup_codes
            .ok_or_else(|| "No backup codes found".to_string())?;

        let mut hashed_codes: Vec<String> = serde_json::from_str(&backup_codes_json)
            .map_err(|e| format!("Invalid backup codes data: {}", e))?;

        // Find the first code that matches (supports mixed v1/v2 hashes in the list)
        if let Some(pos) = hashed_codes
            .iter()
            .position(|h| verify_backup_code_hash(&code, h))
        {
            hashed_codes.remove(pos);

            // Update the database with remaining codes
            let updated_json = serde_json::to_string(&hashed_codes)
                .map_err(|e| format!("JSON serialization failed: {}", e))?;
            update_backup_codes(&db, &updated_json)?;

            Ok(true)
        } else {
            Ok(false)
        }
    })();

    match result {
        Ok(true) => {
            rate_limiter.record_success();
            twofa_state.on_twofa_completed();
            Ok(true)
        }
        Ok(false) => {
            rate_limiter.record_failure();
            Ok(false)
        }
        Err(e) => {
            rate_limiter.record_failure();
            Err(e)
        }
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

/// Disable 2FA.
/// Requires a fully authenticated session (password + 2FA if previously enabled).
/// Without this guard, a locked-screen IPC call could disable 2FA and bypass
/// the TwoFactorPendingState enforcement on the next unlock.
#[tauri::command]
pub fn disable_2fa(
    db: State<Database>,
    lock: State<'_, crate::AppLockState>,
    twofa_state: State<'_, TwoFactorPendingState>,
) -> Result<bool, String> {
    if lock.is_locked() {
        return Err("Session is locked".to_string());
    }
    if !twofa_state.is_fully_authenticated() {
        return Err(
            "Authentication incomplete: cannot disable 2FA without completing auth".to_string(),
        );
    }
    disable_2fa_in_db(&db)?;
    Ok(true)
}

/// Returns true if 2FA is enabled but the TOTP secret is stored as legacy plaintext
/// (no enc:v1: prefix). Used by the frontend to nudge users to re-enable TOTP.
#[tauri::command]
pub fn totp_needs_reencryption(db: State<Database>) -> Result<bool, String> {
    let row = get_2fa_row(&db)?;
    match row {
        Some(r)
            if r.enabled
                && r.method
                    .as_deref()
                    .is_some_and(|m| m == "totp" || m == "both") =>
        {
            let needs = r
                .totp_secret
                .map(|s| !s.starts_with(TOTP_ENC_PREFIX))
                .unwrap_or(false);
            Ok(needs)
        }
        _ => Ok(false),
    }
}

/// Verify TOTP code for login (returns true if valid).
/// `password` is required to decrypt the stored secret blob.
/// On success, marks the 2FA step complete in TwoFactorPendingState so
/// unlock_app will proceed.
#[tauri::command]
pub fn verify_2fa_totp(
    db: State<Database>,
    twofa_state: State<'_, TwoFactorPendingState>,
    rate_limiter: State<'_, PasswordRateLimiter>,
    used_codes: State<'_, TotpUsedCodes>,
    code: String,
    password: String,
) -> Result<bool, String> {
    rate_limiter
        .check()
        .map_err(|secs| format!("Too many failed attempts. Try again in {secs}s."))?;

    let row = get_2fa_row(&db)?.ok_or_else(|| "2FA not enabled".to_string())?;

    if !row.enabled {
        return Err("2FA not enabled".to_string());
    }

    let method = row.method.as_deref();
    if method != Some("totp") && method != Some("both") {
        return Err("TOTP not configured".to_string());
    }

    let stored = row
        .totp_secret
        .ok_or_else(|| "No TOTP secret found".to_string())?;
    let secret = decrypt_totp_secret(&stored, &password)?;

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
            // Reject if this code was already used within the 90-second window.
            if used_codes.check_and_record(&code, now) {
                rate_limiter.record_failure();
                return Ok(false);
            }
            rate_limiter.record_success();
            twofa_state.on_twofa_completed();
            return Ok(true);
        }
    }

    rate_limiter.record_failure();
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_round_trip() {
        let secret = "JBSWY3DPEHPK3PXP";
        let password = "correct-horse-battery-staple";
        let blob = encrypt_totp_secret(secret, password).expect("encrypt failed");
        let recovered = decrypt_totp_secret(&blob, password).expect("decrypt failed");
        assert_eq!(recovered, secret);
    }

    #[test]
    fn wrong_password_fails_decryption() {
        let secret = "JBSWY3DPEHPK3PXP";
        let blob = encrypt_totp_secret(secret, "password-a").expect("encrypt failed");
        let result = decrypt_totp_secret(&blob, "password-b");
        assert!(result.is_err());
    }

    #[test]
    fn legacy_plaintext_returned_as_is() {
        let legacy = "JBSWY3DPEHPK3PXP";
        let result = decrypt_totp_secret(legacy, "anypassword").expect("should succeed");
        assert_eq!(result, legacy);
    }

    #[test]
    fn malformed_blob_missing_parts() {
        let result = decrypt_totp_secret("enc:v1:onlytwoparts.here", "pw");
        assert!(result.is_err());
    }

    #[test]
    fn wrong_nonce_length_returns_err_not_panic() {
        // Build a blob with an 11-byte nonce (one byte short of the required 12).
        let b64 = base64::engine::general_purpose::STANDARD;
        let salt = b64.encode([0u8; 16]);
        let short_nonce = b64.encode([0u8; 11]);
        let ct = b64.encode([0u8; 32]);
        let blob = format!("enc:v1:{}.{}.{}", salt, short_nonce, ct);
        let result = decrypt_totp_secret(&blob, "pw");
        assert!(result.is_err());
        let msg = result.unwrap_err();
        assert!(
            msg.contains("nonce"),
            "error message should mention nonce, got: {msg}"
        );
    }

    #[test]
    fn encrypt_produces_enc_v1_prefix() {
        let blob = encrypt_totp_secret("SOMESECRET", "password").expect("encrypt failed");
        assert!(blob.starts_with("enc:v1:"));
    }

    #[test]
    fn encrypt_with_empty_password_succeeds() {
        // PBKDF2 accepts an empty password — the empty-password guard is upstream
        // in generate_totp_secret (the Tauri command layer).
        let result = encrypt_totp_secret("SOMESECRET", "");
        assert!(result.is_ok());
    }

    // ── backup code hash v2 ───────────────────────────────────────────────────

    #[test]
    fn hash_backup_code_v2_produces_expected_prefix() {
        let h = hash_backup_code_v2("ABCD-EFGH");
        assert!(h.starts_with("pbkdf2:v2:"), "got: {h}");
    }

    #[test]
    fn hash_backup_code_v2_two_calls_produce_different_salts() {
        // Each call generates a fresh random salt — two hashes of the same code differ.
        let h1 = hash_backup_code_v2("ABCD-EFGH");
        let h2 = hash_backup_code_v2("ABCD-EFGH");
        assert_ne!(
            h1, h2,
            "different salts should yield different stored hashes"
        );
    }

    #[test]
    fn verify_backup_code_hash_v2_correct_code() {
        let code = "ABCD-EFGH";
        let stored = hash_backup_code_v2(code);
        assert!(verify_backup_code_hash(code, &stored));
    }

    #[test]
    fn verify_backup_code_hash_v2_wrong_code() {
        let stored = hash_backup_code_v2("ABCD-EFGH");
        assert!(!verify_backup_code_hash("WXYZ-1234", &stored));
    }

    #[test]
    fn verify_backup_code_hash_v2_normalizes_dashes_and_case() {
        // User might type "abcdefgh" or "ABCD-EFGH" — both must match.
        let code = "ABCD-EFGH";
        let stored = hash_backup_code_v2(code);
        assert!(
            verify_backup_code_hash("abcdefgh", &stored),
            "lowercase no-dash should match"
        );
        assert!(
            verify_backup_code_hash("abcd-efgh", &stored),
            "lowercase with-dash should match"
        );
    }

    #[test]
    fn verify_backup_code_hash_v1_legacy_sha256() {
        // v1: bare hex SHA-256 of normalized code (no prefix, no salt).
        let code = "ABCD-EFGH";
        let normalized = "ABCDEFGH";
        let mut hasher = sha2::Sha256::new();
        use sha2::Digest;
        hasher.update(normalized.as_bytes());
        let legacy_hash = hex_encode(hasher.finalize().as_slice());
        // v1 hash must still verify against the code.
        assert!(
            verify_backup_code_hash(code, &legacy_hash),
            "legacy v1 hash must still work"
        );
    }

    #[test]
    fn verify_backup_code_hash_v1_wrong_code_fails() {
        let mut hasher = sha2::Sha256::new();
        use sha2::Digest;
        hasher.update(b"ABCDEFGH");
        let legacy_hash = hex_encode(hasher.finalize().as_slice());
        assert!(!verify_backup_code_hash("WXYZ-1234", &legacy_hash));
    }

    #[test]
    fn verify_backup_code_hash_malformed_v2_returns_false() {
        assert!(!verify_backup_code_hash("ABCD-EFGH", "pbkdf2:v2:onlyone"));
        assert!(!verify_backup_code_hash("ABCD-EFGH", "pbkdf2:v2:!!!:!!!"));
    }
}
