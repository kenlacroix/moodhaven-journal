# Peer Sync — Security Model

> **Feature version:** v1.6.0 | **Last Updated:** 2026-06-05

This document explains the security design of MoodHaven Journal's local peer sync feature. It is intended for security reviewers and contributors modifying the sync engine.

---

## Overview

Local peer sync allows two MoodHaven Journal desktop instances on the same LAN to exchange encrypted journal entries directly, without any cloud server or relay. Every security decision prioritises one rule: **a passive observer on the network, or a compromised peer, must not be able to read journal content.**

---

## Threat Model

| Threat | Mitigation |
|:---|:---|
| Passive eavesdropper on LAN | AES-256-GCM on all sync frames; v2 protocol uses ephemeral X25519 ECDH for forward secrecy |
| Unknown device attempting sync | Ed25519 challenge/signature handshake before any encrypted data is exchanged |
| Device ID spoofing | Server issues a 32-byte random challenge; client must sign it with their Ed25519 private key |
| Replay attack | Per-frame random 12-byte nonce; AES-GCM authentication tag covers the nonce |
| Compromised peer reads journal | Journal content is AES-256-GCM ciphertext at rest; sync moves ciphertext blobs, not plaintext |
| Compromised peer injects settings | Compile-time key allowlist (`SYNC_ALLOWED_SETTINGS`); field-level merge for `app_settings` |
| LWW bypass via far-future timestamp | Peer timestamps rejected if > 10 seconds ahead of local clock (`MAX_FUTURE_SECS`) |
| Password mismatch between devices | Entry blobs stored correctly; frontend decryption fails gracefully — no data corruption |
| Man-in-the-middle during pairing | PIN must be read off Device A and typed on Device B (out-of-band verification) |

---

## Layer 1 — Device Identity

Each device generates a permanent **Ed25519 key pair** on first launch.

```
ed25519-dalek: generate_keypair() → (private_key, public_key)

private_key  →  {app_data_dir}/peer_key.bin      (0600 permissions)
public_key   →  {app_data_dir}/device.json        (device metadata)

deviceId = hex(SHA-256(public_key))[0..16]        (first 16 chars, displayed in UI)
```

**Properties:**
- Private key never leaves the device.
- `device.json` is readable but not sensitive (public key only).
- If `device.json` is deleted and regenerated, the device ID changes and all peers must re-pair.

---

## Layer 2 — Peer Discovery (mDNS)

Discovery uses mDNS/DNS-SD (`_moodhaven._tcp.local`). The broadcast announces:

```
service type : _moodhaven._tcp.local
port         : {sync_port}
TXT records  : device_id={deviceId}, device_name={name}
```

**What is exposed on the network:**
- Device name (user-chosen display name)
- Device ID (16-char hex, derived from public key)
- Sync port

**What is not exposed:**
- Public key (not in mDNS broadcast — only shared during pairing)
- Journal content (never transmitted in plaintext)
- Password or encryption key

Discovery is active only while the app is running. There is no persistent broadcast daemon.

---

## Layer 3 — Secure Pairing

Pairing establishes mutual trust between two devices. It must be initiated by the user on both sides.

### Pairing Flow

```
Device A (initiator)
    │  peer_generate_pairing_token()
    │  → generates 6-digit PIN
    │  → starts temporary HTTP pairing server on a random port
    │  → displays QR code encoding { host, port, deviceId, pin }
    │
Device B (scanner/enter PIN)
    │  peer_accept_pairing(target_host, peer_device_id, pin)
    │  → connects to Device A's pairing server
    │  → exchanges public keys
    │  → verifies PIN matches
    │  → stores Device A in trusted_devices.json
    │
Device A
    │  receives Device B's public key
    │  verifies PIN
    │  stores Device B in trusted_devices.json
    │  closes pairing server
```

### What is stored after pairing

```json
// {app_data_dir}/trusted_devices.json
[
  {
    "deviceId": "9a4f0b2c...",
    "deviceName": "Ken's Phone",
    "publicKey": "base64url-ed25519-public-key",
    "pairedAt": "2026-03-18T10:00:00Z"
  }
]
```

**PIN security:**
- 6-digit numeric PIN, generated fresh for each pairing session.
- Valid for the duration of the pairing server only (cancelled if unused).
- Must be communicated out-of-band (user reads it and types it in) — a network attacker who can see mDNS traffic does not know the PIN.
- The pairing server closes immediately after one successful exchange.

