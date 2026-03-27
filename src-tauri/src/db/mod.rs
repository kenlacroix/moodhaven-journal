//! Database module for MoodHaven Journal
//!
//! Handles SQLite connection, migrations, and CRUD operations
//! for encrypted journal entries.

use rusqlite::{params, Connection};
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
    /// None for currently-sealed entries (content withheld until unlock date)
    pub encrypted_content: Option<EncryptedContent>,
    pub mood: i32,
    /// Privacy mode: 0 = Open, 1 = Mindful (local analysis only), 2 = Private (no analysis)
    pub privacy_mode: i32,
    /// JSON-encoded LocationWeather captured at write time (not encrypted; city-level only)
    pub location_weather: Option<String>,
    /// Book this entry belongs to (default = 'default')
    pub book_id: String,
    /// Whether this entry is pinned/favourited
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
    /// Tag names for this entry (fetched via GROUP_CONCAT join)
    pub tags: Vec<String>,
    /// ISO timestamp until which this entry is sealed (None = not sealed)
    pub sealed_until: Option<String>,
    /// 'letter' | 'vault' | 'anniversary' — set on seal; 'anniversary' on auto-reveal
    pub capsule_type: Option<String>,
    /// ID of the original capsule entry this response was written for
    pub linked_original_id: Option<String>,
    /// ISO timestamp when this entry was revealed (None = not yet revealed)
    pub unsealed_at: Option<String>,
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

/// Bundled analytics response — all analytics data in one DB session
#[derive(Debug, Serialize, Deserialize)]
pub struct FullAnalyticsBundle {
    pub average_mood: f64,
    pub total_entries: i32,
    pub streak_stats: StreakStats,
    pub mood_distribution: Vec<MoodDistribution>,
    pub day_of_week_stats: Vec<DayOfWeekStats>,
    pub trend_data: Vec<DailyStats>,
}

/// Insights metadata — lightweight all-time stats that don't require decryption
#[derive(Debug, Serialize, Deserialize)]
pub struct InsightsMetadata {
    pub entries_this_week: i32,
    pub total_entries: i32,
    pub top_tags: Vec<String>,
}

/// Calendar day data for monthly view
#[derive(Debug, Serialize, Deserialize)]
pub struct CalendarDayData {
    pub date: String,
    pub average_mood: f64,
    pub entry_count: i32,
}

/// A named journal (book) that groups entries
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Book {
    pub id: String,
    pub name: String,
    pub emoji: String,
    pub color: String,
    pub sort_order: i32,
    pub description: Option<String>,
    pub settings: Option<String>, // JSON-encoded BookSettings
    pub created_at: String,
    pub updated_at: String,
}

/// Parse a GROUP_CONCAT tag string into a Vec of tag names.
pub fn parse_tags(tags_str: Option<String>) -> Vec<String> {
    match tags_str {
        Some(s) if !s.is_empty() => s.split(',').map(|t| t.to_string()).collect(),
        _ => vec![],
    }
}

/// Map a rusqlite row to a `JournalEntryRow`.
///
/// Expected column order (0-indexed):
/// 0  id, 1  encrypted_content, 2  mood, 3  privacy_mode,
/// 4  location_weather, 5  book_id, 6  pinned, 7  created_at,
/// 8  updated_at, 9  sealed_until, 10 capsule_type,
/// 11 linked_original_id, 12 unsealed_at, 13 tags (GROUP_CONCAT)
pub fn map_entry_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<JournalEntryRow> {
    let content_json_opt: Option<String> = row.get(1)?;
    let sealed_until: Option<String> = row.get(9)?;
    let capsule_type: Option<String> = row.get(10)?;
    let linked_original_id: Option<String> = row.get(11)?;
    let unsealed_at: Option<String> = row.get(12)?;
    let tags_str: Option<String> = row.get(13)?;

    // Withhold content for entries that are sealed but not yet revealed.
    let is_sealed = sealed_until.is_some() && unsealed_at.is_none();
    let encrypted_content = if is_sealed {
        None
    } else {
        content_json_opt
            .as_deref()
            .map(|json| {
                serde_json::from_str::<EncryptedContent>(json)
                    .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))
            })
            .transpose()?
    };

    Ok(JournalEntryRow {
        id: row.get(0)?,
        encrypted_content,
        mood: row.get(2)?,
        privacy_mode: row.get(3)?,
        location_weather: row.get(4)?,
        book_id: row
            .get::<_, Option<String>>(5)?
            .unwrap_or_else(|| "default".to_string()),
        pinned: row.get::<_, i32>(6)? != 0,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        sealed_until,
        capsule_type,
        linked_original_id,
        unsealed_at,
        tags: parse_tags(tags_str),
    })
}


