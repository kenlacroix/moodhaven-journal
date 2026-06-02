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

pub mod analytics;
pub mod books;
pub mod journal;
pub mod signals;
pub mod still;
pub mod voice_memos;

pub use analytics::*;
pub use books::*;
pub use journal::*;
pub use signals::*;
pub use still::*;
pub use voice_memos::*;

/// User settings row
#[derive(Debug, Serialize, Deserialize)]
pub struct UserSettings {
    pub password_hash: String,
    pub password_salt: String,
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
        let _ = conn.execute(
            "ALTER TABLE journal_entries ADD COLUMN sealed_until TEXT",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE journal_entries ADD COLUMN capsule_type TEXT",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE journal_entries ADD COLUMN linked_original_id TEXT",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE journal_entries ADD COLUMN unsealed_at TEXT",
            [],
        );

        // Runtime migration: entry status column (J2)
        let _ = conn.execute(
            "ALTER TABLE journal_entries ADD COLUMN status TEXT DEFAULT 'complete'",
            [],
        );

        // Runtime migration: StillHaven session link (J3)
        let _ = conn.execute("ALTER TABLE journal_entries ADD COLUMN session_id TEXT", []);

        // Runtime migration: word count stored at write time (v1.3.0)
        let _ = conn.execute(
            "ALTER TABLE journal_entries ADD COLUMN word_count INTEGER",
            [],
        );

        // Index for session_id lookups (v1.3.0)
        let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_entries_session_id ON journal_entries(session_id)",
            [],
        );

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

        // signals table
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

        // sync_log triggers
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

        // StillHaven sync_log triggers (still_sessions + still_activation_samples tables
        // are created via schema.sql above; triggers reference them here)
        conn.execute_batch(
            "
            CREATE TRIGGER IF NOT EXISTS sync_log_still_session_insert
                AFTER INSERT ON still_sessions FOR EACH ROW
            BEGIN
                INSERT INTO sync_log(object_id, object_type, action)
                VALUES (NEW.id, 'still_session', 'insert');
            END;

            CREATE TRIGGER IF NOT EXISTS sync_log_still_session_update
                AFTER UPDATE ON still_sessions FOR EACH ROW
            BEGIN
                INSERT INTO sync_log(object_id, object_type, action)
                VALUES (NEW.id, 'still_session', 'update');
            END;

            CREATE TRIGGER IF NOT EXISTS sync_log_still_session_delete
                AFTER DELETE ON still_sessions FOR EACH ROW
            BEGIN
                INSERT INTO sync_log(object_id, object_type, action)
                VALUES (OLD.id, 'still_session', 'delete');
            END;

            CREATE TRIGGER IF NOT EXISTS sync_log_still_sample_insert
                AFTER INSERT ON still_activation_samples FOR EACH ROW
            BEGIN
                INSERT INTO sync_log(object_id, object_type, action)
                VALUES (CAST(NEW.id AS TEXT), 'still_sample', 'insert');
            END;

            CREATE TRIGGER IF NOT EXISTS sync_log_still_sample_delete
                AFTER DELETE ON still_activation_samples FOR EACH ROW
            BEGIN
                INSERT INTO sync_log(object_id, object_type, action)
                VALUES (CAST(OLD.id AS TEXT), 'still_sample', 'delete');
            END;
        ",
        )
        .map_err(|e| format!("Failed to create StillHaven sync triggers: {}", e))?;

        // voice_memos
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

        // Runtime migrations: voice memo draft columns (Phase 5)
        let _ = conn.execute("ALTER TABLE voice_memos ADD COLUMN context TEXT", []);
        let _ = conn.execute(
            "ALTER TABLE voice_memos ADD COLUMN inferred_mood INTEGER",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE voice_memos ADD COLUMN book_id TEXT NOT NULL DEFAULT 'default'",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE voice_memos ADD COLUMN reviewed INTEGER NOT NULL DEFAULT 0",
            [],
        );

        // Ensure settings table exists early so the sync engine can query it.
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS settings (
                key        TEXT PRIMARY KEY,
                value      TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );",
        )
        .map_err(|e| format!("Failed to create settings table: {}", e))?;

        // peer_sync_state
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

/// Check whether 2FA is currently enabled in the database.
/// Used by verify_password to populate TwoFactorPendingState.
pub fn is_2fa_enabled(db: &Database) -> Result<bool, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT enabled FROM two_factor_auth WHERE id = 1",
        [],
        |row| row.get::<_, i32>(0),
    );
    match result {
        Ok(v) => Ok(v == 1),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(false),
        Err(e) => Err(format!("is_2fa_enabled: {e}")),
    }
}
