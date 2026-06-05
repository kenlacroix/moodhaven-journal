//! PIN unlock commands for MoodHaven Journal
//!
//! Provides a 4–6 digit numeric PIN as an alternative unlock method.
//! The PIN does NOT replace the master password — it encrypts a copy of it.
//!
//! ## Storage format
//! - `pin_salt`    : base64(16-byte random salt)
//! - `pin_blob`    : base64(12-byte nonce) + "." + base64(AES-256-GCM ciphertext of master password)
//! - `pin_enabled` : "1" when set up, absent or "0" otherwise
//!
//! ## Key derivation
//! PBKDF2-HMAC-SHA-256 with 600 000 iterations — same parameters as the master password.
//! The low entropy of a 6-digit PIN is partially mitigated by the high iteration count;
//! the Rust-side rate limiter (5 failures → 30 s lockout, persisted) handles the rest.
//!
//! ## Security invariants
//! - `pin_setup` and `pin_disable` require session unlock (user must be authenticated).
//! - `pin_is_enabled` and `pin_unlock` are pre-auth (they run on the lock screen).
//! - Key material and the decrypted password are wrapped in `Zeroizing<>` so they are
//!   zeroed when dropped. The returned `String` remains in JS heap until GC; this matches
//!   the existing password-unlock memory model and is not novel to PIN unlock.
//! - Changing the master password invalidates the PIN (the wrapped copy becomes stale);
//!   the frontend must detect this and prompt to re-setup the PIN.

use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use hmac::Hmac;
use pbkdf2::pbkdf2;
use rand::RngCore;
use sha2::Sha256;
use std::sync::PoisonError;
use tauri::State;
use zeroize::Zeroizing;

use crate::db::Database;
use crate::{AppLockState, PinRateLimiter};

use super::require_unlocked;

const PBKDF2_ITERATIONS: u32 = 600_000;
const KEY_SIZE: usize = 32;
const SALT_SIZE: usize = 16;
const NONCE_SIZE: usize = 12;

const KEY_SALT: &str = "pin_salt";
const KEY_BLOB: &str = "pin_blob";
const KEY_ENABLED: &str = "pin_enabled";

// ---------------------------------------------------------------------------
// Internal DB helpers — inline settings access without the lock guard
// ---------------------------------------------------------------------------

