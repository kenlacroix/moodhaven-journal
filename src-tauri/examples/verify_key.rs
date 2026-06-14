//! Throwaway live-test helper: does a given password open the SQLCipher DB?
//! usage: verify_key <db_path> <salt_b64> <password>
//! Derives the 256-bit key (PBKDF2-HMAC-SHA256, 600k) from the password + db_state.json salt,
//! applies it as the SQLCipher raw key, and tries to read journal_entries.
//! Prints OPEN_OK entries=N (exit 0) or OPEN_FAIL <err> (exit 1).
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use hmac::Hmac;
use pbkdf2::pbkdf2;
use rusqlite::Connection;
use sha2::Sha256;
use std::process::exit;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    if a.len() != 4 {
        eprintln!("usage: verify_key <db_path> <salt_b64> <password>");
        exit(2);
    }
    let (db_path, salt_b64, password) = (&a[1], &a[2], &a[3]);
    let salt = B64.decode(salt_b64).expect("bad salt b64");
    let mut key = [0u8; 32];
    pbkdf2::<Hmac<Sha256>>(password.as_bytes(), &salt, 600_000, &mut key).expect("pbkdf2");
    let hex = hex::encode(key);
    let conn = Connection::open(db_path).expect("open file");
    conn.execute_batch(&format!("PRAGMA key = \"x'{hex}'\";"))
        .expect("pragma key");
    match conn.query_row("SELECT count(*) FROM journal_entries", [], |r| {
        r.get::<_, i64>(0)
    }) {
        Ok(n) => {
            println!("OPEN_OK entries={n}");
            exit(0);
        }
        Err(e) => {
            println!("OPEN_FAIL {e}");
            exit(1);
        }
    }
}
