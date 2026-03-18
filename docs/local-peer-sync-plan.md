# Local Peer Discovery & Direct Sync — Architecture Plan

> **Status:** All 4 phases complete ✅
> **Shipped:** v0.7.0
> **Last Updated:** 2026-03-18

---

## Overview

Enable MoodBloom instances across desktop, phone, and watch to discover each other on a local network and sync encrypted data peer-to-peer — no cloud server, no user accounts, no configuration required.

**Design priorities:**
- Privacy-first (LAN-only by default, zero cloud involvement)
- Zero-configuration (mDNS auto-discovery)
- Secure-by-default (Ed25519 identity, paired devices only)
- Offline-first (sync is opportunistic, never blocking)

---

## Architecture: Four Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: Encrypted Sync Connection                         │
│  TLS WebSocket + Ed25519 mutual auth + AES-256-GCM payload  │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Secure Pairing                                    │
│  QR code / PIN exchange → trusted_devices store             │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Peer Discovery                                    │
│  mDNS/Zeroconf (_moodbloom._tcp.local) + UDP fallback       │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Device Identity                                   │
│  Ed25519 key pair → stable deviceId, stored in device.json  │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Device Identity

### Data Model

```json
// app_data_dir/device.json
{
  "deviceName": "Ken's Laptop",
  "deviceType": "desktop",
  "deviceId": "9a4f0b2c...",
  "publicKey": "base64url-encoded-ed25519-public-key",
  "created": "2026-03-13T10:00:00Z"
}
```

- `deviceId` = SHA-256(publicKey), hex-encoded, first 16 chars displayed
- Private key stored separately: `app_data_dir/device_private_key.bin` (0600 permissions)
- Generated once on first launch; persists across reboots

### Rust Implementation

**Crate:** `ed25519-dalek` + `rand`

```
src-tauri/src/commands/peer_identity.rs
  - get_or_create_device_identity() → DeviceIdentity
  - get_device_id() → String
  - get_device_public_key() → String (base64url)
```

**TypeScript types:**
```typescript
// src/types/peerSync.ts
interface DeviceIdentity {
  deviceName: string;
  deviceType: 'desktop' | 'phone' | 'tablet' | 'watch';
  deviceId: string;       // 16-char hex prefix of SHA-256(pubkey)
  publicKey: string;      // base64url Ed25519 public key
  created: string;
}

interface TrustedDevice extends DeviceIdentity {
  paired: string;         // ISO date of pairing
  lastSeen?: string;
  lastSyncAt?: string;
}
```

---

## Layer 2: Peer Discovery

### Protocol: mDNS / DNS-SD

**Service type:** `_moodbloom._tcp.local`

**Broadcast record:**
```
Service:    moodbloom-<deviceName>._moodbloom._tcp.local
Port:       4242 (default, configurable)
TXT record:
  device_id=<first-16-hex>
  device_type=desktop
  version=0.7.0
  pubkey_hint=<first-8-chars-of-pubkey>
```

`pubkey_hint` lets receiving devices check if this peer is already paired without leaking the full key.

### Rust Implementation

**Crate:** `mdns-sd` (cross-platform: Linux/macOS/Windows)

```
src-tauri/src/commands/peer_discovery.rs
  - start_discovery()           → spawns mdns-sd ServiceDaemon task
  - stop_discovery()
  - get_nearby_peers()          → Vec<DiscoveredPeer>
  - list_trusted_devices()      → Vec<TrustedDevice>
  - remove_trusted_device(id)
```

**Discovered peer type:**
```typescript
interface DiscoveredPeer {
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  host: string;           // resolved mDNS hostname
  port: number;
  version: string;
  isTrusted: boolean;     // matched against trusted_devices store
  isOnline: boolean;
  lastSeen: string;
}
```

### Fallback: UDP Broadcast