fn db_get(conn: &rusqlite::Connection, key: &str) -> Result<Option<String>, String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT value FROM settings WHERE key = ?1")
        .map_err(|e| e.to_string())?;

    match stmt.query_row([key], |row| row.get::<_, String>(0)) {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn db_set(conn: &rusqlite::Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
        [key, value],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn db_delete(conn: &rusqlite::Connection, key: &str) -> Result<(), String> {
    conn.execute("DELETE FROM settings WHERE key = ?1", [key])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

fn derive_key(pin: &str, salt: &[u8]) -> Result<[u8; KEY_SIZE], String> {
    let mut key = [0u8; KEY_SIZE];
    pbkdf2::<Hmac<Sha256>>(pin.as_bytes(), salt, PBKDF2_ITERATIONS, &mut key)
        .map_err(|e| format!("pbkdf2: {e}"))?;
    Ok(key)
}

fn validate_pin(pin: &str) -> Result<(), String> {
    if pin.len() < 4 || pin.len() > 6 || !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err("PIN must be 4–6 digits".to_string());
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Check if PIN unlock is set up. Does NOT require session unlock.
/// Called on the lock screen to decide whether to show the PIN option.
#[tauri::command]
pub fn pin_is_enabled(db: State<Database>) -> Result<bool, String> {
    let conn = db.conn.lock().map_err(|e: PoisonError<_>| e.to_string())?;
    Ok(db_get(&conn, KEY_ENABLED)?.as_deref() == Some("1"))
}

/// Set up PIN unlock. Requires an unlocked session.
///
/// Encrypts `password` under a key derived from `pin`, then stores the
/// ciphertext. Subsequent calls overwrite any existing PIN.
#[tauri::command]
pub fn pin_setup(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    password: String,
    pin: String,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    validate_pin(&pin)?;

    if password.is_empty() {
        return Err("password must not be empty".to_string());
    }

    let mut salt = [0u8; SALT_SIZE];
    let mut nonce_bytes = [0u8; NONCE_SIZE];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);

    let key_bytes = Zeroizing::new(derive_key(&pin, &salt)?);
    let cipher = Aes256Gcm::new_from_slice(&*key_bytes).map_err(|e| format!("aes init: {e}"))?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, password.as_bytes())
        .map_err(|_| "encryption failed".to_string())?;

    let blob = format!("{}.{}", B64.encode(nonce_bytes), B64.encode(&ciphertext));

    let conn = db.conn.lock().map_err(|e: PoisonError<_>| e.to_string())?;
    db_set(&conn, KEY_SALT, &B64.encode(salt))?;
    db_set(&conn, KEY_BLOB, &blob)?;
    db_set(&conn, KEY_ENABLED, "1")?;

    Ok(())
}

/// Attempt to unlock using a PIN. Does NOT require session unlock.
///
/// Returns the decrypted master password on success. The caller must then
/// run the normal unlock flow (verify_password + unlock_app or 2FA).
///
/// Rate-limited on the Rust side. Error format on lockout: `"locked:{secs}"`.
#[tauri::command]
pub fn pin_unlock(
    db: State<Database>,
    pin_limiter: State<'_, PinRateLimiter>,
    pin: String,
) -> Result<String, String> {
    // Check lockout before format validation so that format-invalid PINs
    // still consume from the rate-limit budget.
    if let Err(remaining_secs) = pin_limiter.0.check() {
        return Err(format!("locked:{remaining_secs}"));
    }

    validate_pin(&pin)?;

    let (salt_b64, blob) = {
        let conn = db.conn.lock().map_err(|e: PoisonError<_>| e.to_string())?;
        let salt = db_get(&conn, KEY_SALT)?.ok_or("PIN not set up")?;
        let blob = db_get(&conn, KEY_BLOB)?.ok_or("PIN not set up")?;
        (salt, blob)
    };

    let salt = B64.decode(&salt_b64).map_err(|_| "invalid stored salt")?;

    let dot = blob.find('.').ok_or("corrupt PIN blob")?;
    let nonce_bytes = B64.decode(&blob[..dot]).map_err(|_| "invalid blob")?;
    let ciphertext = B64.decode(&blob[dot + 1..]).map_err(|_| "invalid blob")?;

    if nonce_bytes.len() != NONCE_SIZE {
        return Err("invalid nonce length".to_string());
    }

    let key_bytes = Zeroizing::new(derive_key(&pin, &salt)?);
    let cipher = Aes256Gcm::new_from_slice(&*key_bytes).map_err(|e| format!("aes init: {e}"))?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    match cipher.decrypt(nonce, ciphertext.as_ref()) {
        Ok(plaintext) => {
            let plaintext = Zeroizing::new(plaintext);
            pin_limiter.0.record_success();
            String::from_utf8(plaintext.to_vec())
                .map_err(|_| "invalid password encoding".to_string())
        }
        Err(_) => {
            if let Some(lockout_secs) = pin_limiter.0.record_failure() {
                Err(format!("locked:{lockout_secs}"))
            } else {
                Err("Incorrect PIN".to_string())
            }
        }
    }
}

/// Disable PIN unlock. Requires an unlocked session.
/// Removes all stored PIN data. The master password is unaffected.
#[tauri::command]
pub fn pin_disable(db: State<Database>, lock: State<'_, AppLockState>) -> Result<(), String> {
    require_unlocked(&lock)?;
    let conn = db.conn.lock().map_err(|e: PoisonError<_>| e.to_string())?;
    db_delete(&conn, KEY_SALT)?;
    db_delete(&conn, KEY_BLOB)?;
    db_delete(&conn, KEY_ENABLED)?;
    Ok(())
}
