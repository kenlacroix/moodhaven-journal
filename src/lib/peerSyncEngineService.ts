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
  sent: number;
  received: number;
  at: string;
}

export interface SyncErrorEvent {
  deviceId: string;
  message: string;
}

export async function startSyncServer(): Promise<void> {
  return invoke('peer_start_sync_server');
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
