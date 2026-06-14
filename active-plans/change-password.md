# Change Master Password

> **Status:** Plan / not started. Grounded in a full read of the crypto stack (2026-06-08).
> **Estimated effort:** ~1 week for the re-encrypt approach (Approach A). The wrap-the-key
> refactor (Approach B) is a larger, separate follow-up.
> **Owner:** TBD

---

## 0. Product judgment & decision (2026-06-08)

**Decision: build it.** The user value alone is modest — for a local-first, offline, no-account
journal there's no server credential to revoke, so password *rotation* mostly serves "someone saw
my password" (rare) plus "table-stakes button users expect." Forgot-password is already covered by
the Recovery Key + Erase & Start Fresh and is **not** what this feature addresses (it requires the
current password).

**The real driver is exposure.** "I built crash-safe master-password rotation across a
double-encryption layer (SQLCipher outer + per-field AES-GCM inner), with SIGKILL crash-replay
tests" is a strong engineering-writing story — in the same vein as the self-pentest series. So this
is built **as a feature *and* as the basis for a blog post**, and that combination is what justifies
the ~1 week against its modest raw demand.

**Implication for how we build it:** lean into the parts that make the best post — the
two-layer/two-runtime re-encryption, the atomicity design, the crash-recovery marker, and the
crash-replay test matrix. Those are exactly the load-bearing engineering bits anyway, so the blog
angle and the correctness work point the same direction. See §11 for the writing plan.

---

## 1. Goal

Let an unlocked user change their master password from **Settings → Privacy**, preserving all
data and every dependent unlock path, without ever weakening the zero-knowledge model or risking
data loss on interruption.

Not in scope: password *reset* without the old password (that is what the Recovery Key and
"Erase & Start Fresh" already cover). Change-password **requires the current password**.

---

## 2. Why this is not a one-liner

The password *is* the key. There is no master key to re-point, so "change password" means
**re-deriving keys and re-encrypting / re-wrapping everything that depends on the old password.**
There are two independent encryption layers, both keyed off the password, and the work spans both
the Rust backend and the JS frontend (where the per-field keys live).

### Two password-derived layers

| Layer | Key | Where | Salt | Re-encrypt cost |
|---|---|---|---|---|
| **Outer — SQLCipher whole-DB** | `PBKDF2(password, db_salt, 600k)` applied as raw `PRAGMA key = "x'…'"` | `src-tauri/src/db/mod.rs`; salt in `db_state.json` | one salt | one atomic rekey of the file |
| **Inner — per-field AES-256-GCM** | `PBKDF2(password, per-field salt, 600k)` | frontend `src/lib/services/crypto.ts`; per-row blobs | one salt **per blob** | decrypt + re-encrypt **every** blob |

On the encrypted path (all v1.8.0+ installs) SQLCipher's MAC verification on key-apply *is* the
password check — there is no separate verifier-hash compare (`journal.rs::verify_password`,
encrypted branch). The legacy `password_hash`/`password_salt` in `user_settings` is only consulted
on the pre-migration unencrypted path, but we still update it on change for consistency.

### Everything that depends on the old password

From a full audit of the stack:

| # | Item | File(s) | Stored as | Action on change |
|---|---|---|---|---|
| 1 | Journal entry content | `crypto.ts`, `commands/journal.rs` | per-field blob (own salt) | **re-encrypt** (FE has the key) |
| 2 | Signals payload | `signalService.ts`, `commands/signals.rs` | per-field blob | **re-encrypt** (FE) |
| 3 | Media attachments | `commands/media.rs` (MBMF, 32-byte salt header) | encrypted files on disk | **re-encrypt** (Rust) |
| 4 | SQLCipher DB key | `db/mod.rs`, `db_state.json` | password-derived, salt on disk | **rekey** the whole file (Rust) |
| 5 | TOTP secret | `commands/two_factor.rs` (`enc:v1:…`) | per-field blob | **re-encrypt** (Rust) |
| 6 | PIN unlock | `commands/pin_unlock.rs` | wrapped copy of the password | **stale → re-wrap or disable** |
| 7 | Desktop biometric | `commands/biometric.rs` | password in OS keyring | **stale → re-store or clear** |
| 8 | Recovery key | `recoveryKeyService.ts` | wrapped copy of the password | **stale → regenerate** |
| 9 | Verifier hash | `crypto.ts::hashPassword`, `journal.rs` | PBKDF2 hash + salt | **update** |
| 10 | Hardware key | `commands/hardware_key.rs` | independent secret (NOT the password) | **no action** |
| 11 | Export files | `commands/data_management.rs` | self-contained envelope per export | **no action** (old backups keep old password) |

