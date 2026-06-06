# HANDOFF — Architecture & Threat-Model Documentation

**Branch:** `task/architecture-docs`
**Last commit:** `e7c9fe6`
**Date:** 2026-06-06

---

## What Changed

### Session 1 (2026-06-05 — commit `126d222`)

#### New file: `docs/threat-model.md`

A full threat model covering:

- **Asset inventory** — journal content (critical), session key (critical), device identity (high), API credentials (high), plaintext metadata (low), voice memo audio (medium)
- **Trust boundaries** — JS WebView / Tauri IPC / filesystem / network, with what crosses each
- **Adversary model** — 7 in-scope adversaries (passive LAN observer, malicious LAN peer, compromised trusted device, compromised WebDAV server, local filesystem attacker, malicious whisper sidecar, remote AI provider) and 5 explicit out-of-scope adversaries
- **9 named threats (T1–T9)** — each with: description, mitigations (citing specific file + constant), and residual risk
- **Mitigations vs gaps table** — 15 rows; gap items flagged: v1 sync fallback (no forward secrecy), unlock_app bypass via IPC, voice memo audio unencrypted on disk, WebDAV restore not hash-verified, sidecar hash check missing
- **Intentional trade-offs table** — 7 rows explaining why metadata is plaintext, why per-entry salt vs master key, etc.

#### Updated: `docs/peer-sync-security.md`

The previously documented protocol was v1-only and missing 3 of the 4 sync phases. Rewrote Layer 4 to reflect what's actually in the code:

| Was documented | What's actually implemented |
|:---|:---|
| v1 static SHA-256 key only | v2 X25519 ECDH (forward-secret) as primary; v1 as fallback |
| "Both sides verify trusted_devices.json" | Ed25519 challenge/signature handshake (`Auth` message) before any encrypted exchange |
| 1-phase sync (entries only) | 4 phases: Entries → Books → Signals → Settings |
| No settings sync | Settings sync with compile-time allowlist + field-level merge |
| No mention of timestamp validation | `MAX_FUTURE_SECS = 10` clock-skew limit on all peer timestamps |

Added: `NotTrusted` auto-revocation path; full protocol sequence diagram for v2; Security Review Scope section listing the exact files an auditor should read.

#### Updated: `docs/architecture.md` (§8)

Sync protocol summary block updated from stale "derive SHA-256 v1 key" to correct v2 ECDH + 4-phase summary.

#### Updated: `SECURITY.md`

- Supported versions table: was `0.9.x` (stale by 7 minor versions), now `1.6.x / 1.5.x`
- `CLAUDE.md §2` link was broken; replaced with correct paths
- TOTP version corrected: was `v1.2.0`, actually `v1.2.1`
- Trade-offs table: added per-entry salt rationale, v1 sync fallback note

#### Updated: `CONTRIBUTING.md`

- Stale test count `1172` removed (replaced with "All tests should pass")
- `docs/threat-model.md` and `docs/peer-sync-security.md` added to Architecture Guide key-files table

#### Updated: `src-tauri/src/commands/peer_sync_engine/mod.rs`

Module docstring corrected from v1-only to v2 + v1 fallback description.

---

### Session 2 (2026-06-06 — commits `320de08`, `e7c9fe6`)

#### Updated: `docs/architecture.md` (§11 added, version bumped)

Added new section §11 Cloud Sync Architecture (Phase 1) documenting:
- Supported providers table (WebDAV, Dropbox, Google Drive)
- OAuth 2.0 PKCE flow diagram (code verifier generation → browser open → localhost redirect server → token exchange → SQLite storage)
- Upload and download flows
- Security properties (HTTPS, ciphertext-only, OAuth scope minimality, PKCE)
- Phase 1 gaps table (placeholder credentials, client_secret in binary, unencrypted tokens, no auto-sync, no backup rotation)
- Key files table

Version header updated from `v1.6.0.1` to `v1.6.0 (feat/cloud-sync-phase1)`.

#### Updated: `docs/tauri-commands.md`

Added **Cloud Providers (Phase 1)** section with all 6 new commands:
- `cloud_provider_auth_start` — OAuth PKCE flow
- `cloud_provider_upload_blob` — encrypted blob upload
- `cloud_provider_download_blob` — blob download
- `cloud_provider_status` — connection status
- `cloud_provider_disconnect` — token revocation (local only)
- `cloud_provider_refresh_token` — token refresh

Total command count updated from ~150 to ~156.

#### Updated: `docs/threat-model.md`

- Added OAuth tokens to asset inventory
- Updated trust boundary diagram to include Dropbox/Google Drive
- Added **Compromised cloud provider** to in-scope adversary table
- Added **T10** — Compromised cloud provider (Dropbox / Google Drive): mitigations + 4 residual risk items
- Added 5 rows to mitigations vs gaps table for cloud provider gaps

#### Updated: `src/lib/services/crypto.ts`

Added WHY doc comments to:
- `clearKeyCache()` — explains this must be called on lock so derived keys don't outlive the session
- `hashPassword()` — explains PBKDF2 gives the verifier the same brute-force cost as an encryption key

#### Updated: `src/lib/services/cloudSyncService.ts`

Added WHY comment explaining the ETag guard (prevents a second browser tab from clobbering a concurrent upload).

#### Updated: `README.md`

- Feature table: added Dropbox/Google Drive to the sync feature description
- Docs reference table: added `docs/threat-model.md` link (was missing — discoverability gap)

#### Updated: `CONTRIBUTING.md`

Fixed stale `CLAUDE.md §3` reference (CLAUDE.md has no numbered sections); replaced with plain-English pointer to the Design section.

---

## What Was Verified

