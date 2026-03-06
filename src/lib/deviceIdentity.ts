/**
 * deviceIdentity.ts
 *
 * Manages a stable device UUID and human-readable name for multi-device sync.
 * Both values are persisted in the SQLite settings table so they survive
 * settings.json resets and are shared across the main + breakout windows.
 */

import { invoke } from '@tauri-apps/api/core';

const DEVICE_ID_KEY = 'sync_device_id';
const DEVICE_NAME_KEY = 'sync_device_name';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'Android';
  if (/ipad|iphone|ipod/i.test(ua)) return 'iOS';
  if (/mac os x/i.test(ua)) return 'Mac';
  if (/win/i.test(ua)) return 'Windows PC';
  return 'Linux Desktop';
}

/** Get or generate the persistent device UUID for this installation. */
export async function getDeviceId(): Promise<string> {
  const existing = await invoke<string | null>('get_setting', { key: DEVICE_ID_KEY }).catch(() => null);
  if (existing) return existing;
  const id = generateUUID();
  await invoke('set_setting', { key: DEVICE_ID_KEY, value: id }).catch(() => {});
  return id;
}

/** Get the human-readable device name (falls back to a platform guess). */
export async function getDeviceName(): Promise<string> {
  const name = await invoke<string | null>('get_setting', { key: DEVICE_NAME_KEY }).catch(() => null);
  return name || defaultDeviceName();
}

/** Persist a new device name. */
export async function setDeviceName(name: string): Promise<void> {
  await invoke('set_setting', { key: DEVICE_NAME_KEY, value: name.trim() });
}
