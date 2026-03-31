/**
 * Peer Discovery Service
 *
 * IPC wrappers and event listeners for the Rust mDNS peer discovery backend.
 * Phase 1: Device identity + LAN discovery
 * Phase 2 will add: pairing, trusted devices
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { DeviceIdentity, DiscoveredPeer } from '../../types/peerSync';

// ── Identity commands ──────────────────────────────────────────────────────────

/** Get (or generate on first call) this device's Ed25519 identity */
export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  return invoke<DeviceIdentity>('peer_get_identity');
}

/** Rename this device */
export async function renameDevice(name: string): Promise<DeviceIdentity> {
  return invoke<DeviceIdentity>('peer_rename_device', { name });
}

// ── Discovery commands ─────────────────────────────────────────────────────────

/** Start mDNS broadcast + browse. Idempotent. */
export async function startDiscovery(): Promise<void> {
  return invoke<void>('peer_discovery_start');
}

/** Stop discovery and clear peer list */
export async function stopDiscovery(): Promise<void> {
  return invoke<void>('peer_discovery_stop');
}

/** Get current snapshot of discovered nearby peers */
export async function getNearbyPeers(): Promise<DiscoveredPeer[]> {
  return invoke<DiscoveredPeer[]>('peer_get_nearby');
}

/** Check if discovery is currently active */
export async function isDiscoveryActive(): Promise<boolean> {
  return invoke<boolean>('peer_discovery_is_active');
}

// ── Event listeners ────────────────────────────────────────────────────────────

/** Called when a new peer is discovered on the LAN */
export function onPeerDiscovered(
  callback: (peer: DiscoveredPeer) => void
): Promise<UnlistenFn> {
  return listen<DiscoveredPeer>('peer:discovered', (event) => {
    callback(event.payload);
  });
}

/** Called when a peer goes offline */
export function onPeerLost(
  callback: (deviceId: string) => void
): Promise<UnlistenFn> {
  return listen<{ deviceId: string }>('peer:lost', (event) => {
    callback(event.payload.deviceId);
  });
}
