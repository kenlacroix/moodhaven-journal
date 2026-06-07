//! Journal-related Tauri commands
//!
//! All encryption/decryption happens on the frontend.
//! Backend only stores/retrieves encrypted blobs.

use crate::db::{self, Database, EncryptedContent, JournalEntryRow, UserSettings};
use crate::{AppLockState, DbKeyState, PasswordRateLimiter, TwoFactorPendingState};
use base64::Engine;
use hmac::Hmac;
use pbkdf2::pbkdf2;
use sha2::Sha256;
use tauri::State;
use zeroize::Zeroizing;

use super::require_unlocked;

/// Check if user has set up their password
#[tauri::command]
pub fn check_password_exists(db: State<Database>) -> Result<bool, String> {
    db::has_password(&db)
}

/// Store password verification hash (not the password itself).
/// First-run exception: allowed while locked if no password exists yet (setup flow).
/// If a password already exists, session must be unlocked (password change flow).
#[tauri::command]
pub fn store_password_hash(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    hash: String,
    salt: String,
) -> Result<(), String> {
    let password_already_set = db::has_password(&db)?;
    if password_already_set {
        require_unlocked(&lock)?;
    }
    db::set_password_hash(&db, &hash, &salt)
}

/// Get password hash for verification
#[tauri::command]
pub fn get_password_hash(db: State<Database>) -> Result<Option<UserSettings>, String> {
    db::get_password_hash(&db)
}

/// Verify a password against the stored PBKDF2 hash (unencrypted DB) or by attempting
/// to open the SQLCipher-encrypted database (post-migration DB).
///
/// - PBKDF2-HMAC-SHA-256, 600 000 iterations, 32-byte output
/// - Salt source: user_settings table (unencrypted path) or db_state.json (encrypted path)
/// - Hash comparison is constant-time (unencrypted) or implicit via SQLCipher key check
/// - Backend rate limiter: 5 failures → 30-second lockout
/// - On success, records derived key in DbKeyState and sets TwoFactorPendingState
///
/// Returns `Ok(true)` on match, `Ok(false)` on mismatch, `Err` on bad inputs or lockout.
#[tauri::command]
pub fn verify_password(
    db: State<Database>,
    rate_limiter: State<'_, PasswordRateLimiter>,
    twofa_state: State<'_, TwoFactorPendingState>,
    db_key_state: State<'_, DbKeyState>,
    password: String,
) -> Result<bool, String> {
    // Wrap immediately so the plaintext is wiped on every exit path (incl. early returns).
    let password = Zeroizing::new(password);
    if password.is_empty() {
        return Err("empty password".to_string());
    }

    rate_limiter
        .check()
        .map_err(|secs| format!("Too many failed attempts. Try again in {secs}s."))?;

    if db.is_encrypted() {
        // ── Encrypted path (post-migration) ──────────────────────────────────
        // Proof of correct password: derive key from db_state.json salt and try to
        // open the encrypted database. SQLCipher's MAC verification fails immediately
        // on a wrong key, so there is no separate hash check needed.
        let salt_b64 = db.db_salt().ok_or(
            "Database encryption record is missing. \
             If this persists, use \"Erase & Start Fresh\" in Settings to recover.",
        )?;
        let salt = base64::engine::general_purpose::STANDARD
            .decode(&salt_b64)
            .map_err(|e| format!("invalid db_state salt: {e}"))?;
        let mut derived = Zeroizing::new([0u8; 32]);
        pbkdf2::<Hmac<Sha256>>(password.as_bytes(), &salt, 600_000, derived.as_mut())
            .map_err(|e| format!("pbkdf2 error: {e}"))?;

        match db.apply_key(&derived) {
            Ok(()) => {
                rate_limiter.record_success();
                let twofa_enabled = db::is_2fa_enabled(&db).unwrap_or(false);
                twofa_state.on_password_verified(twofa_enabled);
                db_key_state.set(*derived);
                Ok(true)
            }
            Err(_) => {
                rate_limiter.record_failure();
                Ok(false)
            }
        }
    } else {
        // ── Unencrypted path (existing install or first run) ──────────────────
        // Classic PBKDF2 hash comparison. On success, store the derived key so
        // unlock_app can trigger the migration to an encrypted DB.
        let settings = db::get_password_hash(&db)?;
        let settings = match settings {
            Some(s) => s,
            None => return Ok(false),
        };

        let salt = base64::engine::general_purpose::STANDARD
            .decode(&settings.password_salt)
            .map_err(|e| format!("invalid salt encoding: {e}"))?;
        let mut derived = Zeroizing::new([0u8; 32]);
        pbkdf2::<Hmac<Sha256>>(password.as_bytes(), &salt, 600_000, derived.as_mut())
            .map_err(|e| format!("pbkdf2 error: {e}"))?;

        let derived_b64 =
            Zeroizing::new(base64::engine::general_purpose::STANDARD.encode(*derived));
        let matched = constant_time_eq(&derived_b64, &settings.password_hash);
        if matched {
            rate_limiter.record_success();
            let twofa_enabled = db::is_2fa_enabled(&db).unwrap_or(false);
            twofa_state.on_password_verified(twofa_enabled);
            // Store derived key bytes — unlock_app will use them to encrypt the DB.
            db_key_state.set(*derived);
        } else {
            rate_limiter.record_failure();
        }
        Ok(matched)
    }
}

