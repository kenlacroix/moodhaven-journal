# MoodHaven Journal — Threat Model

> **Version:** v1.8.0 (fix/security-pt6-acl-lockguard) | **Last Updated:** 2026-06-07

This document describes what MoodHaven Journal protects, against whom, and where the design intentionally draws the line.

---

## Table of Contents

1. [Assets](#1-assets)
2. [Trust Boundaries](#2-trust-boundaries)
3. [Adversary Model](#3-adversary-model)
4. [Threats — In Scope](#4-threats--in-scope)
5. [Threats — Out of Scope](#5-threats--out-of-scope)
6. [Mitigations vs Gaps](#6-mitigations-vs-gaps)
7. [Intentional Design Trade-offs](#7-intentional-design-trade-offs)

---

## 1. Assets

| Asset | Sensitivity | Where stored |
|:---|:---|:---|
| Journal entry content (text) | **Critical** | SQLite ciphertext only — AES-256-GCM client-side, stored inside a SQLCipher-encrypted DB at rest (raw-key application fixed in v1.8.0 — see T5 / T14) |
| Encryption key (session) | **Critical** | JS memory only; never persisted |
| User password | **Critical** | Never stored; only a PBKDF2 hash+salt |
| TOTP seed | **High** | SQLite, AES-256-GCM encrypted (v1.2.1+) |
| Backup / recovery codes | **High** | SHA-256 hashed in SQLite |
| API keys / PATs (Oura, OpenAI, WebDAV) | **High** | SQLite, `__enc_v1:` prefix, AES-256-GCM via `secureStorage.ts` |
| OAuth tokens (Dropbox, Google Drive) | **High** | SQLite `settings` table, AES-256-GCM encrypted under a per-device key in the OS keyring (v1.8.0+; file fallback 0600 when no keyring) |
| WebDAV URL | **Medium** | Settings table (plaintext); contains no credentials by itself |
| Mood levels (1–5) | **Low** | SQLite plaintext — required for analytics |
| Timestamps, tags, book names | **Low** | SQLite plaintext — required for ordering and search |
| Voice memo audio files | **Medium** | App data dir; not encrypted at rest (deleted after transcription) |
| Device identity key pair | **High** | `peer_key.bin` (Ed25519 private key, 0600); `device.json` (public only) |
| Trusted devices list | **Medium** | `trusted_devices.json` (public keys + device names) |

---

## 2. Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│ JS WebView (renderer process)                                        │
│                                                                      │
│  All encryption/decryption happens here.                            │
│  Session password and derived CryptoKey are held in JS memory.      │
│  No plaintext journal content crosses this boundary.                │
│                                                                      │
│  ┌──────────────────────────────────────────────────┐               │
│  │  Tauri IPC (invoke / emit)  ◄── BOUNDARY ──────  │               │
│  └──────────────────────────────────────────────────┘               │
│                                                                      │
│  Rust backend receives only ciphertext blobs                        │
│  and harmless metadata (mood int, timestamps).                      │
└───────────────────────────┬─────────────────────────────────────────┘
                            │  Tauri IPC
┌───────────────────────────▼─────────────────────────────────────────┐
│ Rust process (Tauri backend)                                         │
│                                                                      │
│  Stores/retrieves encrypted blobs via rusqlite.                     │
│  Runs mDNS, TCP sync server, whisper.cpp sidecar.                   │
│  Holds Mutex<Connection> — non-reentrant.                            │
│                                                                      │
│  ┌──────────────────────────────────────────────────┐               │
│  │  Filesystem / OS  ◄── BOUNDARY ────────────────  │               │
│  └──────────────────────────────────────────────────┘               │
│                                                                      │
│  SQLite file (moodhaven.db) — only ciphertext for journal content   │
│  peer_key.bin — Ed25519 private key                                 │
│  trusted_devices.json — paired peer public keys                     │
└─────────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────────┐
│ Network (LAN / Internet)                                             │
│                                                                      │
│  Peer sync: AES-256-GCM on TCP, forward-secret (X25519 ECDH)       │
│  WebDAV: AES-256-GCM ciphertext over HTTPS                          │
│  Dropbox / Google Drive: AES-256-GCM ciphertext over HTTPS (Phase 1)│
│  Oura / update check: Rust-side HTTP; no journal content            │
│  AI (OpenAI): aggregated metadata only, user's own key              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Adversary Model

### In-scope adversaries

| Adversary | Capability | Goal |
|:---|:---|:---|
| **Passive LAN observer** | Can capture all TCP/UDP traffic on the local network | Read journal entries in transit |
| **Malicious LAN peer** | Knows device IDs from mDNS; may craft HELLO frames | Bypass authentication; inject entries; override local data |
| **Compromised trusted device** | Full control of a device the user has previously paired | Read journal content; inject arbitrary settings |
| **Compromised WebDAV server** | Read/write/delete all files stored by the app | Read journal content; tamper with backup |
| **Compromised cloud provider (Dropbox / GDrive)** | Read/write/delete files in app folder; access valid OAuth tokens | Read journal content (as ciphertext only); revoke access; tamper with backup |
| **Local file system attacker** | Read access to `moodhaven.db` and surrounding files | Recover journal content without knowing the password |
| **Malicious whisper.cpp binary** | Supplied by an attacker who has replaced the sidecar | Exfiltrate audio or transcriptions |
| **Remote AI provider (OpenAI)** | Sees API payloads sent by the app | Learn about user's journal habits |

### Out-of-scope adversaries

| Adversary | Why out of scope |
|:---|:---|
| Attacker with physical access to an **unlocked** device | Once unlocked, the key is in memory — no practical mitigation |
| OS-level privilege escalation | App runs with user privileges; OS security is assumed |
| Browser/WebView sandbox escape | No novel exploit primitives exist in scope here |
| Side-channel attacks on AES-GCM | Out of scope for a desktop journaling app |
| Supply-chain attacks against npm/Cargo dependencies | Not solvable at the app layer |

---

## 4. Threats — In Scope

### T1 — Passive eavesdropping on LAN sync

**Threat:** An attacker capturing TCP traffic on the LAN reads journal entries as they sync between two paired devices.

**Mitigations:**
- All sync frames use AES-256-GCM (Rust `aes-gcm` crate).
- Primary session key derived via ephemeral X25519 ECDH (v2 protocol): `SHA-256("moodhaven-sync-v2:" || X25519_shared || sorted(static_A, static_B))`. Per-session forward secrecy — capturing one session key does not compromise past sessions.
- Fallback (v1, used if peer does not send `eph_pub`): `SHA-256("moodhaven-sync-v1:" || sorted(pub_A, pub_B))` — no forward secrecy but still requires knowing both Ed25519 public keys.
- Journal `content` field is already an AES-256-GCM blob even within the sync payload — two encryption layers on wire.

**Residual risk:** v1 fallback path has no forward secrecy. Removing the fallback once all peers have upgraded would close this.

---

### T2 — Unauthenticated device connects and syncs

**Threat:** A malicious device on the LAN knows a target's device ID (visible in mDNS) and connects to the sync port, then reads or injects entries.

**Mitigations:**
- The server sends a random 32-byte challenge nonce in the `Ok` message (plaintext phase).
- The client must respond with `Auth { signature: hex(Ed25519_sign("moodhaven-hello-auth-v1:" || challenge_bytes)) }`, proving possession of the Ed25519 private key corresponding to their device ID.
- The server verifies the signature against the public key stored in `trusted_devices.json`. If the device ID is not in the list the server sends `NotTrusted` and closes the connection.
- Device private key never leaves `peer_key.bin` (0600 permissions).

**Residual risk:** If `peer_key.bin` is exfiltrated by a local attacker with file access, an attacker could forge `Auth` messages. This requires local file access, which is outside the in-scope adversary model for an unlocked device.

---

### T3 — LWW bypass via far-future timestamp

**Threat:** A compromised peer sends entries or settings with a timestamp years in the future, permanently winning every subsequent LWW comparison and overwriting local changes.

**Mitigations:**
- `parse_peer_timestamp()` in `conflict.rs` rejects any timestamp more than 10 seconds ahead of the local clock (`MAX_FUTURE_SECS = 10`).
- Rejects date-only strings (e.g. `"9999-12-31"`) that would parse as RFC 3339 but lack time components.

**Residual risk:** A compromised peer that can set its system clock within 10 seconds of the real time can still win any LWW conflict involving simultaneous edits. This is an inherent property of LWW without a monotonic clock authority.

---

### T4 — Compromised peer injects sensitive settings

**Threat:** A malicious or compromised trusted device sends a settings sync payload containing `password_hash`, `totp_secret`, or API credentials in an attempt to take over the account.

**Mitigations:**
- `SYNC_ALLOWED_SETTINGS` in `conflict.rs` is a compile-time allowlist. Only `"app_settings"` may be upserted from a peer; all other keys are logged and dropped.
- Even within `"app_settings"`, field-level merge (`merge_settings_json`) restricts which sub-fields flow from the remote: `journal.*`, `reminders.*`, `ai.features`, `ai.consent`, `appearance.compactMode`, `appearance.animationsEnabled`. Credential fields (`openai.apiKey`, `localAI.*`) and per-device settings (`theme`) are never overwritten.

**Residual risk:** None for credential injection. A compromised peer can alter shared preference fields, which is expected behaviour for sync.

---

### T5 — Attacker reads SQLite file directly

**Threat:** An attacker with read access to `moodhaven.db` (e.g. cloud backup access, another user on the same OS, or a stolen laptop) attempts to read journal entries.

**Mitigations:**
- All journal `content` is AES-256-GCM ciphertext at the application layer. Without the password, it is unreadable.
- Each entry uses a fresh random 128-bit salt and 96-bit IV — no two entries share key material even if the same password is used.
- PBKDF2-SHA-256 with 600,000 iterations resists brute-force on weak passwords.
- TOTP seed, API credentials, and (v1.8.0+) OAuth tokens are also AES-256-GCM encrypted in the settings table.
- The whole database file is additionally encrypted at rest with SQLCipher (a second layer beneath the per-field application encryption). **See T14:** this layer was inert until v1.8.0 — the on-disk DB was effectively plaintext SQLite for everything *not* covered by the application-layer encryption above (mood, timestamps, tags, location/weather, and any other plaintext columns). v1.8.0 fixes the raw-key application so the file is genuinely SQLCipher-encrypted; this is verified on the installed Windows build.

**Residual risk:** Metadata (mood, timestamps, tags, location/weather) is stored without application-layer encryption. With the SQLCipher layer now engaged (v1.8.0) it is protected at rest behind the database key; before v1.8.0 it was readable directly from the file. Even with SQLCipher engaged, this metadata is decryptable by anyone who can derive the DB key, so it remains a lower-value target and a documented intentional trade-off (see §7).

---

### T6 — WebDAV server compromise

**Threat:** The WebDAV server is compromised; an attacker can read, modify, or delete all stored backup files.

**Mitigations:**
- All data is AES-256-GCM encrypted client-side before upload. The server stores ciphertext only.
- If the attacker deletes backups, the local copy on the user's device is unaffected (no cloud-primary writes).

**Residual risk:** If the attacker can replay an old backup file during a restore, the user would silently lose entries written after the backup. Backup integrity beyond checksum is not currently verified on restore.

---

### T7 — AI provider learns journal content

**Threat:** The optional AI features send journal content to OpenAI, violating the zero-knowledge promise.

**Mitigations:**
- AI features are disabled by default and require explicit opt-in with a consent modal.
- Only aggregated metadata is sent: mood averages, trend direction, dominant emotion categories (local extraction), entry frequency, preferred writing time.
- Journal text is never serialised into any AI request. This is enforced by code review policy, not a technical control.

**Residual risk:** Code review is a process control, not an enforcement boundary. A future bug or contributor error could inadvertently include text. The prohibition is stated in `CLAUDE.md` as a non-negotiable.

---

### T8 — Whisper.cpp sidecar exfiltrates audio

**Threat:** A maliciously replaced `whisper-cli` binary sends audio or transcription text off-device.

**Mitigations:**
- The sidecar binary is bundled at build time via Tauri's `externalBin` mechanism; it cannot be replaced without replacing the whole app bundle.
- Transcription result is returned via stdout to the Rust process; network access from the sidecar would require the sidecar binary itself to initiate connections.
- The temp audio WAV is deleted immediately after `whisper-cli` exits, regardless of success or failure.

**Residual risk:** A compromised build environment could supply a malicious whisper-cli binary. No code-signing or sidecar hash verification currently protects against this post-build.

---

### T9 — Password verification bypass via IPC

**Threat:** A malicious extension or injected script in the WebView calls `unlock_app` directly, bypassing password verification.

**Mitigations:**
- Since v0.9.0, `verify_password` runs in Rust (PBKDF2-SHA-256, constant-time comparison). The frontend calls `verify_password` and only calls `unlock_app` after a confirmed `true` return.
- Tauri capability ACL (`capabilities/default.json`) controls which commands the frontend can invoke.
- The frontend also implements `timingSafeEqual` for the client-side hash comparison path (used during first-run setup before `unlock_app` exists).
- The Rust session lock (`AppLockState`) is **setup-aware** (v1.8.0). A fresh install with no stored password hash starts **unlocked** so the first-run setup wizard can pair devices and restore from a peer — there is no journal data to protect before a password exists. Once a password hash is stored, or if the DB is unreadable (e.g. an encrypted DB without its key), the lock starts **locked** (default-deny). Data commands — including peer sync (`peer_sync_now`, `peer_full_restore`, `peer_get_sync_states`) and pairing status/cancel (`peer_cancel_pairing`, `peer_pairing_is_active`) — enforce `require_unlocked` server-side, so a locked session cannot drive sync or read sync state regardless of what the frontend invokes.

**Residual risk:** If an attacker can inject arbitrary JS into the WebView (e.g. via a script-injection bug in TipTap's paste handling), they could call `invoke('unlock_app')` directly. The Rust session lock does not independently verify the password was correct — it trusts the frontend's call. This is an architectural gap noted for future hardening.

---

### T10 — Compromised cloud provider (Dropbox / Google Drive)

**Threat:** Dropbox or Google Drive is compromised, or the user's OAuth token is stolen. An attacker gains read/write access to the stored backup file and all future uploads.

**Mitigations:**
- All journal data is AES-256-GCM encrypted client-side before upload via `exportData()`. The provider stores only ciphertext; a compromised provider cannot read journal content.
- OAuth scope minimality: Dropbox uses `files.content.read/write` scoped to `/Apps/MoodHaven/`; Google Drive uses `drive.appdata` (hidden folder, accessible only to this app). An attacker cannot enumerate other user files.
- Tokens stored in SQLite `settings` table; local DB access (T5) is required to steal them from disk.
- Manual sync only (Phase 1): no persistent token use until the user explicitly triggers a sync.

**Residual risk (Phase 1 gaps):**
- OAuth tokens are AES-256-GCM encrypted at rest as of v1.8.0 (per-device key in the OS keyring; 0600 file fallback). A T5 attacker who reads only `moodhaven.db` no longer obtains a usable token without also obtaining the per-device key.
- Google Drive `client_secret` is compiled into the binary as a constant. An attacker who extracts the binary can find the secret. Mitigated by `drive.appdata` scope restriction, which limits blast radius even with the secret. Phase 2: move to PKCE-only or inject at build time via CI secrets.
- No backup file integrity verification on download (same gap as T6 / WebDAV). A compromised provider could serve a replayed older backup.
- OAuth token revocation on disconnect does not call the provider's revocation endpoint — it only clears local rows. A leaked token remains valid until it expires unless the user revokes it via the provider's dashboard.

---

### T11 — Trusted peer pulls the entire database without consent

**Threat:** A trusted (previously paired) but compromised, lost, or malicious device sends a `RestoreRequest` over the authenticated sync channel and downloads the *entire* SQLCipher database, not just the incremental sync delta. Trust established for routine sync is not the same as authorization to exfiltrate everything.

**Mitigations (applied + reproduction-proven, live re-validation pending):**
- Full-DB restore is gated behind an explicit, user-armed window (`peer_arm_restore`). The serving device rejects any `RestoreRequest` unless the user has armed restore within the last 5 minutes via Settings → Devices → "Set up a new device".
- The arm window is **one-shot** (consumed by the first restore), **time-limited** (5-minute TTL), and **cleared on lock** (`lock_app` disarms it), so an armed-then-locked or armed-then-idle device cannot silently serve a restore.
- The peer still has to pass the normal Ed25519 challenge/signature authentication (T2) before reaching the restore path.

**Residual risk:** A peer that is both trusted *and* able to deliver a `RestoreRequest` inside the 5-minute armed window (i.e. while the legitimate user is actively setting up a new device) can complete one restore. This is the intended behaviour for the new-device setup flow; the out-of-band arming action is the consent control.

---

### T12 — Locked session still serves data over IPC or sync

**Threat:** A compromised WebView (script injection) or a peer on the network drives data-bearing commands while the app is locked — reading or writing journal rows, leaking entry metadata, reading stats, or regenerating backup codes — by invoking commands that did not check the session lock.

**Mitigations (applied + reproduction-proven, live re-validation pending):**
- The Rust session lock (`AppLockState`) is now default-deny across the sensitive data surface. PT6/PT7/PT9 extended `require_unlocked` to activities, voice memos, peer pairing, cloud sync, the low-level sync helpers (`upsert_entry_from_sync`, `get_entry_timestamps`), peer sync data commands, `get_data_stats`, and `regenerate_backup_codes` — all of which were previously reachable from a locked or compromised WebView through the still-keyed DB connection.
- The browser/PWA shim mirrors the backend: its lock-gated command list was expanded from 7 activity commands to the full sensitive data surface (default-deny), so the two builds behave identically.
- The lock is setup-aware (see T9): a fresh install with no password hash starts unlocked (no data to protect yet); once a password exists the app starts locked.

**Residual risk:** Same as T9 — the lock trusts the frontend's `unlock_app` call rather than independently re-verifying the password. Closing that gap is tracked as future hardening.

---

### T13 — Cross-device sync silently drops connections (availability)

**Threat:** Not a confidentiality threat, but a reliability finding from the pentest: on Windows, accepted sync sockets inherited the listener's non-blocking flag, so post-handshake reads returned `WouldBlock` and legitimate peers were dropped mid-sync. Unreliable sync pushes users toward less-private workarounds (e.g. emailing exports) and can mask whether a sync actually completed.

**Mitigation (applied + reproduction-proven, live re-validation pending):**
- The accepted stream is forced into blocking mode after `accept()`; the handler relies on `read_timeout` for liveness instead of inheriting the listener's non-blocking behaviour.

**Residual risk:** None material; this is a correctness fix. A misbehaving peer can still time out, which is handled gracefully.

---

### T14 — Encryption at rest was inert (SQLCipher key mismatch)

**Threat:** The headline finding of PT8. The database was advertised (since v1.7.0) as SQLCipher-encrypted at rest, but the on-disk file was effectively **plaintext SQLite** on every build and OS. A local-file attacker (T5) reading `moodhaven.db` could open it directly and read every plaintext column (mood, timestamps, tags, location/weather) without any key — only the per-field application-layer AES-256-GCM (journal text, TOTP seed, credentials) protected those specific fields.

**Root cause:** The migration encrypted the DB with a raw 256-bit key via `ATTACH ... KEY "x'<hex>'"` (raw key, no KDF), but every read path opened it with `PRAGMA hexkey = '<hex>'`, which decodes the hex and then runs PBKDF2 over it — deriving a *different* key. The first-unlock verify therefore always failed ("file is not a database"), the migration silently fell back, and the install kept running on the plaintext DB. Confirmed two independent ways: a standalone cargo reproduction (app-path read fails; `PRAGMA key "x'<hex>'"` succeeds) and a trace into the vendored SQLCipher C source (the raw-key branch requires the literal `x'...'` wrapper; `hexkey` pre-decodes and falls through to PBKDF2).

**Mitigation (verified end-to-end on the installed Windows build):**
- The three read-path pragmas now use `PRAGMA key = "x'<hex>'"`, matching the encryption form. Backward-compatible — existing files were always raw-keyed, so they open correctly with no re-encryption.
- A regression test over the encrypt → reopen round-trip (which did not exist before, which is why the bug shipped) now guards the read path.
- Verified on the green Windows installed release build: `db_state` flips to encrypted, the on-disk bytes are ciphertext rather than the `SQLite format 3` magic, and unlock succeeds cleanly.

**Residual risk:** Databases created by pre-v1.8.0 builds were never encrypted, so any copy of those files (old backups, prior disk images, cloud snapshots) remains plaintext. Re-encryption applies only going forward. Users who relied on at-rest encryption before v1.8.0 should treat older on-disk copies as unprotected.

---

### T15 — Plaintext key/password material lingering in process memory

**Threat:** Even with at-rest and in-transit encryption, plaintext key material or passwords left on the stack/heap after use can be recovered from a process memory dump on an unlocked device, widening the blast radius of any later compromise.

**Mitigations (applied + reproduction-proven, live re-validation pending):**
- The `format!`-built `PRAGMA`/`ATTACH` SQL strings containing the plaintext SQLCipher key (built on every unlock/migration) are now `Zeroizing`.
- Raw password parameters in `verify_password`, `pin_setup`, and `biometric_store_session` are wrapped in `Zeroizing`; `pin_unlock` derives into a `Zeroizing<[u8; 32]>` instead of a bare stack array.
- The session bridge wraps the password before its lock check (closing a leaky early-return), enforces a 60-second TTL, and clears on `lock_app` and `factory_reset`.

**Residual risk:** Zeroization reduces but does not eliminate memory remanence (compiler/allocator behaviour, copies made by the WebView's JS engine). Physical access to an unlocked device remains out of scope (§5). Live heap-dump re-validation (PT9 E2) is pending against the installed build.

---

## 5. Threats — Out of Scope

| Threat | Reason |
|:---|:---|
| Physical access to an unlocked device | Key is in memory; no mitigation possible |
| Denial-of-service (crash the app, fill disk) | Local desktop app; no SLA |
| Social engineering | Out of scope for technical design |
| Third-party dependency vulnerabilities | Report upstream; no app-specific exploit path needed |
| Race conditions in the SQLite mutex | rusqlite Mutex is fair; the non-reentrant constraint is a code-review control |

---

## 6. Mitigations vs Gaps

| Area | Mitigation | Gap / Status |
|:---|:---|:---|
| Journal content confidentiality | AES-256-GCM, PBKDF2 600k | ✅ |
| Database at rest (whole file) | SQLCipher raw-key, applied via `PRAGMA key "x'…'"` | ✅ (v1.8.0 — was inert before; verified on Windows build) |
| Sync confidentiality | AES-256-GCM + X25519 ECDH (v2) | ✅ |
| Sync authentication | Ed25519 challenge/signature | ✅ |
| Full-DB restore authorization | One-shot 5-min armed window, cleared on lock | ✅ (v1.8.0 — applied + reproduction-proven) |
| Cross-device sync reliability (Windows) | Accepted socket forced blocking + read_timeout | ✅ (v1.8.0 — applied + reproduction-proven) |
| LWW timestamp forgery | 10-second clock-skew limit | ✅ |
| Settings injection | Compile-time key allowlist | ✅ |
| TOTP seed at rest | AES-256-GCM in DB | ✅ (v1.2.1+) |
| API credentials at rest | `secureStorage.ts` (`__enc_v1:` prefix) | ✅ |
| Locked-session data commands | Default-deny `require_unlocked` across data surface (backend + browser shim) | ✅ (v1.8.0 — applied + reproduction-proven) |
| `unlock_app` bypass | Rust-side verify_password | Partial — session lock does not re-verify |
| Sync v1 fallback (no forward secrecy) | Removed — peers without `eph_pub` rejected | ✅ (v1.8.0) |
| Key/password material in memory | `Zeroizing` on key SQL strings, password params, derived keys; session-bridge TTL + clear on lock | ✅ (v1.8.0 — applied + reproduction-proven; live heap-dump re-validation pending) |
| Path traversal via untrusted filenames | `id`/`media_id` validated in `store_voice_memo`, `write_media_from_sync` | ✅ (v1.8.0 — applied + reproduction-proven) |
| Voice memo files at rest | Deleted after transcription | Unencrypted while on disk |
| Backup restore integrity | SHA-256 on update downloads | WebDAV restores not hash-verified |
| Whisper sidecar integrity | Bundled at build time | No post-build hash check |
| Session key in memory after lock | `clearKeyCache()` called on lock | sessionKeyCache Map GC-dependent |
| Metadata (mood, tags, timestamps) | SQLCipher at rest (v1.8.0); no application-layer field encryption | Documented trade-off |
| Cloud OAuth tokens at rest | AES-256-GCM under per-device keyring key | ✅ (v1.8.0) |
| Cloud provider data in transit | HTTPS + AES-256-GCM ciphertext | ✅ |
| Cloud provider scope | Dropbox: `/Apps/MoodHaven/` only; GDrive: `drive.appdata` | ✅ |
| Google Drive client_secret | Compiled-in constant | Gap — Phase 2: move to build-time CI injection |
| Cloud disconnect token revocation | Local rows cleared only | Gap — tokens remain valid on provider until expiry |
| Recovery-key promote re-verification | — | In progress — promote path does not yet re-verify derived key against stored hash |
| Restore salt transfer | — | In progress — full-DB restore does not yet transfer `db_state.json` salt with the DB file |

---

## 7. Intentional Design Trade-offs

These are known, accepted decisions — not vulnerabilities.

| Trade-off | Rationale |
|:---|:---|
| Session key held in JS memory | Unavoidable in a WebView app; cleared on lock via `clearKeyCache()` |
| Mood stored plaintext | Required for analytics without decrypting every entry |
| Timestamps stored plaintext | Required for calendar view and timeline ordering |
| Tags stored plaintext | Required for tag search index |
| Weather/location stored plaintext | Opt-in; contains no journal content |
| Per-entry salt (vs single master key) | Compromising one entry's key does not expose others; prevents bulk decryption |
| Sync port is deterministic | `44000 + (device_id[0..4] as u16) % 1000`; convenient, not a secret |
| Password verification in Rust + JS | Rust `verify_password` is authoritative; JS `verifyPasswordHash` is used only during setup |
| No cloud-primary storage | Local-first by design; WebDAV sync is an optional, user-controlled convenience |
