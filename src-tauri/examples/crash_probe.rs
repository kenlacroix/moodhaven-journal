//! crash_probe — Layer B subprocess for the crash-replay harness.
//!
//! Exposes the real seed / migrate / verify path over the crate's public API so
//! `scripts/crash-replay.sh` can `kill -9` the `migrate` run *at* a boundary (via the
//! `crash_point!` hooks in `encrypt_in_place`, armed with `MH_CRASH_POINT` /
//! `MH_CRASH_READY`) and then prove startup recovery never loses data.
//!
//!   crash_probe seed    <dir>            — build a seeded plaintext DB + sentinel row
//!   crash_probe migrate <dir> <password> — run the real encrypt_in_place (honors MH_CRASH_POINT)
//!   crash_probe verify  <dir> <password> — boot + recover; exit 0 iff old XOR new, sentinel intact
//!
//! This is a cargo *example* (debug build), never bundled into the app.

use moodhaven_journal_lib::commands::change_password::PENDING_MARKER;
use moodhaven_journal_lib::db::{read_db_state, Database};
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::process::exit;

const SENTINEL_ID: &str = "sentinel";
const SENTINEL_VAL: &str = "precious-original-data";
/// The value `cmd_cp_change`'s `apply_inner` rewrites the sentinel to — standing in for the
/// per-field inner re-encryption. Lets the crash matrix prove the inner write commits/rolls back
/// atomically with the salt-flip, not just the outer SQLCipher rekey.
const SENTINEL_VAL_NEW: &str = "rekeyed-under-new-password";
/// Constant salt so the three separate processes derive the same key from a password.
const PROBE_SALT: &[u8] = b"moodhaven-crash-probe-salt-v1";
/// change-password uses two distinct salts: the live DB starts under OLD, the rekey tmp under NEW.
const CP_OLD_SALT: &[u8] = b"moodhaven-cp-old-salt-v1";
const CP_NEW_SALT: &[u8] = b"moodhaven-cp-new-salt-v1";

fn salt_b64() -> String {
    encode_b64(PROBE_SALT)
}