Items 1–5 + 9 are the irreversible re-encryption work. Items 6–8 are convenience copies that
become stale; the safe default is to **invalidate** them and prompt re-setup (re-wrapping them
silently is possible but multiplies the atomic surface — see §5). Item 10 is genuinely independent.
Item 11 needs nothing.

---

## 3. Two approaches

### Approach A — Re-encrypt in place (recommended first)

Decrypt every dependent blob with the old password, re-encrypt with the new one; rekey the outer
SQLCipher layer; update the verifier; invalidate stale convenience copies. No architecture change,
ships a real feature. Cost is **O(data size)** and the hard part is crash-safety across the
JS/Rust boundary and the on-disk media files.

**Pros:** no schema/crypto-core change; entries stay individually keyed (the current model);
nothing new to maintain. **Cons:** every change-password re-encrypts all data; media (filesystem,
non-transactional) is the crash-safety weak point; orchestration spans FE + Rust.

### Approach B — Wrap-the-key indirection (later refactor)

Introduce a random **master data key (MDK)** that encrypts all fields; store the MDK encrypted by
the password-derived key (exactly the shape PIN/biometric/recovery already use for the password).
Change-password then only re-wraps the MDK — **O(1)**, instant, trivially atomic (one blob write).

**Pros:** change-password and all future rotations become a single cheap, atomic re-wrap; PIN /
biometric / recovery wrap the *MDK* instead of the password, so they survive a password change
without re-setup. **Cons:** it is a crypto-core change; current blobs are keyed directly by the
password, so adopting it still requires a **one-time full re-encryption migration** (essentially
one run of Approach A) plus careful versioning and its own crash-safe migration. Bigger up-front
risk for a feature users hit rarely.

**Recommendation:** ship **Approach A** now (real feature, no core change). Treat **Approach B**
as a separate, later refactor — and note that when B lands, the migration *is* an A-style
re-encrypt, so A's machinery (batching, the pending-marker, media swap) is reused, not thrown away.

The rest of this plan details Approach A.

---

## 4. Approach A — implementation

### Orchestration model

Per-field keys for entries (1) and signals (2) live only in JS, so the FE must do that
re-encryption; media (3), TOTP (5), the DB rekey (4), verifier (9), and convenience-copy
invalidation (6–8) are Rust-side. The FE orchestrates; Rust performs the irreversible file ops last,
gated by a crash-recovery marker that mirrors the existing `moodhaven_restore.pending` + `.sha256`
pattern.

### Phase sequence

1. **FE — collect & validate.** User enters current + new + confirm. Verify current via
   `verify_password`. Enforce new-password strength and `new != current`.
2. **FE — inner re-encrypt (entries + signals).** Stream in batches: fetch blobs → `decrypt(old)`
   → `encrypt(new)`. Do **not** mutate the DB yet; build the batch of new blobs. Batching keeps
   memory bounded for large journals; entries are text so this is cheap, but stream rather than
   load-all.
3. **FE → Rust `password_change_begin`.** Write `password_change.pending` (phase marker, new salt,
   old/new key material held only in memory for the call). From here, startup recovery owns the
   outcome.
4. **Rust — atomic DB transaction (still on the OLD SQLCipher key):** in one SQLite txn:
   bulk-UPDATE the re-encrypted entry + signal blobs (passed from FE), re-encrypt the TOTP secret
   (Rust holds old+new password), write the new verifier hash/salt, and write the FE-computed
   regenerated recovery-key blob (if recovery enabled). Commit atomically. Inner layer is now fully
   on the new password; outer layer still old.
5. **Rust — media re-encrypt (the hard part).** For each MBMF file: decrypt(old) → encrypt(new) to
   a staging file → fsync → atomic rename over the original, recording each completed file in the
   pending marker so a crash can resume. Reuse `media.rs`'s existing encrypt/decrypt helpers and the
   Windows-safe rename pattern already in `db/mod.rs`.
6. **Rust — rekey outer SQLCipher.** Add `rekey_in_place(new_key, new_salt_b64)` to `db/mod.rs`,
   modeled on `encrypt_in_place` (either `PRAGMA rekey = "x'<newhex>'"` if validated reliable on all
   three OSes, or the `sqlcipher_export`-into-new-keyed-file + crash-safe swap that the codebase
   already trusts). Write the new salt to `db_state.json`. Update `db_key_state` to the new key.