If mDNS is blocked (some corporate networks filter multicast):
- Broadcast UDP probe to `255.255.255.255:4243`
- Payload: `{type:"probe", deviceId, deviceName, port}`
- Respond on same port with device info

### Event Emission

Discovery runs in a background Tauri task and emits events:
```rust
// Tauri events emitted to frontend
"peer:discovered"  → DiscoveredPeer
"peer:lost"        → { deviceId }
"peer:updated"     → DiscoveredPeer
```

---

## Layer 3: Secure Pairing

### Pairing Flow (QR Code)

```
Device A (Initiator)                    Device B (Acceptor)
─────────────────────                   ─────────────────────
1. Generate pairing token (32 random bytes)
2. Display QR code:
   { deviceId, deviceName, deviceType,
     publicKey, pairingToken,
     expires: now+5min, port }
                                        3. Scan QR code
                                        4. Extract token + publicKey
                                        5. Display confirmation:
                                           "Pair with Ken's Laptop?"
                                        6. User taps Confirm
                                        7. POST /pair with:
                                           { myDeviceId, myPublicKey,
                                             pairingToken }
8. Verify token matches
9. Store Device B in trusted_devices
10. Respond 200 OK + own publicKey     10. Store Device A in trusted_devices

Both devices now trusted ✓
```

### Alternative: Numeric PIN

For watch (no camera):
1. Device A generates 6-digit PIN from pairing token
2. User types PIN on watch
3. Watch sends PIN + its publicKey to Device A
4. Device A verifies PIN, stores watch as trusted device

### Pairing Token Security

- 32-byte cryptographically random token
- Expires in 5 minutes
- Single-use (invalidated after first successful pair)
- Not transmitted in mDNS broadcast

### Trusted Devices Store

```json
// app_data_dir/trusted_devices.json  (encrypted with app key)
[
  {
    "deviceId": "9a4f0b2c...",
    "deviceName": "Ken's Phone",
    "deviceType": "phone",
    "publicKey": "base64url...",
    "paired": "2026-03-13T10:05:00Z",
    "lastSeen": "2026-03-13T15:30:00Z",
    "lastSyncAt": "2026-03-13T15:30:05Z"
  }
]
```

```
src-tauri/src/commands/peer_pairing.rs
  - generate_pairing_qr()         → QrPayload (JSON for QR encoding)
  - accept_pairing(payload)       → TrustedDevice
  - confirm_pin_pairing(pin)      → TrustedDevice
  - revoke_device(deviceId)
```

---

## Layer 4: Encrypted Sync Connection

### Transport

