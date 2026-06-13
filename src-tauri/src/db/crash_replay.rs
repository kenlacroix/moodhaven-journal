//! Crash-replay test harness — Layer A (state injection).
//!
//! Proves the one invariant for every operation that rewrites the encrypted DB:
//! after a crash at any boundary and the next startup recovery, the database is
//! **either fully in the pre-operation state OR fully in the post-operation state —
//! never a mix, never unreadable, never empty.**
//!
//! Each boundary test constructs the exact on-disk intermediate state a crash leaves
//! behind (the helpers below), drives the real `Database::new` startup recovery plus the
//! `apply_key` deferred-promotion path, and asserts `old XOR new` with the sentinel row
//! intact. This is the same convention the two original ad-hoc tests in `mod.rs` used,
//! generalized into a complete, named phase matrix for `encrypt_in_place`.
//!
//! Layer B (a literal `kill -9` against the same boundaries) lives in
//! `examples/crash_probe.rs` + `scripts/crash-replay.sh`.

use super::{read_db_state, write_db_state, Database, DbStateFile};
use rusqlite::Connection;
use std::path::{Path, PathBuf};

// ── Fixtures ────────────────────────────────────────────────────────────────

/// The known journal row every boundary test seeds and then re-reads. If recovery
/// loses or half-writes data, this row goes missing or unreadable.
const SENTINEL_ID: &str = "sentinel";
const SENTINEL_VAL: &str = "precious-original-data";
/// base64("test-salt") — stand-in for the PBKDF2 salt pre-written by `encrypt_in_place`.
const SALT_B64: &str = "dGVzdC1zYWx0";

/// A deterministic 32-byte key and its hex form (the raw `x'..'` SQLCipher key).
fn test_key() -> ([u8; 32], String) {
    let mut k = [0u8; 32];
    for (i, b) in k.iter_mut().enumerate() {
        *b = (i as u8).wrapping_mul(7).wrapping_add(1);
    }
    let hex = hex::encode(k);
    (k, hex)
}