- All cross-references in threat-model.md match actual code constants: `parse_peer_timestamp` + `MAX_FUTURE_SECS = 10` in `conflict.rs`; `SYNC_ALLOWED_SETTINGS = ["app_settings"]`; `derive_sync_key_ecdh` + `derive_sync_key_static` in `peer_sync_engine/crypto.rs`; `Auth` and `NotTrusted` message types in `protocol.rs`
- Cloud provider commands verified against `git show 98793c0` and `git show 6626650` — all 6 commands, PKCE flow, file paths, and scope details match actual code
- Placeholder credential names verified: `DROPBOX_APP_KEY_PLACEHOLDER`, `GOOGLE_CLIENT_ID_PLACEHOLDER`, `GOOGLE_CLIENT_SECRET_PLACEHOLDER` — runtime guard present (returns error before auth attempt)
- All doc files remain self-consistent
- No code was changed in session 2 beyond doc comments

---

## Diataxis Coverage Map

| Entity / Feature | Reference | How-to | Tutorial | Explanation |
|:---|:---|:---|:---|:---|
| AES-256-GCM encryption | ✅ architecture.md §5, threat-model.md §1 | ❌ | ❌ | ✅ architecture.md §5 |
| PBKDF2 key derivation | ✅ architecture.md §5 | ❌ | ❌ | ✅ crypto.ts header |
| Peer sync v2 protocol | ✅ peer-sync-security.md | ❌ | ❌ | ✅ peer-sync-security.md |
| WebDAV sync | ✅ tauri-commands.md (implicit) | ✅ README §4 | ❌ | ❌ |
| Dropbox/Google Drive (Phase 1) | ✅ architecture.md §11, tauri-commands.md | ❌ | ❌ | ✅ architecture.md §11 |
| Threat model | ✅ threat-model.md | ❌ | ❌ | ✅ threat-model.md |
| 2FA (TOTP + hardware key) | ✅ tauri-commands.md | ❌ | ❌ | ✅ .claude/docs/security.md |
| Voice memos / STT | ✅ tauri-commands.md, speech-to-text.md | ✅ speech-to-text.md | ❌ | ✅ speech-to-text.md |
| Watch companion | ✅ watch-companion.md | ✅ watch-companion.md | ❌ | ✅ watch-companion.md |
| Time capsule | ✅ tauri-commands.md | ❌ | ❌ | ❌ |
| StillHaven | ✅ tauri-commands.md | ❌ | ❌ | ❌ |
| Browser / PWA mode | ❌ | ❌ | ❌ | ❌ |
| First-run setup / unlock | ❌ | ❌ | ❌ | ❌ |
| AI features / BYOK | ✅ .claude/docs/ai-features.md | ❌ | ❌ | ✅ .claude/docs/ai-features.md |

**Critical gaps (zero coverage):**
- Browser/PWA mode: IndexedDB backend, `browser-invoke.ts` shim, ETag-guarded WebDAV — no user-facing docs
- First-run setup flow: no how-to or tutorial for new user onboarding

**Common gaps (reference only, no how-to/tutorial):**
- Time capsule, StillHaven — documented in command reference but no user guide
- Dropbox/Google Drive — reference docs added; no how-to (acceptable for Phase 1 which isn't shipping yet)

---

## What's Left (Adjacent Issues — Not Fixed)

Per operating rules these were logged rather than fixed:

1. **`unlock_app` IPC bypass gap (T9 residual risk)** — The Rust session lock trusts the frontend's call without re-verifying the password. Hardening path: add a password token/HMAC to `unlock_app` that Rust validates.

2. **Sync v1 fallback should be removed** — The static-key fallback in `derive_sync_key_static` has no forward secrecy. All shipped clients are v2-capable. Removing it reduces attack surface.

3. **Voice memo audio unencrypted on disk** — Files in `voice_memos_incoming/` and permanent store are not encrypted at rest before transcription completes.

4. **WebDAV restore not hash-verified** — `import_data` has no separate integrity check beyond AES-GCM authentication. A compromised WebDAV server could serve a replayed older backup.

5. **Sidecar binary integrity** — No post-build hash verification of the whisper-cli sidecar binary.

6. **OAuth access token unencrypted in SQLite** — `cloud_{provider}_access_token` rows are stored in plaintext. Phase 2 should apply the `secureStorage.ts` (`__enc_v1:`) encryption pattern.

7. **Google Drive client_secret compiled into binary** — `GOOGLE_CLIENT_SECRET_PLACEHOLDER` is a constant in `cloud_providers.rs`. Even when replaced with a real value, anyone who extracts the binary can find it. Phase 2: CI-injected build secret.

8. **`architecture.md` data model** — The `journal_entries` schema block still shows `content TEXT` rather than `encrypted_content TEXT`, which is the actual column name in the code. Predates this PR.

9. **Browser/PWA mode has no user-facing documentation** — The `browser.ts` / `browser-invoke.ts` backend and ETag-guarded WebDAV sync have no how-to guide.

---

## Assumptions Made

- The cloud provider commands (`cloud_providers.rs`, `cloudProvidersService.ts`) were read from git history (`git show 98793c0`, `git show 6626650`) since they were merged into the branch base but are not present as live files in this worktree (the worktree is locked on a commit predating those merges).
- The `feat/cloud-sync-phase1` context described in the task specification refers to the commits `9ee72d3` and `2d794af` that merged the cloud sync feature into the main history before this worktree was created.
- All claimed code constants (placeholder names, file paths, scope strings) were verified against the actual `git show` output before being written into documentation.

## Skills Invoked

- `/guard` — blast-radius guardrails, freeze boundary set to repo root
- `/document-release` — cross-doc consistency audit, Diataxis coverage map, README discoverability fix, CONTRIBUTING stale-reference fix
- `/ship` — draft PR (see below)