**Protocol:** WebSocket over TLS (wss://)

Each device runs a lightweight HTTPS/WS server on port 4242.

**Handshake:**
1. Connect: `wss://<peer-host>:4242/sync`
2. Client sends: `{ type: "hello", deviceId, nonce, timestamp }`
3. Server verifies `deviceId` is in trusted list
4. Server sends: `{ type: "challenge", challenge: 32-random-bytes }`
5. Client signs challenge with Ed25519 private key
6. Client sends: `{ type: "auth", signature }`
7. Server verifies signature against stored public key
8. If valid → session established with unique session key (ECDH)

### Sync Protocol

```
Phase 1 — Manifest Exchange:
  A → B: { type: "manifest", entryIds: [{ id, updatedAt }], lastSync }
  B → A: { type: "manifest", entryIds: [...], lastSync }

Phase 2 — Delta Request:
  A → B: { type: "request", missing: [id1, id2, ...] }
  B → A: { type: "request", missing: [id3, id4, ...] }

Phase 3 — Data Transfer:
  B → A: { type: "entries", entries: [EncryptedEntry, ...] }
  A → B: { type: "entries", entries: [EncryptedEntry, ...] }

Phase 4 — Acknowledge:
  Both: { type: "sync_complete", count: N, timestamp }
```

### Entry Format Over Wire

Entries are transmitted **still encrypted** — the same AES-256-GCM ciphertext stored locally. No re-encryption needed; the user's password key is shared across their own devices (same master key). Receiving device just stores the blob.

```typescript
interface WireEntry {
  entryId: string;
  deviceId: string;       // origin device
  updatedAt: string;
  encryptedPayload: string;  // base64 of existing local ciphertext
}
```

### Conflict Resolution: Last-Write-Wins + Append

- Each entry has `updatedAt` (ISO timestamp, microsecond precision)
- If both devices have same `entryId` with different `updatedAt`: newer wins
- Deleted entries: tombstone record `{ entryId, deletedAt, origin }` prevents resurrection
- New entries (different `entryId`): always kept (append semantics)

---

## Watch Integration

Watch devices do not participate directly in the mDNS network.

```
Watch ←—BLE/WiFi—→ Phone ←—LAN—→ Desktop/Tablet
```

The phone acts as a relay:
- Watch syncs to phone via its existing BLE/Wifi Direct channel
- Phone stores entries and participates in LAN peer sync as "phone" device type
- Desktop/tablet fetches from phone normally

Watch entries get `deviceId` of the watch but arrive via phone — the sync protocol handles this transparently since `deviceId` in `WireEntry` records the true origin.

---

## File Structure

```
src-tauri/src/
├── commands/
│   ├── peer_identity.rs      # Ed25519 key gen, device.json
│   ├── peer_discovery.rs     # mDNS-sd daemon, UDP fallback
│   ├── peer_pairing.rs       # QR gen, PIN flow, trusted_devices.json
│   └── peer_sync.rs          # WS server, sync protocol, manifest logic
│
src/
├── types/
│   └── peerSync.ts           # DeviceIdentity, TrustedDevice, DiscoveredPeer, SyncStatus
├── lib/
│   ├── peerDiscoveryService.ts   # IPC wrappers + event listeners
│   ├── peerPairingService.ts     # QR encode/decode, pairing flow
│   └── peerSyncService.ts        # Sync orchestration, conflict resolution
├── stores/
│   └── peerSyncStore.ts          # Zustand: peers, pairing state, sync status
├── hooks/
│   └── usePeerSync.ts            # Convenience hook for components
├── components/
│   └── peer-sync/
│       ├── NearbyDevicesPanel.tsx    # Discovered peers list
│       ├── PairingModal.tsx          # QR display / PIN entry / confirmation
│       ├── TrustedDevicesList.tsx    # Manage paired devices
│       ├── SyncStatusBadge.tsx       # Inline sync status indicator
│       └── DeviceQRCode.tsx          # QR code renderer
└── pages/
    └── PeerSyncWireframes.tsx    # Dev-only wireframe preview page
```

---

## Cargo Dependencies

```toml
[dependencies]
# Peer discovery
mdns-sd = "0.11"

# Cryptographic identity
ed25519-dalek = { version = "2", features = ["rand_core"] }
x25519-dalek = "2"          # ECDH session key
sha2 = "0.10"

# WebSocket server (async, lightweight)
axum = { version = "0.7", features = ["ws"] }
tokio-tungstenite = "0.21"

# TLS
rustls = "0.23"
rcgen = "0.13"              # Self-signed cert generation per device
```

---

## Phased Implementation

### Phase 1 — Identity & Discovery (v0.6.0) ✅ COMPLETE
- [x] Ed25519 key generation + `peer_identity.json` / `peer_key.bin`
- [x] mDNS broadcast + discovery daemon (`mdns-sd`, `_moodbloom._tcp.local.`)
- [x] `peer_get_nearby`, `peer_discovery_start/stop`, `peer_discovery_is_active` commands
- [x] `DevicesTab` in Settings → Devices tab (full polished UI)
- [x] Event-driven peer list via `peer:discovered` / `peer:lost` Tauri events
- [x] `PeerSyncBadge` in sidebar footer
- [x] `PeerSyncWireframes` dev preview page (`?mode=peersync`)

### Phase 2 — Pairing (v0.6.1) ✅ COMPLETE
- [x] Pairing token generation (6-digit PIN, 32-byte entropy)
- [x] QR code display (`qrcode` JS lib, no network)
- [x] `PairingModal` (both initiator and acceptor flows)
- [x] `trusted_devices.json` store (public-keys only, deterministic ports 43000–43999)
- [x] Revoke/unpair device (`TrustedDevicesList`)
- [x] `peer:paired` Tauri event on both sides

### Phase 3 — Sync Engine (v0.7.0) ✅ COMPLETE
- [x] TCP sync server per device (port 44000–44999, derived from deviceId)
- [x] Plaintext HELLO → encrypted MANIFEST exchange → ENTRY stream → DONE/ACK
- [x] Shared transport key: SHA-256("moodbloom-sync-v1:" ‖ sorted pubkeys) — no handshake roundtrip
- [x] Manifest exchange + delta protocol (send only missing entries in each direction)
- [x] Background sync task (auto-triggers on `peer:discovered` with 30 s cooldown)
- [x] `SyncStatusBadge` in Sidebar footer
- [x] Conflict resolution: last-write-wins by `updated_at` + append-only for new entries
- [x] `peer_sync_state` DB table tracks `last_sync_at` per peer

### Phase 4 — Polish (v0.7.1) ✅ COMPLETE
- [x] UDP broadcast fallback — parallel UDP thread on port 4243; probe/pong protocol;
      injects peers mDNS missed; stops cleanly when mDNS thread exits
- [x] LAN-only privacy mode toggle — `peerSyncLanOnly` setting (default: true);
      RFC-1918 check in `usePeerSync` auto-sync path; toggle in Settings → Devices
- [x] Auto-sync interval setting — `peerSyncIntervalSecs` (10/30/60/300 s, default: 30);
      used in `usePeerSync` cooldown via ref; selector in Settings → Devices
- [ ] Sync conflict review UI — deferred (LWW resolution handles conflicts silently; no UX needed yet)
- [ ] Watch gateway routing (phone as relay) — deferred to post-release

---

## Security Properties

| Property | Implementation |
|---|---|
| Device authentication | Ed25519 signature on challenge |
| Transport encryption | TLS (self-signed per-device cert via rcgen) |
| Payload privacy | Entries transmitted as existing AES-256-GCM ciphertext |
| Pairing integrity | Signed QR token, 5-min expiry, single-use |
| No trust escalation | Trusted list is append-only via explicit user action |
| Revocation | Remove from trusted_devices; peer closes connection on next handshake |
| LAN-only | mDNS is LAN-scoped by definition; WS server binds to LAN interface only |

---

## Settings Integration

New section in Settings → **Devices** tab:

```
┌─ Devices ──────────────────────────────────────────────────┐
│                                                             │
│  Local Sync          [● Enabled]                           │
│  Discover and sync with devices on your local network      │
│                                                             │
│  This Device                                               │
│  Ken's Laptop · desktop · ID: 9a4f0b2c                    │
│  [Rename]                                                   │
│                                                             │
│  Nearby Devices                                             │
│  ○ Ken's Phone   · last seen: just now   [Pair]            │
│                                                             │
│  Paired Devices                                             │
│  ✓ Ken's iPhone  · last sync: 2 min ago  [Revoke]          │
│  ✓ Ken's Tablet  · last sync: 1 hr ago   [Revoke]          │
│                                                             │
│  [+ Pair New Device]                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Privacy Guarantees

1. **LAN-only by default** — no data ever leaves local network
2. **Zero external servers** — no relay, no signaling server, no cloud
3. **No metadata leakage** — mDNS TXT only advertises public device info (name, type, version)
4. **Encrypted in transit** — all sync payloads are AES-256-GCM ciphertext + TLS wrapper
5. **Explicit pairing** — auto-discovery ≠ auto-sync; user must explicitly pair
6. **User controls trusted list** — any device can be revoked at any time