/// Fresh, isolated temp profile dir per test (mirrors the existing tests' cleanup).
fn fresh_dir(tag: &str) -> PathBuf {
    let base = std::env::temp_dir().join(format!("mh_cr_{tag}_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base);
    std::fs::create_dir_all(&base).expect("create temp profile dir");
    base
}

// ── State-injection helpers (build a boundary's exact on-disk state) ─────────

/// Seed a real plaintext DB (full schema + migrations via `Database::new`) with the
/// known sentinel row. Leaves no `db_state.json` — callers write the boundary state.
fn seed_plaintext_db(db_path: &Path) {
    let seed = Database::new(db_path.to_path_buf()).expect("seed plaintext DB");
    {
        let conn = seed.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO journal_entries (id, encrypted_content, mood, created_at, updated_at)
             VALUES (?1, ?2, 3, datetime('now'), datetime('now'))",
            rusqlite::params![SENTINEL_ID, SENTINEL_VAL],
        )
        .expect("insert sentinel row");
    }
    drop(seed);
}

/// Produce a VALID encrypted `moodhaven_enc.db` from the seeded plaintext DB — the B2/B3
/// on-disk state where `sqlcipher_export` completed before the crash.
fn inject_valid_tmp(db_path: &Path, hex_key: &str) {
    let tmp = db_path.with_file_name("moodhaven_enc.db");
    let _ = std::fs::remove_file(&tmp);
    let c = Connection::open(db_path).expect("open plaintext to export");
    let tmp_str = tmp.to_str().unwrap();
    c.execute_batch(&format!(
        "ATTACH DATABASE '{tmp_str}' AS encrypted KEY \"x'{hex_key}'\";
         SELECT sqlcipher_export('encrypted');
         DETACH DATABASE encrypted;"
    ))
    .expect("sqlcipher_export to valid tmp");
}

/// Produce a TRUNCATED/garbage `moodhaven_enc.db` — the B2′ on-disk state where the
/// process was killed mid-export. Must never clobber the intact original (SQLC-004).
fn inject_corrupt_tmp(db_path: &Path) {
    let tmp = db_path.with_file_name("moodhaven_enc.db");
    std::fs::write(&tmp, b"\x00\x01corrupt-truncated-not-a-db\xff\xfe").expect("write corrupt tmp");
}

/// Thin wrapper over `write_db_state` for boundary setup.
fn write_state(db_path: &Path, encrypted: bool, salt: Option<&str>) {
    write_db_state(
        db_path,
        &DbStateFile {
            encrypted,
            salt: salt.map(str::to_string),
        },
    )
    .expect("write db_state.json");
}

// ── The invariant (the heart of the harness) ────────────────────────────────

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
enum Recovered {
    Old,
    New,
}

/// True if the file at `db_path` is a plaintext DB still serving the sentinel row.
fn plaintext_has_sentinel(db_path: &Path) -> bool {
    Connection::open(db_path)
        .ok()
        .and_then(|c| {
            c.query_row(
                "SELECT encrypted_content FROM journal_entries WHERE id = ?1",
                [SENTINEL_ID],
                |r| r.get::<_, String>(0),
            )
            .ok()
        })
        .map(|v| v == SENTINEL_VAL)
        .unwrap_or(false)
}

/// True if the file at `db_path` is an encrypted DB serving the sentinel row under `key`.
fn keyed_has_sentinel(db_path: &Path, hex_key: &str) -> bool {
    Database::open_keyed(db_path, hex_key)
        .ok()
        .and_then(|c| {
            c.query_row(
                "SELECT encrypted_content FROM journal_entries WHERE id = ?1",
                [SENTINEL_ID],
                |r| r.get::<_, String>(0),
            )
            .ok()
        })
        .map(|v| v == SENTINEL_VAL)
        .unwrap_or(false)
}

/// Drive the REAL recovery path: `Database::new` (startup recovery) and, if it routes to
/// the encrypted path, `apply_key` (deferred key-verified promotion). On a corrupt-tmp
/// revert (`apply_key` returns the "unlock again" error), re-boot once — exactly what the
/// app does when the user retries the unlock — and resolve against the restored plaintext.
fn recover(db_path: &Path, key: &[u8; 32]) -> Recovered {
    let db = Database::new(db_path.to_path_buf()).expect("Database::new must not fail on recovery");
    if read_db_state(db_path).encrypted {
        match db.apply_key(key) {
            Ok(()) => {
                drop(db);
                Recovered::New
            }
            Err(_) => {
                // apply_key key-verified a corrupt tmp, discarded it, and reverted
                // db_state to plaintext. The retry boot opens the intact original.
                drop(db);
                let again =
                    Database::new(db_path.to_path_buf()).expect("re-boot after corrupt-tmp revert");
                drop(again);
                Recovered::Old
            }
        }
    } else {
        drop(db);
        Recovered::Old
    }
}

/// Run recovery, then assert the invariant: exactly one of {old plaintext, new encrypted}
/// is readable with the sentinel intact, and the *other* form is NOT also readable (no
/// mixed/half state). Returns which state we recovered into so the test can assert intent.
fn assert_invariant(db_path: &Path, key: &[u8; 32], hex_key: &str) -> Recovered {
    let rec = recover(db_path, key);
    let tmp = db_path.with_file_name("moodhaven_enc.db");
    match rec {
        Recovered::Old => {
            assert!(
                plaintext_has_sentinel(db_path),
                "recovered=old: plaintext original must serve the sentinel row"
            );
            assert!(
                !keyed_has_sentinel(db_path, hex_key),
                "recovered=old: the DB must NOT also be readable as encrypted (mixed state)"
            );
        }
        Recovered::New => {
            assert!(
                !tmp.exists(),
                "recovered=new: the pending tmp must be promoted away"
            );
            assert!(
                keyed_has_sentinel(db_path, hex_key),
                "recovered=new: encrypted DB must serve the sentinel row"
            );
            assert!(
                !plaintext_has_sentinel(db_path),
                "recovered=new: the DB must NOT also be readable as plaintext (mixed state)"
            );
        }
    }
    rec
}

// ── Migration phase matrix (encrypt_in_place, B0–B6 + B2′ + B6′) ─────────────

mod migration {
    use super::*;

    // B0 — crash before the salt pre-write: plaintext DB, no db_state, no tmp.
    // The migration simply never started → recover to the intact plaintext original.
    #[test]
    fn b0_before_salt_write() {
        let base = fresh_dir("b0");
        let db = base.join("moodhaven.db");
        let (key, hex) = test_key();

        seed_plaintext_db(&db);

        assert_eq!(assert_invariant(&db, &key, &hex), Recovered::Old);
        let _ = std::fs::remove_dir_all(&base);
    }

    // B1 — crash after the salt was pre-written but before the export created any tmp:
    // plaintext DB + db_state{encrypted:false, salt}, no tmp. Salt-only is harmless; the
    // migration re-runs next time → recover to the intact plaintext original.
    #[test]
    fn b1_salt_written_no_tmp() {
        let base = fresh_dir("b1");
        let db = base.join("moodhaven.db");
        let (key, hex) = test_key();

        seed_plaintext_db(&db);
        write_state(&db, false, Some(SALT_B64));

        assert_eq!(assert_invariant(&db, &key, &hex), Recovered::Old);
        let _ = std::fs::remove_dir_all(&base);
    }

    // B2 — crash after a VALID export, before the encrypted:true write: plaintext DB +
    // valid tmp + db_state{encrypted:false, salt}. Startup flips db_state to encrypted:true
    // and apply_key key-verifies + promotes the tmp → recover to the new encrypted DB.
    #[test]
    fn b2_valid_tmp_promotes() {
        let base = fresh_dir("b2");
        let db = base.join("moodhaven.db");
        let (key, hex) = test_key();

        seed_plaintext_db(&db);
        inject_valid_tmp(&db, &hex);
        write_state(&db, false, Some(SALT_B64));

        assert_eq!(assert_invariant(&db, &key, &hex), Recovered::New);
        let _ = std::fs::remove_dir_all(&base);
    }

    // B2′ — crash mid-export leaves a CORRUPT/truncated tmp next to the intact plaintext
    // DB (db_state{encrypted:false, salt}). The corrupt tmp must NOT clobber the original
    // (the SQLC-004 data-loss guard) → recover to the intact plaintext original.
    // This folds in the original `startup_recovery_preserves_original_when_tmp_is_corrupt`.
    #[test]
    fn b2p_corrupt_tmp_preserves_original() {
        let base = fresh_dir("b2p");
        let db = base.join("moodhaven.db");
        let (key, hex) = test_key();

        seed_plaintext_db(&db);
        inject_corrupt_tmp(&db);
        write_state(&db, false, Some(SALT_B64));

        assert_eq!(assert_invariant(&db, &key, &hex), Recovered::Old);
        let _ = std::fs::remove_dir_all(&base);
    }

    // B3 — crash after the encrypted:true write, before the conn placeholder swap:
    // valid tmp + db_state{encrypted:true, salt}. Startup defers, apply_key promotes the
    // verified tmp → recover to the new encrypted DB.
    // This folds in the original `apply_key_promotes_valid_pending_tmp_after_verification`.
    #[test]
    fn b3_state_true_valid_tmp_promotes() {
        let base = fresh_dir("b3");
        let db = base.join("moodhaven.db");
        let (key, hex) = test_key();

        seed_plaintext_db(&db);
        inject_valid_tmp(&db, &hex);
        write_state(&db, true, Some(SALT_B64));

        assert_eq!(assert_invariant(&db, &key, &hex), Recovered::New);
        let _ = std::fs::remove_dir_all(&base);
    }

    // B4 — crash after the conn → in-memory placeholder swap. On-disk state is identical
    // to B3 (the swap is in-memory only), so a fresh process recovers identically → new.
    #[test]
    fn b4_conn_placeholder_swapped() {
        let base = fresh_dir("b4");
        let db = base.join("moodhaven.db");
        let (key, hex) = test_key();

        seed_plaintext_db(&db);
        inject_valid_tmp(&db, &hex);
        write_state(&db, true, Some(SALT_B64));

        assert_eq!(assert_invariant(&db, &key, &hex), Recovered::New);
        let _ = std::fs::remove_dir_all(&base);
    }

    // B5 — crash after the original's stale WAL/SHM were removed, before the rename. The
    // removed sidecars belong to the about-to-be-discarded plaintext original, so the
    // on-disk recovery state still matches B3 → new.
    #[test]
    fn b5_wal_removed_before_rename() {
        let base = fresh_dir("b5");
        let db = base.join("moodhaven.db");
        let (key, hex) = test_key();

        seed_plaintext_db(&db);
        inject_valid_tmp(&db, &hex);
        // Simulate the original's WAL/SHM having been swept just before the rename.
        let _ = std::fs::remove_file(db.with_extension("db-wal"));
        let _ = std::fs::remove_file(db.with_extension("db-shm"));
        write_state(&db, true, Some(SALT_B64));

        assert_eq!(assert_invariant(&db, &key, &hex), Recovered::New);
        let _ = std::fs::remove_dir_all(&base);
    }

    // B6 — crash after the rename completed: the encrypted DB is live at moodhaven.db,
    // no tmp, db_state{encrypted:true, salt}. apply_key opens the on-disk file directly →
    // recover to the new encrypted DB (the fully-migrated steady state).
    #[test]
    fn b6_rename_done() {
        let base = fresh_dir("b6");
        let db = base.join("moodhaven.db");
        let (key, hex) = test_key();

        seed_plaintext_db(&db);
        inject_valid_tmp(&db, &hex);
        // Complete the rename: the encrypted tmp becomes the live DB.
        std::fs::rename(db.with_file_name("moodhaven_enc.db"), &db).expect("promote rename");
        write_state(&db, true, Some(SALT_B64));

        assert_eq!(assert_invariant(&db, &key, &hex), Recovered::New);
        let _ = std::fs::remove_dir_all(&base);
    }

    // B6′ — crash in the backup-and-rename window: the original was moved aside to
    // moodhaven_old.db and the encrypted tmp is not yet in place (moodhaven.db absent),
    // db_state{encrypted:true, salt}. Startup restores the backup, then apply_key promotes
    // the verified tmp → recover to the new encrypted DB, never losing data.
    #[test]
    fn b6p_rename_interrupted_backup_restore() {
        let base = fresh_dir("b6p");
        let db = base.join("moodhaven.db");
        let (key, hex) = test_key();

        seed_plaintext_db(&db);
        inject_valid_tmp(&db, &hex);
        write_state(&db, true, Some(SALT_B64));
        // Simulate the window: original moved to backup, tmp not yet renamed into place.
        std::fs::rename(&db, db.with_file_name("moodhaven_old.db")).expect("move original aside");
        assert!(
            !db.exists(),
            "precondition: live DB is absent in the backup window"
        );

        assert_eq!(assert_invariant(&db, &key, &hex), Recovered::New);
        let _ = std::fs::remove_dir_all(&base);
    }
}

// ── Forward-looking change_master_password matrix (placeholders) ─────────────
//
// One #[ignore]d stub per future boundary from active-plans/change-password.md §4. They
// name the boundary and its expected old-XOR-new outcome BEFORE the feature exists; the
// change-password PR drops `crash_point!`s at these boundaries and un-ignores each test.
mod change_master_password {
    const PENDING: &str = "pending change_master_password (active-plans/change-password.md)";

    // Inner txn (entries + signals + TOTP + verifier) not yet committed: SQLite rolled it
    // back → data is wholly on the OLD password (outer + inner). Recover = old.
    #[test]
    #[ignore = "pending change_master_password (active-plans/change-password.md)"]
    fn cmp_b0_inner_txn_pre_commit_recovers_old() {
        unimplemented!("{PENDING} — expected recovered=old (txn rolled back)");
    }

    // Inner txn committed (inner layer on NEW password) but media/rekey not started: the
    // pending marker drives resume forward → recover = new.
    #[test]
    #[ignore = "pending change_master_password (active-plans/change-password.md)"]
    fn cmp_b1_post_commit_pre_media_recovers_new() {
        unimplemented!("{PENDING} — expected recovered=new (resume media + rekey)");
    }

    // Crash mid media-file swap: per-file progress in the marker lets recovery resume the
    // remaining files, then finish the rekey → recover = new.
    #[test]
    #[ignore = "pending change_master_password (active-plans/change-password.md)"]
    fn cmp_b2_mid_media_swap_recovers_new() {
        unimplemented!("{PENDING} — expected recovered=new (resume from media progress)");
    }

    // All media re-encrypted, outer SQLCipher rekey not yet applied: resume the rekey from
    // the marker (new salt recorded) → recover = new.
    #[test]
    #[ignore = "pending change_master_password (active-plans/change-password.md)"]
    fn cmp_b3_post_media_pre_rekey_recovers_new() {
        unimplemented!("{PENDING} — expected recovered=new (resume outer rekey)");
    }

    // Rekey applied, pending marker not yet cleared: clearing the marker is idempotent →
    // recover = new.
    #[test]
    #[ignore = "pending change_master_password (active-plans/change-password.md)"]
    fn cmp_b4_post_rekey_pre_marker_clear_recovers_new() {
        unimplemented!("{PENDING} — expected recovered=new (idempotent marker clear)");
    }
}