fn encode_b64(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

/// Same PBKDF2-HMAC-SHA256 / 600k-iteration derivation the app uses at unlock.
fn derive_key(password: &str) -> [u8; 32] {
    derive_key_with(password, PROBE_SALT)
}

fn derive_key_with(password: &str, salt: &[u8]) -> [u8; 32] {
    use hmac::Hmac;
    use sha2::Sha256;
    let mut key = [0u8; 32];
    pbkdf2::pbkdf2::<Hmac<Sha256>>(password.as_bytes(), salt, 600_000, &mut key).expect("pbkdf2");
    key
}

fn db_path(dir: &str) -> PathBuf {
    Path::new(dir).join("moodhaven.db")
}

fn cmd_seed(dir: &str) {
    let _ = std::fs::create_dir_all(dir);
    let path = db_path(dir);
    let db = Database::new(path.clone()).expect("seed: Database::new");
    {
        let conn = db.conn.lock().expect("seed: lock");
        conn.execute(
            "INSERT INTO journal_entries (id, encrypted_content, mood, created_at, updated_at)
             VALUES (?1, ?2, 3, datetime('now'), datetime('now'))",
            rusqlite::params![SENTINEL_ID, SENTINEL_VAL],
        )
        .expect("seed: insert sentinel row");
    }
    println!("seeded plaintext DB at {}", path.display());
}

fn cmd_migrate(dir: &str, password: &str) {
    let path = db_path(dir);
    let db = Database::new(path).expect("migrate: Database::new");
    let key = derive_key(password);
    // encrypt_in_place fires crash_point!(...) at each boundary; if MH_CRASH_POINT is
    // armed the process parks there (and kill -9 lands) and this call never returns.
    db.encrypt_in_place(&key, &salt_b64())
        .expect("migrate: encrypt_in_place");
    println!("migration completed without hitting a crash point");
}

fn plaintext_has_sentinel(path: &Path) -> bool {
    Connection::open(path)
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

fn keyed_has_sentinel(path: &Path, hex_key: &str) -> bool {
    let c = match Connection::open(path) {
        Ok(c) => c,
        Err(_) => return false,
    };
    if c.execute_batch(&format!("PRAGMA key = \"x'{hex_key}'\";"))
        .is_err()
    {
        return false;
    }
    c.query_row(
        "SELECT encrypted_content FROM journal_entries WHERE id = ?1",
        [SENTINEL_ID],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .map(|v| v == SENTINEL_VAL)
    .unwrap_or(false)
}

enum Rec {
    Old,
    New,
}

/// Drive the real recovery: boot, and if it routes to the encrypted path, apply the key
/// (key-verified promotion). On the corrupt-tmp revert, re-boot once like a retry unlock.
fn recover(path: &Path, key: &[u8; 32]) -> Rec {
    let db = Database::new(path.to_path_buf()).expect("verify: Database::new");
    if read_db_state(path).encrypted {
        match db.apply_key(key) {
            Ok(()) => {
                drop(db);
                Rec::New
            }
            Err(_) => {
                drop(db);
                let _ = Database::new(path.to_path_buf()).expect("verify: re-boot after revert");
                Rec::Old
            }
        }
    } else {
        drop(db);
        Rec::Old
    }
}

fn cmd_verify(dir: &str, password: &str) -> ! {
    let path = db_path(dir);
    let key = derive_key(password);
    let hex_key = hex::encode(key);

    let rec = recover(&path, &key);
    let old = plaintext_has_sentinel(&path);
    let new = keyed_has_sentinel(&path, &hex_key);

    let (which, sentinel) = match rec {
        Rec::Old => ("old", old),
        Rec::New => ("new", new),
    };
    // Invariant: exactly one form is readable (no mixed/half state) AND the sentinel
    // survived in the form we recovered into.
    let ok = sentinel && (old ^ new);
    println!(
        "recovered={which} sentinel={}",
        if sentinel { "intact" } else { "LOST" }
    );
    if ok {
        exit(0);
    }
    eprintln!("INVARIANT VIOLATED: old={old} new={new} (must be exactly one, sentinel intact)");
    exit(1);
}

// ── change_master_password boundaries (single atomic flip, keyless tail) ─────────────────────
//
// Drives the real `rekey_in_place` — the atomic-flip core of change_master_password — so the
// harness can `kill -9` AT each of its crash boundaries (cmp.tmp_built / cmp.after_db_flip /
// cmp.after_promote) and prove the DB recovers fully OLD or fully NEW, never a mix. The marker
// is written exactly as the orchestrator does, since recovery uses `db_state.salt == marker
// .new_salt_b64` to decide commit. (The media-staging boundaries are covered by the Layer-A
// matrix, cmp_b1/b2/b3.)

/// The sentinel's `encrypted_content` as seen through `hex_key`, or None if the key can't open the
/// DB. Lets cp-verify assert the exact inner value (old vs re-keyed), not just row presence.
fn keyed_sentinel_value(path: &Path, hex_key: &str) -> Option<String> {
    let c = Connection::open(path).ok()?;
    if c.execute_batch(&format!("PRAGMA key = \"x'{hex_key}'\";"))
        .is_err()
    {
        return None;
    }
    c.query_row(
        "SELECT encrypted_content FROM journal_entries WHERE id = ?1",
        [SENTINEL_ID],
        |r| r.get::<_, String>(0),
    )
    .ok()
}

fn cmd_cp_seed(dir: &str, old_pw: &str) {
    let _ = std::fs::create_dir_all(dir);
    let path = db_path(dir);
    let db = Database::new(path.clone()).expect("cp-seed: Database::new");
    {
        let conn = db.conn.lock().expect("cp-seed: lock");
        conn.execute(
            "INSERT INTO journal_entries (id, encrypted_content, mood, created_at, updated_at)
             VALUES (?1, ?2, 3, datetime('now'), datetime('now'))",
            rusqlite::params![SENTINEL_ID, SENTINEL_VAL],
        )
        .expect("cp-seed: insert sentinel");
    }
    let old_key = derive_key_with(old_pw, CP_OLD_SALT);
    db.encrypt_in_place(&old_key, &encode_b64(CP_OLD_SALT))
        .expect("cp-seed: encrypt_in_place");
    println!("seeded encrypted DB (old password) at {}", path.display());
}

fn cmd_cp_change(dir: &str, old_pw: &str, new_pw: &str) {
    let path = db_path(dir);
    let db = Database::new(path).expect("cp-change: Database::new");
    let old_key = derive_key_with(old_pw, CP_OLD_SALT);
    db.apply_key(&old_key).expect("cp-change: unlock old");

    // Write the pending marker (recovery's commit discriminator), exactly as the orchestrator.
    let new_salt_b64 = encode_b64(CP_NEW_SALT);
    let marker = Path::new(dir).join(PENDING_MARKER);
    std::fs::write(
        &marker,
        format!(r#"{{"phase":"inner_pending","new_salt_b64":"{new_salt_b64}","media_done":[]}}"#),
    )
    .expect("cp-change: write marker");

    let new_key = derive_key_with(new_pw, CP_NEW_SALT);
    // rekey_in_place fires crash_point!(...) at cmp.tmp_built / cmp.after_db_flip /
    // cmp.after_promote; if MH_CRASH_POINT is armed it parks there and this never returns.
    // apply_inner performs a REAL inner re-write (sentinel → SENTINEL_VAL_NEW) so the kill matrix
    // proves the inner per-field update commits/rolls back atomically with the salt-flip — not
    // just the outer SQLCipher rekey (the no-op closure left the inner path untested under kill).
    db.rekey_in_place(&new_key, &new_salt_b64, |conn| {
        conn.execute(
            "UPDATE journal_entries SET encrypted_content = ?1 WHERE id = ?2",
            rusqlite::params![SENTINEL_VAL_NEW, SENTINEL_ID],
        )
        .map_err(|e| format!("cp-change inner update: {e}"))?;
        Ok(())
    })
    .expect("cp-change: rekey_in_place");
    let _ = std::fs::remove_file(&marker); // keyless tail: clear marker on clean completion
    println!("change completed without hitting a crash point");
}

fn cmd_cp_verify(dir: &str, old_pw: &str, new_pw: &str) -> ! {
    let path = db_path(dir);
    let old_hex = hex::encode(derive_key_with(old_pw, CP_OLD_SALT));
    let new_key = derive_key_with(new_pw, CP_NEW_SALT);
    let new_hex = hex::encode(new_key);
    let old_key = derive_key_with(old_pw, CP_OLD_SALT);

    let db = Database::new(path.clone()).expect("cp-verify: Database::new");
    // Recovery's own discriminator: if db_state.salt advanced to the new salt, the change
    // committed (unlock with the new key) — otherwise it didn't (unlock with the old key).
    let committed = read_db_state(&path).salt.as_deref() == Some(encode_b64(CP_NEW_SALT).as_str());
    let key = if committed { new_key } else { old_key };
    let _ = db.apply_key(&key); // promotes the rekey tmp (committed) or discards it (pre-commit)
    drop(db);

    // Prove old-XOR-new AND that the inner re-write tracked the flip: committed ⇒ ONLY the new key
    // opens and the sentinel holds the re-keyed value; pre-commit ⇒ ONLY the old key opens and the
    // sentinel holds its original value. A surviving old-keyed DB with the new inner value (or vice
    // versa) would mean the inner write and the salt-flip diverged — the exact mix we forbid.
    let old_val = keyed_sentinel_value(&path, &old_hex);
    let new_val = keyed_sentinel_value(&path, &new_hex);
    let (which, ok) = if committed {
        (
            "new",
            new_val.as_deref() == Some(SENTINEL_VAL_NEW) && old_val.is_none(),
        )
    } else {
        (
            "old",
            old_val.as_deref() == Some(SENTINEL_VAL) && new_val.is_none(),
        )
    };
    println!("recovered={which} ok={ok} old={old_val:?} new={new_val:?}");
    if ok {
        exit(0);
    }
    eprintln!(
        "INVARIANT VIOLATED: committed={committed} old={old_val:?} new={new_val:?} \
         (exactly one key must open, with the matching inner value)"
    );
    exit(1);
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let usage = || -> ! {
        eprintln!(
            "usage: crash_probe <seed|migrate|verify> <dir> [password]\n\
             \x20      crash_probe <cp-seed|cp-change|cp-verify> <dir> <old_pw> [new_pw]"
        );
        exit(2);
    };
    match args.get(1).map(String::as_str) {
        Some("seed") => {
            let dir = args.get(2).unwrap_or_else(|| usage());
            cmd_seed(dir);
        }
        Some("migrate") => {
            let (dir, pw) = match (args.get(2), args.get(3)) {
                (Some(d), Some(p)) => (d, p),
                _ => usage(),
            };
            cmd_migrate(dir, pw);
        }
        Some("verify") => {
            let (dir, pw) = match (args.get(2), args.get(3)) {
                (Some(d), Some(p)) => (d, p),
                _ => usage(),
            };
            cmd_verify(dir, pw);
        }
        Some("cp-seed") => {
            let (dir, old) = match (args.get(2), args.get(3)) {
                (Some(d), Some(o)) => (d, o),
                _ => usage(),
            };
            cmd_cp_seed(dir, old);
        }
        Some("cp-change") => {
            let (dir, old, new) = match (args.get(2), args.get(3), args.get(4)) {
                (Some(d), Some(o), Some(n)) => (d, o, n),
                _ => usage(),
            };
            cmd_cp_change(dir, old, new);
        }
        Some("cp-verify") => {
            let (dir, old, new) = match (args.get(2), args.get(3), args.get(4)) {
                (Some(d), Some(o), Some(n)) => (d, o, n),
                _ => usage(),
            };
            cmd_cp_verify(dir, old, new);
        }
        _ => usage(),
    }
}