/// Database state managed by Tauri
pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    /// Initialize database with schema
    pub fn new(db_path: PathBuf) -> Result<Self, String> {
        let conn =
            Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?;

        // Enable foreign keys
        conn.execute("PRAGMA foreign_keys = ON", [])
            .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;

        // Performance pragmas (safe on every startup)
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA cache_size = -8000;
             PRAGMA synchronous = NORMAL;",
        )
        .map_err(|e| format!("Failed to set performance pragmas: {}", e))?;

        // Run migrations
        conn.execute_batch(include_str!("schema.sql"))
            .map_err(|e| format!("Failed to run migrations: {}", e))?;

        // Runtime migration: add privacy_mode column if it doesn't exist yet
        // SQLite ignores duplicate column errors, so we silently swallow the error
        let _ = conn.execute(
            "ALTER TABLE journal_entries ADD COLUMN privacy_mode INTEGER NOT NULL DEFAULT 0",
            [],
        );

        // Runtime migration: add location_weather column (nullable TEXT)
        let _ = conn.execute(
            "ALTER TABLE journal_entries ADD COLUMN location_weather TEXT",
            [],
        );

        // Runtime migration: books table
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS books (
                id         TEXT PRIMARY KEY,
                name       TEXT NOT NULL,
                emoji      TEXT NOT NULL DEFAULT '📔',
                color      TEXT NOT NULL DEFAULT 'violet',
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            INSERT OR IGNORE INTO books (id, name, emoji, color, sort_order, created_at)
                VALUES ('default', 'Journal', '📔', 'violet', 0, datetime('now'));",
        )
        .map_err(|e| format!("Failed to create books table: {}", e))?;

        // Runtime migration: add book_id column to journal_entries
        let _ = conn.execute(
            "ALTER TABLE journal_entries ADD COLUMN book_id TEXT NOT NULL DEFAULT 'default'",
            [],
        );

        // Runtime migrations for books table (description + settings + updated_at)
        let _ = conn.execute("ALTER TABLE books ADD COLUMN description TEXT", []);
        let _ = conn.execute("ALTER TABLE books ADD COLUMN settings TEXT", []);
        let _ = conn.execute("ALTER TABLE books ADD COLUMN updated_at TEXT", []);
        // Backfill updated_at for any rows created before this migration
        let _ = conn.execute(
            "UPDATE books SET updated_at = created_at WHERE updated_at IS NULL",
            [],
        );

        // Runtime migration: add pinned column to journal_entries
        let _ = conn.execute(
            "ALTER TABLE journal_entries ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0",
            [],
        );

        // Runtime migrations: time capsule columns
        let _ = conn.execute("ALTER TABLE journal_entries ADD COLUMN sealed_until TEXT", []);
        let _ = conn.execute("ALTER TABLE journal_entries ADD COLUMN capsule_type TEXT", []);
        let _ = conn.execute(
            "ALTER TABLE journal_entries ADD COLUMN linked_original_id TEXT",
            [],
        );
        let _ = conn.execute("ALTER TABLE journal_entries ADD COLUMN unsealed_at TEXT", []);

        // Runtime migration: media attachments table
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS entry_media (
                id          TEXT PRIMARY KEY,
                entry_id    TEXT NOT NULL,
                filename    TEXT NOT NULL,
                mime_type   TEXT NOT NULL,
                size_bytes  INTEGER NOT NULL,
                enc_path    TEXT NOT NULL,
                created_at  TEXT NOT NULL,
                FOREIGN KEY(entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_entry_media_entry_id
                ON entry_media(entry_id);",
        )
        .map_err(|e| format!("Failed to create entry_media table: {}", e))?;

        // Runtime migration: recreate updated_at trigger to use local time
        // The original schema.sql trigger used datetime('now') (UTC). Drop and recreate
        // so existing installations also get the fix — IF NOT EXISTS won't update in-place.
        conn.execute_batch(
            "DROP TRIGGER IF EXISTS update_entry_timestamp;
             CREATE TRIGGER update_entry_timestamp
                 AFTER UPDATE ON journal_entries
                 FOR EACH ROW
                 WHEN NEW.updated_at = OLD.updated_at
             BEGIN
                 UPDATE journal_entries
                 SET updated_at = strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')
                 WHERE id = OLD.id;
             END;",
        )
        .map_err(|e| format!("Failed to recreate trigger: {}", e))?;

        // ── Phase 1: Signals + sync infrastructure ────────────────────────────

        // signals table — stores encrypted structured data points (mood check-ins,
        // Wear OS events, health snapshots, etc.). Payload is an EncryptedContent JSON
        // blob encrypted client-side by the TypeScript layer (same pattern as journal entries).
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS signals (
                id          TEXT PRIMARY KEY,
                timestamp   TEXT NOT NULL,
                type        TEXT NOT NULL,
                source      TEXT NOT NULL DEFAULT 'manual',
                payload     TEXT NOT NULL,
                synced      INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now','localtime'))
            );
            CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals(timestamp);
            CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(type);",
        )
        .map_err(|e| format!("Failed to create signals table: {}", e))?;

        // reflection_signals — many-to-many link between journal reflections and signals
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS reflection_signals (
                reflection_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
                signal_id     TEXT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
                PRIMARY KEY (reflection_id, signal_id)
            );
            CREATE INDEX IF NOT EXISTS idx_reflection_signals_entry
                ON reflection_signals(reflection_id);",
        )
        .map_err(|e| format!("Failed to create reflection_signals table: {}", e))?;

        // Extend entry_media with optional signal_id (nullable, additive)
        let _ = conn.execute(
            "ALTER TABLE entry_media ADD COLUMN signal_id TEXT REFERENCES signals(id)",
            [],
        );

        // sync_log — lightweight change-tracking table for incremental sync
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS sync_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                object_id   TEXT NOT NULL,
                object_type TEXT NOT NULL,
                action      TEXT NOT NULL,
                synced      INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now','localtime'))
            );
            CREATE INDEX IF NOT EXISTS idx_sync_log_unsynced
                ON sync_log(synced) WHERE synced = 0;",
        )
        .map_err(|e| format!("Failed to create sync_log table: {}", e))?;

        // sync_log triggers — fire on every mutation of the core tables so that any
        // future sync engine can query sync_log to find what changed since last sync.
        conn.execute_batch(
            "
            CREATE TRIGGER IF NOT EXISTS sync_log_entry_insert
                AFTER INSERT ON journal_entries FOR EACH ROW
            BEGIN
                INSERT INTO sync_log(object_id, object_type, action)
                VALUES (NEW.id, 'journal_entry', 'insert');
            END;

            CREATE TRIGGER IF NOT EXISTS sync_log_entry_update
                AFTER UPDATE ON journal_entries FOR EACH ROW
            BEGIN
                INSERT INTO sync_log(object_id, object_type, action)
                VALUES (NEW.id, 'journal_entry', 'update');
            END;

            CREATE TRIGGER IF NOT EXISTS sync_log_entry_delete
                AFTER DELETE ON journal_entries FOR EACH ROW
            BEGIN
                INSERT INTO sync_log(object_id, object_type, action)
                VALUES (OLD.id, 'journal_entry', 'delete');
            END;

            CREATE TRIGGER IF NOT EXISTS sync_log_signal_insert
                AFTER INSERT ON signals FOR EACH ROW
            BEGIN
                INSERT INTO sync_log(object_id, object_type, action)
                VALUES (NEW.id, 'signal', 'insert');
            END;

            CREATE TRIGGER IF NOT EXISTS sync_log_signal_delete
                AFTER DELETE ON signals FOR EACH ROW
            BEGIN
                INSERT INTO sync_log(object_id, object_type, action)
                VALUES (OLD.id, 'signal', 'delete');
            END;

            CREATE TRIGGER IF NOT EXISTS sync_log_book_insert
                AFTER INSERT ON books FOR EACH ROW
            BEGIN
                INSERT INTO sync_log(object_id, object_type, action)
                VALUES (NEW.id, 'book', 'insert');
            END;

            CREATE TRIGGER IF NOT EXISTS sync_log_book_update
                AFTER UPDATE ON books FOR EACH ROW
            BEGIN
                INSERT INTO sync_log(object_id, object_type, action)
                VALUES (NEW.id, 'book', 'update');
            END;

            CREATE TRIGGER IF NOT EXISTS sync_log_book_delete
                AFTER DELETE ON books FOR EACH ROW
            BEGIN
                INSERT INTO sync_log(object_id, object_type, action)
                VALUES (OLD.id, 'book', 'delete');
            END;
        ",
        )
        .map_err(|e| format!("Failed to create sync_log triggers: {}", e))?;

        // voice_memos — raw .m4a files received from Wear OS watch (or phone mic)
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS voice_memos (
                id            TEXT PRIMARY KEY,
                timestamp     TEXT NOT NULL,
                duration_ms   INTEGER NOT NULL DEFAULT 0,
                health_json   TEXT,
                file_path     TEXT NOT NULL,
                transcription TEXT,
                entry_id      TEXT,
                source        TEXT NOT NULL DEFAULT 'watch',
                created_at    TEXT NOT NULL
                    DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now','localtime'))
            );
            CREATE INDEX IF NOT EXISTS idx_voice_memos_timestamp
                ON voice_memos(timestamp);",
        )
        .map_err(|e| format!("Failed to create voice_memos table: {}", e))?;

        // Runtime migration: add raw_transcription column to voice_memos (idempotent)
        let _ = conn.execute(
            "ALTER TABLE voice_memos ADD COLUMN raw_transcription TEXT",
            [],
        );

        // Ensure settings table exists early so the sync engine can query it.
        // Also created lazily in commands/settings.rs and commands/oura.rs; all
        // definitions are identical so CREATE IF NOT EXISTS is harmless.
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS settings (
                key        TEXT PRIMARY KEY,
                value      TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );",
        )
        .map_err(|e| format!("Failed to create settings table: {}", e))?;

        // peer_sync_state — tracks last successful sync timestamp per trusted peer
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS peer_sync_state (
                peer_device_id TEXT PRIMARY KEY,
                last_sync_at   TEXT NOT NULL
            );",
        )
        .map_err(|e| format!("Failed to create peer_sync_state table: {}", e))?;

        // Runtime migration: index for book_id filtering on timeline view
        let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_entries_book_id ON journal_entries(book_id)",
            [],
        );

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

    Ok(app_data.join("moodhaven.db"))
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
    privacy_mode: i32,
    location_weather: Option<&str>,
    book_id: Option<&str>,
) -> Result<JournalEntryRow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let content_json = serde_json::to_string(encrypted_content)
        .map_err(|e| format!("JSON serialization failed: {}", e))?;

    let bid = book_id.unwrap_or("default");

    conn.execute(
        "INSERT INTO journal_entries (id, encrypted_content, mood, privacy_mode, location_weather, book_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'), strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'))",
        params![id, content_json, mood, privacy_mode, location_weather, bid],
    )
    .map_err(|e| format!("Failed to create entry: {}", e))?;

    // Fetch the created entry using the same connection (avoid deadlock)
    conn.query_row(
        "SELECT je.id, je.encrypted_content, je.mood, je.privacy_mode, je.location_weather, je.book_id, je.pinned, je.created_at, je.updated_at,
                je.sealed_until, je.capsule_type, je.linked_original_id, je.unsealed_at,
                COALESCE(GROUP_CONCAT(t.name, ','), '') as tags
         FROM journal_entries je
         LEFT JOIN entry_tags et ON je.id = et.entry_id
         LEFT JOIN tags t ON et.tag_id = t.id
         WHERE je.id = ?1
         GROUP BY je.id",
        params![id],
        map_entry_row,
    )
    .map_err(|e| format!("Failed to fetch created entry: {}", e))
}

