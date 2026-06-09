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

// ── change_master_password matrix (single atomic flip, keyless tail) ──────────
//
// The change reorders the plan's sketch into the only crash-safe shape (decision
// 2026-06-09): all KEY-requiring work — staging media to `*.rekeytmp` + building the
// new-keyed `moodhaven_rekey.db` with the inner blobs re-encrypted — happens BEFORE one
// atomic commit point (the db_state.json salt flip + tmp promotion), and everything after
// is KEYLESS (rename staged media, clear marker) so startup recovery finishes it forward
// with no password. The single discriminator recovery uses is `db_state.salt == marker
// .new_salt_b64`: equal ⇒ committed ⇒ roll forward to NEW; not equal ⇒ pre-commit ⇒ roll
// back to OLD. The invariant is the same as the migration matrix: old XOR new, never a mix.
mod change_master_password {
    use super::*;
    use crate::commands::change_password::PENDING_MARKER;

    /// base64("old-salt") / base64("new-salt") — the db_state salts that gate commit.
    const OLD_SALT_B64: &str = "b2xkLXNhbHQ=";
    const NEW_SALT_B64: &str = "bmV3LXNhbHQ=";

    /// Two distinct deterministic 32-byte keys: the OLD outer key the live DB starts under,
    /// and the NEW outer key the rekey tmp is built under.
    fn old_new_keys() -> ([u8; 32], String, [u8; 32], String) {
        let (old, old_hex) = test_key();
        let mut new = [0u8; 32];
        for (i, b) in new.iter_mut().enumerate() {
            *b = (i as u8).wrapping_mul(11).wrapping_add(3);
        }
        let new_hex = hex::encode(new);
        (old, old_hex, new, new_hex)
    }

    /// Build the live `moodhaven.db` as a real SQLCipher DB keyed with `hex_key`, serving the
    /// sentinel row, with `db_state{encrypted:true, salt:salt_b64}`.
    fn build_encrypted_live(db_path: &Path, hex_key: &str, salt_b64: &str) {
        seed_plaintext_db(db_path);
        inject_valid_tmp(db_path, hex_key); // exports plaintext → moodhaven_enc.db (keyed)
        std::fs::rename(db_path.with_file_name("moodhaven_enc.db"), db_path).expect("promote live");
        let _ = std::fs::remove_file(db_path.with_extension("db-wal"));
        let _ = std::fs::remove_file(db_path.with_extension("db-shm"));
        write_state(db_path, true, Some(salt_b64));
    }

    /// Produce a complete, valid `moodhaven_rekey.db` keyed with `hex_new` (the fully-built
    /// new-password tmp a change creates before the flip). Seeded from an isolated scratch dir
    /// so it never touches the target profile's `db_state.json`.
    fn make_rekey_tmp(db_path: &Path, hex_new: &str) {
        let scratch_dir = db_path.with_file_name("scratch_seed");
        let _ = std::fs::remove_dir_all(&scratch_dir);
        std::fs::create_dir_all(&scratch_dir).expect("scratch dir");
        let scratch = scratch_dir.join("moodhaven.db");
        seed_plaintext_db(&scratch);

        let tmp = db_path.with_file_name("moodhaven_rekey.db");
        let _ = std::fs::remove_file(&tmp);
        let tmp_str = tmp.to_str().unwrap();
        let c = Connection::open(&scratch).expect("open scratch");
        c.execute_batch(&format!(
            "ATTACH DATABASE '{tmp_str}' AS r KEY \"x'{hex_new}'\";
             SELECT sqlcipher_export('r');
             DETACH DATABASE r;"
        ))
        .expect("export rekey tmp");
        drop(c);
        let _ = std::fs::remove_dir_all(&scratch_dir);
    }

    /// Write the pending-change marker carrying the NEW salt (the commit discriminator).
    fn write_marker(db_path: &Path) {
        let json = format!(
            r#"{{"phase":"inner_pending","new_salt_b64":"{NEW_SALT_B64}","media_done":[]}}"#
        );
        std::fs::write(db_path.with_file_name(PENDING_MARKER), json).expect("write marker");
    }

