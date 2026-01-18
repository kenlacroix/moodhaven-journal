//! Database module for MoodBloom
//!
//! Handles SQLite connection, migrations, and CRUD operations
//! for encrypted journal entries.

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Manager;

/// Encrypted content structure matching TypeScript EncryptedData
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EncryptedContent {
    pub ciphertext: String,
    pub iv: String,
    pub salt: String,
    pub version: i32,
}

/// Journal entry as stored in database
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JournalEntryRow {
    pub id: String,
    pub encrypted_content: EncryptedContent,
    pub mood: i32,
    pub created_at: String,
    pub updated_at: String,
}

/// Journal entry metadata (without content, for list views)
#[derive(Debug, Serialize, Deserialize)]
pub struct JournalEntryMeta {
    pub id: String,
    pub mood: i32,
    pub created_at: String,
}

/// User settings row
#[derive(Debug, Serialize, Deserialize)]
pub struct UserSettings {
    pub password_hash: String,
    pub password_salt: String,
}

/// Daily mood statistics
#[derive(Debug, Serialize, Deserialize)]
pub struct DailyStats {
    pub date: String,
    pub average_mood: f64,
    pub entry_count: i32,
}

/// Mood distribution for analytics
#[derive(Debug, Serialize, Deserialize)]
pub struct MoodDistribution {
    pub mood: i32,
    pub count: i32,
}

/// Streak statistics
#[derive(Debug, Serialize, Deserialize)]
pub struct StreakStats {
    pub current_streak: i32,
    pub longest_streak: i32,
    pub last_entry_date: Option<String>,
}

/// Day of week statistics
#[derive(Debug, Serialize, Deserialize)]
pub struct DayOfWeekStats {
    pub day_of_week: i32,
    pub day_name: String,
    pub average_mood: f64,
    pub entry_count: i32,
}

/// Calendar day data for monthly view
#[derive(Debug, Serialize, Deserialize)]
pub struct CalendarDayData {
    pub date: String,
    pub average_mood: f64,
    pub entry_count: i32,
}

/// Database state managed by Tauri
pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    /// Initialize database with schema
    pub fn new(db_path: PathBuf) -> Result<Self, String> {
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        // Enable foreign keys
        conn.execute("PRAGMA foreign_keys = ON", [])
            .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;

        // Run migrations
        conn.execute_batch(include_str!("schema.sql"))
            .map_err(|e| format!("Failed to run migrations: {}", e))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}

/// Get database path in app data directory
pub fn get_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    std::fs::create_dir_all(&app_data)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    Ok(app_data.join("moodbloom.db"))
}

// ============================================================================
// User Settings Operations
// ============================================================================

/// Check if user has set up password
pub fn has_password(db: &Database) -> Result<bool, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let count: i32 = conn
        .query_row("SELECT COUNT(*) FROM user_settings", [], |row| row.get(0))
        .map_err(|e| format!("Query failed: {}", e))?;

    Ok(count > 0)
}

/// Store password hash for verification
pub fn set_password_hash(db: &Database, hash: &str, salt: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO user_settings (id, password_hash, password_salt, updated_at)
         VALUES (1, ?1, ?2, datetime('now'))",
        params![hash, salt],
    )
    .map_err(|e| format!("Failed to store password: {}", e))?;

    Ok(())
}

/// Get stored password hash and salt
pub fn get_password_hash(db: &Database) -> Result<Option<UserSettings>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let result = conn.query_row(
        "SELECT password_hash, password_salt FROM user_settings WHERE id = 1",
        [],
        |row| {
            Ok(UserSettings {
                password_hash: row.get(0)?,
                password_salt: row.get(1)?,
            })
        },
    );

    match result {
        Ok(settings) => Ok(Some(settings)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Query failed: {}", e)),
    }
}

// ============================================================================
// Journal Entry Operations
// ============================================================================

/// Create a new journal entry
pub fn create_entry(
    db: &Database,
    id: &str,
    encrypted_content: &EncryptedContent,
    mood: i32,
) -> Result<JournalEntryRow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let content_json = serde_json::to_string(encrypted_content)
        .map_err(|e| format!("JSON serialization failed: {}", e))?;

    conn.execute(
        "INSERT INTO journal_entries (id, encrypted_content, mood)
         VALUES (?1, ?2, ?3)",
        params![id, content_json, mood],
    )
    .map_err(|e| format!("Failed to create entry: {}", e))?;

    // Fetch the created entry
    get_entry(db, id)?.ok_or_else(|| "Entry not found after creation".to_string())
}