fn constant_time_eq(a: &str, b: &str) -> bool {
    let a = a.as_bytes();
    let b = b.as_bytes();
    if a.len() != b.len() {
        return false;
    }
    a.iter()
        .zip(b.iter())
        .fold(0u8, |acc, (x, y)| acc | (x ^ y))
        == 0
}

/// Create a new encrypted journal entry
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_journal_entry(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    id: String,
    encrypted_content: EncryptedContent,
    mood: i32,
    privacy_mode: Option<i32>,
    location_weather: Option<String>,
    book_id: Option<String>,
    word_count: Option<i32>,
) -> Result<JournalEntryRow, String> {
    require_unlocked(&lock)?;
    if !(1..=5).contains(&mood) {
        return Err("Mood must be between 1 and 5".to_string());
    }

    let pm = privacy_mode.unwrap_or(0);
    if !(0..=2).contains(&pm) {
        return Err("Privacy mode must be 0, 1, or 2".to_string());
    }

    db::create_entry(
        &db,
        &id,
        &encrypted_content,
        mood,
        pm,
        location_weather.as_deref(),
        book_id.as_deref(),
        word_count,
    )
}

/// Get a single journal entry by ID
#[tauri::command]
pub fn get_journal_entry(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    id: String,
) -> Result<Option<JournalEntryRow>, String> {
    require_unlocked(&lock)?;
    db::get_entry(&db, &id)
}

/// Get all journal entries (encrypted)
#[tauri::command]
pub fn get_all_journal_entries(
    db: State<'_, Database>,
    lock: State<'_, AppLockState>,
    limit: Option<i32>,
) -> Result<Vec<JournalEntryRow>, String> {
    require_unlocked(&lock)?;
    db::get_all_entries(&db, limit)
}

/// Get entries from the same calendar day (month+day) in previous years (On This Day).
/// More efficient than fetching all entries and filtering in JS.
#[tauri::command]
pub fn get_entries_on_this_day(
    db: State<Database>,
    lock: State<'_, AppLockState>,
) -> Result<Vec<JournalEntryRow>, String> {
    require_unlocked(&lock)?;
    db::get_entries_on_this_day(&db)
}

/// Get journal entries within a date range
#[tauri::command]
pub fn get_journal_entries_by_date(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    start_date: String,
    end_date: String,
) -> Result<Vec<JournalEntryRow>, String> {
    require_unlocked(&lock)?;
    db::get_entries_by_date_range(&db, &start_date, &end_date)
}

