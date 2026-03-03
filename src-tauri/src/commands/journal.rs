//! Journal-related Tauri commands
//!
//! All encryption/decryption happens on the frontend.
//! Backend only stores/retrieves encrypted blobs.

use crate::db::{self, Database, EncryptedContent, JournalEntryRow, UserSettings};
use tauri::State;

/// Check if user has set up their password
#[tauri::command]
pub fn check_password_exists(db: State<Database>) -> Result<bool, String> {
    db::has_password(&db)
}

/// Store password verification hash (not the password itself)
#[tauri::command]
pub fn store_password_hash(
    db: State<Database>,
    hash: String,
    salt: String,
) -> Result<(), String> {
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
    id: String,
    encrypted_content: EncryptedContent,
    mood: i32,
    privacy_mode: Option<i32>,
) -> Result<JournalEntryRow, String> {
    // Validate mood range
    if !(1..=5).contains(&mood) {
        return Err("Mood must be between 1 and 5".to_string());
    }

    let pm = privacy_mode.unwrap_or(0);
    if !(0..=2).contains(&pm) {
        return Err("Privacy mode must be 0, 1, or 2".to_string());
    }

    db::create_entry(&db, &id, &encrypted_content, mood, pm)
}

/// Get a single journal entry by ID
#[tauri::command]
pub fn get_journal_entry(db: State<Database>, id: String) -> Result<Option<JournalEntryRow>, String> {
    db::get_entry(&db, &id)
}

/// Get all journal entries (encrypted)
#[tauri::command]
pub fn get_all_journal_entries(
    db: State<Database>,
    limit: Option<i32>,
) -> Result<Vec<JournalEntryRow>, String> {
    db::get_all_entries(&db, limit)
}

/// Get journal entries within a date range
#[tauri::command]
pub fn get_journal_entries_by_date(
    db: State<Database>,
    start_date: String,
    end_date: String,
) -> Result<Vec<JournalEntryRow>, String> {
    db::get_entries_by_date_range(&db, &start_date, &end_date)
}

/// Update an existing journal entry
#[tauri::command]
pub fn update_journal_entry(
    db: State<Database>,
    id: String,
    encrypted_content: EncryptedContent,
    mood: i32,
    privacy_mode: Option<i32>,
) -> Result<JournalEntryRow, String> {
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
pub fn delete_journal_entry(db: State<Database>, id: String) -> Result<bool, String> {
    db::delete_entry(&db, &id)
}

/// Get mood statistics for analytics
#[tauri::command]
pub fn get_mood_statistics(
    db: State<Database>,
    start_date: String,
    end_date: String,
) -> Result<Vec<db::DailyStats>, String> {
    db::get_mood_stats(&db, &start_date, &end_date)
}

/// Get overall statistics (average mood, total entries)
#[tauri::command]
pub fn get_overall_statistics(db: State<Database>) -> Result<(f64, i32), String> {
    db::get_overall_stats(&db)
}