/// Toggle the pinned state of an entry.
pub fn patch_entry_pinned(db: &Database, id: &str, pinned: bool) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let pinned_val: i32 = if pinned { 1 } else { 0 };
    conn.execute(
        "UPDATE journal_entries SET pinned = ?1 WHERE id = ?2",
        params![pinned_val, id],
    )
    .map_err(|e| format!("Failed to patch pinned: {}", e))?;
    Ok(())
}

/// Sync tags for an entry: replaces all existing tags with the provided list.
/// Tags are upserted into the `tags` table and linked via `entry_tags`.
pub fn sync_entry_tags(db: &Database, entry_id: &str, tags: &[String]) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM entry_tags WHERE entry_id = ?1",
        params![entry_id],
    )
    .map_err(|e| format!("Failed to clear entry tags: {}", e))?;

    for tag in tags {
        let name = tag.trim();
        if name.is_empty() {
            continue;
        }

        conn.execute(
            "INSERT OR IGNORE INTO tags (name) VALUES (?1)",
            params![name],
        )
        .map_err(|e| format!("Failed to upsert tag: {}", e))?;

        let tag_id: i64 = conn
            .query_row(
                "SELECT id FROM tags WHERE name = ?1 COLLATE NOCASE",
                params![name],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to get tag id: {}", e))?;

        conn.execute(
            "INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?1, ?2)",
            params![entry_id, tag_id],
        )
        .map_err(|e| format!("Failed to link entry tag: {}", e))?;
    }

    Ok(())
}

