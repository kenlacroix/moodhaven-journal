//! Database module for MoodHaven Journal
//!
//! Handles SQLite connection, migrations, and CRUD operations
//! for encrypted journal entries.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Manager;
use zeroize::Zeroizing;

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

// ============================================================================
// SQLCipher encryption state sidecar
// ============================================================================

/// Persisted alongside moodhaven.db as db_state.json.
/// Records whether the database file is SQLCipher-encrypted and the PBKDF2 salt
/// needed to derive the key before the database can be opened.
/// Must be readable without opening the database.
#[derive(Serialize, Deserialize, Default)]
pub struct DbStateFile {
    pub encrypted: bool,
    /// Base64-encoded PBKDF2 salt (copied from user_settings.password_salt at migration time).
    pub salt: Option<String>,
}

fn db_state_path(db_path: &Path) -> PathBuf {
    db_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("db_state.json")
}

pub fn read_db_state(db_path: &Path) -> DbStateFile {
    let path = db_state_path(db_path);
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_db_state(db_path: &Path, state: &DbStateFile) -> Result<(), String> {
    let path = db_state_path(db_path);
    let json = serde_json::to_string(state).map_err(|e| format!("serialize db_state: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("write db_state.json: {e}"))?;
    Ok(())
}

// ============================================================================
// User settings row
// ============================================================================

/// User settings row
#[derive(Debug, Serialize, Deserialize)]
pub struct UserSettings {
    pub password_hash: String,
    pub password_salt: String,
}

/// Database state managed by Tauri
pub struct Database {
    pub conn: Mutex<Connection>,
    /// Absolute path to moodhaven.db (needed by apply_key / encrypt_in_place).
    pub path: PathBuf,
}

impl Database {
    /// Initialize database. If db_state.json reports the file is already encrypted,
    /// the connection is opened but no pragmas or migrations are run — the caller must
    /// call `apply_key()` after the user authenticates before the connection is usable.
    pub fn new(db_path: PathBuf) -> Result<Self, String> {
        let mut state = read_db_state(&db_path);

        // Recovery: if moodhaven_enc.db exists, a previous migration was interrupted.
        // Determine how far it got based on the salt pre-write and encrypted flag.
        let tmp_path = db_path.with_file_name("moodhaven_enc.db");
        if tmp_path.exists() {
            if !state.encrypted {
                if state.salt.is_some() {
                    // Salt was pre-written before export (v1.7.5+): migration was in progress.
                    // Update db_state.json to encrypted:true and complete the rename below.
                    log::warn!(
                        "[sqlcipher] Found moodhaven_enc.db with pre-written salt — \
                         completing interrupted migration (SQLC-004)"
                    );
                    let _ = write_db_state(
                        &db_path,
                        &DbStateFile {
                            encrypted: true,
                            salt: state.salt.clone(),
                        },
                    );
                    state.encrypted = true;
                } else {
                    // No salt: crash occurred before the pre-write (pre-v1.7.5 path) or
                    // the revert path was hit. The encrypted tmp cannot be keyed without the
                    // salt — discard it and fall through to open the original plaintext DB.
                    log::warn!(
                        "[sqlcipher] Found moodhaven_enc.db without salt — \
                         discarding orphaned file (SQLC-004)"
                    );
                    let _ = std::fs::remove_file(&tmp_path);
                }
            } else {
                log::info!("[sqlcipher] Completing interrupted migration on startup");
            }
            if state.encrypted {
                #[cfg(target_os = "windows")]
                if let Err(e) = std::fs::remove_file(&db_path) {
                    log::warn!("[sqlcipher] Windows pre-rename remove failed: {e}");
                }
                std::fs::rename(&tmp_path, &db_path)
                    .map_err(|e| format!("[sqlcipher] Startup recovery rename failed: {e}"))?;
            }
        }

        let conn =
            Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?;

        if !state.encrypted {
            if let Err(migration_err) = Self::run_pragmas_and_migrations(&conn) {
                // Probe: if migration failed because the file is a SQLCipher binary opened
                // without a key (db_state.json missing or stale), detect it and write a
                // recovery marker so the next startup takes the encrypted path.
                let is_ciphertext = conn
                    .execute_batch("SELECT count(*) FROM sqlite_master;")
                    .is_err();
                if is_ciphertext {
                    log::warn!(
                        "[sqlcipher] Detected encrypted database without db_state.json \
                         — writing recovery state"
                    );
                    let _ = write_db_state(
                        &db_path,
                        &DbStateFile {
                            encrypted: true,
                            salt: None,
                        },
                    );
                    return Ok(Self {
                        conn: Mutex::new(conn),
                        path: db_path,
                    });
                }
                return Err(migration_err);
            }
        }

        Ok(Self {
            conn: Mutex::new(conn),
            path: db_path,
        })
    }

    /// Apply a SQLCipher key to the database connection after the user authenticates.
    /// Opens a fresh connection with PRAGMA hexkey set, verifies the key is correct,
    /// runs all pragmas and migrations, then replaces the stored connection.
    /// Called by `verify_password` when the DB is already encrypted.
    pub fn apply_key(&self, key: &[u8; 32]) -> Result<(), String> {
        let hex_key = Zeroizing::new(hex::encode(key));
        let new_conn =
            Connection::open(&self.path).map_err(|e| format!("reopen db for key: {e}"))?;
        new_conn
            .execute_batch(&format!("PRAGMA hexkey = '{}';", *hex_key))
            .map_err(|e| format!("PRAGMA hexkey: {e}"))?;
        new_conn
            .execute_batch("SELECT count(*) FROM sqlite_master;")
            .map_err(|_| "wrong key".to_string())?;
        Self::run_pragmas_and_migrations(&new_conn)?;
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        *conn = new_conn;
        Ok(())
    }

    /// Encrypt the database in-place using sqlcipher_export.
    /// Called by `unlock_app` the first time the user authenticates on an unencrypted DB.
    /// After this returns, db_state.json is updated and the stored connection uses the key.
    pub fn encrypt_in_place(&self, key: &[u8; 32], salt_b64: &str) -> Result<(), String> {
        let hex_key = Zeroizing::new(hex::encode(key));
        let tmp_path = self.path.with_file_name("moodhaven_enc.db");
        let tmp_str = tmp_path.to_str().ok_or("non-UTF8 db path")?;
        // Reject paths with single quotes — would break inline SQL
        if tmp_str.contains('\'') {
            return Err("Database path contains single quotes — cannot encrypt".to_string());
        }
        let tmp_str = tmp_str.to_string();

        // Clean up any previous incomplete attempt
        let _ = std::fs::remove_file(&tmp_path);

        // Pre-write the salt before creating moodhaven_enc.db. If a crash occurs
        // before the encrypted:true write in step 3, SQLC-004 recovery in Database::new()
        // will find salt.is_some() and can complete the migration on next startup.
        write_db_state(
            &self.path,
            &DbStateFile {
                encrypted: false,
                salt: Some(salt_b64.to_string()),
            },
        )?;

        // 1. Flush WAL and export to encrypted tmp file (hold conn lock for this block)
        {
            let conn = self.conn.lock().map_err(|e| e.to_string())?;
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
            conn.execute_batch(&format!(
                "ATTACH DATABASE '{tmp_str}' AS encrypted KEY \"x'{}'\";
                 SELECT sqlcipher_export('encrypted');
                 DETACH DATABASE encrypted;",
                *hex_key
            ))
            .map_err(|e| format!("sqlcipher_export: {e}"))?;
        }

        // 2. Verify the exported file opens with the key
        {
            let verify = Connection::open(&tmp_path).map_err(|e| format!("verify open: {e}"))?;
            verify
                .execute_batch(&format!("PRAGMA hexkey = '{}';", *hex_key))
                .map_err(|e| format!("verify hexkey: {e}"))?;
            verify
                .execute_batch("SELECT count(*) FROM sqlite_master;")
                .map_err(|_| "encrypted db unreadable after export".to_string())?;
        }

        // 3. Write db_state.json BEFORE releasing the file handle. This must happen before
        //    the rename: if a crash occurs between here and step 6, Database::new() will
        //    detect moodhaven_enc.db still present and complete the rename on next startup.
        write_db_state(
            &self.path,
            &DbStateFile {
                encrypted: true,
                salt: Some(salt_b64.to_string()),
            },
        )?;

        // 4. Release the original file by replacing the conn with an in-memory placeholder
        {
            let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
            let placeholder =
                Connection::open_in_memory().map_err(|e| format!("placeholder: {e}"))?;
            *conn = placeholder;
            // Original connection drops here, releasing the file handle
        }

        // 5. Remove WAL/SHM for the original file (should be empty after TRUNCATE checkpoint).
        //    On Windows, SQLite in WAL mode may keep the SHM handle open briefly after the
        //    Connection is dropped. Retry a few times before giving up.
        for _ in 0..5 {
            let wal_gone = std::fs::remove_file(self.path.with_extension("db-wal")).is_ok()
                || !self.path.with_extension("db-wal").exists();
            let shm_gone = std::fs::remove_file(self.path.with_extension("db-shm")).is_ok()
                || !self.path.with_extension("db-shm").exists();
            if wal_gone && shm_gone {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        // 6. Rename encrypted tmp to final path.
        //    On Windows, rename fails if the destination exists — move the original to a
        //    backup first so we can restore it on failure rather than deleting it outright.
        //    Retry up to 5 times with 50 ms gaps to handle delayed Windows handle release.
        #[cfg(target_os = "windows")]
        let rename_result: Result<(), String> = {
            let backup = self.path.with_file_name("moodhaven_old.db");
            let mut last_err = String::new();
            let mut success = false;
            for attempt in 0..5u8 {
                if attempt > 0 {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
                match std::fs::rename(&self.path, &backup) {
                    Err(e) => {
                        last_err = format!("backup original db: {e}");
                    }
                    Ok(()) => match std::fs::rename(&tmp_path, &self.path) {
                        Ok(()) => {
                            let _ = std::fs::remove_file(&backup);
                            success = true;
                            break;
                        }
                        Err(e) => {
                            let _ = std::fs::rename(&backup, &self.path);
                            last_err = format!("rename encrypted db: {e}");
                        }
                    },
                }
            }
            if success {
                Ok(())
            } else {
                Err(last_err)
            }
        };

        #[cfg(not(target_os = "windows"))]
        let rename_result: Result<(), String> =
            std::fs::rename(&tmp_path, &self.path).map_err(|e| format!("rename encrypted db: {e}"));

        if let Err(e) = rename_result {
            // Revert db_state.json and restore the original connection so the app stays usable.
            let _ = write_db_state(
                &self.path,
                &DbStateFile {
                    encrypted: false,
                    salt: None,
                },
            );
            let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
            match Connection::open(&self.path) {
                Ok(restored) if Self::run_pragmas_and_migrations(&restored).is_ok() => {
                    *conn = restored;
                }
                _ => log::error!(
                    "[sqlcipher] Could not restore DB connection after migration failure \
                     — restart required"
                ),
            }
            return Err(e);
        }

        // 7. Open final keyed connection to the encrypted file
        {
            let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
            let final_conn = Connection::open(&self.path)
                .map_err(|e| format!("open final encrypted db: {e}"))?;
            final_conn
                .execute_batch(&format!("PRAGMA hexkey = '{}';", *hex_key))
                .map_err(|e| format!("final hexkey: {e}"))?;
            final_conn
                .execute_batch("SELECT count(*) FROM sqlite_master;")
                .map_err(|_| "final encrypted db unreadable".to_string())?;
            // Pragmas only (migrations already ran on the pre-encryption DB)
            final_conn
                .execute_batch(
                    "PRAGMA foreign_keys = ON;
                     PRAGMA journal_mode = WAL;
                     PRAGMA cache_size = -8000;
                     PRAGMA synchronous = NORMAL;",
                )
                .map_err(|e| format!("final pragmas: {e}"))?;
            *conn = final_conn;
        }

        Ok(())
    }

    /// Returns true if db_state.json reports the database is SQLCipher-encrypted.
    pub fn is_encrypted(&self) -> bool {
        read_db_state(&self.path).encrypted
    }

    /// Returns the base64-encoded PBKDF2 salt from db_state.json, if present.
    pub fn db_salt(&self) -> Option<String> {
        read_db_state(&self.path).salt
    }

    /// Run all pragmas and schema migrations on an open connection.
    /// Called by `new()` for unencrypted databases and by `apply_key()` after
    /// the key is set. All migrations use `IF NOT EXISTS` or `ALTER TABLE ADD COLUMN`
    /// so they are safe to run on an already-migrated database.
    fn run_pragmas_and_migrations(conn: &Connection) -> Result<(), String> {
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

        // still_signal_links — associates a still_trigger signal with the session it spawned (v1.5.0)
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS still_signal_links (
                session_id TEXT NOT NULL REFERENCES still_sessions(id) ON DELETE CASCADE,
                signal_id  TEXT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
                PRIMARY KEY (session_id, signal_id)
            );",
        )
        .map_err(|e| format!("Failed to create still_signal_links table: {}", e))?;

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

        // Runtime migration: activities + entry_activities tables (v1.8.0)
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS activities (
                id         TEXT PRIMARY KEY,
                name       TEXT NOT NULL UNIQUE,
                emoji      TEXT NOT NULL DEFAULT '✨',
                is_custom  INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS entry_activities (
                entry_id    TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
                activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
                PRIMARY KEY (entry_id, activity_id)
            );
            CREATE INDEX IF NOT EXISTS idx_entry_activities_entry
                ON entry_activities(entry_id);
            CREATE INDEX IF NOT EXISTS idx_entry_activities_activity
                ON entry_activities(activity_id);",
        )
        .map_err(|e| format!("Failed to create activities tables: {}", e))?;

        // Seed predefined activities on first run (idempotent — skipped if rows exist)
        {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM activities WHERE is_custom = 0",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);

            if count == 0 {
                const PREDEFINED: &[(&str, &str)] = &[
                    ("exercise", "🏃"),
                    ("social", "👥"),
                    ("work", "💼"),
                    ("reading", "📚"),
                    ("creative", "🎨"),
                    ("meditation", "🧘"),
                    ("good_sleep", "😴"),
                    ("poor_sleep", "😵"),
                    ("nature", "🌿"),
                    ("family", "🏠"),
                    ("cooking", "🍳"),
                    ("music", "🎵"),
                    ("learning", "📖"),
                    ("travel", "✈️"),
                    ("gaming", "🎮"),
                ];
                for (i, (name, emoji)) in PREDEFINED.iter().enumerate() {
                    let id = format!("act_{}", name);
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO activities
                             (id, name, emoji, is_custom, sort_order, created_at)
                         VALUES (?1, ?2, ?3, 0, ?4, datetime('now'))",
                        params![id, name, emoji, i as i32],
                    );
                }
            }
        }

        Ok(())
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

/// Check if user has set up password.
/// For an encrypted DB the password must exist (it was set before encryption ran),
/// so we return true without touching the connection.
pub fn has_password(db: &Database) -> Result<bool, String> {
    if db.is_encrypted() {
        return Ok(true);
    }
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
