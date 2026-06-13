//! Change master password — Approach A (re-encrypt in place).
//!
//! See active-plans/change-password.md. The password *is* the key in this zero-knowledge
//! app, so "change password" means re-deriving keys and re-encrypting everything keyed off
//! the old password, across two layers (outer SQLCipher whole-DB + inner per-field AES-GCM)
//! and two runtimes (the frontend owns the entry/signal keys; Rust owns the rest).
//!
//! The frontend re-encrypts entries + signals (it holds those keys) and hands the new blobs
//! to this command. Rust then performs the irreversible work last, as close to atomic as the
//! filesystem allows, gated by the `password_change.pending` marker so a crash at any phase
//! boundary recovers to a clean old-XOR-new state (never a mix). Phase order and the marker
//! shape mirror the restore-pending pattern in `peer_sync_engine`.
//!
//! CRASH-SAFETY MODEL (single atomic flip, keyless tail — decision 2026-06-09): all
//! key-requiring work happens before ONE atomic commit point, and everything after is keyless
//! so startup recovery finishes it forward with no password. In order: (1) stage every media
//! file's new-password copy to a `*.rekeytmp` sibling (originals untouched); (2) build a
//! new-keyed `moodhaven_rekey.db` with the inner blobs/TOTP/verifier/recovery re-encrypted
//! inside it; (3) **the commit** — flip `db_state.json`'s salt to the new value and promote the
//! tmp over the live DB (`Database::rekey_in_place`); (4) keyless tail — rename the staged media
//! and clear the marker. A crash before (3) leaves the live DB wholly on the old password
//! (`recover_rekey_tmp` discards the orphan tmp); a crash after (3) rolls forward to the new
//! password. The `cmp_b0..b4` crash-replay matrix proves old-XOR-new at every boundary.

use super::require_unlocked;
use crate::commands::biometric::biometric_clear_session;
use crate::commands::media;
use crate::commands::two_factor::reencrypt_totp;
use crate::db::crash_point;
use crate::db::journal::EncryptedContent;
use crate::db::Database;
use crate::AppLockState;
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use hmac::Hmac;
use pbkdf2::pbkdf2;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use tauri::{AppHandle, Emitter, Manager, State};
use zeroize::Zeroizing;

const PBKDF2_ITERS: u32 = 600_000;

/// Recovery-key escrow settings keys (mirror `src/lib/services/recoveryKeyService.ts`).
const RECOVERY_ENABLED_KEY: &str = "recovery_key_enabled";
const RECOVERY_BLOB_KEY: &str = "recovery_key_encrypted_password";

/// One re-encrypted journal entry blob produced by the frontend under the NEW password.
/// `rename_all = "camelCase"` is REQUIRED: Tauri camelCases top-level command *argument* names
/// but NOT nested struct fields, and the frontend sends `encryptedContent`. Without this, serde
/// fails to deserialize the `entries` argument ("missing field `encrypted_content`") and the
/// whole command rejects before its body runs. (Mirrors `ExportFilter` in data_management.rs.)
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReencryptedEntry {
    pub id: String,
    pub encrypted_content: EncryptedContent,
}

/// One re-encrypted signal payload produced by the frontend under the NEW password.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReencryptedSignal {
    pub id: String,
    /// AES-256-GCM ciphertext payload (opaque string, as stored in `signals.payload`).
    pub payload: String,
}

/// Crash-recovery marker persisted to `{app_data}/password_change.pending`. Its presence
/// signals "a change is in flight"; `new_salt_b64` is the authoritative commit discriminator —
/// recovery compares it to `db_state.json`'s salt (equal ⇒ committed ⇒ roll forward; not equal
/// ⇒ pre-commit ⇒ roll back). The forward roll is KEYLESS (rename staged media, clear marker),
/// so it completes with no password.
///
/// Key material is deliberately NOT persisted: all key-requiring work finishes before the
/// commit point, so recovery never needs a password to roll forward or back.
#[derive(Debug, Serialize, Deserialize)]
pub struct ChangePasswordPending {
    /// The phase boundary last crossed before the marker was last written.
    pub phase: ChangePhase,
    /// base64 PBKDF2 salt for the NEW outer SQLCipher key (needed to finish the rekey).
    pub new_salt_b64: String,
    /// Per-file media progress: filenames already re-encrypted under the new password.
    #[serde(default)]
    pub media_done: Vec<String>,
}

