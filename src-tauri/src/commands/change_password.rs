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
//! SCAFFOLD STATUS: command surface, phase sequence, crash boundaries, and the pending
//! marker are in place and wired to the crash-replay harness placeholders
//! (`db::crash_replay::change_master_password::cmp_b0..b4`). The irreversible primitives
//! (`Database::rekey_in_place`, `media::reencrypt_all_media`) still return not-implemented,
//! so the command fails safely *before* mutating real data until the implementation pass.

use super::require_unlocked;
use crate::db::crash_point;
use crate::db::journal::EncryptedContent;
use crate::db::Database;
use crate::AppLockState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use zeroize::Zeroizing;

/// One re-encrypted journal entry blob produced by the frontend under the NEW password.
#[derive(Debug, Deserialize)]
pub struct ReencryptedEntry {
    pub id: String,
    pub encrypted_content: EncryptedContent,
}

/// One re-encrypted signal payload produced by the frontend under the NEW password.
#[derive(Debug, Deserialize)]
pub struct ReencryptedSignal {
    pub id: String,
    /// AES-256-GCM ciphertext payload (opaque string, as stored in `signals.payload`).
    pub payload: String,
}

/// Crash-recovery marker persisted to `{app_data}/password_change.pending`. Records which
/// phase the change reached so startup recovery can either roll forward (resume media + the
/// outer rekey) or recognize a pre-commit crash (data still wholly on the old password).
///
/// Key material is deliberately NOT persisted: if the process dies mid-change, resuming the
/// keyed steps requires the user to re-enter both passwords (see plan §"Startup crash
/// recovery"). The marker carries only what is safe at rest — the phase and the new salt.
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

/// Change the master password. Steps 4–6 of plan §4 are collapsed here into one Rust call
/// so a crash leaves only "before inner commit" (full rollback to old) or "after rekey"
/// (fully new), minimizing the resumable middle (plan §8 "outer/inner skew").
///
/// `entries` / `signals` are the frontend-re-encrypted blobs (under `new_password`).
/// `recovery_blob` is the regenerated recovery-key wrap, if recovery is enabled.
#[tauri::command]
pub async fn change_master_password(
    db: State<'_, Database>,
    lock: State<'_, AppLockState>,
    _app: AppHandle,
    old_password: String,
    new_password: String,
    new_salt_b64: String,
    entries: Vec<ReencryptedEntry>,
    signals: Vec<ReencryptedSignal>,
    recovery_blob: Option<String>,
) -> Result<ChangeSummary, String> {
    require_unlocked(&lock)?;
    let old_password = Zeroizing::new(old_password);
    let new_password = Zeroizing::new(new_password);

    // Phase 0 — validate before any mutation (plan §4.1). Wrong current password, weak new
    // password, or new == current are all rejected here, before the marker is ever written.
    validate_change(&old_password, &new_password)?;
    let _ = (&entries, &signals, &recovery_blob, &new_salt_b64);

    // ── Phase 1: inner txn (entries + signals + TOTP + verifier), still on OLD outer key ──
    // TODO(§4.4): write the InnerPending marker, then in ONE SQLite txn bulk-UPDATE the
    // re-encrypted entry/signal blobs, call two_factor::reencrypt_totp(&conn, old, new),
    // write the new verifier hash, and the regenerated recovery_blob; commit atomically.
    crash_point!("cmp.before_inner_commit");
    // <commit happens here>
    crash_point!("cmp.after_inner_commit");

    // ── Phase 2: media re-encryption (filesystem, non-transactional — the weak link) ──────
    // TODO(§4.5): media::reencrypt_all_media(&_app, &old_password, &new_password), updating
    // the marker's media_done as each file's stage-then-rename completes.
    crash_point!("cmp.mid_media");
    let _ = db; // (db handle used by the real rekey below)

    // ── Phase 3: outer SQLCipher rekey ────────────────────────────────────────────────────
    crash_point!("cmp.before_rekey");
    // TODO(§4.6): derive new outer key from new_password + new_salt_b64, then
    // db.rekey_in_place(&new_key, &new_salt_b64).
    crash_point!("cmp.after_rekey");

    // ── Phase 4: invalidate stale convenience copies + clear marker (plan §4.7, §5) ───────
    // TODO: pin_disable + biometric_clear_session; recovery key already regenerated in
    // Phase 1; delete the PENDING_MARKER (idempotent).

    let _ = recovery_blob;
    Err(
        "change_master_password not yet implemented (active-plans/change-password.md §4)"
            .to_string(),
    )
}

/// Summary returned to the frontend so it can show the post-change re-setup checklist (§6).
#[derive(Debug, Serialize)]
pub struct ChangeSummary {
    pub entries_reencrypted: usize,
    pub signals_reencrypted: usize,
    pub media_reencrypted: usize,
    /// Convenience factors invalidated by the change and needing re-setup.
    pub pin_disabled: bool,
    pub biometric_cleared: bool,
    pub recovery_key_regenerated: bool,
}

/// Reject the change before any mutation: empty inputs, or new == current.
fn validate_change(old_password: &str, new_password: &str) -> Result<(), String> {
    if old_password.is_empty() || new_password.is_empty() {
        return Err("password must not be empty".to_string());
    }
    if old_password == new_password {
        return Err("new password must differ from the current password".to_string());
    }
    // TODO(§4.1): verify `old_password` via the existing verifier and enforce new-password
    // strength here (shared with the frontend rule).
    Ok(())
}
