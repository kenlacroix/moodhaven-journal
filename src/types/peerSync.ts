// Peer Sync — Type Definitions
// Layer 1: Device Identity, Layer 2: Discovery, Layer 3: Pairing, Layer 4: Sync

type DeviceType = 'desktop' | 'phone' | 'tablet' | 'watch';

export interface DeviceIdentity {
  deviceName: string;
  deviceType: DeviceType;
  deviceId: string;    // first 16 hex chars of SHA-256(publicKey)
  publicKey: string;   // base64url Ed25519 public key
  created: string;     // ISO date
}

export interface TrustedDevice {
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  publicKey: string;
  pairedAt: string;     // ISO date
  lastSeen: string;     // ISO date
  lastSyncAt?: string;  // ISO date (set after first sync)
}

export interface PairingTokenInfo {
  pin: string;         // 6-digit string
  qrPayload: string;   // JSON string for QR image generation
  expiresAt: number;   // Unix timestamp
  localHost: string;   // Our LAN IP
  pairingPort: number; // 42425
}

export interface DiscoveredPeer {
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  host: string;
  port: number;
  version: string;
  pubkeyHint: string;
  isTrusted: boolean;
  isOnline: boolean;
  lastSeen: string;
}

export type SyncStatus =
  | { state: 'idle' }
  | { state: 'syncing'; deviceName: string; progress?: number }
  | { state: 'success'; deviceName: string; count: number; at: string }
  | { state: 'error'; deviceName: string; message: string };
