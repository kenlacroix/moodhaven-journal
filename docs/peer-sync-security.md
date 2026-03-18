# Peer Sync — Security Model

> **Feature version:** v0.7.0 | **Status:** Complete

This document explains the security design of MoodBloom's local peer sync feature. It is intended for security reviewers and contributors modifying the sync engine.

---

## Overview

Local peer sync allows two MoodBloom desktop instances on the same LAN to exchange encrypted journal entries directly, without any cloud server or relay. Every security decision prioritises one rule: **a passive observer on the network, or a compromised peer, must not be able to read journal content.**

---

## Threat Model

| Threat | Mitigation |
|:---|:---|
| Passive eavesdropper on LAN | All sync payloads are AES-256-GCM encrypted on the wire |
| Unknown device attempting sync | Only trusted (paired) devices are accepted; others are disconnected at HELLO |
| Device ID spoofing | Transport key derived from both public keys; cannot be derived without the genuine private key |
| Replay attack | Per-session nonce (12 bytes, random) included in every encrypted frame |
| Compromised peer reads journal | Journal content is AES-256-GCM encrypted end-to-end; sync engine moves ciphertext blobs, not plaintext |
| Password mismatch between devices | Entry blobs store fine (same cipher format); frontend decrypt fails gracefully — no data corruption |
| Man-in-the-middle during pairing | PIN must be verified out-of-band (user reads PIN off Device A and enters it on Device B) |

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

Discovery uses mDNS/DNS-SD (`_moodbloom._tcp.local`). The broadcast announces:

```
service type : _moodbloom._tcp.local
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

The nonce is fresh (randomly generated) per frame.

### Transport Key Derivation

The transport key is derived independently by both sides — no key exchange needed:

```
transport_key = SHA-256(
    "moodbloom-sync-v1:" +
    sort_lexicographic([base64(pubKeyA), base64(pubKeyB)])
)
```

**Properties:**
- Both sides derive the same key without transmitting it.
- Key is session-ephemeral in practice (rebuilt from stable key material each connection).
- An attacker who does not know either device's private key cannot derive the transport key from the public keys alone (SHA-256 preimage resistance).

### Protocol Sequence

```
Device A (client)          Device B (server / sync listener)
    │                              │
    │── HELLO (plaintext) ────────▶│  { deviceId, protocolVersion }
    │◀─ HELLO (plaintext) ─────────│  { deviceId, protocolVersion }
    │                              │
    │  Both sides verify: is peer in trusted_devices.json?
    │  If not → disconnect immediately.
    │  Both sides independently derive transport_key.
    │                              │
    │── MANIFEST (encrypted) ─────▶│  { entries: [{id, updated_at}] }
    │◀─ MANIFEST (encrypted) ──────│  { entries: [{id, updated_at}] }
    │                              │
    │  Each side computes: which entries does the peer lack?
    │                              │
    │── ENTRIES (encrypted) ──────▶│  [{id, content (ciphertext), mood, …}]
    │◀─ ENTRIES (encrypted) ───────│  [{id, content (ciphertext), mood, …}]
    │                              │
    │── DONE (encrypted) ─────────▶│
    │◀─ DONE_ACK (encrypted) ──────│
    │                              │
    │  Both sides update peer_sync_state (last_sync_at)
```

### Conflict Resolution

Conflicts (same entry modified on both devices) are resolved **last-write-wins** (LWW) by `updated_at` timestamp. The entry with the later `updated_at` is kept.

This is a conservative strategy — no data is deleted, but concurrent edits on two devices will result in one version being overwritten. Users should treat peer sync as "merge missing entries," not collaborative real-time editing.

### What crosses the wire

**Synced in plaintext:**
- Entry ID
- `updated_at` timestamp (for manifest diffing and LWW)
- Mood level (integer 1–5)
- `privacy_mode`
- `book_id`
- `pinned` flag

**Synced as ciphertext (opaque blobs):**
- Entry content (`EncryptedContent` struct: `{ iv, data, salt }`)

**Not synced:**
- Settings (each device keeps its own)
- 2FA configuration
- WebDAV credentials
- Oura PAT
- Device identity / pairing data
- Media attachments (planned for future phase)

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

- `src-tauri/src/commands/peer_sync_engine.rs` — TCP server, protocol, encryption/decryption
- `src-tauri/src/commands/peer_pairing.rs` — PIN generation, key exchange, trust storage
- `src-tauri/src/commands/peer_identity.rs` — key generation, persistence
- `src-tauri/src/commands/peer_discovery.rs` — mDNS broadcast content
- `src/lib/peerSyncEngineService.ts` — frontend orchestration
- `src-tauri/capabilities/default.json` — ACL for sync commands