/// The phase boundaries of a change, in order. Mirrors the `cmp_b*` harness placeholders.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChangePhase {
    /// Marker written; inner transaction not yet committed. Crash here → recover OLD.
    InnerPending,
    /// Inner txn committed (entries/signals/TOTP/verifier on new pw); media not started.
    InnerCommitted,
    /// Media re-encryption in progress (see `media_done`).
    MediaInProgress,
    /// All media re-encrypted; outer SQLCipher rekey not yet applied.
    MediaDone,
    /// Outer rekey applied; marker clear pending (idempotent).
    Rekeyed,
}

/// Filename of the crash-recovery marker in the app data dir.
pub const PENDING_MARKER: &str = "password_change.pending";

/// Change the master password (single atomic flip, keyless tail — see the module docs).
/// `entries` / `signals` are the frontend-re-encrypted blobs (under `new_password`);
/// `new_salt_b64` is the new outer-key salt the FE generated; `recovery_blob` is the
/// regenerated recovery-key wrap, if the user re-supplied their recovery code.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn change_master_password(
    db: State<'_, Database>,
    lock: State<'_, AppLockState>,
    rekey: State<'_, crate::RekeyInProgress>,
    app: AppHandle,
    old_password: String,
    new_password: String,
    new_salt_b64: String,
    entries: Vec<ReencryptedEntry>,
    signals: Vec<ReencryptedSignal>,
    recovery_blob: Option<String>,
) -> Result<ChangeSummary, String> {
    require_unlocked(&lock)?;

    // Hold the write-gate for the whole command (idempotent if the frontend already armed it via
    // `change_password_begin` before fetching its re-key snapshot). Data-write commands refuse
    // while armed, so a concurrent write can't strand a row under the old password. Disarmed on
    // every return path, including early errors and panics, via the Drop guard below.
    let rekey_guard: &crate::RekeyInProgress = rekey.inner();
    rekey_guard.arm();
    struct DisarmOnDrop<'a>(&'a crate::RekeyInProgress);
    impl Drop for DisarmOnDrop<'_> {
        fn drop(&mut self) {
            self.0.disarm();
        }
    }
    let _disarm = DisarmOnDrop(rekey_guard);

    let old_password = Zeroizing::new(old_password);
    let new_password = Zeroizing::new(new_password);

    // Phase 0 — validate before any mutation (plan §4.1). Wrong current password, empty input,
    // or new == current are all rejected here, before the marker is ever written.
    validate_change(&db, &old_password, &new_password)?;

    let new_salt = B64
        .decode(&new_salt_b64)
        .map_err(|e| format!("invalid new_salt_b64: {e}"))?;
    let new_key = derive_key(&new_password, &new_salt)?;
    let new_verifier = pbkdf2_b64(&new_password, &new_salt)?;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let marker_path = app_data_dir.join(PENDING_MARKER);

    // Snapshot convenience-factor state on the (still old) live DB before any mutation so the
    // summary and the recovery-blob decision are computed from the pre-change world.
    let recovery_was_enabled = read_setting(&db, RECOVERY_ENABLED_KEY)?.as_deref() == Some("true");
    let pin_was_enabled = read_setting(&db, "pin_enabled")?.as_deref() == Some("1");
    let recovery_regenerated = recovery_blob.is_some();

    let entries_n = entries.len();
    let signals_n = signals.len();

    // ── Pre-commit (fallible; fully rolled back on error) ────────────────────────────────
    // Everything up to and including the atomic salt-flip inside `rekey_in_place`. On ANY error
    // here the live DB was never modified, so the `match` below tidies the in-flight marker +
    // staged media and returns — leaving the running app exactly as it was. Returns the count of
    // media files staged (for the summary).
    let pre = (|| -> Result<usize, String> {
        // Marker: from here, startup recovery (recover_rekey_tmp / finish_pending_password_change)
        // owns the outcome. It carries only the new salt and per-file media progress — never key
        // material (plan §"Startup crash recovery").
        write_marker(
            &marker_path,
            &ChangePasswordPending {
                phase: ChangePhase::InnerPending,
                new_salt_b64: new_salt_b64.clone(),
                media_done: Vec::new(),
            },
        )?;

        // ── Stage media (KEYED, reversible — originals untouched) ────────────────────────
        // Each file's NEW-password copy is written to a `<file>.rekeytmp` sibling; the keyless
        // rename over the original happens only AFTER the atomic DB flip.
        let media_total = media::stage_reencrypt_media(
            &app_data_dir,
            &db,
            &old_password,
            &new_password,
            |done, total| {
                let _ = app.emit(
                    "change-password-progress",
                    serde_json::json!({ "phase": "media", "done": done, "total": total }),
                );
            },
        )?;
        crash_point!("cmp.media_staged");

        // ── Build the NEW-keyed DB tmp with the inner re-encryption applied, then flip it over
        // the live DB in one atomic promotion (rekey_in_place). The closure runs inside the
        // not-yet-live tmp, so a crash before the flip leaves the live DB wholly on the old pw.
        db.rekey_in_place(&new_key, &new_salt_b64, |conn: &Connection| {
            // Entries (per-field AES-GCM blobs the frontend re-encrypted under the new password).
            for e in &entries {
                let json = serde_json::to_string(&e.encrypted_content)
                    .map_err(|err| format!("serialize entry {}: {err}", e.id))?;
                conn.execute(
                    "UPDATE journal_entries SET encrypted_content = ?1 WHERE id = ?2",
                    params![json, e.id],
                )
                .map_err(|err| format!("update entry {}: {err}", e.id))?;
            }
            // Signals (payload is the full JSON EncryptedData envelope — see signalService.ts).
            for s in &signals {
                conn.execute(
                    "UPDATE signals SET payload = ?1 WHERE id = ?2",
                    params![s.payload, s.id],
                )
                .map_err(|err| format!("update signal {}: {err}", s.id))?;
            }

            // Completeness backstop. The tmp is a FULL export of the live DB, but only the
            // frontend-supplied ids were re-encrypted above. If the DB holds more entry/signal
            // rows than the frontend re-keyed — a write that slipped the write-gate, or an
            // under-fetch — those surplus rows still carry OLD-password inner ciphertext inside
            // the NEW-keyed DB and would be undecryptable. Abort: returning Err here discards the
            // not-yet-promoted tmp and leaves the live DB wholly on the old password (no loss).
            let entry_rows =
                conn.query_row("SELECT count(*) FROM journal_entries", [], |r| {
                    r.get::<_, i64>(0)
                })
                .map_err(|err| format!("count entries: {err}"))? as usize;
            if entry_rows != entries.len() {
                return Err(format!(
                    "re-key incomplete: {entry_rows} entries present but {} re-encrypted — \
                     aborting before any change to avoid data loss",
                    entries.len()
                ));
            }
            let signal_rows =
                conn.query_row("SELECT count(*) FROM signals", [], |r| r.get::<_, i64>(0))
                    .map_err(|err| format!("count signals: {err}"))? as usize;
            if signal_rows != signals.len() {
                return Err(format!(
                    "re-key incomplete: {signal_rows} signals present but {} re-encrypted — \
                     aborting before any change to avoid data loss",
                    signals.len()
                ));
            }

            // TOTP seed (Rust holds both passwords). No-op if 2FA absent / legacy-plaintext.
            reencrypt_totp(conn, &old_password, &new_password)?;
            // Verifier hash + salt (consulted only on the legacy unencrypted path, but kept
            // consistent — the encrypted path's real check is SQLCipher's MAC on the new key).
            conn.execute(
                "INSERT OR REPLACE INTO user_settings (id, password_hash, password_salt, updated_at)
                 VALUES (1, ?1, ?2, datetime('now'))",
                params![new_verifier, new_salt_b64],
            )
            .map_err(|err| format!("update verifier: {err}"))?;
            // Invalidate the PIN escrow INSIDE the atomic flip (it wraps the OLD password). Doing
            // it here — not in the keyless tail — means a crash can never promote a committed DB
            // that still contains a stale PIN yielding the old password.
            for key in ["pin_salt", "pin_blob", "pin_enabled"] {
                conn.execute("DELETE FROM settings WHERE key = ?1", params![key])
                    .map_err(|err| format!("clear pin {key}: {err}"))?;
            }
            // Recovery key (key escrow). If the FE supplied a freshly-wrapped blob, install it;
            // otherwise a previously-enabled recovery key now wraps the OLD password and is stale,
            // so disable it (the post-change checklist prompts the user to regenerate).
            match &recovery_blob {
                Some(blob) => {
                    conn.execute(
                        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                        params![RECOVERY_BLOB_KEY, blob],
                    )
                    .map_err(|err| format!("update recovery blob: {err}"))?;
                    conn.execute(
                        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, 'true')",
                        params![RECOVERY_ENABLED_KEY],
                    )
                    .map_err(|err| format!("enable recovery: {err}"))?;
                }
                None if recovery_was_enabled => {
                    conn.execute(
                        "DELETE FROM settings WHERE key = ?1",
                        params![RECOVERY_BLOB_KEY],
                    )
                    .map_err(|err| format!("clear recovery blob: {err}"))?;
                    conn.execute(
                        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, 'false')",
                        params![RECOVERY_ENABLED_KEY],
                    )
                    .map_err(|err| format!("disable recovery: {err}"))?;
                }
                None => {}
            }
            Ok(())
        })?;

        Ok(media_total)
    })();

    let media_total = match pre {
        Ok(n) => n,
        Err(e) => {
            // Distinguish pre- vs post-commit failure by the authoritative discriminator: has
            // db_state.json's salt already advanced to the new salt? `rekey_in_place` crosses its
            // commit point INTERNALLY (the salt flip), so a failure in its post-flip steps
            // (placeholder swap / WAL sweep / promote / reopen) surfaces here as an Err even though
            // the change is COMMITTED.
            let committed = crate::db::get_db_path(&app)
                .map(|p| {
                    crate::db::read_db_state(&p).salt.as_deref() == Some(new_salt_b64.as_str())
                })
                .unwrap_or(false);
            if committed {
                // Post-commit failure. The change is done; the marker + staged media + rekey tmp
                // MUST be preserved so the next unlock's startup recovery (recover_rekey_tmp /
                // finish_pending_password_change) rolls the keyless tail forward. Deleting the
                // marker here would make recovery mistake this for a pre-commit orphan and destroy
                // the only NEW-keyed copy — a permanent brick. Surface a restart instruction.
                return Err(format!(
                    "Your password was changed, but finalizing was interrupted ({e}). \
                     Restart the app and unlock with your NEW password."
                ));
            }
            // Pre-commit failure: the live DB was never modified. Tidy the in-flight state so the
            // still-running app is clean (a restart would otherwise roll back via recover_rekey_tmp).
            let _ = media::cleanup_media_staging(&app_data_dir);
            let _ = std::fs::remove_file(&marker_path);
            return Err(e);
        }
    };
    // db.conn is now the NEW-keyed connection; the live DB file is fully on the new password.

    // ── KEYLESS tail (committed; best-effort — startup recovery is the backstop) ───────────
    // Past the commit we must NOT return Err: the change is done. Any leftover work here is
    // keyless and idempotently finished by `finish_pending_password_change` on the next unlock if
    // interrupted, so failures are swallowed rather than propagated (a propagated post-commit
    // error would surface a false "failed" to a change that actually succeeded).
    let media_renamed = media::finish_media_renames(&app_data_dir).unwrap_or(0);
    crash_point!("cmp.media_renamed");

    // Clear the biometric keyring credential (it wraps the OLD password). Keyless, so the
    // committed-recovery path in `finish_pending_password_change` also clears it after a crash.
    let biometric_cleared = biometric_clear_session().is_ok();

    // Done — clear the marker (idempotent; startup recovery would also clear it).
    let _ = std::fs::remove_file(&marker_path);
    let _ = app.emit(
        "change-password-progress",
        serde_json::json!({ "phase": "done" }),
    );

    Ok(ChangeSummary {
        entries_reencrypted: entries_n,
        signals_reencrypted: signals_n,
        media_reencrypted: media_renamed.max(media_total),
        pin_disabled: pin_was_enabled,
        biometric_cleared,
        recovery_key_regenerated: recovery_regenerated,
    })
}

