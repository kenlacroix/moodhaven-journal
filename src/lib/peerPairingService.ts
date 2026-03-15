/**
 * Peer Pairing Service
 *
 * IPC wrappers for the Rust peer pairing backend (Phase 2).
 * Handles PIN generation, HTTP server lifecycle, and trusted device management.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { TrustedDevice, PairingTokenInfo } from '../types/peerSync';

// ── Pairing commands ───────────────────────────────────────────────────────────

/**
 * Generate a 6-digit PIN and start the pairing HTTP server on port 42425.
 * The returned `qrPayload` can be encoded as a QR code for scanning.
 * Token expires after 5 minutes.
 */
export async function generatePairingToken(): Promise<PairingTokenInfo> {
  return invoke<PairingTokenInfo>('peer_generate_pairing_token');
}

/**
 * Accept a pairing invitation from `targetHost`.
 * Posts this device's identity + the `pin` to the peer's pairing server.
 * On success, both devices are saved as trusted.
 */
/**
 * Accept a pairing invitation.
 * `peerDeviceId` is used by the Rust side to derive the initiator's pairing port
 * (43000 + first-4-hex-of-deviceId % 1000) — no hardcoded port needed.
 */
export async function acceptPairing(
  targetHost: string,
  peerDeviceId: string,
  pin: string
): Promise<TrustedDevice> {
  return invoke<TrustedDevice>('peer_accept_pairing', { targetHost, peerDeviceId, pin });
}

/** Get all paired (trusted) devices. */
export async function getTrustedDevices(): Promise<TrustedDevice[]> {
  return invoke<TrustedDevice[]>('peer_get_trusted');
}

/** Remove a paired device by device_id. */
export async function revokeDevice(deviceId: string): Promise<void> {
  return invoke<void>('peer_revoke_device', { deviceId });
}

/** Cancel the in-progress pairing session (stops the HTTP server). */
export async function cancelPairing(): Promise<void> {
  return invoke<void>('peer_cancel_pairing');
}

/** Check if the pairing server is currently listening. */
export async function isPairingActive(): Promise<boolean> {
  return invoke<boolean>('peer_pairing_is_active');
}

// ── Event listeners ────────────────────────────────────────────────────────────

/** Called on both sides when pairing succeeds. */
export function onPeerPaired(
  callback: (device: TrustedDevice) => void
): Promise<UnlistenFn> {
  return listen<TrustedDevice>('peer:paired', (event) => {
    callback(event.payload);
  });
}

/**
 * Called on the initiator when the acceptor enters a wrong PIN.
 * Payload contains the number of attempts remaining before lockout.
 */
export function onPairingAttemptFailed(
  callback: (data: { remainingAttempts: number }) => void
): Promise<UnlistenFn> {
  return listen<{ remainingAttempts: number }>('peer:pairing_attempt_failed', (event) => {
    callback(event.payload);
  });
}

/**
 * Called on the initiator when the pairing session is locked out
 * after too many consecutive wrong PINs.
 */
export function onPairingLocked(
  callback: (data: { reason: string }) => void
): Promise<UnlistenFn> {
  return listen<{ reason: string }>('peer:pairing_locked', (event) => {
    callback(event.payload);
  });
}
