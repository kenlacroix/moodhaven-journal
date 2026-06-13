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

use moodhaven_journal_lib::db::{read_db_state, Database};
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::process::exit;

const SENTINEL_ID: &str = "sentinel";
const SENTINEL_VAL: &str = "precious-original-data";
/// Constant salt so the three separate processes derive the same key from a password.
const PROBE_SALT: &[u8] = b"moodhaven-crash-probe-salt-v1";

fn salt_b64() -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(PROBE_SALT)
}

/// Same PBKDF2-HMAC-SHA256 / 600k-iteration derivation the app uses at unlock.
fn derive_key(password: &str) -> [u8; 32] {
    use hmac::Hmac;
    use sha2::Sha256;
    let mut key = [0u8; 32];
    pbkdf2::pbkdf2::<Hmac<Sha256>>(password.as_bytes(), PROBE_SALT, 600_000, &mut key)
        .expect("pbkdf2");
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

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let usage = || -> ! {
        eprintln!("usage: crash_probe <seed|migrate|verify> <dir> [password]");
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
        _ => usage(),
    }
}
