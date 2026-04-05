//! Journal-related Tauri commands
//!
//! All encryption/decryption happens on the frontend.
//! Backend only stores/retrieves encrypted blobs.

use crate::db::{self, Database, EncryptedContent, JournalEntryRow, UserSettings};
use crate::AppLockState;
use tauri::State;

fn require_unlocked(lock: &State<'_, AppLockState>) -> Result<(), String> {
    if lock.is_locked() {
        Err("Session is locked".to_string())
    } else {
        Ok(())
    }
}

/// Check if user has set up their password
#[tauri::command]
pub fn check_password_exists(db: State<Database>) -> Result<bool, String> {
    db::has_password(&db)
}

/// Store password verification hash (not the password itself)
#[tauri::command]
pub fn store_password_hash(db: State<Database>, hash: String, salt: String) -> Result<(), String> {
    db::set_password_hash(&db, &hash, &salt)
}

/// Get password hash for verification
#[tauri::command]
pub fn get_password_hash(db: State<Database>) -> Result<Option<UserSettings>, String> {
    db::get_password_hash(&db)
}

/// Create a new encrypted journal entry
#[tauri::command]
pub fn create_journal_entry(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    id: String,
    encrypted_content: EncryptedContent,
    mood: i32,
    privacy_mode: Option<i32>,
    location_weather: Option<String>,
    book_id: Option<String>,
) -> Result<JournalEntryRow, String> {
    require_unlocked(&lock)?;
    // Validate mood range
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
) -> Result<JournalEntryRow, String> {
    require_unlocked(&lock)?;
    if !(1..=5).contains(&mood) {
        return Err("Mood must be between 1 and 5".to_string());
    }

    let pm = privacy_mode.unwrap_or(0);
    if !(0..=2).contains(&pm) {
        return Err("Privacy mode must be 0, 1, or 2".to_string());
    }

    db::update_entry(&db, &id, &encrypted_content, mood, pm)
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
