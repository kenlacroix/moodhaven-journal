# Change-Password — Pre-Ship Security Review

> Status: **FIXES APPLIED + VERIFIED** (uncommitted, in the worktree). All HIGH/MED items below
> are fixed. Remaining: commit/push, then the on-device live-test on Windows.
>
> Verification (worktree, reusing the main tree's cargo target):
> - `cargo check --all-targets` (lib + examples + tests) — clean.
> - `cargo test --lib` — **220 passed**, including the 5 crash-replay boundaries (cmp_b0..b4) and
>   `rekey_in_place_happy_path_flips_old_to_new`.
> - `tsc --noEmit` — clean. `vitest` changePasswordService + recoveryKeyService — **14 passed**.
>
> Work is in an **isolated git worktree** (`../MoodBloom-cmp-review`, branch
> `feat/change-master-password-impl`) because a concurrent session keeps switching branches in the
> main tree. The branch is checked out exclusively by the worktree, so it's safe there.

## Method

Verified each published blog claim against the implementation with a 26-agent fan-out
(6 claim-cluster verifiers + adversarial confirmation). Findings below are adversarially confirmed.

## Verified claims (design is sound)

- Single atomic flip / old-XOR-new: the only commit discriminator is the `db_state.json` salt
  write in `Database::rekey_in_place`; `recover_rekey_tmp` promotes-or-discards on
  `cur_salt == marker.new_salt`. Pre-commit → OLD; post-commit → NEW; keyless tail resumes on
  next launch. (`db/mod.rs`)
- Recovery-key re-escrow: new blob wraps the NEW password; blank field retires the old key; FE
  verifies the typed code before re-wrapping. No stale recovery key silently survives.
- Password never persisted (marker carries a salt, not a key); keys in `Zeroizing`; nothing
  logged/emitted; old key dropped after rekey. OAuth tokens correctly out of scope (keyring-keyed).
- Requires current password, lock-gated, browser build refuses, ACL-registered.

## Confirmed defects → fix status

| # | Sev | Finding | Fix status |
|---|-----|---------|------------|
| 1 | HIGH | **TOCTOU / under-fetch data loss.** FE fetches blobs, re-keys, then calls the command; rows written in between (writer-window auto-save, `publish_voice_memo_draft`, peer `upsert_entry_from_sync`) keep OLD inner ciphertext in the NEW-keyed DB → undecryptable. Also `db::list_signals` defaults to 200 / caps at 1000, and the FE called it unbounded → **>200 signals silently stranded**. | **DONE** — 3 parts: (a) new unbounded `get_signal_rekey_blobs`/`db::get_all_signal_blobs`, FE swapped off `list_signals`; (b) row-count **parity backstop** inside `apply_inner` (count mismatch → safe abort, no loss); (c) **write-gate** (`RekeyInProgress` + `require_no_rekey`) armed by `change_password_begin` before the FE fetch and via the command's own Drop guard, gating the 7 data-write commands, disarmed on `lock_app`. |
| 2 | HIGH | **`ChangeSummary` serialized snake_case** → every field `undefined`; checklist never renders. | **DONE** (`#[serde(rename_all="camelCase")]`) |
| 3 | MED | **Stale PIN/biometric survive a post-commit crash.** | **DONE** — PIN-row deletes moved **inside** `apply_inner` (atomic with the flip); `finish_pending_password_change` made commit-aware and now also clears the biometric keyring on the committed-recovery path. |
| 3b | MED | **(found while fixing #3)** `finish_pending_password_change` unconditionally promoted staged media — reachable **pre-commit** (crash during media staging, no tmp yet) → promotes new-keyed media over originals while the DB is still old-keyed → media unreadable. | **DONE** — now discards staging when not committed; promotes only when `db_state.salt == marker.new_salt`. |
| 4 | MED | **Crash matrix didn't exercise inner re-encryption** (no-op `apply_inner` in the probe). | **DONE** — `crash_probe.rs` now does a real inner re-write (sentinel → `SENTINEL_VAL_NEW`) and verify asserts the inner value tracked the flip (old-XOR-new on the inner write, not just the outer rekey). |
| 5 | LOW | `validate_change` failed OPEN if the verifier row is absent. | **DONE** (fail-closed on `db.is_encrypted()`) |
| 6 | LOW | Legacy-plaintext TOTP seed never rotated (stays plaintext). | accept (documented; disable/re-enable migration owns it) |
| 7 | LOW | One undecryptable entry/signal aborts the whole change. | accept (fail-safe by design) |
| 8 | LOW | Decrypted TOTP seed left un-zeroized in `reencrypt_totp`. | **DONE** (`Zeroizing`) |
| 9 | LOW | Wrong-recovery-key compare isn't constant-time. | accept (FE, low value) |

## What the safe pre/post-commit split now guarantees

`change_master_password` is split into a fallible **pre-commit** closure (marker → media staging →
`rekey_in_place` with the inner writes + parity backstop) and a best-effort **keyless tail**. A
pre-commit error tidies the marker + staged media and returns with the live DB untouched; the tail
never returns `Err` (a propagated post-commit error would falsely report failure on a committed
change — startup recovery is the backstop). This also fixed a latent wart where the original tail
`?`-propagated `finish_media_renames` post-commit.

## Implementation notes (all applied — this is what was built)

**Fix 1 (HIGH) — close the data-loss window. Three parts:**

a. **Unbounded signal fetch.** Add `db::get_all_signal_blobs(&db) -> Vec<(String,String)>`
   (`db/signals.rs`, mirror `get_all_entry_blobs`; `SELECT id, payload FROM signals ORDER BY id`,
   NO limit). Add command `get_signal_rekey_blobs` (`commands/signals.rs`) returning
   `[{id, payload}]`. Register in `lib.rs` invoke_handler + `permissions/app-commands.toml`.
   FE: in `changePasswordService.ts` `runChangePassword`, replace
   `invoke('list_signals', {})` with `invoke('get_signal_rekey_blobs')`.

b. **Parity backstop inside `apply_inner`** (`change_password.rs`, after the entry+signal UPDATE
   loops, before `reencrypt_totp`): `SELECT count(*) FROM journal_entries` must equal
   `entries.len()`; `SELECT count(*) FROM signals` must equal `signals.len()`. On mismatch return
   `Err(...)` → the not-yet-promoted tmp is discarded (pre-commit) → safe rollback to OLD, no loss.
   Also restructure the command so a pre-commit error cleans up (`cleanup_media_staging` + remove
   marker) and the **post-commit tail is best-effort** (do NOT `?`-propagate `finish_media_renames`
   — startup recovery is the backstop; propagating it post-commit would surface a false failure and
   the cleanup branch must never run after commit or it deletes committed new-keyed media).

c. **Write-gate guard** (prevents benign aborts from background writers). Add
   `pub struct RekeyInProgress(AtomicBool)` to `lib.rs` (+ `app.manage`). Add
   `require_no_rekey(&State<RekeyInProgress>)` to `commands/mod.rs`. New commands
   `change_password_begin` (require_unlocked → arm) and `change_password_cancel` (disarm);
   `change_master_password` arms early + disarms via a `Drop` guard. Gate (add
   `rekey: State<'_, crate::RekeyInProgress>` + `super::require_no_rekey(&rekey)?` after each
   `require_unlocked`): `create_journal_entry`, `update_journal_entry`, `delete_journal_entry`
   (journal.rs), `create_signal` (signals.rs), `publish_voice_memo_draft` (voice_memos.rs),
   `upsert_entry_from_sync` (sync.rs), `save_media_attachment` (media.rs). Disarm in `lock_app`
   (data_management.rs). FE: call `change_password_begin` before fetching blobs; on any throw before
   the command returns, call `change_password_cancel`. Register both new commands in lib.rs +
   app-commands.toml.

**Fix 3 (MED) — stale PIN/biometric on crash:**
- Move the three PIN `DELETE FROM settings` (`pin_salt`/`pin_blob`/`pin_enabled`) INTO
  `apply_inner` (atomic with the flip); remove the keyless-tail `clear_pin` call and the now-unused
  `clear_pin` fn.
- In `db/mod.rs::finish_pending_password_change`, also call
  `crate::commands::biometric::biometric_clear_session()` (keyless, idempotent) so a crash-after-
  commit recovery clears the stale biometric keyring credential too.

**Fix 8 (LOW):** wrap the decrypted seed in `reencrypt_totp` (`two_factor.rs`) in `Zeroizing`.

**Fix 4 (test gap):** make the crash-replay probe (`examples/crash_probe.rs`) drive `rekey_in_place`
with a real `apply_inner` (a representative entry/signal/TOTP/verifier UPDATE), so the kill-at-every-
boundary matrix actually covers the inner writes the blog claims are proven.

## Files touched (worktree, uncommitted — 17 files, +457/−172)

Rust: `commands/change_password.rs` (the bulk), `lib.rs` (`RekeyInProgress` + manage + 3 new cmd
regs), `commands/mod.rs` (`require_no_rekey`), `commands/{journal,signals,voice_memos,sync,media}.rs`
(write-gate on 7 commands + `get_signal_rekey_blobs`), `commands/data_management.rs` (disarm on lock),
`commands/two_factor.rs` (zeroize seed), `db/mod.rs` (`finish_pending_password_change` commit-aware +
biometric clear), `db/signals.rs` (`get_all_signal_blobs`), `examples/crash_probe.rs` (real inner
write), `permissions/app-commands.toml` + `gen/schemas/acl-manifests.json` (ACL for 3 new cmds).
Frontend: `lib/services/changePasswordService.ts` (begin/cancel + unbounded signal fetch),
`lib/backend/browser-invoke.ts` (3 new cmds → desktop-only throw).

## Windows live-test — IN PROGRESS (resume here)

Goal: empirically verify on `desktop-tplfj56` (SSH via Kali jump host
`ssh -J ken@kali.tail06c6c3.ts.net ken@desktop-tplfj56.tail06c6c3.ts.net`, PowerShell shell):
old key can't decrypt post-change, DB stays SQLCipher ciphertext, salt rotated, no leftover
`password_change.pending`/`moodhaven_rekey.db`, PIN/biometric cleared, recovery re-escrow correct,
camelCase summary renders. Plus the TOCTOU repro: write from the breakout writer mid-change.

**Done so far on the VM:**
- Uninstalled the old MoodHaven **1.8.2** (no journal DB existed — only WebView2 cache — so nothing lost).
- Transferred the branch via git bundle (no push) → fetched into `C:\Users\Ken\moodhaven-journal`,
  checked out `feat/change-master-password-impl` @ `f6ed956`. (Prior branch `fix/security-pt6-acl-lockguard`
  was `git stash`-ed first — `git stash pop` to restore it later.)
- `cargo test --lib` on Windows got 5.3 min in (hundreds of crates OK) then failed — **environmental, not code**.
- **`npm install` + `npm run build` succeeded** — `dist/` is built; `node_modules` present.

**Two environmental blockers (both being worked around, neither is a code defect):**
1. **OpenSSL needs Strawberry Perl + nmake.** SQLCipher (`rusqlite`→`libsqlite3-sys`→`openssl-sys`,
   vendored) compiles OpenSSL from source. Needs `perl` + MSVC `nmake`. Git-for-Windows' msys perl
   is too cut-down (fails in `config.pm`). MSVC `nmake` is available via `Enter-VsDevShell`
   (VS BuildTools 2022 at `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools`).
2. **C: was full** (32 GB disk, 0.1 GB free). The **F: drive has ~11.7 GB free** — use it for the build.

**VM state right now (clean):** C: target deleted (C: free ~1.7 GB); `F:\cargo-target`, `F:\temp`,
`F:\dl` created; `dist/` + `node_modules` intact; Strawberry Perl NOT yet installed (the 5.40.0.1
portable URL 404'd — get a valid portable-zip URL from https://strawberryperl.com/releases.html,
e.g. a 5.38/5.32 `-64bit-portable.zip`).

**Resume steps:**
1. Download a valid Strawberry Perl **portable** zip to `F:\dl`, `Expand-Archive` to `F:\strawberry`
   (perl ends up at `F:\strawberry\perl\bin\perl.exe`).
2. Build (one PowerShell session): prepend `F:\strawberry\perl\bin` to PATH (before Git's perl);
   `Enter-VsDevShell -VsInstallPath '<BuildTools>' -SkipAutomaticLocation -DevCmdArguments '-arch=x64'`;
   set `$env:CARGO_TARGET_DIR='F:\cargo-target'` and `$env:TEMP=$env:TMP='F:\temp'` (C: too tight for
   temp); `cd C:\Users\Ken\moodhaven-journal\src-tauri; cargo build` (debug; dist already built, so the
   exe embeds the frontend). Output: `F:\cargo-target\debug\moodhaven-journal.exe`.
3. Hand the exe path to the user to run **from their RDP session** (an SSH-launched GUI won't appear in
   their session). They: create journal w/ known throwaway pw `oldpass123`, write 2-3 entries, optionally
   set a PIN + Recovery Key, then Settings → Privacy → Change Password → `newpass456`; report both pws.
4. Verify on-disk via SSH (see Goal). For the old-key-fails/new-key-opens crypto proof, derive PBKDF2(600k,
   pw, salt-from-`db_state.json`) and try `PRAGMA key = "x'<hex>'"; SELECT count(*)` — mirror
   `crash_probe.rs::keyed_sentinel_value`. App data dir: `C:\Users\Ken\AppData\Local\com.moodhaven.app`.

Alternative if the VM build stays painful: trigger `.github/workflows/build.yml` (has `workflow_dispatch`,
builds Windows) on the branch → download the NSIS installer artifact → install on the VM (needs the
branch pushed; user said don't MERGE, hasn't spoken to push).