/// Get a single entry by ID
pub fn get_entry(db: &Database, id: &str) -> Result<Option<JournalEntryRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let result = conn.query_row(
        "SELECT id, encrypted_content, mood, created_at, updated_at
         FROM journal_entries WHERE id = ?1",
        params![id],
        |row| {
            let content_json: String = row.get(1)?;
            let encrypted_content: EncryptedContent = serde_json::from_str(&content_json)
                .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

            Ok(JournalEntryRow {
                id: row.get(0)?,
                encrypted_content,
                mood: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    );

    match result {
        Ok(entry) => Ok(Some(entry)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Query failed: {}", e)),
    }
}

/// Get all entries (most recent first)
pub fn get_all_entries(db: &Database, limit: Option<i32>) -> Result<Vec<JournalEntryRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let limit_clause = limit.map_or(String::new(), |l| format!(" LIMIT {}", l));

    let mut stmt = conn
        .prepare(&format!(
            "SELECT id, encrypted_content, mood, created_at, updated_at
             FROM journal_entries
             ORDER BY created_at DESC{}",
            limit_clause
        ))
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let entries = stmt
        .query_map([], |row| {
            let content_json: String = row.get(1)?;
            let encrypted_content: EncryptedContent = serde_json::from_str(&content_json)
                .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

            Ok(JournalEntryRow {
                id: row.get(0)?,
                encrypted_content,
                mood: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row parsing failed: {}", e))?;

    Ok(entries)
}

/// Get entries for a date range
pub fn get_entries_by_date_range(
    db: &Database,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<JournalEntryRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, encrypted_content, mood, created_at, updated_at
             FROM journal_entries
             WHERE date(created_at) BETWEEN ?1 AND ?2
             ORDER BY created_at DESC",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let entries = stmt
        .query_map(params![start_date, end_date], |row| {
            let content_json: String = row.get(1)?;
            let encrypted_content: EncryptedContent = serde_json::from_str(&content_json)
                .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

            Ok(JournalEntryRow {
                id: row.get(0)?,
                encrypted_content,
                mood: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row parsing failed: {}", e))?;

    Ok(entries)
}

/// Update an entry's content
pub fn update_entry(
    db: &Database,
    id: &str,
    encrypted_content: &EncryptedContent,
    mood: i32,
) -> Result<JournalEntryRow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let content_json = serde_json::to_string(encrypted_content)
        .map_err(|e| format!("JSON serialization failed: {}", e))?;

    let rows_affected = conn
        .execute(
            "UPDATE journal_entries
             SET encrypted_content = ?1, mood = ?2
             WHERE id = ?3",
            params![content_json, mood, id],
        )
        .map_err(|e| format!("Failed to update entry: {}", e))?;

    if rows_affected == 0 {
        return Err("Entry not found".to_string());
    }

    drop(conn);
    get_entry(db, id)?.ok_or_else(|| "Entry not found after update".to_string())
}

/// Delete an entry
pub fn delete_entry(db: &Database, id: &str) -> Result<bool, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let rows_affected = conn
        .execute("DELETE FROM journal_entries WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete entry: {}", e))?;

    Ok(rows_affected > 0)
}

// ============================================================================
// Statistics Operations
// ============================================================================

/// Get mood statistics for a date range
pub fn get_mood_stats(
    db: &Database,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<DailyStats>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT date, average_mood, entry_count
             FROM mood_daily_stats
             WHERE date BETWEEN ?1 AND ?2
             ORDER BY date DESC",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let stats = stmt
        .query_map(params![start_date, end_date], |row| {
            Ok(DailyStats {
                date: row.get(0)?,
                average_mood: row.get(1)?,
                entry_count: row.get(2)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row parsing failed: {}", e))?;

    Ok(stats)
}

/// Get overall statistics
pub fn get_overall_stats(db: &Database) -> Result<(f64, i32), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let result = conn
        .query_row(
            "SELECT COALESCE(AVG(mood), 0), COUNT(*) FROM journal_entries",
            [],
            |row| Ok((row.get::<_, f64>(0)?, row.get::<_, i32>(1)?)),
        )
        .map_err(|e| format!("Query failed: {}", e))?;

    Ok(result)
}

// ============================================================================
// Analytics Operations
// ============================================================================

/// Get mood distribution (count per mood level 1-5)
pub fn get_mood_distribution(db: &Database) -> Result<Vec<MoodDistribution>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT mood, COUNT(*) as count
             FROM journal_entries
             GROUP BY mood
             ORDER BY mood",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let distribution = stmt
        .query_map([], |row| {
            Ok(MoodDistribution {
                mood: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row parsing failed: {}", e))?;

    Ok(distribution)
}

/// Get streak statistics (current and longest streaks)
pub fn get_streak_stats(db: &Database) -> Result<StreakStats, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Get all unique dates with entries, ordered by date descending
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT date(created_at) as entry_date
             FROM journal_entries
             ORDER BY entry_date DESC",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let dates: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("Query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row parsing failed: {}", e))?;

    if dates.is_empty() {
        return Ok(StreakStats {
            current_streak: 0,
            longest_streak: 0,
            last_entry_date: None,
        });
    }

    let last_entry_date = dates.first().cloned();
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    // Calculate current streak (consecutive days from today or yesterday)
    let mut current_streak = 0;
    let mut check_date = chrono::Local::now().date_naive();

    // If the last entry is not today, check if it was yesterday
    if let Some(ref last_date) = last_entry_date {
        if last_date != &today {
            let yesterday = (chrono::Local::now() - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string();
            if last_date != &yesterday {
                // Streak is broken
                current_streak = 0;
            } else {
                check_date = check_date - chrono::Duration::days(1);
            }
        }
    }

    // Count consecutive days
    if current_streak == 0 && (last_entry_date.as_ref() == Some(&today) ||
        last_entry_date.as_ref() == Some(&(chrono::Local::now() - chrono::Duration::days(1)).format("%Y-%m-%d").to_string())) {
        for date_str in &dates {
            let expected = check_date.format("%Y-%m-%d").to_string();
            if date_str == &expected {
                current_streak += 1;
                check_date = check_date - chrono::Duration::days(1);
            } else {
                break;
            }
        }
    }

    // Calculate longest streak
    let mut longest_streak = 0;
    let mut temp_streak = 1;

    for i in 0..dates.len() - 1 {
        let current = chrono::NaiveDate::parse_from_str(&dates[i], "%Y-%m-%d")
            .map_err(|e| format!("Date parse failed: {}", e))?;
        let next = chrono::NaiveDate::parse_from_str(&dates[i + 1], "%Y-%m-%d")
            .map_err(|e| format!("Date parse failed: {}", e))?;

        if (current - next).num_days() == 1 {
            temp_streak += 1;
        } else {
            longest_streak = longest_streak.max(temp_streak);
            temp_streak = 1;
        }
    }
    longest_streak = longest_streak.max(temp_streak);

    // Ensure current streak isn't greater than longest
    current_streak = current_streak.min(longest_streak);
    longest_streak = longest_streak.max(current_streak);

    Ok(StreakStats {
        current_streak,
        longest_streak,
        last_entry_date,
    })
}

/// Get average mood by day of week
pub fn get_day_of_week_stats(db: &Database) -> Result<Vec<DayOfWeekStats>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    let mut stmt = conn
        .prepare(
            "SELECT
                CAST(strftime('%w', created_at) AS INTEGER) as dow,
                AVG(mood) as avg_mood,
                COUNT(*) as count
             FROM journal_entries
             GROUP BY dow
             ORDER BY dow",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let stats = stmt
        .query_map([], |row| {
            let dow: i32 = row.get(0)?;
            Ok(DayOfWeekStats {
                day_of_week: dow,
                day_name: day_names.get(dow as usize).unwrap_or(&"Unknown").to_string(),
                average_mood: row.get(1)?,
                entry_count: row.get(2)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row parsing failed: {}", e))?;

    Ok(stats)
}

/// Get mood data for a specific month (for calendar view)
pub fn get_monthly_mood_data(
    db: &Database,
    year: i32,
    month: i32,
) -> Result<Vec<CalendarDayData>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT
                date(created_at) as date,
                AVG(mood) as avg_mood,
                COUNT(*) as count
             FROM journal_entries
             WHERE strftime('%Y', created_at) = ?1
               AND strftime('%m', created_at) = ?2
             GROUP BY date(created_at)
             ORDER BY date",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let year_str = format!("{:04}", year);
    let month_str = format!("{:02}", month);

    let data = stmt
        .query_map(params![year_str, month_str], |row| {
            Ok(CalendarDayData {
                date: row.get(0)?,
                average_mood: row.get(1)?,
                entry_count: row.get(2)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row parsing failed: {}", e))?;

    Ok(data)
}
