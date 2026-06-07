//! Database module for MoodHaven Journal
//!
//! Handles SQLite connection, migrations, and CRUD operations
//! for encrypted journal entries.

use rusqlite::{params, Connection, OpenFlags};
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
        //
        // CRITICAL (data-loss fix): the encrypted tmp is produced by sqlcipher_export,
        // which pre-writes the salt to db_state.json BEFORE the export runs. If the
        // process is killed (crash / SIGKILL / power loss) mid-export, moodhaven_enc.db
        // is left TRUNCATED while the original plaintext moodhaven.db is still intact.
        // Promoting (renaming) the tmp over the original here — with no key to verify it —
        // would clobber good data with a corrupt file and lock the user out permanently.
        //
        // Therefore Database::new NEVER renames the tmp over the original. The atomic
        // promotion is deferred to apply_key(), which runs only after the user
        // authenticates and holds the derived key, so the tmp can actually be opened and
        // verified before it replaces the original. See `pending_promotion` handling there.
        let tmp_path = db_path.with_file_name("moodhaven_enc.db");
        if tmp_path.exists() {
            if state.encrypted {
                // db_state already says encrypted:true. This happens when the crash landed
                // AFTER the export's encrypted:true write (step 3) but before the rename, or
                // when a previous startup already flipped the flag. The tmp is the live DB
                // but it has NOT been key-verified — defer promotion to apply_key().
                log::info!(
                    "[sqlcipher] Found moodhaven_enc.db with encrypted db_state — \
                     deferring key-verified promotion to apply_key (startup recovery)"
                );
            } else if state.salt.is_some() {
                // Salt pre-written before export (v1.7.5+) but db_state still encrypted:false:
                // the crash may have happened mid-export, so the tmp could be truncated. Flip
                // db_state to encrypted:true so verify_password derives the key and routes to
                // apply_key, which key-verifies the tmp before promoting it. The original
                // plaintext moodhaven.db is left fully intact in case the tmp is corrupt.
                log::warn!(
                    "[sqlcipher] Found moodhaven_enc.db with pre-written salt — \
                     deferring key-verified promotion to apply_key, original preserved (SQLC-004)"
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
        }

        // Decide whether this is a genuine first run (no existing setup → safe to CREATE
        // a fresh DB) or an existing install (encrypted, or a salt was already written →
        // the DB MUST already exist). For existing installs we open WITHOUT the CREATE
        // flag so a missing file surfaces as an error instead of fabricating an empty
        // decoy that an unkeyed `SELECT count(*)` would wrongly accept as the real DB.
        let is_existing_setup = state.encrypted || state.salt.is_some();
        let conn = if is_existing_setup {
            if !db_path.exists() {
                return Err(
                    "database file missing: db_state.json reports an existing setup but \
                     moodhaven.db is absent — refusing to fabricate an empty database"
                        .to_string(),
                );
            }
            Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_WRITE)
                .map_err(|e| format!("Failed to open database: {}", e))?
        } else {
            // Genuine first run / fresh install: create the file and migrate.
            Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?
        };

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

    /// Open a SQLCipher database file with a raw key and confirm it is readable.
    ///
    /// Uses the SAME raw `x'...'` literal form used to ENCRYPT (encrypt_in_place's
    /// `ATTACH ... KEY "x'...'"`). `PRAGMA hexkey` instead runs the bytes through
    /// SQLCipher's KDF, deriving a DIFFERENT key → "file is not a database" on every
    /// read. The format!-built SQL holds the plaintext key, so wrap it in Zeroizing.
    ///
    /// Returns the opened connection on success, or an error if the key is wrong or the
    /// file is corrupt/truncated (the `SELECT count(*)` read will fail in either case).
    fn open_keyed(path: &Path, hex_key: &str) -> Result<Connection, String> {
        let conn = Connection::open(path).map_err(|e| format!("open keyed db: {e}"))?;
        let pragma = Zeroizing::new(format!("PRAGMA key = \"x'{hex_key}'\";"));
        conn.execute_batch(&pragma)
            .map_err(|e| format!("PRAGMA key: {e}"))?;
        conn.execute_batch("SELECT count(*) FROM sqlite_master;")
            .map_err(|_| "wrong key or corrupt database".to_string())?;
        Ok(conn)
    }

    /// Apply a SQLCipher key to the database connection after the user authenticates.
    ///
    /// Two cases:
    ///
    /// 1. **Deferred promotion** — a pending `moodhaven_enc.db` exists (an interrupted
    ///    migration that `Database::new` intentionally did NOT promote, to avoid clobbering
    ///    the intact original with a possibly-truncated tmp). We now hold the derived key,
    ///    so we can actually open the tmp and verify it. ONLY if it opens cleanly do we
    ///    atomically promote it (rename over `moodhaven.db`, write `db_state {encrypted:true}`)
    ///    and adopt its connection. If the tmp is corrupt/truncated, the original plaintext
    ///    `moodhaven.db` is left untouched, the bad tmp is discarded, `db_state` is reverted
    ///    to `{encrypted:false}`, and a clear error is returned — the next unlock attempt then
    ///    falls back to the intact plaintext DB with no data loss.
    ///
    /// 2. **Normal** — no pending tmp: open `moodhaven.db` with the key as before.
    ///
    /// In both cases the keyed connection has all pragmas + migrations applied, then
    /// replaces the stored connection. Called by `verify_password` on an encrypted DB.
    pub fn apply_key(&self, key: &[u8; 32]) -> Result<(), String> {
        let hex_key = Zeroizing::new(hex::encode(key));
        let tmp_path = self.path.with_file_name("moodhaven_enc.db");

        if tmp_path.exists() {
            return self.promote_pending_tmp(&tmp_path, &hex_key);
        }

        let new_conn = Self::open_keyed(&self.path, &hex_key)?;
        Self::run_pragmas_and_migrations(&new_conn)?;
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        *conn = new_conn;
        Ok(())
    }

    /// Promote a pending, interrupted-migration `moodhaven_enc.db` ONLY after key-verifying it.
    /// On verify failure the original `moodhaven.db` is preserved and the tmp discarded.
    fn promote_pending_tmp(&self, tmp_path: &Path, hex_key: &str) -> Result<(), String> {
        // Key-verify the tmp BEFORE touching the original. If the export was interrupted the
        // tmp is truncated and this open fails — leaving the original plaintext DB intact.
        let keyed = match Self::open_keyed(tmp_path, hex_key) {
            Ok(conn) => conn,
            Err(e) => {
                // The tmp could not be opened with the derived key. This is either a wrong
                // password OR a corrupt/truncated tmp. Distinguish by probing the original:
                // if moodhaven.db is a readable, POPULATED plaintext DB, the tmp is the
                // corrupt one → discard it and revert db_state so the user can unlock
                // against the original.
                //
                // Open WITHOUT the CREATE flag: a missing original must NOT be silently
                // re-created as an empty file (SQLCipher would then read it as an empty
                // plaintext DB and we would wrongly "revert to the intact original",
                // destroying the only recoverable copy). An empty/zero-table DB is likewise
                // NOT a valid original — require a KNOWN real table (`journal_entries`) to be
                // present so an auto-created or otherwise empty decoy is never accepted as the
                // user's real plaintext data.
                let original_is_plaintext =
                    Connection::open_with_flags(&self.path, OpenFlags::SQLITE_OPEN_READ_WRITE)
                        .ok()
                        .map(|c| {
                            c.query_row(
                                "SELECT count(*) FROM sqlite_master \
                                 WHERE type = 'table' AND name = 'journal_entries';",
                                [],
                                |r| r.get::<_, i64>(0),
                            )
                            .map(|n| n > 0)
                            .unwrap_or(false)
                        })
                        .unwrap_or(false);
                if original_is_plaintext {
                    log::error!(
                        "[sqlcipher] Pending moodhaven_enc.db failed key verification while the \
                         original moodhaven.db is a readable plaintext DB — discarding the corrupt \
                         tmp and reverting to the intact original (data preserved): {e}"
                    );
                    let _ = std::fs::remove_file(tmp_path);
                    // Clear ONLY the encrypted flag — preserve the existing salt. Nulling it
                    // would irreversibly strand a recoverable encrypted DB (F3). We only reach
                    // here after positively confirming a populated plaintext original above.
                    let _ = write_db_state(
                        &self.path,
                        &DbStateFile {
                            encrypted: false,
                            salt: read_db_state(&self.path).salt,
                        },
                    );
                    return Err(
                        "Interrupted encryption left a corrupt file; your original data was \
                         preserved. Please unlock again."
                            .to_string(),
                    );
                }
                // Original is not a plaintext DB (already encrypted, or absent). Could not
                // verify the tmp — most likely a wrong password. Leave both files untouched
                // so a correct password on retry can still promote the tmp.
                return Err(e);
            }
        };

        // Tmp opened cleanly with the key → safe to promote atomically. Drop the verify
        // connection first so the file handle is released before the rename (Windows).
        Self::run_pragmas_and_migrations(&keyed)?;
        drop(keyed);

        // Release the passive connection Database::new opened on the original moodhaven.db
        // (replace with an in-memory placeholder) so the file handle is freed before we
        // rename over it — required on Windows, harmless on POSIX.
        {
            let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
            let placeholder =
                Connection::open_in_memory().map_err(|e| format!("placeholder: {e}"))?;
            *conn = placeholder;
        }

        // Drop the original plaintext DB's stale WAL/SHM so they don't bleed into the
        // promoted encrypted file. Retry briefly for delayed Windows handle release.
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

        // Drop the encrypted tmp's own WAL/SHM so stale sidecar files don't survive the
        // rename and corrupt the promoted DB (F4). NotFound is fine — ignore all errors.
        let _ = std::fs::remove_file(tmp_path.with_extension("db-wal"));
        let _ = std::fs::remove_file(tmp_path.with_extension("db-shm"));

        Self::atomic_promote(&self.path, tmp_path)?;

        // db_state is now authoritative: the encrypted file is live at moodhaven.db.
        write_db_state(
            &self.path,
            &DbStateFile {
                encrypted: true,
                salt: read_db_state(&self.path).salt,
            },
        )?;

        // Open the final keyed connection on the promoted file and adopt it.
        let final_conn = Self::open_keyed(&self.path, hex_key)?;
        Self::run_pragmas_and_migrations(&final_conn)?;
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        *conn = final_conn;
        log::info!("[sqlcipher] Promoted interrupted-migration tmp after key verification");
        Ok(())
    }

    /// Atomically replace `dst` (the original moodhaven.db) with `src` (moodhaven_enc.db).
    /// Mirrors encrypt_in_place's rename strategy: on Windows the destination must be moved
    /// aside first (rename fails if the destination exists), and Windows may keep the file
    /// handle open briefly after a Connection drops, so both steps retry.
    fn atomic_promote(dst: &Path, src: &Path) -> Result<(), String> {
        #[cfg(target_os = "windows")]
        {
            let backup = dst.with_file_name("moodhaven_old.db");
            let mut last_err = String::new();
            for attempt in 0..5u8 {
                if attempt > 0 {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
                // If the original is gone (crash mid-rename), promote the tmp directly.
                if !dst.exists() {
                    match std::fs::rename(src, dst) {
                        Ok(()) => return Ok(()),
                        Err(e) => {
                            last_err = format!("rename encrypted db: {e}");
                            continue;
                        }
                    }
                }
                match std::fs::rename(dst, &backup) {
                    Err(e) => last_err = format!("backup original db: {e}"),
                    Ok(()) => match std::fs::rename(src, dst) {
                        Ok(()) => {
                            let _ = std::fs::remove_file(&backup);
                            return Ok(());
                        }
                        Err(e) => {
                            let _ = std::fs::rename(&backup, dst);
                            last_err = format!("rename encrypted db: {e}");
                        }
                    },
                }
            }
            Err(last_err)
        }

        #[cfg(not(target_os = "windows"))]
        {
            // rename(2) atomically replaces the destination on POSIX.
            std::fs::rename(src, dst).map_err(|e| format!("rename encrypted db: {e}"))
        }
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
            let attach_sql = Zeroizing::new(format!(
                "ATTACH DATABASE '{tmp_str}' AS encrypted KEY \"x'{}'\";
                 SELECT sqlcipher_export('encrypted');
                 DETACH DATABASE encrypted;",
                *hex_key
            ));
            conn.execute_batch(&attach_sql)
                .map_err(|e| format!("sqlcipher_export: {e}"))?;
        }

        // 2. Verify the exported file opens with the key
        {
            let verify = Connection::open(&tmp_path).map_err(|e| format!("verify open: {e}"))?;
            let verify_pragma = Zeroizing::new(format!("PRAGMA key = \"x'{}'\";", *hex_key));
            verify
                .execute_batch(&verify_pragma)
                .map_err(|e| format!("verify key: {e}"))?;
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
            let final_pragma = Zeroizing::new(format!("PRAGMA key = \"x'{}'\";", *hex_key));
            final_conn
                .execute_batch(&final_pragma)
                .map_err(|e| format!("final key: {e}"))?;
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

#[cfg(test)]
mod sqlcipher_key_tests {
    use rusqlite::Connection;

    // Regression guard for the SQLCipher key-application bug: the DB is encrypted
    // with a RAW key via `ATTACH ... KEY "x'<hex>'"`, so it MUST be read back with
    // the same raw form `PRAGMA key = "x'<hex>'"`. `PRAGMA hexkey` instead decodes
    // the hex and runs PBKDF2 over the bytes, deriving a DIFFERENT key — which
    // silently broke encryption-at-rest (the migration verify always failed, so the
    // DB stayed plaintext). This test fails if a read path ever diverges from the
    // encryption form again.
    #[test]
    fn raw_key_export_roundtrip_opens_with_pragma_key() {
        let hex_key: String = (0u8..32)
            .map(|b| format!("{:02x}", b.wrapping_mul(7)))
            .collect();
        let dir = std::env::temp_dir();
        let pid = std::process::id();
        let plain = dir.join(format!("mh_sqlc_plain_{pid}.db"));
        let enc = dir.join(format!("mh_sqlc_enc_{pid}.db"));
        let _ = std::fs::remove_file(&plain);
        let _ = std::fs::remove_file(&enc);

        // 1. Plaintext DB with a known row → sqlcipher_export with a raw key (the app's encryption path).
        {
            let c = Connection::open(&plain).unwrap();
            c.execute_batch(
                "CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO t VALUES (1, 'secret');",
            )
            .unwrap();
            let enc_str = enc.to_str().unwrap();
            c.execute_batch(&format!(
                "ATTACH DATABASE '{enc_str}' AS encrypted KEY \"x'{hex_key}'\";
                 SELECT sqlcipher_export('encrypted');
                 DETACH DATABASE encrypted;"
            ))
            .unwrap();
        }

        // 2. Reopen with the SAME raw form the app uses (apply_key / verify / final-open) — must succeed.
        {
            let c = Connection::open(&enc).unwrap();
            c.execute_batch(&format!("PRAGMA key = \"x'{hex_key}'\";"))
                .unwrap();
            let n: i64 = c
                .query_row("SELECT count(*) FROM t", [], |r| r.get(0))
                .expect("raw `PRAGMA key` must open a raw-keyed SQLCipher DB");
            assert_eq!(
                n, 1,
                "exported row must be readable with the matching raw key"
            );
        }

        // 3. The buggy read path (`PRAGMA hexkey`) must NOT open the same file — documents the mismatch.
        {
            let c = Connection::open(&enc).unwrap();
            c.execute_batch(&format!("PRAGMA hexkey = '{hex_key}';"))
                .unwrap();
            let res = c.query_row("SELECT count(*) FROM t", [], |r| r.get::<_, i64>(0));
            assert!(
                res.is_err(),
                "`PRAGMA hexkey` derives a different key and must not open a raw-keyed DB"
            );
        }

        let _ = std::fs::remove_file(&plain);
        let _ = std::fs::remove_file(&enc);
    }

    // Data-loss regression guard (HIGH severity): a crash mid-`sqlcipher_export` leaves a
    // TRUNCATED moodhaven_enc.db next to the still-intact plaintext moodhaven.db, with
    // db_state.json carrying the pre-written salt but encrypted:false. The old recovery
    // path in Database::new blindly renamed the corrupt tmp over the good DB → permanent
    // lockout / total data loss. The fix defers promotion to apply_key (which has the key
    // and can verify the tmp first), so Database::new MUST NOT destroy the original here.
    #[test]
    fn startup_recovery_preserves_original_when_tmp_is_corrupt() {
        use super::{read_db_state, write_db_state, Database, DbStateFile};

        let dir = std::env::temp_dir();
        let pid = std::process::id();
        let base = dir.join(format!("mh_crashrec_{pid}"));
        let _ = std::fs::create_dir_all(&base);
        let db_path = base.join("moodhaven.db");
        let tmp_path = base.join("moodhaven_enc.db");
        let state_path = base.join("db_state.json");
        let _ = std::fs::remove_file(&db_path);
        let _ = std::fs::remove_file(&tmp_path);
        let _ = std::fs::remove_file(&state_path);

        // 1. A real, intact plaintext journal DB with a known secret row.
        {
            let c = Connection::open(&db_path).unwrap();
            c.execute_batch(
                "CREATE TABLE journal_entries (id TEXT PRIMARY KEY, content TEXT);
                 INSERT INTO journal_entries VALUES ('e1', 'precious-original-data');",
            )
            .unwrap();
        }

        // 2. Simulate the interrupted migration: a TRUNCATED/garbage moodhaven_enc.db
        //    (not a valid SQLite/SQLCipher file) plus db_state.json with the pre-written
        //    salt but encrypted:false — exactly the state encrypt_in_place leaves behind
        //    if it is killed after the salt write but before the export completes.
        std::fs::write(&tmp_path, b"\x00\x01corrupt-truncated-not-a-db\xff\xfe").unwrap();
        write_db_state(
            &db_path,
            &DbStateFile {
                encrypted: false,
                salt: Some("dGVzdC1zYWx0".to_string()), // base64("test-salt")
            },
        )
        .unwrap();

        // 3. Boot. Recovery must NOT promote the corrupt tmp over the good DB.
        let db = Database::new(db_path.clone()).expect("Database::new must not fail on recovery");
        drop(db); // release any handle before re-opening the file below

        // 4. The original plaintext moodhaven.db must still be intact and readable WITHOUT
        //    a key — proving the corrupt tmp was never renamed over it (no data loss).
        {
            let c = Connection::open(&db_path).unwrap();
            let content: String = c
                .query_row(
                    "SELECT content FROM journal_entries WHERE id = 'e1'",
                    [],
                    |r| r.get(0),
                )
                .expect("original plaintext DB must survive startup recovery");
            assert_eq!(
                content, "precious-original-data",
                "startup recovery must not clobber the intact original with the corrupt tmp"
            );
        }

        // 5. db_state.json is flipped to encrypted:true so verify_password routes through
        //    apply_key (which key-verifies the tmp before any promotion); the salt is kept.
        let state = read_db_state(&db_path);
        assert!(
            state.encrypted,
            "recovery should mark encrypted:true to defer key-verified promotion to apply_key"
        );
        assert_eq!(state.salt.as_deref(), Some("dGVzdC1zYWx0"));

        let _ = std::fs::remove_dir_all(&base);
    }

    // Positive path: when the interrupted-migration tmp is actually VALID (export
    // completed before the crash), apply_key with the correct key must promote it —
    // rename it over moodhaven.db, mark db_state encrypted:true, and serve its rows.
    #[test]
    fn apply_key_promotes_valid_pending_tmp_after_verification() {
        use super::{read_db_state, write_db_state, Database, DbStateFile};

        let hex_key: String = (0u8..32)
            .map(|b| format!("{:02x}", b.wrapping_mul(11).wrapping_add(3)))
            .collect();
        let key: [u8; 32] = {
            let mut k = [0u8; 32];
            for (i, byte) in k.iter_mut().enumerate() {
                *byte = u8::from_str_radix(&hex_key[i * 2..i * 2 + 2], 16).unwrap();
            }
            k
        };

        let dir = std::env::temp_dir();
        let pid = std::process::id();
        let base = dir.join(format!("mh_promote_{pid}"));
        let _ = std::fs::create_dir_all(&base);
        let db_path = base.join("moodhaven.db");
        let tmp_path = base.join("moodhaven_enc.db");
        let _ = std::fs::remove_file(&db_path);
        let _ = std::fs::remove_file(&tmp_path);
        let _ = std::fs::remove_file(base.join("db_state.json"));

        // 1. Build a real plaintext DB via Database::new (full schema + migrations) with a
        //    known row, then produce a VALID encrypted tmp via sqlcipher_export — exactly the
        //    state encrypt_in_place leaves behind if killed after export but before rename.
        {
            let seed = Database::new(db_path.clone()).expect("seed plaintext DB");
            {
                let conn = seed.conn.lock().unwrap();
                conn.execute(
                    "INSERT INTO journal_entries (id, encrypted_content, mood, created_at, updated_at)
                     VALUES ('e1', 'migrated-secret', 3, datetime('now'), datetime('now'))",
                    [],
                )
                .unwrap();
                let tmp_str = tmp_path.to_str().unwrap();
                conn.execute_batch(&format!(
                    "ATTACH DATABASE '{tmp_str}' AS encrypted KEY \"x'{hex_key}'\";
                     SELECT sqlcipher_export('encrypted');
                     DETACH DATABASE encrypted;"
                ))
                .unwrap();
            }
            drop(seed);
        }
        write_db_state(
            &db_path,
            &DbStateFile {
                encrypted: false,
                salt: Some("dGVzdC1zYWx0".to_string()),
            },
        )
        .unwrap();

        // 2. Boot (defers promotion) then apply the correct key (as verify_password would).
        let db = Database::new(db_path.clone()).expect("Database::new must not fail");
        db.apply_key(&key)
            .expect("valid tmp must promote under the correct key");

        // 3. The tmp is gone (promoted), db_state is encrypted:true, and the keyed
        //    connection serves the migrated row.
        assert!(
            !tmp_path.exists(),
            "valid tmp must be promoted (renamed away)"
        );
        assert!(read_db_state(&db_path).encrypted);
        {
            let conn = db.conn.lock().unwrap();
            let content: String = conn
                .query_row(
                    "SELECT encrypted_content FROM journal_entries WHERE id = 'e1'",
                    [],
                    |r| r.get(0),
                )
                .expect("promoted encrypted DB must serve the migrated row");
            assert_eq!(content, "migrated-secret");
        }

        drop(db);
        let _ = std::fs::remove_dir_all(&base);
    }

    // Planted-decoy regression guard (PT10): an attacker (or a botched recovery) leaves a
    // garbage moodhaven_enc.db plus db_state.json {encrypted:false, salt:<x>} but NO
    // moodhaven.db. SQLCipher's `Connection::open` would CREATE an empty moodhaven.db and an
    // unkeyed `SELECT count(*)` would SUCCEED on it (returns 0) — fooling the recovery probe
    // into accepting the empty decoy as the user's intact plaintext original, discarding the
    // tmp and reverting to an empty DB (silent data loss). The fix must surface the missing
    // original as an error and must NOT fabricate-and-accept an empty decoy.
    #[test]
    fn startup_does_not_fabricate_and_accept_empty_decoy_when_original_missing() {
        use super::{read_db_state, write_db_state, Database, DbStateFile};

        let dir = std::env::temp_dir();
        let pid = std::process::id();
        let base = dir.join(format!("mh_decoy_{pid}"));
        let _ = std::fs::remove_dir_all(&base);
        let _ = std::fs::create_dir_all(&base);
        let db_path = base.join("moodhaven.db");
        let tmp_path = base.join("moodhaven_enc.db");
        let _ = std::fs::remove_file(&db_path);
        let _ = std::fs::remove_file(&tmp_path);
        let _ = std::fs::remove_file(base.join("db_state.json"));

        // 1. Garbage encrypted tmp + a salt-bearing db_state, but the original moodhaven.db
        //    does NOT exist. This is an existing setup (salt present), so Database::new must
        //    NOT fabricate an empty moodhaven.db — it must surface the missing original as an
        //    error instead of accepting an auto-created empty decoy.
        std::fs::write(&tmp_path, b"\x00\x01garbage-not-a-db\xff").unwrap();
        write_db_state(
            &db_path,
            &DbStateFile {
                encrypted: false,
                salt: Some("dGVzdC1zYWx0".to_string()), // base64("test-salt")
            },
        )
        .unwrap();

        // 2. Boot. The missing original must be reported as an error, NOT silently created.
        let err = Database::new(db_path.clone())
            .err()
            .expect("Database::new must error when an existing-setup DB file is missing");
        assert!(
            err.contains("missing"),
            "missing original must be surfaced as an error (got: {err})"
        );

        // 3. No empty moodhaven.db was fabricated, and the salt is preserved so a real
        //    recovery (restoring the genuine DB) remains possible.
        assert!(
            !db_path.exists(),
            "must NOT fabricate an empty moodhaven.db decoy"
        );
        let after = read_db_state(&db_path);
        assert_eq!(
            after.salt.as_deref(),
            Some("dGVzdC1zYWx0"),
            "salt must be preserved, never stranded"
        );

        let _ = std::fs::remove_dir_all(&base);
    }

    // Companion guard for the hardened `promote_pending_tmp` probe (PT10): even if execution
    // reaches apply_key with a garbage tmp and a ZERO-TABLE (or absent) original, the probe
    // must treat an empty/missing original as NOT a valid plaintext DB — so it must NOT
    // discard the tmp and revert to an empty decoy. It surfaces an error and leaves the tmp
    // and salt untouched. Here the original is an empty (zero-table) SQLite file.
    #[test]
    fn promote_rejects_empty_zero_table_original_as_decoy() {
        use super::{read_db_state, write_db_state, Database, DbStateFile};

        let dir = std::env::temp_dir();
        let pid = std::process::id();
        let base = dir.join(format!("mh_decoy2_{pid}"));
        let _ = std::fs::remove_dir_all(&base);
        let _ = std::fs::create_dir_all(&base);
        let db_path = base.join("moodhaven.db");
        let tmp_path = base.join("moodhaven_enc.db");

        // 1. Seed a fresh plaintext DB (full schema) so Database::new opens cleanly, then drop
        //    all of its content to make it a zero-table "empty decoy" the probe must reject.
        {
            let seed = Database::new(db_path.clone()).expect("seed plaintext DB");
            drop(seed);
        }
        // Truncate the original to an empty SQLite file (zero tables in sqlite_master).
        {
            let c = Connection::open(&db_path).unwrap();
            // Drop every user object so sqlite_master is empty.
            let names: Vec<(String, String)> = {
                let mut stmt = c
                    .prepare("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")
                    .unwrap();
                let rows = stmt
                    .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
                    .unwrap();
                rows.filter_map(|r| r.ok()).collect()
            };
            c.execute_batch("PRAGMA foreign_keys = OFF;").unwrap();
            for (ty, name) in names {
                let kind = match ty.as_str() {
                    "table" => "TABLE",
                    "index" => "INDEX",
                    "trigger" => "TRIGGER",
                    "view" => "VIEW",
                    _ => continue,
                };
                let _ = c.execute_batch(&format!("DROP {kind} IF EXISTS \"{name}\";"));
            }
            let n: i64 = c
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
                    [],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(n, 0, "original must be a zero-table empty DB for this test");
        }

        // 2. Plant a garbage tmp + salt-bearing db_state and route to apply_key directly.
        std::fs::write(&tmp_path, b"\x00garbage\xff").unwrap();
        write_db_state(
            &db_path,
            &DbStateFile {
                encrypted: true,
                salt: Some("dGVzdC1zYWx0".to_string()),
            },
        )
        .unwrap();

        let db = Database::new(db_path.clone()).expect("Database::new opens existing empty DB");
        let key = [9u8; 32];
        let err = db
            .apply_key(&key)
            .expect_err("garbage tmp + empty original must not succeed");

        // The "data preserved, deleted tmp, revert" path must NOT have fired — an empty
        // zero-table DB is not a valid original.
        assert!(
            !err.contains("your original data was preserved"),
            "empty zero-table DB must not be accepted as the intact original (got: {err})"
        );
        assert!(
            tmp_path.exists(),
            "tmp must be left untouched, not discarded into a revert-to-empty"
        );
        let after = read_db_state(&db_path);
        assert_eq!(
            after.salt.as_deref(),
            Some("dGVzdC1zYWx0"),
            "salt must be preserved, never stranded"
        );

        drop(db);
        let _ = std::fs::remove_dir_all(&base);
    }
}