**Trust revocation:**
- `peer_revoke_device(deviceId)` removes the entry from `trusted_devices.json`.
- The revoked device will be rejected at HELLO on the next connection attempt.

---

## Layer 4 — Encrypted Sync Engine (TCP)

### Sync Port Assignment

```
port = 44000 + (parseInt(deviceId[0..4], 16) % 1000)
range: 44000–44999 (stable per device, deterministic)
```

### Wire Format

Every sync frame uses a length-prefixed, encrypted envelope:

```
[4 bytes: BE uint32 payload length]
[12 bytes: random AES-GCM nonce]
[N bytes: AES-256-GCM ciphertext of JSON payload]
```

The nonce is fresh (randomly generated via `OsRng`) per frame.

### Transport Key Derivation

**v2 (primary — forward secret):**

Both sides generate an ephemeral X25519 key pair for each connection. The connecting device advertises its ephemeral public key in `Hello.eph_pub`; the server responds with its own in `Ok.eph_pub`.

```
ecdh_shared = X25519(my_eph_secret, peer_eph_pub)

session_key = SHA-256(
    "moodhaven-sync-v2:" ||
    ecdh_shared ||
    sort_lexicographic([my_static_pub, peer_static_pub])
)
```

The X25519 shared secret is mixed with both static Ed25519 public keys so that device identity is bound into the session key. Compromising the ephemeral secret of one session does not expose any other session.

**v1 (fallback — no forward secrecy):**

Used automatically if the connecting peer does not send `eph_pub` (pre-v2 client). Included for backwards compatibility only; should be removed once all peers are on v2.

```
session_key = SHA-256(
    "moodhaven-sync-v1:" ||
    sort_lexicographic([static_pub_A, static_pub_B])
)
```

### Authentication Handshake

After the v2 session key is established the server issues a 32-byte challenge to prove the client holds the Ed25519 private key matching their device ID in `trusted_devices.json`:

```
Client → Server: Hello { did: "<deviceId>", eph_pub: "<hex X25519 pub>" }     [plaintext]
Server → Client: Ok    { name: "<name>", eph_pub: "<hex>", challenge: "<hex>" } [plaintext]
Client → Server: Auth  { signature: hex(Ed25519_sign("moodhaven-hello-auth-v1:" || challenge_bytes)) } [plaintext]
```

The server verifies the signature against the public key stored in `trusted_devices.json`. If the device ID is not in the trusted list, or the signature is invalid, the server sends `NotTrusted { server_device_id }` in plaintext and closes the connection. The `NotTrusted` message signals the client to auto-revoke the server from its own trusted list.

All subsequent messages use the encrypted framing described above.

### Protocol Sequence (v2)

```
Client                                  Server
  │── Hello (plain) ──────────────────▶│  { did, eph_pub }
  │◀─ Ok    (plain) ───────────────────│  { name, eph_pub, challenge }
  │── Auth  (plain) ──────────────────▶│  { signature }
  │                                    │  [server verifies Ed25519 sig; disconnects if bad]
  │                                    │
  │◀─ Manifest (enc) ──────────────────│  { entries:[…], books:[…], signals:[…], settings:[…] }
  │── Manifest (enc) ─────────────────▶│
  │                                    │
  ├── Entry phase ─────────────────────┤
  │◀─ Entry   (enc) × N ───────────────│
  │◀─ Done    (enc)  ──────────────────│  { sent: N }
  │── Entry   (enc) × M ──────────────▶│
  │── Done    (enc)  ─────────────────▶│  { sent: M }
  │◀─ DoneAck (enc)  ──────────────────│  { recv: M }
  │                                    │
  ├── Books phase ─────────────────────┤
  │◀─ Book      (enc) × A ─────────────│
  │◀─ BooksDone (enc) ─────────────────│  { sent: A }
  │── Book      (enc) × B ────────────▶│
  │── BooksDone (enc) ────────────────▶│  { sent: B }
  │◀─ BooksAck  (enc) ─────────────────│  { recv: B }
  │                                    │
  ├── Signals phase ───────────────────┤
  │◀─ Signal      (enc) × C ───────────│
  │◀─ SignalsDone (enc) ───────────────│  { sent: C }
  │── Signal      (enc) × D ──────────▶│
  │── SignalsDone (enc) ──────────────▶│  { sent: D }
  │◀─ SignalsAck  (enc) ───────────────│  { recv: D }
  │                                    │
  ├── Settings phase ──────────────────┤
  │◀─ Setting     (enc) × E ───────────│  (whitelisted keys only)
  │◀─ SettingsDone (enc) ──────────────│
  │── Setting     (enc) × F ──────────▶│
  │── SettingsDone (enc) ─────────────▶│
  │◀─ SettingsAck (enc) ───────────────│
  │                                    │
  │  Both sides update peer_sync_state (last_sync_at)
```

