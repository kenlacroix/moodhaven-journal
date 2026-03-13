// Peer Sync — Type Definitions
// Layer 1: Device Identity, Layer 2: Discovery, Layer 3: Pairing, Layer 4: Sync

export type DeviceType = 'desktop' | 'phone' | 'tablet' | 'watch';

export interface DeviceIdentity {
  deviceName: string;
  deviceType: DeviceType;
  deviceId: string;    // first 16 hex chars of SHA-256(publicKey)
  publicKey: string;   // base64url Ed25519 public key
  created: string;     // ISO date
}

export interface TrustedDevice extends DeviceIdentity {
  paired: string;       // ISO date
  lastSeen?: string;    // ISO date
  lastSyncAt?: string;  // ISO date
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

export interface PairingQRPayload {
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  publicKey: string;
  pairingToken: string;  // 32-byte random, base64url
  expires: string;       // ISO date (5 min from generation)
  port: number;
}

export type PairingState =
  | { status: 'idle' }
  | { status: 'generating' }
  | { status: 'displaying_qr'; payload: PairingQRPayload; expiresAt: number }
  | { status: 'scanning' }
  | { status: 'confirming'; peer: DiscoveredPeer }
  | { status: 'pairing' }
  | { status: 'success'; device: TrustedDevice }
  | { status: 'error'; message: string };

export type SyncStatus =
  | { state: 'idle' }
  | { state: 'syncing'; deviceName: string; progress?: number }
  | { state: 'success'; deviceName: string; count: number; at: string }
  | { state: 'error'; deviceName: string; message: string };

export interface SyncRecord {
  deviceId: string;
  deviceName: string;
  direction: 'send' | 'receive' | 'both';
  entriesExchanged: number;
  at: string;
  durationMs: number;
}