    /// Stage a media file: original `note.enc` (old bytes) + its `note.enc.rekeytmp` sibling
    /// (new bytes), one entry-dir deep under `media/`. Returns the original path.
    fn put_staged_media(db_path: &Path) -> std::path::PathBuf {
        let mdir = db_path.with_file_name("media").join("entryX");
        std::fs::create_dir_all(&mdir).expect("media dir");
        let orig = mdir.join("note.enc");
        std::fs::write(&orig, b"OLD-ORIGINAL").expect("write orig");
        std::fs::write(mdir.join("note.enc.rekeytmp"), b"NEW-STAGED").expect("write staging");
        orig
    }

    /// True if a `*.rekeytmp` staging file still exists anywhere under `media/`.
    fn any_staging_left(db_path: &Path) -> bool {
        let root = db_path.with_file_name("media");
        let Ok(dirs) = std::fs::read_dir(&root) else {
            return false;
        };
        for d in dirs.flatten() {
            if let Ok(files) = std::fs::read_dir(d.path()) {
                for f in files.flatten() {
                    if f.path().to_string_lossy().ends_with(".rekeytmp") {
                        return true;
                    }
                }
            }
        }
        false
    }

    /// Drive the REAL recovery (`Database::new` + `apply_key`) and assert the invariant:
    /// exactly one of {old-keyed, new-keyed} serves the sentinel, the rekey tmp + marker are
    /// gone, and no media staging file is left dangling.
    fn assert_cmp(db_path: &Path, expect: Recovered, key: &[u8; 32], old_hex: &str, new_hex: &str) {
        let db = Database::new(db_path.to_path_buf()).expect("Database::new on recovery");
        db.apply_key(key).expect("apply_key recovery");
        drop(db);

        assert!(
            !db_path.with_file_name("moodhaven_rekey.db").exists(),
            "rekey tmp must be resolved away"
        );
        assert!(
            !db_path.with_file_name(PENDING_MARKER).exists(),
            "pending marker must be cleared"
        );
        assert!(
            !any_staging_left(db_path),
            "no media staging file may dangle"
        );

        match expect {
            Recovered::Old => {
                assert!(
                    keyed_has_sentinel(db_path, old_hex),
                    "recovered=old: OLD key must serve the sentinel"
                );
                assert!(
                    !keyed_has_sentinel(db_path, new_hex),
                    "recovered=old: NEW key must NOT open (mixed state)"
                );
            }
            Recovered::New => {
                assert!(
                    keyed_has_sentinel(db_path, new_hex),
                    "recovered=new: NEW key must serve the sentinel"
                );
                assert!(
                    !keyed_has_sentinel(db_path, old_hex),
                    "recovered=new: OLD key must NOT open (mixed state)"
                );
            }
        }
    }