/// Arm the write-gate before the frontend fetches its re-key snapshot, so a concurrent write
/// can't strand a row under the old password (the TOCTOU window between fetch and the atomic
/// flip). Paired with `change_master_password` (which re-arms then disarms on completion) and
/// `change_password_cancel` (if the frontend aborts before invoking the change). Cleared on lock.
#[tauri::command]
pub fn change_password_begin(
    lock: State<'_, AppLockState>,
    rekey: State<'_, crate::RekeyInProgress>,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    rekey.arm();
    Ok(())
}

/// Disarm the write-gate when the frontend abandons a change before it commits.
#[tauri::command]
pub fn change_password_cancel(rekey: State<'_, crate::RekeyInProgress>) -> Result<(), String> {
    rekey.disarm();
    Ok(())
}

/// Derive the 256-bit outer SQLCipher key from the new password + new salt.
fn derive_key(password: &str, salt: &[u8]) -> Result<Zeroizing<[u8; 32]>, String> {
    let mut key = Zeroizing::new([0u8; 32]);
    pbkdf2::<Hmac<Sha256>>(password.as_bytes(), salt, PBKDF2_ITERS, key.as_mut())
        .map_err(|e| format!("pbkdf2: {e}"))?;
    Ok(key)
}

/// Compute the base64 verifier hash (matches `crypto.ts::hashPassword` / `verify_password`).
fn pbkdf2_b64(password: &str, salt: &[u8]) -> Result<String, String> {
    let mut out = Zeroizing::new([0u8; 32]);
    pbkdf2::<Hmac<Sha256>>(password.as_bytes(), salt, PBKDF2_ITERS, out.as_mut())
        .map_err(|e| format!("pbkdf2: {e}"))?;
    Ok(B64.encode(*out))
}

