/**
 * syncManifest.ts
 *
 * The sync manifest is a small encrypted JSON file stored on WebDAV at
 * `MoodBloom/sync/manifest.enc`. It is the remote source of truth for which
 * entries and books exist across all devices, indexed by ID with their
 * last-known updated_at timestamp and originating device.
 *
 * Any device with the correct password can read and update the manifest.
 */

import { encrypt, decrypt } from './crypto';
import type { EncryptedData } from './crypto';

export interface ManifestEntryMeta {
  /** ISO timestamp matching the entry's updated_at column */
  updatedAt: string;
  /** Device UUID that last wrote this entry to WebDAV */
  deviceId: string;
}

export interface SyncTombstone {
  id: string;
  type: 'entry' | 'book';
  deletedAt: string; // ISO
  deviceId: string;
}

export interface SyncManifest {
  schemaVersion: 1;
  /** ISO timestamp of when this manifest was last written */
  generatedAt: string;
  /** Device UUID that last wrote this manifest */
  deviceId: string;
  entries: Record<string, ManifestEntryMeta>;
  books: Record<string, ManifestEntryMeta>;
  /** Soft-delete log so deletions propagate to other devices */
  tombstones: SyncTombstone[];
}

export function createEmptyManifest(deviceId: string): SyncManifest {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    deviceId,
    entries: {},
    books: {},
    tombstones: [],
  };
}

export async function encryptManifest(manifest: SyncManifest, password: string): Promise<string> {
  const result = await encrypt(JSON.stringify(manifest), password);
  if (!result.success || !result.data) {
    throw new Error(result.error ?? 'Failed to encrypt manifest');
  }
  return JSON.stringify(result.data);
}

export async function decryptManifest(encryptedStr: string, password: string): Promise<SyncManifest> {
  const encryptedData: EncryptedData = JSON.parse(encryptedStr);
  const result = await decrypt(encryptedData, password);
  if (!result.success || !result.data) {
    throw new Error('Failed to decrypt sync manifest — wrong password?');
  }
  return JSON.parse(result.data) as SyncManifest;
}