    // b0 — crash BEFORE the commit (media staged + new tmp built, db_state.salt still OLD).
    // The marker's new salt ≠ db_state.salt → pre-commit → discard the orphan tmp, roll back
    // staged media, open the intact OLD live DB. Recover = OLD.
    #[test]
    fn cmp_b0_pre_commit_recovers_old() {
        let base = fresh_dir("cmp_b0");
        let db = base.join("moodhaven.db");
        let (old, old_hex, _new, new_hex) = old_new_keys();

        build_encrypted_live(&db, &old_hex, OLD_SALT_B64);
        make_rekey_tmp(&db, &new_hex);
        write_marker(&db);
        let orig = put_staged_media(&db);

        assert_cmp(&db, Recovered::Old, &old, &old_hex, &new_hex);
        assert_eq!(
            std::fs::read(&orig).unwrap(),
            b"OLD-ORIGINAL",
            "rollback must preserve the original media bytes"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    // b1 — crash just AFTER the commit (db_state.salt flipped to NEW), before the tmp was
    // promoted: live DB still OLD-keyed, complete new-keyed tmp present. marker.new == db_state
    // .salt → committed → key-verify + promote the tmp, then rename staged media. Recover = NEW.
    #[test]
    fn cmp_b1_post_commit_pre_promote_recovers_new() {
        let base = fresh_dir("cmp_b1");
        let db = base.join("moodhaven.db");
        let (_old, old_hex, new, new_hex) = old_new_keys();

        build_encrypted_live(&db, &old_hex, OLD_SALT_B64);
        write_state(&db, true, Some(NEW_SALT_B64)); // the commit-point flip
        make_rekey_tmp(&db, &new_hex);
        write_marker(&db);
        let orig = put_staged_media(&db);

        assert_cmp(&db, Recovered::New, &new, &old_hex, &new_hex);
        assert_eq!(
            std::fs::read(&orig).unwrap(),
            b"NEW-STAGED",
            "roll-forward must promote the staged media bytes"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    // b2 — crash AFTER the tmp was promoted (live DB now NEW-keyed, no tmp), before the media
    // renames: marker present, staging present. No tmp → open the live NEW DB, then the keyless
    // tail finishes the media renames and clears the marker. Recover = NEW.
    #[test]
    fn cmp_b2_post_promote_pre_media_rename_recovers_new() {
        let base = fresh_dir("cmp_b2");
        let db = base.join("moodhaven.db");
        let (_old, old_hex, new, new_hex) = old_new_keys();

        build_encrypted_live(&db, &new_hex, NEW_SALT_B64); // already promoted to new
        write_marker(&db);
        let orig = put_staged_media(&db);

        assert_cmp(&db, Recovered::New, &new, &old_hex, &new_hex);
        assert_eq!(
            std::fs::read(&orig).unwrap(),
            b"NEW-STAGED",
            "tail must finish the media rename"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    // b3 — crash AFTER the media renames, before the marker clear: live NEW DB, no staging, no
    // tmp, marker still present. The tail simply clears the marker (idempotent). Recover = NEW.
    #[test]
    fn cmp_b3_post_media_rename_pre_marker_clear_recovers_new() {
        let base = fresh_dir("cmp_b3");
        let db = base.join("moodhaven.db");
        let (_old, old_hex, new, new_hex) = old_new_keys();

        build_encrypted_live(&db, &new_hex, NEW_SALT_B64);
        write_marker(&db);
        // Media already renamed: original holds the new bytes, no .rekeytmp sibling.
        let mdir = db.with_file_name("media").join("entryX");
        std::fs::create_dir_all(&mdir).unwrap();
        std::fs::write(mdir.join("note.enc"), b"NEW-STAGED").unwrap();

        assert_cmp(&db, Recovered::New, &new, &old_hex, &new_hex);
        let _ = std::fs::remove_dir_all(&base);
    }

    // Happy path (no crash): rekey_in_place exports the live OLD DB into a NEW-keyed tmp,
    // applies the inner re-encryption in the tmp, flips db_state, and promotes — leaving the
    // DB readable ONLY under the new key, with the inner update visible, and the old key dead.
    #[test]
    fn rekey_in_place_happy_path_flips_old_to_new() {
        let base = fresh_dir("cmp_happy");
        let db_path = base.join("moodhaven.db");
        let (old, old_hex, new, new_hex) = old_new_keys();

        build_encrypted_live(&db_path, &old_hex, OLD_SALT_B64);
        let db = Database::new(db_path.clone()).expect("open");
        db.apply_key(&old).expect("unlock old");

        db.rekey_in_place(&new, NEW_SALT_B64, |conn| {
            conn.execute(
                "UPDATE journal_entries SET encrypted_content = ?1 WHERE id = ?2",
                rusqlite::params!["REKEYED-CONTENT", SENTINEL_ID],
            )
            .map(|_| ())
            .map_err(|e| e.to_string())
        })
        .expect("rekey");
        drop(db);

        // New key reads the inner-updated row; old key is dead; db_state advanced.
        let new_val = Database::open_keyed(&db_path, &new_hex)
            .and_then(|c| {
                c.query_row(
                    "SELECT encrypted_content FROM journal_entries WHERE id = ?1",
                    [SENTINEL_ID],
                    |r| r.get::<_, String>(0),
                )
                .map_err(|e| e.to_string())
            })
            .expect("new key must open the rekeyed DB");
        assert_eq!(
            new_val, "REKEYED-CONTENT",
            "inner update must be visible under new key"
        );
        assert!(
            Database::open_keyed(&db_path, &old_hex).is_err(),
            "old key must no longer open the rekeyed DB"
        );
        assert_eq!(
            read_db_state(&db_path).salt.as_deref(),
            Some(NEW_SALT_B64),
            "db_state salt must advance to the new salt"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    // b4 — only the marker is left (everything else done): the tail clears it. Recover = NEW.
    #[test]
    fn cmp_b4_marker_only_recovers_new() {
        let base = fresh_dir("cmp_b4");
        let db = base.join("moodhaven.db");
        let (_old, old_hex, new, new_hex) = old_new_keys();

        build_encrypted_live(&db, &new_hex, NEW_SALT_B64);
        write_marker(&db);

        assert_cmp(&db, Recovered::New, &new, &old_hex, &new_hex);
        let _ = std::fs::remove_dir_all(&base);
    }
}