/// Update an existing journal entry
#[tauri::command]
pub fn update_journal_entry(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    id: String,
    encrypted_content: EncryptedContent,
    mood: i32,
    privacy_mode: Option<i32>,
    word_count: Option<i32>,
) -> Result<JournalEntryRow, String> {
    require_unlocked(&lock)?;
    if !(1..=5).contains(&mood) {
        return Err("Mood must be between 1 and 5".to_string());
    }

    let pm = privacy_mode.unwrap_or(0);
    if !(0..=2).contains(&pm) {
        return Err("Privacy mode must be 0, 1, or 2".to_string());
    }

    db::update_entry(&db, &id, &encrypted_content, mood, pm, word_count)
}

/// Delete a journal entry
#[tauri::command]
pub fn delete_journal_entry(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    id: String,
) -> Result<bool, String> {
    require_unlocked(&lock)?;
    db::delete_entry(&db, &id)
}

/// Attach location/weather data to an existing entry.
/// Called when geolocation resolves after the initial auto-save has already created the row.
#[tauri::command]
pub fn patch_entry_location_weather(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    id: String,
    location_weather: String,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    db::patch_entry_location_weather(&db, &id, &location_weather)
}

/// Toggle the pinned/favourite state of an entry.
#[tauri::command]
pub fn patch_entry_pinned(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    id: String,
    pinned: bool,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    db::patch_entry_pinned(&db, &id, pinned)
}

/// Set the status of an entry ('thinking' | 'complete' | 'revisit').
#[tauri::command]
pub fn patch_entry_status(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    id: String,
    status: String,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    db::patch_entry_status(&db, &id, &status)
}

/// Link a journal entry to a StillHaven session.
#[tauri::command]
pub fn link_journal_entry_to_session(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    entry_id: String,
    session_id: String,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    db::link_journal_entry_to_session(&db, &entry_id, &session_id)
}

/// Sync tags for an entry (replaces all existing tags).
#[tauri::command]
pub fn sync_entry_tags(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    id: String,
    tags: Vec<String>,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    db::sync_entry_tags(&db, &id, &tags)
}

/// Get all unique tag names used in a book.
#[tauri::command]
pub fn get_book_tags(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    book_id: String,
) -> Result<Vec<String>, String> {
    require_unlocked(&lock)?;
    db::get_book_tags(&db, &book_id)
}

/// Get mood statistics for analytics
#[tauri::command]
pub fn get_mood_statistics(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    start_date: String,
    end_date: String,
) -> Result<Vec<db::DailyStats>, String> {
    require_unlocked(&lock)?;
    db::get_mood_stats(&db, &start_date, &end_date)
}

/// Get overall statistics (average mood, total entries)
#[tauri::command]
pub fn get_overall_statistics(
    db: State<Database>,
    lock: State<'_, AppLockState>,
) -> Result<(f64, i32), String> {
    require_unlocked(&lock)?;
    db::get_overall_stats(&db)
}

#[cfg(test)]
mod tests {
    use base64::Engine;
    use hmac::Hmac;
    use pbkdf2::pbkdf2;
    use sha2::Sha256;

    // Reusable helper: derive PBKDF2-HMAC-SHA-256 hash from (password, raw_salt_bytes).
    // Mirrors verify_password's internal logic so tests are self-contained.
    fn derive(password: &str, salt_bytes: &[u8]) -> String {
        let mut out = [0u8; 32];
        pbkdf2::<Hmac<Sha256>>(password.as_bytes(), salt_bytes, 600_000, &mut out).unwrap();
        base64::engine::general_purpose::STANDARD.encode(out)
    }

    // Constant-time compare (same logic as production code)
    fn ct_eq(a: &str, b: &str) -> bool {
        let a = a.as_bytes();
        let b = b.as_bytes();
        if a.len() != b.len() {
            return false;
        }
        a.iter()
            .zip(b.iter())
            .fold(0u8, |acc, (x, y)| acc | (x ^ y))
            == 0
    }