### Conflict Resolution

**Entries and books:** Last-write-wins (LWW) by `updated_at`. Peer-supplied timestamps are validated by `parse_peer_timestamp()` — values more than 10 seconds in the future are rejected, closing a LWW bypass attack path. Date-only strings (e.g. `"9999-12-31"`) that would parse as RFC 3339 but lack time components are also rejected.

**Signals:** Immutable — `INSERT OR IGNORE`. If the signal ID already exists locally it is skipped; no overwrite.

**Settings:** LWW on `updated_at`, but only for keys in the compile-time allowlist `SYNC_ALLOWED_SETTINGS = ["app_settings"]`. All other keys sent by a peer are logged and silently dropped. For `app_settings`, a field-level merge is applied:
- **Taken from remote:** `journal.*`, `reminders.*`, `ai.features`, `ai.consent`, `appearance.compactMode`, `appearance.animationsEnabled`
- **Never overwritten:** credential fields (`openai.apiKey`, `localAI.*`), device-specific preferences (`theme`), all unlisted keys

### What Crosses the Wire

**Synced as ciphertext (opaque to the sync engine):**
- Entry content (`EncryptedContent: { iv, data, salt }`) — already AES-256-GCM encrypted at rest

**Synced in plaintext within the encrypted frame:**
- Entry ID, `updated_at`, `created_at`, mood (1–5), `privacy_mode`, `book_id`, `pinned`, `sealed_until`, `capsule_type`, `unsealed_at`
- Book metadata: name, emoji, color, sort_order, description, settings JSON
- Signal metadata: type, source, timestamp, payload ciphertext
- Whitelisted settings fields (see above)

**Not synced:**
- Credentials: `password_hash`, `totp_secret`, WebDAV URL/credentials, Oura PAT, OpenAI API key
- 2FA configuration (enable state, backup codes)
- Device identity / pairing data
- Media attachments (planned future phase)
- Per-device preferences: `theme`, all `appearance.*` except `compactMode` and `animationsEnabled`

---

## Password Mismatch Behaviour

If two devices have different passwords, their encryption keys differ. Sync will:

1. Complete successfully (ciphertext blobs are transported correctly).
2. On the receiving device, when the frontend tries to decrypt the received entries, decryption fails.
3. The frontend handles the failure gracefully (entries appear as unreadable / skipped).
4. **No data corruption or crash** — the blobs are stored, they just can't be decrypted.

This is by design. Peer sync assumes a shared password across a user's own devices. It is not designed for sharing journals between different users.

---

## Auto-Sync Triggers

Sync is triggered automatically in two cases:

1. **Peer discovered** — when mDNS fires a `peer:discovered` event for a trusted device, and at least 30 seconds have elapsed since the last sync with that peer.
2. **After pairing** — immediately after a new device is paired, an initial sync runs.

Manual sync is also available via the Devices tab in Settings.

---

## Security Review Scope

When auditing the sync implementation, focus on:

- `src-tauri/src/commands/peer_sync_engine/crypto.rs` — key derivation (v1 + v2), AES-GCM frame encrypt/decrypt
- `src-tauri/src/commands/peer_sync_engine/connection.rs` — TCP server, handshake, authentication flow
- `src-tauri/src/commands/peer_sync_engine/conflict.rs` — LWW upserts, timestamp validation, settings allowlist and merge
- `src-tauri/src/commands/peer_sync_engine/protocol.rs` — wire message types, port formula
- `src-tauri/src/commands/peer_pairing.rs` — PIN generation, key exchange, trust storage
- `src-tauri/src/commands/peer_identity.rs` — key generation, persistence
- `src-tauri/src/commands/peer_discovery.rs` — mDNS broadcast content
- `src/lib/peerSyncEngineService.ts` — frontend orchestration
- `src-tauri/capabilities/default.json` — ACL for sync commands