7. **Rust — invalidate stale convenience copies & finish.** Disable/clear PIN (`pin_*`), clear the
   desktop biometric keyring entry (`biometric_clear_session`). Recovery key was regenerated in
   step 4 (or disable + prompt if we choose not to auto-regen). Delete `password_change.pending`.
   Return a summary of which factors now need re-setup.
8. **FE — post-change UX.** Confirm success; surface a checklist: "Re-enable PIN / biometric"
   (recovery key already updated, or "regenerate recovery key" if not auto-handled).

### Startup crash recovery

On launch, if `password_change.pending` exists, read its phase:
- Inner txn not committed → the txn rolled back; data is wholly on the **old** password. Recover by
  discarding the marker and telling the user the change did not complete (retry).
- Inner committed, media/rekey incomplete → resume media swap from the recorded progress, then
  finish the rekey, then clear the marker. The marker must carry enough to finish deterministically
  (new salt + per-file media progress); old/new key material is **not** persisted to disk — if the
  process died, recovery requires the user to re-enter both passwords to resume, or we roll forward
  only the parts that don't need a key (rename of already-staged media) and re-prompt for the rekey.
  **Design decision to finalize in implementation:** simplest safe option is to make steps 4–6 a
  single Rust call so a crash leaves only "before txn commit" (full rollback to old) or "after rekey"
  (fully new) — minimizing the resumable middle. Media staging happens before the txn commit so a
  crash before commit just leaves orphan staging files to GC.

### New / changed commands (sketch)

- `password_change_begin` / `password_change_commit(entries, signals, recoveryBlob, oldPw, newPw)` —
  or a single `change_master_password(...)` that does steps 4–6 atomically (preferred for crash-safety).
- `db/mod.rs::rekey_in_place(new_key, new_salt_b64)`.
- `media.rs::reencrypt_all(old_pw, new_pw)` (staging + swap + progress).
- `two_factor.rs::reencrypt_totp(old_pw, new_pw)`.
- Reuse existing: `verify_password`, `store_password_hash`, `pin_disable`, `biometric_clear_session`,
  recovery-key store.
- Register in `lib.rs` + `capabilities/default.json`; all gated by `require_unlocked`.

---

## 5. Convenience copies: invalidate vs. re-wrap

Default: **invalidate and prompt** (disable PIN, clear biometric; regenerate or disable recovery
key). Rationale: re-wrapping PIN/biometric requires their secrets (the PIN itself; an OS-keyring
write) inside the same atomic window, widening the failure surface for marginal UX gain on a rare
action. The post-change checklist makes re-setup a 10-second task. Recovery key is the one worth
auto-regenerating in-band (FE can compute the new wrapped blob from the known recovery code only if
the user re-enters it — otherwise prompt to generate a fresh one and re-display it once).

> **Implemented (2026-06-09):** recovery-key **re-escrow** now ships. When a recovery key is
> enabled, the change-password modal offers an optional recovery-key field; if the user re-enters
> it, the FE verifies it opens the current password, re-wraps the *new* password under it
> (`wrapPasswordForRecovery`, pure — no `set_setting`), and passes the blob to
> `change_master_password`, which installs it inside the atomic flip. Left blank → the stale key is
> disabled and the checklist prompts regeneration (the original default). PIN/biometric remain
> invalidate-and-prompt.
>
> **Browser/PWA:** `get_entry_rekey_blobs` / `change_master_password` are desktop/Tauri-only (no
> SQLCipher layer or on-disk media to rekey in browser mode). The shim throws a clear
> "requires the desktop app" error and `PrivacyTab` hides the section when `isBrowser`.

(Approach B removes this problem entirely: those factors wrap the MDK, not the password, so they
survive a change untouched.)

---

## 6. UX

- **Settings → Privacy → Change Password** (new row near PIN/biometric).
- Modal: current password, new password (strength meter), confirm. Inline note: "Changing your
  password re-encrypts your journal — keep the app open until it finishes."
- Progress UI for the re-encryption (entries/media count), since large journals take real time —
  reuse the migration-progress emit pattern noted in the P0 roadmap item.
- On completion: success + a checklist of factors to re-enable (PIN, biometric) and the
  regenerated recovery key (shown once) if applicable.
- Hard-lock the UI against navigation/lock during the operation; the marker protects against crash
  but we should not invite one.

---

## 7. Testing