/// Get all unique tag names used in entries for a given book.
pub fn get_book_tags(db: &Database, book_id: &str) -> Result<Vec<String>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT t.name
             FROM tags t
             JOIN entry_tags et ON t.id = et.tag_id
             JOIN journal_entries je ON je.id = et.entry_id
             WHERE je.book_id = ?1
             ORDER BY t.name COLLATE NOCASE",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let tags = stmt
        .query_map(params![book_id], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Query failed: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(tags)
}

/// Attach (or replace) location_weather on an existing entry.
/// Called when geolocation resolves after the first auto-save has already created the row.
pub fn patch_entry_location_weather(
    db: &Database,
    id: &str,
    location_weather: &str,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE journal_entries SET location_weather = ?1 WHERE id = ?2",
        params![location_weather, id],
    )
    .map_err(|e| format!("Failed to patch location_weather: {}", e))?;

    Ok(())
}

/// Get a single entry by ID
pub fn get_entry(db: &Database, id: &str) -> Result<Option<JournalEntryRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let result = conn.query_row(
        "SELECT je.id, je.encrypted_content, je.mood, je.privacy_mode, je.location_weather, je.book_id, je.pinned, je.created_at, je.updated_at,
                je.sealed_until, je.capsule_type, je.linked_original_id, je.unsealed_at,
                COALESCE(GROUP_CONCAT(t.name, ','), '') as tags
         FROM journal_entries je
         LEFT JOIN entry_tags et ON je.id = et.entry_id
         LEFT JOIN tags t ON et.tag_id = t.id
         WHERE je.id = ?1
         GROUP BY je.id",
        params![id],
        map_entry_row,
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
            "SELECT je.id, je.encrypted_content, je.mood, je.privacy_mode, je.location_weather, je.book_id, je.pinned, je.created_at, je.updated_at,
                    je.sealed_until, je.capsule_type, je.linked_original_id, je.unsealed_at,
                    COALESCE(GROUP_CONCAT(t.name, ','), '') as tags
             FROM journal_entries je
             LEFT JOIN entry_tags et ON je.id = et.entry_id
             LEFT JOIN tags t ON et.tag_id = t.id
             GROUP BY je.id
             ORDER BY je.created_at DESC{}",
            limit_clause
        ))
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let entries = stmt
        .query_map([], map_entry_row)
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
            "SELECT je.id, je.encrypted_content, je.mood, je.privacy_mode, je.location_weather, je.book_id, je.pinned, je.created_at, je.updated_at,
                    je.sealed_until, je.capsule_type, je.linked_original_id, je.unsealed_at,
                    COALESCE(GROUP_CONCAT(t.name, ','), '') as tags
             FROM journal_entries je
             LEFT JOIN entry_tags et ON je.id = et.entry_id
             LEFT JOIN tags t ON et.tag_id = t.id
             WHERE date(je.created_at) BETWEEN ?1 AND ?2
             GROUP BY je.id
             ORDER BY je.created_at DESC",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let entries = stmt
        .query_map(params![start_date, end_date], map_entry_row)
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
    privacy_mode: i32,
) -> Result<JournalEntryRow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let content_json = serde_json::to_string(encrypted_content)
        .map_err(|e| format!("JSON serialization failed: {}", e))?;

    let rows_affected = conn
        .execute(
            "UPDATE journal_entries
             SET encrypted_content = ?1, mood = ?2, privacy_mode = ?3
             WHERE id = ?4",
            params![content_json, mood, privacy_mode, id],
        )
        .map_err(|e| format!("Failed to update entry: {}", e))?;

    if rows_affected == 0 {
        return Err("Entry not found".to_string());
    }

    // Fetch the updated entry using the same connection (avoid deadlock/race)
    conn.query_row(
        "SELECT je.id, je.encrypted_content, je.mood, je.privacy_mode, je.location_weather, je.book_id, je.pinned, je.created_at, je.updated_at,
                je.sealed_until, je.capsule_type, je.linked_original_id, je.unsealed_at,
                COALESCE(GROUP_CONCAT(t.name, ','), '') as tags
         FROM journal_entries je
         LEFT JOIN entry_tags et ON je.id = et.entry_id
         LEFT JOIN tags t ON et.tag_id = t.id
         WHERE je.id = ?1
         GROUP BY je.id",
        params![id],
        map_entry_row,
    )
    .map_err(|e| format!("Failed to fetch updated entry: {}", e))
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
                check_date -= chrono::Duration::days(1);
            }
        }
    }

    // Count consecutive days
    if current_streak == 0
        && (last_entry_date.as_ref() == Some(&today)
            || last_entry_date.as_ref()
                == Some(
                    &(chrono::Local::now() - chrono::Duration::days(1))
                        .format("%Y-%m-%d")
                        .to_string(),
                ))
    {
        for date_str in &dates {
            let expected = check_date.format("%Y-%m-%d").to_string();
            if date_str == &expected {
                current_streak += 1;
                check_date -= chrono::Duration::days(1);
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

    let day_names = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
    ];

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
                day_name: day_names
                    .get(dow as usize)
                    .unwrap_or(&"Unknown")
                    .to_string(),
                average_mood: row.get(1)?,
                entry_count: row.get(2)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row parsing failed: {}", e))?;

    Ok(stats)
}

/// Get all analytics data in a single DB session (one mutex acquisition)
pub fn get_full_analytics_bundle(
    db: &Database,
    trend_days: i64,
) -> Result<FullAnalyticsBundle, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Overall stats
    let (average_mood, total_entries) = conn
        .query_row(
            "SELECT COALESCE(AVG(mood), 0), COUNT(*) FROM journal_entries",
            [],
            |row| Ok((row.get::<_, f64>(0)?, row.get::<_, i32>(1)?)),
        )
        .map_err(|e| format!("Overall stats query failed: {}", e))?;

    // Streak stats
    let mut date_stmt = conn
        .prepare(
            "SELECT DISTINCT date(created_at) as entry_date
             FROM journal_entries
             ORDER BY entry_date DESC",
        )
        .map_err(|e| format!("Streak prepare failed: {}", e))?;

    let dates: Vec<String> = date_stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("Streak query failed: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let streak_stats = compute_streak_stats(dates);

    // Mood distribution
    let mut dist_stmt = conn
        .prepare(
            "SELECT mood, COUNT(*) as count FROM journal_entries GROUP BY mood ORDER BY mood",
        )
        .map_err(|e| format!("Distribution prepare failed: {}", e))?;

    let mood_distribution = dist_stmt
        .query_map([], |row| {
            Ok(MoodDistribution {
                mood: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|e| format!("Distribution query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Distribution row parsing failed: {}", e))?;

    // Day of week stats
    let day_names = [
        "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
    ];
    let mut dow_stmt = conn
        .prepare(
            "SELECT CAST(strftime('%w', created_at) AS INTEGER) as dow,
                    AVG(mood) as avg_mood, COUNT(*) as count
             FROM journal_entries GROUP BY dow ORDER BY dow",
        )
        .map_err(|e| format!("DOW prepare failed: {}", e))?;

    let day_of_week_stats = dow_stmt
        .query_map([], |row| {
            let dow: i32 = row.get(0)?;
            Ok(DayOfWeekStats {
                day_of_week: dow,
                day_name: day_names.get(dow as usize).unwrap_or(&"Unknown").to_string(),
                average_mood: row.get(1)?,
                entry_count: row.get(2)?,
            })
        })
        .map_err(|e| format!("DOW query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("DOW row parsing failed: {}", e))?;

    // Trend data
    let mut trend_stmt = conn
        .prepare(
            "SELECT date(created_at) as date, AVG(mood) as avg_mood, COUNT(*) as count
             FROM journal_entries
             WHERE date(created_at) >= date('now', ?1)
             GROUP BY date(created_at)
             ORDER BY date",
        )
        .map_err(|e| format!("Trend prepare failed: {}", e))?;

    let trend_offset = format!("-{} days", trend_days);
    let trend_data = trend_stmt
        .query_map(params![trend_offset], |row| {
            Ok(DailyStats {
                date: row.get(0)?,
                average_mood: row.get(1)?,
                entry_count: row.get(2)?,
            })
        })
        .map_err(|e| format!("Trend query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Trend row parsing failed: {}", e))?;

    Ok(FullAnalyticsBundle {
        average_mood,
        total_entries,
        streak_stats,
        mood_distribution,
        day_of_week_stats,
        trend_data,
    })
}

/// Get lightweight insights metadata (no decryption required)
pub fn get_insights_metadata(db: &Database) -> Result<InsightsMetadata, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Total entries
    let total_entries: i32 = conn
        .query_row("SELECT COUNT(*) FROM journal_entries", [], |row| row.get(0))
        .unwrap_or(0);

    // Entries since the start of the current week (Sunday-based)
    let entries_this_week: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM journal_entries
             WHERE date(created_at) >= date('now', 'weekday 0', '-7 days')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // Top 5 tags all-time by usage count
    let mut tag_stmt = conn
        .prepare(
            "SELECT t.name
             FROM entry_tags et
             JOIN tags t ON t.id = et.tag_id
             GROUP BY t.id
             ORDER BY COUNT(*) DESC
             LIMIT 5",
        )
        .map_err(|e| format!("Tag prepare failed: {}", e))?;

    let top_tags = tag_stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("Tag query failed: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(InsightsMetadata {
        entries_this_week,
        total_entries,
        top_tags,
    })
}

/// Compute streak stats from a list of unique entry dates (descending ISO order)
/// Uses the same algorithm as get_streak_stats to ensure consistent results.
fn compute_streak_stats(dates: Vec<String>) -> StreakStats {
    if dates.is_empty() {
        return StreakStats {
            current_streak: 0,
            longest_streak: 0,
            last_entry_date: None,
        };
    }

    let last_entry_date = dates.first().cloned();
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let mut current_streak = 0i32;
    let mut check_date = chrono::Local::now().date_naive();

    if let Some(ref last_date) = last_entry_date {
        if last_date != &today {
            let yesterday = (chrono::Local::now() - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string();
            if last_date != &yesterday {
                current_streak = 0;
            } else {
                check_date -= chrono::Duration::days(1);
            }
        }
    }

    if current_streak == 0
        && (last_entry_date.as_ref() == Some(&today)
            || last_entry_date.as_ref()
                == Some(
                    &(chrono::Local::now() - chrono::Duration::days(1))
                        .format("%Y-%m-%d")
                        .to_string(),
                ))
    {
        for date_str in &dates {
            let expected = check_date.format("%Y-%m-%d").to_string();
            if date_str == &expected {
                current_streak += 1;
                check_date -= chrono::Duration::days(1);
            } else {
                break;
            }
        }
    }

    let mut longest_streak = 0i32;
    let mut temp_streak = 1i32;

    for i in 0..dates.len().saturating_sub(1) {
        let current = chrono::NaiveDate::parse_from_str(&dates[i], "%Y-%m-%d");
        let next = chrono::NaiveDate::parse_from_str(&dates[i + 1], "%Y-%m-%d");
        if let (Ok(c), Ok(n)) = (current, next) {
            if (c - n).num_days() == 1 {
                temp_streak += 1;
            } else {
                longest_streak = longest_streak.max(temp_streak);
                temp_streak = 1;
            }
        }
    }
    longest_streak = longest_streak.max(temp_streak);
    current_streak = current_streak.min(longest_streak);
    longest_streak = longest_streak.max(current_streak);

    StreakStats {
        current_streak,
        longest_streak,
        last_entry_date,
    }
}

/// Get mood data for a specific month (for calendar view)
pub fn get_monthly_mood_data(
    db: &Database,
    year: i32,
    month: i32,
) -> Result<Vec<CalendarDayData>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Build date range strings for the month
    let days_in_month = days_in_month(year, month);
    let start = format!("{:04}-{:02}-01", year, month);
    let end = format!("{:04}-{:02}-{:02}", year, month, days_in_month);

    // Primary path: query the pre-computed mood_daily_stats cache (index scan on PK)
    let mut stmt = conn
        .prepare(
            "SELECT date, average_mood, entry_count
             FROM mood_daily_stats
             WHERE date >= ?1 AND date <= ?2
             ORDER BY date",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let data = stmt
        .query_map(params![start, end], |row| {
            Ok(CalendarDayData {
                date: row.get(0)?,
                average_mood: row.get(1)?,
                entry_count: row.get(2)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row parsing failed: {}", e))?;

    if !data.is_empty() {
        return Ok(data);
    }

    // Fallback: check if entries exist for this month (pre-migration data)
    let entry_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM journal_entries
             WHERE date(created_at) >= ?1 AND date(created_at) <= ?2",
            params![start, end],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if entry_count == 0 {
        return Ok(vec![]);
    }

    // Fallback query: full table scan (pre-migration path)
    let year_str = format!("{:04}", year);
    let month_str = format!("{:02}", month);
    let mut fallback_stmt = conn
        .prepare(
            "SELECT date(created_at) as date, AVG(mood) as avg_mood, COUNT(*) as count
             FROM journal_entries
             WHERE strftime('%Y', created_at) = ?1
               AND strftime('%m', created_at) = ?2
             GROUP BY date(created_at)
             ORDER BY date",
        )
        .map_err(|e| format!("Fallback prepare failed: {}", e))?;

    let fallback_data = fallback_stmt
        .query_map(params![year_str, month_str], |row| {
            Ok(CalendarDayData {
                date: row.get(0)?,
                average_mood: row.get(1)?,
                entry_count: row.get(2)?,
            })
        })
        .map_err(|e| format!("Fallback query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Fallback row parsing failed: {}", e))?;

    // Backfill mood_daily_stats for this month so future calls use the cache
    for row in &fallback_data {
        let _ = conn.execute(
            "INSERT OR REPLACE INTO mood_daily_stats (date, average_mood, entry_count)
             VALUES (?1, ?2, ?3)",
            params![row.date, row.average_mood, row.entry_count],
        );
    }

    Ok(fallback_data)
}

fn days_in_month(year: i32, month: i32) -> i32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if year % 400 == 0 || (year % 4 == 0 && year % 100 != 0) {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

// ============================================================================
// Books Operations
// ============================================================================

/// List all books ordered by sort_order
pub fn list_books(db: &Database) -> Result<Vec<Book>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, emoji, color, sort_order, description, settings, created_at,
                    COALESCE(updated_at, created_at)
             FROM books ORDER BY sort_order ASC, created_at ASC",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let books = stmt
        .query_map([], |row| {
            Ok(Book {
                id: row.get(0)?,
                name: row.get(1)?,
                emoji: row.get(2)?,
                color: row.get(3)?,
                sort_order: row.get(4)?,
                description: row.get(5)?,
                settings: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row parsing failed: {}", e))?;

    Ok(books)
}

/// Create a new book
pub fn create_book(
    db: &Database,
    id: &str,
    name: &str,
    emoji: &str,
    color: &str,
    description: Option<&str>,
    settings: Option<&str>,
) -> Result<Book, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Get next sort_order
    let sort_order: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order) + 1, 1) FROM books",
            [],
            |row| row.get(0),
        )
        .unwrap_or(1);

    conn.execute(
        "INSERT INTO books (id, name, emoji, color, sort_order, description, settings, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, strftime('%Y-%m-%dT%H:%M:%S','now','localtime'), strftime('%Y-%m-%dT%H:%M:%S','now','localtime'))",
        params![id, name, emoji, color, sort_order, description, settings],
    )
    .map_err(|e| format!("Failed to create book: {}", e))?;

    conn.query_row(
        "SELECT id, name, emoji, color, sort_order, description, settings, created_at,
                COALESCE(updated_at, created_at)
         FROM books WHERE id = ?1",
        params![id],
        |row| {
            Ok(Book {
                id: row.get(0)?,
                name: row.get(1)?,
                emoji: row.get(2)?,
                color: row.get(3)?,
                sort_order: row.get(4)?,
                description: row.get(5)?,
                settings: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        },
    )
    .map_err(|e| format!("Failed to fetch created book: {}", e))
}

/// Update a book's name, emoji, color, description, and/or settings
pub fn update_book(
    db: &Database,
    id: &str,
    name: &str,
    emoji: &str,
    color: &str,
    description: Option<&str>,
    settings: Option<&str>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let rows = conn
        .execute(
            "UPDATE books SET name = ?1, emoji = ?2, color = ?3, description = ?4, settings = ?5,
                              updated_at = strftime('%Y-%m-%dT%H:%M:%S','now','localtime')
             WHERE id = ?6",
            params![name, emoji, color, description, settings, id],
        )
        .map_err(|e| format!("Failed to update book: {}", e))?;

    if rows == 0 {
        return Err("Book not found".to_string());
    }
    Ok(())
}

/// Delete a book — moves its entries to 'default'; cannot delete 'default'
pub fn delete_book(db: &Database, id: &str) -> Result<(), String> {
    if id == "default" {
        return Err("Cannot delete the default journal".to_string());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Reassign entries
    conn.execute(
        "UPDATE journal_entries SET book_id = 'default' WHERE book_id = ?1",
        params![id],
    )
    .map_err(|e| format!("Failed to reassign entries: {}", e))?;

    conn.execute("DELETE FROM books WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete book: {}", e))?;

    Ok(())
}

// ============================================================================
// Signal Operations
// ============================================================================

/// A signal row as returned from the database
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SignalRow {
    pub id: String,
    pub timestamp: String,
    pub signal_type: String,
    pub source: String,
    /// JSON-encoded EncryptedContent — decrypted by the TypeScript layer
    pub payload: String,
    pub synced: bool,
    pub created_at: String,
}

/// Create a new signal record
pub fn create_signal(
    db: &Database,
    id: &str,
    timestamp: &str,
    signal_type: &str,
    source: &str,
    payload: &str,
) -> Result<SignalRow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO signals (id, timestamp, type, source, payload)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, timestamp, signal_type, source, payload],
    )
    .map_err(|e| format!("Failed to create signal: {}", e))?;

    let row = conn
        .query_row(
            "SELECT id, timestamp, type, source, payload, synced, created_at
             FROM signals WHERE id = ?1",
            params![id],
            |r| {
                Ok(SignalRow {
                    id: r.get(0)?,
                    timestamp: r.get(1)?,
                    signal_type: r.get(2)?,
                    source: r.get(3)?,
                    payload: r.get(4)?,
                    synced: r.get::<_, i32>(5)? != 0,
                    created_at: r.get(6)?,
                })
            },
        )
        .map_err(|e| format!("Failed to fetch created signal: {}", e))?;

    Ok(row)
}

/// List signals, optionally filtered by type
pub fn list_signals(
    db: &Database,
    signal_type: Option<&str>,
    limit: Option<i32>,
) -> Result<Vec<SignalRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let lim = limit.unwrap_or(200).min(1000);

    // Eagerly collect into Vec before stmt is dropped (avoids E0597 borrow issue)
    let rows: Vec<SignalRow> = if let Some(st) = signal_type {
        let mut stmt = conn
            .prepare(
                "SELECT id, timestamp, type, source, payload, synced, created_at
                 FROM signals WHERE type = ?1
                 ORDER BY timestamp DESC LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let collected: Vec<SignalRow> = stmt
            .query_map(params![st, lim], |r| {
                Ok(SignalRow {
                    id: r.get(0)?,
                    timestamp: r.get(1)?,
                    signal_type: r.get(2)?,
                    source: r.get(3)?,
                    payload: r.get(4)?,
                    synced: r.get::<_, i32>(5)? != 0,
                    created_at: r.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        collected
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, timestamp, type, source, payload, synced, created_at
                 FROM signals ORDER BY timestamp DESC LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let collected: Vec<SignalRow> = stmt
            .query_map(params![lim], |r| {
                Ok(SignalRow {
                    id: r.get(0)?,
                    timestamp: r.get(1)?,
                    signal_type: r.get(2)?,
                    source: r.get(3)?,
                    payload: r.get(4)?,
                    synced: r.get::<_, i32>(5)? != 0,
                    created_at: r.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        collected
    };

    Ok(rows)
}

/// Link a signal to a journal reflection entry
pub fn link_signal_to_entry(
    db: &Database,
    reflection_id: &str,
    signal_id: &str,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR IGNORE INTO reflection_signals (reflection_id, signal_id)
         VALUES (?1, ?2)",
        params![reflection_id, signal_id],
    )
    .map_err(|e| format!("Failed to link signal: {}", e))?;

    Ok(())
}

/// Get all signals linked to a journal entry
pub fn list_entry_signals(db: &Database, reflection_id: &str) -> Result<Vec<SignalRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.timestamp, s.type, s.source, s.payload, s.synced, s.created_at
             FROM signals s
             INNER JOIN reflection_signals rs ON rs.signal_id = s.id
             WHERE rs.reflection_id = ?1
             ORDER BY s.timestamp ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<SignalRow> = stmt
        .query_map(params![reflection_id], |r| {
            Ok(SignalRow {
                id: r.get(0)?,
                timestamp: r.get(1)?,
                signal_type: r.get(2)?,
                source: r.get(3)?,
                payload: r.get(4)?,
                synced: r.get::<_, i32>(5)? != 0,
                created_at: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

/// Delete a signal (and cascade through reflection_signals)
pub fn delete_signal(db: &Database, id: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM signals WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete signal: {}", e))?;

    Ok(())
}

/// Get unsynced sync_log entries (for incremental sync engines)
pub fn get_unsynced_log(db: &Database, limit: Option<i32>) -> Result<Vec<SyncLogRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(500).min(2000);

    let mut stmt = conn
        .prepare(
            "SELECT id, object_id, object_type, action, created_at
             FROM sync_log WHERE synced = 0
             ORDER BY id ASC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<SyncLogRow> = stmt
        .query_map(params![lim], |r| {
            Ok(SyncLogRow {
                id: r.get(0)?,
                object_id: r.get(1)?,
                object_type: r.get(2)?,
                action: r.get(3)?,
                created_at: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

/// Mark sync_log rows as synced up to a given log id
pub fn mark_sync_log_synced(db: &Database, up_to_id: i64) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE sync_log SET synced = 1 WHERE id <= ?1 AND synced = 0",
        params![up_to_id],
    )
    .map_err(|e| format!("Failed to mark sync log synced: {}", e))?;

    Ok(())
}

/// Sync log row
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncLogRow {
    pub id: i64,
    pub object_id: String,
    pub object_type: String,
    pub action: String,
    pub created_at: String,
}

// ============================================================================
// Voice Memo Operations (Wear OS audio recordings)
// ============================================================================

/// A voice memo row as returned from the database
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VoiceMemoRow {
    pub id: String,
    pub timestamp: String,
    pub duration_ms: i64,
    /// Optional heart-rate JSON captured at recording time: `{"hr":78}`
    pub health_json: Option<String>,
    /// Relative path from app_data_dir, e.g. `voice_memos/<id>.m4a`
    pub file_path: String,
    /// Whisper.cpp transcription (null until processed)
    pub transcription: Option<String>,
    /// Linked journal entry id (null until user attaches it)
    pub entry_id: Option<String>,
    /// Origin: "watch" | "phone"
    pub source: String,
    pub created_at: String,
}

/// Insert a voice memo record.
/// `file_path` is the relative path stored in the DB (`voice_memos/<id>.m4a`).
pub fn create_voice_memo(
    db: &Database,
    id: &str,
    timestamp: &str,
    duration_ms: i64,
    health_json: Option<&str>,
    file_path: &str,
    source: &str,
) -> Result<VoiceMemoRow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO voice_memos
             (id, timestamp, duration_ms, health_json, file_path, source, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6,
                 strftime('%Y-%m-%dT%H:%M:%S','now','localtime'))",
        params![id, timestamp, duration_ms, health_json, file_path, source],
    )
    .map_err(|e| format!("Failed to insert voice memo: {}", e))?;

    conn.query_row(
        "SELECT id, timestamp, duration_ms, health_json, file_path,
                transcription, entry_id, source, created_at
         FROM voice_memos WHERE id = ?1",
        params![id],
        |r| {
            Ok(VoiceMemoRow {
                id: r.get(0)?,
                timestamp: r.get(1)?,
                duration_ms: r.get(2)?,
                health_json: r.get(3)?,
                file_path: r.get(4)?,
                transcription: r.get(5)?,
                entry_id: r.get(6)?,
                source: r.get(7)?,
                created_at: r.get(8)?,
            })
        },
    )
    .map_err(|e| format!("Failed to fetch created voice memo: {}", e))
}

/// List voice memos, newest first, up to `limit` rows.
pub fn list_voice_memos(db: &Database, limit: Option<i32>) -> Result<Vec<VoiceMemoRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(100).min(1000);

    let mut stmt = conn
        .prepare(
            "SELECT id, timestamp, duration_ms, health_json, file_path,
                    transcription, entry_id, source, created_at
             FROM voice_memos
             ORDER BY timestamp DESC
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![lim], |r| {
            Ok(VoiceMemoRow {
                id: r.get(0)?,
                timestamp: r.get(1)?,
                duration_ms: r.get(2)?,
                health_json: r.get(3)?,
                file_path: r.get(4)?,
                transcription: r.get(5)?,
                entry_id: r.get(6)?,
                source: r.get(7)?,
                created_at: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

/// Get a single voice memo by id.
pub fn get_voice_memo(db: &Database, id: &str) -> Result<Option<VoiceMemoRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let result = conn.query_row(
        "SELECT id, timestamp, duration_ms, health_json, file_path,
                transcription, entry_id, source, created_at
         FROM voice_memos WHERE id = ?1",
        params![id],
        |r| {
            Ok(VoiceMemoRow {
                id: r.get(0)?,
                timestamp: r.get(1)?,
                duration_ms: r.get(2)?,
                health_json: r.get(3)?,
                file_path: r.get(4)?,
                transcription: r.get(5)?,
                entry_id: r.get(6)?,
                source: r.get(7)?,
                created_at: r.get(8)?,
            })
        },
    );

    match result {
        Ok(row) => Ok(Some(row)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Query failed: {}", e)),
    }
}

/// Delete a voice memo record (caller is responsible for deleting the file).
pub fn delete_voice_memo(db: &Database, id: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM voice_memos WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete voice memo: {}", e))?;

    Ok(())
}

/// Patch the transcription text for a voice memo.
pub fn patch_voice_memo_transcription(
    db: &Database,
    id: &str,
    transcription: &str,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE voice_memos SET transcription = ?1 WHERE id = ?2",
        params![transcription, id],
    )
    .map_err(|e| format!("Failed to patch transcription: {}", e))?;

    Ok(())
}

/// Link a voice memo to a journal entry.
pub fn link_voice_memo_to_entry(
    db: &Database,
    memo_id: &str,
    entry_id: &str,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE voice_memos SET entry_id = ?1 WHERE id = ?2",
        params![entry_id, memo_id],
    )
    .map_err(|e| format!("Failed to link voice memo: {}", e))?;

    Ok(())
}
