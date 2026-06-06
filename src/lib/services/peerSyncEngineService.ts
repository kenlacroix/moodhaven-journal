/**
 * peerSyncEngineService — Tauri IPC wrappers and event listeners for the Phase 3 sync engine.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface PeerSyncStateRecord {
  peerDeviceId: string;
  lastSyncAt: string;
}

export interface SyncStartedEvent {
  deviceId: string;
  deviceName: string;
}

export interface SyncCompleteEvent {
  deviceId: string;
  deviceName: string;
  /** Total items sent across all data types. */
  sent: number;
  /** Total items received across all data types. */
  received: number;
  sentEntries: number;
  receivedEntries: number;
  sentBooks: number;
  receivedBooks: number;
  sentSignals: number;
  receivedSignals: number;
  sentSettings: number;
  receivedSettings: number;
  at: string;
}

export interface SyncErrorEvent {
  deviceId: string;
  message: string;
}

/**
 * Fired on the client when the server replies NotTrusted — meaning the server
 * has already revoked us. The client auto-removes the server from its trusted
 * list and emits this event so the frontend can update its UI.
 */
export interface PeerRevokedUsEvent {
  deviceId: string;
  deviceName: string;
}


export async function peerSyncNow(deviceId: string, host: string): Promise<void> {
  return invoke('peer_sync_now', { deviceId, host });
}

export async function getPeerSyncStates(): Promise<PeerSyncStateRecord[]> {
  return invoke('peer_get_sync_states');
}

export function onSyncStarted(cb: (e: SyncStartedEvent) => void): Promise<UnlistenFn> {
  return listen<SyncStartedEvent>('peer:sync_started', (e) => cb(e.payload));
}

export function onSyncComplete(cb: (e: SyncCompleteEvent) => void): Promise<UnlistenFn> {
  return listen<SyncCompleteEvent>('peer:sync_complete', (e) => cb(e.payload));
}

export function onSyncError(cb: (e: SyncErrorEvent) => void): Promise<UnlistenFn> {
  return listen<SyncErrorEvent>('peer:sync_error', (e) => cb(e.payload));
}

/**
 * Called on the client when the server sends NotTrusted — meaning the peer
 * has revoked us. By this point the Rust layer has already removed the peer
 * from trusted_devices.json; the frontend just needs to update its store.
 */
export function onPeerRevokedUs(cb: (e: PeerRevokedUsEvent) => void): Promise<UnlistenFn> {
  return listen<PeerRevokedUsEvent>('peer:peer_revoked_us', (e) => cb(e.payload));
}


// ── Full DB restore (setup-time) ──────────────────────────────────────────────

export interface RestoreProgressEvent {
  bytesReceived: number;
  totalBytes: number;
  percentage: number;
  chunksReceived: number;
  totalChunks: number;
  deviceName: string;
}

export interface RestoreReadyEvent {
  totalBytes: number;
  deviceName: string;
}

export interface RestoreErrorEvent {
  message: string;
}

/** Kick off a full DB restore from a trusted peer (setup-time). */
export async function peerFullRestore(deviceId: string, host: string): Promise<void> {
  return invoke('peer_full_restore', { deviceId, host });
}

/** Rename the pending restore file to moodhaven.db and restart the app. */
export async function peerApplyAndRestart(): Promise<void> {
  return invoke('peer_apply_and_restart');
}

export function onRestoreProgress(cb: (e: RestoreProgressEvent) => void): Promise<UnlistenFn> {
  return listen<RestoreProgressEvent>('peer:restore_progress', (e) => cb(e.payload));
}

export function onRestoreReady(cb: (e: RestoreReadyEvent) => void): Promise<UnlistenFn> {
  return listen<RestoreReadyEvent>('peer:restore_ready', (e) => cb(e.payload));
}

export function onRestoreError(cb: (e: RestoreErrorEvent) => void): Promise<UnlistenFn> {
  return listen<RestoreErrorEvent>('peer:restore_error', (e) => cb(e.payload));
}
