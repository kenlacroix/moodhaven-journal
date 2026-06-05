# HANDOFF — Architecture & Threat-Model Documentation

**Branch:** `task/architecture-docs`
**Commit:** `126d222`
**Date:** 2026-06-05

---

## What Changed

### New file: `docs/threat-model.md`

A full threat model covering:

- **Asset inventory** — journal content (critical), session key (critical), device identity (high), API credentials (high), plaintext metadata (low), voice memo audio (medium)
- **Trust boundaries** — JS WebView / Tauri IPC / filesystem / network, with what crosses each
- **Adversary model** — 7 in-scope adversaries (passive LAN observer, malicious LAN peer, compromised trusted device, compromised WebDAV server, local filesystem attacker, malicious whisper sidecar, remote AI provider) and 5 explicit out-of-scope adversaries
- **9 named threats (T1–T9)** — each with: description, mitigations (citing specific file + constant), and residual risk
- **Mitigations vs gaps table** — 15 rows; gap items flagged: v1 sync fallback (no forward secrecy), unlock_app bypass via IPC, voice memo audio unencrypted on disk, WebDAV restore not hash-verified, sidecar hash check missing
- **Intentional trade-offs table** — 7 rows explaining why metadata is plaintext, why per-entry salt vs master key, etc.

### Updated: `docs/peer-sync-security.md`

The previously documented protocol was v1-only and missing 3 of the 4 sync phases. Rewrote Layer 4 to reflect what's actually in the code:

| Was documented | What's actually implemented |
|:---|:---|
| v1 static SHA-256 key only | v2 X25519 ECDH (forward-secret) as primary; v1 as fallback |
| "Both sides verify trusted_devices.json" | Ed25519 challenge/signature handshake (`Auth` message) before any encrypted exchange |
| 1-phase sync (entries only) | 4 phases: Entries → Books → Signals → Settings |
| No settings sync | Settings sync with compile-time allowlist + field-level merge |
| No mention of timestamp validation | `MAX_FUTURE_SECS = 10` clock-skew limit on all peer timestamps |

Added: `NotTrusted` auto-revocation path; full protocol sequence diagram for v2; Security Review Scope section listing the exact files an auditor should read.

Threat table updated from the vague v1 claims to precise v2 mitigations.

### Updated: `docs/architecture.md`

Sync protocol summary block (§8) updated from the stale "derive SHA-256 v1 key" description to the correct v2 ECDH + 4-phase summary, with a pointer to `peer-sync-security.md` for the full protocol.

### Updated: `SECURITY.md`

- Supported versions table: was `0.9.x` (stale by 7 minor versions), now `1.6.x / 1.5.x`
- `CLAUDE.md §2` link was broken (that section doesn't exist); replaced with correct paths to `.claude/docs/security.md` and `docs/threat-model.md`
- TOTP version corrected: was `v1.2.0`, actually `v1.2.1` (when the encrypted-at-rest migration landed)
- Trade-offs table: added per-entry salt rationale, v1 sync fallback note, `clearKeyCache()` precision on the JS memory row
- Scope: added LWW timestamp forgery to in-scope vulnerability list

### Updated: `CONTRIBUTING.md`

- Stale test count `1172` removed (replaced with "All tests should pass") — avoids the doc going stale again
- `docs/threat-model.md` and `docs/peer-sync-security.md` added to the Architecture Guide key-files table

### Updated: `src-tauri/src/commands/peer_sync_engine/mod.rs`

Module docstring updated: the `## Transport encryption` section previously described only the v1 static key. Now correctly documents both v2 (primary, with forward secrecy, challenge/auth) and v1 (fallback, no forward secrecy).

---

## What Was Verified

- Cherry-pick landed cleanly; `git log` confirms `126d222` on `task/architecture-docs`
- `docs/threat-model.md` and updated `docs/peer-sync-security.md` exist in the working tree
- Threat model cross-references match actual code: `parse_peer_timestamp` + `MAX_FUTURE_SECS = 10` in `conflict.rs`; `SYNC_ALLOWED_SETTINGS = ["app_settings"]` in `conflict.rs`; `merge_settings_json` allowlist in `conflict.rs`; `derive_sync_key_ecdh` + `derive_sync_key_static` in `peer_sync_engine/crypto.rs`; `Auth` message and `NotTrusted` message in `peer_sync_engine/protocol.rs`
- No code changes were made; all edits are documentation-only

---

## What's Left (Adjacent Issues — Not Fixed)

Per operating rules these were logged rather than fixed:

1. **`unlock_app` IPC bypass gap (T9 residual risk)** — The Rust session lock trusts the frontend's call without re-verifying the password. A JS injection attack in the WebView could call `invoke('unlock_app')` directly. Hardening path: add a password token/HMAC to `unlock_app` that Rust validates before setting the unlock flag.

2. **Sync v1 fallback should be removed** — The static-key fallback in `derive_sync_key_static` has no forward secrecy. All shipped clients are v2-capable; the fallback path only exists for theoretical old peers. Removing it reduces attack surface.

3. **Voice memo audio unencrypted on disk** — Files in `voice_memos_incoming/` and the permanent store are not encrypted. They are deleted after transcription, but a crash or power loss could leave them behind. Future work: encrypt at write time, decrypt before passing to whisper sidecar.

4. **WebDAV restore not hash-verified** — `import_data` trusts the decryption result without a separate integrity check beyond the AES-GCM tag. The update download path (updater.rs) does SHA-256 verification; the WebDAV restore path does not. A compromised WebDAV server could serve a replayed older backup.

5. **Sidecar binary integrity** — No post-build hash verification of the whisper-cli sidecar binary. Mitigated by Tauri's bundle mechanism but not enforced at runtime.

6. **`architecture.md` data model** — The `journal_entries` schema block still shows `content TEXT` rather than `encrypted_content TEXT`, which is the actual column name in the code. This predates this PR; flagged for a future pass.

---

## Assumptions Made

- The `task/architecture-docs` branch was previously used for a different task (dep-modernization); the docs commit was cherry-picked onto it rather than branched from `main`. The base commits on this branch are unrelated to the documentation changes — they should not be included in the PR diff against `main`.
- The threat model's "no third-party audit" statement in `SECURITY.md` was already present and was preserved as accurate.
- Skills invoked: none matched the trigger keywords for this task (no `technical-writing` or `docs` skill was installed). Work was done ad-hoc using Read/Edit/Write tools with direct source code review.
