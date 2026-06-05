# MoodHaven Journal — Threat Model

> **Version:** v1.6.0.1 | **Last Updated:** 2026-06-05

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
| Journal entry content (text) | **Critical** | SQLite ciphertext only — AES-256-GCM, client-side encryption |
| Encryption key (session) | **Critical** | JS memory only; never persisted |
| User password | **Critical** | Never stored; only a PBKDF2 hash+salt |
| TOTP seed | **High** | SQLite, AES-256-GCM encrypted (v1.2.1+) |
| Backup / recovery codes | **High** | SHA-256 hashed in SQLite |
| API keys / PATs (Oura, OpenAI, WebDAV) | **High** | SQLite, `__enc_v1:` prefix, AES-256-GCM via `secureStorage.ts` |
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
- All journal `content` is AES-256-GCM ciphertext. Without the password, it is unreadable.
- Each entry uses a fresh random 128-bit salt and 96-bit IV — no two entries share key material even if the same password is used.
- PBKDF2-SHA-256 with 600,000 iterations resists brute-force on weak passwords.
- TOTP seed and API credentials are also AES-256-GCM encrypted in the settings table.

**Residual risk:** Metadata (mood, timestamps, tags, location/weather) is stored in plaintext. A sophisticated attacker could correlate tags and timestamps with external events. This is documented as an intentional trade-off (see §7).

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

**Residual risk:** If an attacker can inject arbitrary JS into the WebView (e.g. via a script-injection bug in TipTap's paste handling), they could call `invoke('unlock_app')` directly. The Rust session lock does not independently verify the password was correct — it trusts the frontend's call. This is an architectural gap noted for future hardening.

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
| Sync confidentiality | AES-256-GCM + X25519 ECDH (v2) | ✅ |
| Sync authentication | Ed25519 challenge/signature | ✅ |
| LWW timestamp forgery | 10-second clock-skew limit | ✅ |
| Settings injection | Compile-time key allowlist | ✅ |
| TOTP seed at rest | AES-256-GCM in DB | ✅ (v1.2.1+) |
| API credentials at rest | `secureStorage.ts` (`__enc_v1:` prefix) | ✅ |
| `unlock_app` bypass | Rust-side verify_password | Partial — session lock does not re-verify |
| Sync v1 fallback (no forward secrecy) | Falls back only if peer lacks `eph_pub` | Gap — should be phased out |
| Voice memo files at rest | Deleted after transcription | Unencrypted while on disk |
| Backup restore integrity | SHA-256 on update downloads | WebDAV restores not hash-verified |
| Whisper sidecar integrity | Bundled at build time | No post-build hash check |
| Session key in memory after lock | `clearKeyCache()` called on lock | sessionKeyCache Map GC-dependent |
| Metadata (mood, tags, timestamps) | Intentionally plaintext | Documented trade-off |

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