    /// ASCII password round-trip: hash and verify must agree.
    #[test]
    fn test_verify_ascii_password_correct() {
        // nosemgrep: rust-hardcoded-secret (test fixture — PBKDF2 round-trip test)
        let password = "test123";
        // Use a fixed 16-byte salt (raw) — matches the 16-byte SALT_LENGTH in crypto.ts
        let salt_bytes = [
            0x61u8, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x6b, 0x6c, 0x6d, 0x6e,
            0x6f, 0x70,
        ];
        let stored_salt = base64::engine::general_purpose::STANDARD.encode(salt_bytes);
        let stored_hash = derive(password, &salt_bytes);

        // Simulate verify_password logic
        let decoded_salt = base64::engine::general_purpose::STANDARD
            .decode(&stored_salt)
            .unwrap();
        let candidate_hash = derive(password, &decoded_salt);
        assert!(
            ct_eq(&candidate_hash, &stored_hash),
            "ASCII password should verify"
        );
    }

    /// Unicode password round-trip — non-ASCII critical path.
    #[test]
    fn test_verify_unicode_password_correct() {
        // nosemgrep: rust-hardcoded-secret (test fixture — Unicode PBKDF2 round-trip test)
        let password = "日記📝";
        let salt_bytes = [
            0xdeu8, 0xad, 0xbe, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0xfe, 0xdc,
            0xba, 0x98,
        ];
        let stored_salt = base64::engine::general_purpose::STANDARD.encode(salt_bytes);
        let stored_hash = derive(password, &salt_bytes);

        let decoded_salt = base64::engine::general_purpose::STANDARD
            .decode(&stored_salt)
            .unwrap();
        let candidate_hash = derive(password, &decoded_salt);
        assert!(
            ct_eq(&candidate_hash, &stored_hash),
            "Unicode password should verify"
        );
    }

    /// Wrong password must not match.
    #[test]
    fn test_verify_wrong_password_returns_false() {
        let correct = "correct-horse-battery-staple";
        let wrong = "wrong-password";
        let salt_bytes = [
            0x11u8, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee,
            0xff, 0x00,
        ];
        let stored_hash = derive(correct, &salt_bytes);
        let candidate_hash = derive(wrong, &salt_bytes);
        assert!(
            !ct_eq(&candidate_hash, &stored_hash),
            "Wrong password must not match"
        );
    }

    /// Base64 salt decode — passing raw salt bytes directly (not the base64 string bytes)
    /// must give the same hash as encoding → decoding the salt.
    #[test]
    fn test_salt_must_be_decoded_before_derive() {
        // nosemgrep: rust-hardcoded-secret (test fixture only)
        let password = "parity-check";
        let salt_bytes = [
            0xaau8, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77,
            0x88, 0x99,
        ];
        let stored_salt_b64 = base64::engine::general_purpose::STANDARD.encode(salt_bytes);

        // Correct: decode base64 first
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(&stored_salt_b64)
            .unwrap();
        let correct_hash = derive(password, &decoded);

        // Wrong: use the base64 string bytes directly (should differ)
        let wrong_hash = derive(password, stored_salt_b64.as_bytes());

        assert!(
            !ct_eq(&correct_hash, &wrong_hash),
            "Decoded salt must produce a different hash than raw base64 bytes"
        );
        // And the decoded path matches direct raw bytes
        let direct_hash = derive(password, &salt_bytes);
        assert!(
            ct_eq(&correct_hash, &direct_hash),
            "Decoded salt path must match direct raw-bytes path"
        );
    }

    /// Invalid base64 salt must return Err, not panic.
    #[test]
    fn test_invalid_base64_salt_returns_err() {
        let result = base64::engine::general_purpose::STANDARD.decode("not-valid-base64!!!");
        assert!(
            result.is_err(),
            "Truncated/invalid base64 salt must fail to decode"
        );
    }
}