> **The crash-replay test infrastructure is being built first, on its own branch, before this
> feature** — see [`crash-replay-harness.md`](crash-replay-harness.md). It is proven against the
> existing `encrypt_in_place` migration and then reused here by dropping `crash_point!` markers into
> `change_master_password`'s phase boundaries and un-ignoring the placeholder matrix. The SIGKILL
> output it produces is the credibility anchor for the blog post (§11).

- **Rust integration (highest value):** seed an encrypted DB with entries + signals + media + TOTP
  + PIN + recovery key → run change_master_password → assert: old password fails, new password
  unlocks, all entries/signals/media decrypt under the new password, TOTP still validates, PIN is
  disabled, recovery key regenerated (or disabled), `db_state.json` salt updated.
- **Crash-replay:** SIGKILL at each phase boundary (before txn commit, mid-media, after rekey) →
  relaunch → assert either clean "old password still works" or "new password works", never a
  half-state, never data loss. This is the load-bearing test.
- **Password-mismatch / wrong current password** → rejected before any mutation.
- **FE unit:** the batch decrypt-old/encrypt-new transform round-trips.
- Fits the existing CI `cargo test` + vitest lanes.

---

## 8. Risks

- **Data loss on interruption** — the entire reason for the pending-marker + single-atomic-Rust-call
  design and the crash-replay tests. Treat as the #1 risk.
- **Media swap** (filesystem, non-transactional) — the weakest link; stage-then-rename with progress.
- **Outer/inner skew** — inner committed but outer not rekeyed (or vice versa) must be impossible to
  leave persistent; collapse steps 4–6 into one Rust call.
- **Memory** for large journals — stream/batch the FE re-encryption, don't load all blobs at once.
- **Cross-boundary orchestration** — FE holds entry/signal keys, Rust holds the rest; keep the
  irreversible ops Rust-side and last.

---

## 9. Out of scope / explicitly not building

- Password *reset* without the old password (covered by Recovery Key + Erase & Start Fresh).
- Auto-re-wrapping PIN/biometric in-band (invalidate + prompt instead; revisit under Approach B).
- Hardware-key changes (independent of the password).
- Migrating old export files (they are self-contained under the password used at export time).

---

## 10. Recommendation

Build **Approach A** as one well-tested feature: a single atomic Rust `change_master_password`
spanning the inner re-encrypt commit → media swap → outer rekey, fronted by a batched FE
re-encryption and a crash-recovery marker, with invalidate-and-prompt for convenience factors.
Defer **Approach B** (wrap-the-key MDK) as a separate refactor whose one-time migration reuses this
machinery — and which then makes every future password change instant and atomic.

---

## 11. Blog post (the exposure deliverable)

This feature is being built partly to write about it, like the self-pentest series. Capture the
material *while building*, not after — screenshots, the crash-replay test output, the before/after
architecture.

**Working title:** "Changing a password is a one-liner — unless you encrypt everything. How I built
crash-safe master-password rotation."

**The narrative arc (this is the post):**
1. The naïve expectation — "Settings → Change Password, how hard can it be?"
2. The reveal — in a zero-knowledge app the password *is* the key; there's nothing to "update."
3. The complication — **two** password-derived layers (SQLCipher outer + per-field AES-GCM inner),
   keyed across **two** runtimes (JS holds entry/signal keys, Rust holds the rest).
4. The real enemy — atomicity. Re-encrypting an entire encrypted database where one layer is in a
   SQLite transaction and the other is loose files on disk, such that a crash never loses data.
5. The design — the `password_change.pending` marker, collapsing inner-commit → media-swap →
   outer-rekey into one atomic call, invalidate-vs-rewrap for convenience factors.
6. The proof — SIGKILL at every phase boundary, assert no half-state, ever. Show the test matrix.
7. The "do it right" coda — the wrap-the-key (MDK) refactor that makes it all O(1), and why I
   shipped the honest version first.

**Two cuts, matching the established framing** ([[feedback-pentest-blog-framing]]):
- **MoodHaven site** — user-trust voice: "what changing your password actually does, and why it's
  safe to interrupt."
- **Personal site** — engineering/learning voice: the full two-layer atomicity story; this is the
  exposure piece.

**Assets to capture during the build:** the dependency table (§2), the phase-sequence diagram (§4),
the crash-replay results (§7), and a short clip/screens of the progress UI on a large journal.

**Sequencing:** write the post *after* the feature lands and the crash-replay suite is green — the
test output is the credibility anchor, same as the pentest pcaps were.