/// Read a `settings` value from the live DB connection (None if absent).
fn read_setting(db: &Database, key: &str) -> Result<Option<String>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        other => Err(format!("read setting {key}: {other}")),
    })
}

/// Serialize the pending marker to `{app_data}/password_change.pending`.
fn write_marker(path: &std::path::Path, marker: &ChangePasswordPending) -> Result<(), String> {
    let json = serde_json::to_string(marker).map_err(|e| format!("serialize marker: {e}"))?;
    std::fs::write(path, json).map_err(|e| format!("write marker: {e}"))
}

/// Summary returned to the frontend so it can show the post-change re-setup checklist (§6).
/// `rename_all = "camelCase"` is required: Tauri does not camelCase command *return* values
/// (only arguments), and the frontend `ChangeSummary` interface reads camelCase — without this
/// every field arrives as `undefined` and the success screen / checklist render blank.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeSummary {
    pub entries_reencrypted: usize,
    pub signals_reencrypted: usize,
    pub media_reencrypted: usize,
    /// Convenience factors invalidated by the change and needing re-setup.
    pub pin_disabled: bool,
    pub biometric_cleared: bool,
    pub recovery_key_regenerated: bool,
}

/// Reject the change before any mutation: empty inputs, new == current, or a wrong current
/// password. The current-password check compares against the stored PBKDF2 verifier (the same
/// hash `verify_password` uses on the unencrypted path); on encrypted installs the verifier row
/// is kept in sync at setup/migration, so this is an authoritative pre-mutation gate. (The
/// frontend also proves the old password by decrypting every blob in `reKeyBatch` first.)
fn validate_change(db: &Database, old_password: &str, new_password: &str) -> Result<(), String> {
    if old_password.is_empty() || new_password.is_empty() {
        return Err("password must not be empty".to_string());
    }
    if old_password == new_password {
        return Err("new password must differ from the current password".to_string());
    }
    if new_password.chars().count() < 8 {
        return Err("new password must be at least 8 characters".to_string());
    }
    match crate::db::get_password_hash(db)? {
        Some(settings) => {
            let salt = B64
                .decode(&settings.password_salt)
                .map_err(|e| format!("invalid stored salt: {e}"))?;
            let computed = pbkdf2_b64(old_password, &salt)?;
            if !constant_time_eq(&computed, &settings.password_hash) {
                return Err("current password is incorrect".to_string());
            }
        }
        None => {
            // No stored verifier. Fail CLOSED on an encrypted install — a missing verifier row
            // there is anomalous, and accepting any old password would let a caller re-key the
            // DB without proving knowledge of the current password. (A pre-setup unencrypted
            // install legitimately has no verifier, but change-password is unreachable there.)
            if db.is_encrypted() {
                return Err("cannot verify current password (no stored verifier)".to_string());
            }
        }
    }
    Ok(())
}

/// Constant-time string comparison (avoid leaking the verifier via timing).
fn constant_time_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}
