/**
 * Data Management Service
 *
 * Handles factory reset, export, and import operations.
 * Provides encrypted export/import wrappers using AES-256-GCM.
 */

import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { encrypt, decrypt } from './crypto';
import type { EncryptedData } from './crypto';
import { listAllMedia } from './mediaService';
import { isAndroidPlatform } from '../../hooks/usePlatform';
import { shareExportedText } from './mobileExport';

/**
 * Factory reset - wipe all app data
 * @returns Promise that resolves to true on success
 */
export async function factoryReset(): Promise<boolean> {
  return invoke<boolean>('factory_reset');
}

/**
 * Exit the application (used after factory reset to fully restart)
 */
export async function exitApp(): Promise<void> {
  return invoke<void>('exit_app');
}

/**
 * Relaunch the application into its first-run state (used after factory reset).
 * Desktop restarts the process; the browser build reloads the page.
 */
export async function relaunchApp(): Promise<void> {
  return invoke<void>('relaunch_app');
}

/** Optional filters for selective export. All fields optional; absent = no filter. */
export interface ExportFilter {
  tags?: string[];
  moodMin?: number;
  moodMax?: number;
  startDate?: string; // ISO 8601
  endDate?: string;   // ISO 8601
}

/**
 * Export journal data.
 * When `password` is provided the Rust backend encrypts the payload
 * (PBKDF2+AES-256-GCM) and returns a ready-to-use moodhaven-encrypted-v1
 * envelope that the frontend decrypt() can unwrap directly.
 * When omitted (full-backup path) the raw base64 is returned for the caller
 * to wrap with its own encryption envelope.
 */
export async function exportData(password?: string, filter?: ExportFilter): Promise<string> {
  return invoke<string>('export_data', {
    password: password ?? null,
    filter: filter ?? null,
  });
}

/**
 * Import data from backup
 * @param data - Base64-encoded backup string
 * @returns Number of entries imported
 */
async function importData(data: string): Promise<number> {
  return invoke<number>('import_data', { data });
}

/**
 * Get data statistics for export info
 * @returns Object with totalEntries and averageMood
 */
export async function getDataStats(): Promise<{ totalEntries: number; averageMood: number }> {
  return invoke<{ totalEntries: number; averageMood: number }>('get_data_stats');
}

/**
 * Download export as file using native Save dialog.
 * Verifies the file is written and contains encrypted data.
 * @param data - Backup data string (must be encrypted envelope)
 * @param filename - Default name of the file to download
 * @throws Error if file write fails, verification fails, or data is not encrypted
 */
export async function downloadBackup(data: string, filename: string): Promise<void> {
  // Verify data is encrypted before writing
  try {
    const parsed = JSON.parse(data);
    if (parsed.format !== 'moodhaven-encrypted-v1' || !parsed.payload) {
      throw new Error('Export data is not encrypted. Aborting write.');
    }
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error('Export data is not in the expected encrypted format.');
    }
    throw e;
  }

  if (isAndroidPlatform) {
    await shareExportedText(filename, data, 'application/octet-stream');
    return;
  }

  const filePath = await save({
    defaultPath: filename,
    filters: [{ name: 'MoodHaven Backup', extensions: ['moodhaven'] }],
  });

  if (!filePath) return; // user cancelled

  // Write via Rust command (bypasses FS plugin scope restrictions)
  const bytesWritten = await invoke<number>('write_text_file', {
    path: filePath,
    contents: data,
  });

  if (!bytesWritten || bytesWritten === 0) {
    throw new Error('Export file was not written. Please try again.');
  }
}

/**
 * Read backup file contents
 * @param file - File object to read
 * @returns Promise that resolves to the file contents
 */
export async function readBackupFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

// --- Encrypted export/import ---

const ENCRYPTED_EXPORT_VERSION = 'moodhaven-encrypted-v1';
const FULL_EXPORT_VERSION = 'moodhaven-full-v2';

interface EncryptedExportEnvelope {
  format: string;
  payload: EncryptedData;
}

interface MediaSyncPayload {
  id: string;
  entryId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  dataBase64: string;
}

interface FullExportPayload {
  entriesData: string;        // base64 from export_data Rust command
  media: MediaSyncPayload[];  // encrypted MBMF bytes, base64-encoded
}

/**
 * Export data with AES-256-GCM encryption (entries only, no media).
 * Used by WebDAV cloud sync which has its own media sync path.
 * Encryption is done in Rust (PBKDF2+AES-256-GCM, same parameters as WebCrypto)
 * so the plaintext never crosses the IPC boundary. The returned envelope is
 * directly compatible with encryptedImport / downloadBackup.
 */
export async function encryptedExport(password: string): Promise<string> {
  return exportData(password);
}

/**
 * Export all data including media attachments, with AES-256-GCM encryption.
 * This is the full backup format — use this for "Export Data" in Settings.
 * @param password - Master password for encryption
 * @param onProgress - Optional callback: (uploaded, total) for progress UI
 * @returns JSON string containing encrypted full backup
 */
export async function exportWithMedia(
  password: string,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const [entriesBase64, allMedia] = await Promise.all([exportData(), listAllMedia()]);

  const mediaPayloads: MediaSyncPayload[] = [];
  for (let i = 0; i < allMedia.length; i++) {
    try {
      const payload = await invoke<MediaSyncPayload>('read_media_for_sync', {
        mediaId: allMedia[i].id,
      });
      mediaPayloads.push(payload);
    } catch {
      // Skip files that can't be read — non-fatal
    }
    onProgress?.(i + 1, allMedia.length);
  }

  const fullExport: FullExportPayload = { entriesData: entriesBase64, media: mediaPayloads };
  const result = await encrypt(JSON.stringify(fullExport), password);
  if (!result.success || !result.data) throw new Error(result.error || 'Encryption failed');
  return JSON.stringify({ format: FULL_EXPORT_VERSION, payload: result.data });
}

/**
 * Import data from an encrypted backup.
 * Auto-detects format:
 *   - moodhaven-full-v2  → full backup with media (new)
 *   - moodhaven-encrypted-v1 → entries only, encrypted (legacy)
 *   - plain base64           → entries only, unencrypted (oldest legacy)
 * @returns Number of entries imported
 */
export async function encryptedImport(data: string, password: string): Promise<number> {
  let base64Data: string;

  try {
    const parsed = JSON.parse(data) as EncryptedExportEnvelope;

    if (parsed.format === FULL_EXPORT_VERSION && parsed.payload) {
      // Full backup (v2) — includes media
      const result = await decrypt(parsed.payload, password);
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Decryption failed — wrong password?');
      }
      const fullExport: FullExportPayload = JSON.parse(result.data);
      const entries = await importData(fullExport.entriesData);

      for (const m of fullExport.media ?? []) {
        await invoke('write_media_from_sync', {
          entryId: m.entryId,
          mediaId: m.id,
          filename: m.filename,
          mimeType: m.mimeType,
          sizeBytes: m.sizeBytes,
          createdAt: m.createdAt,
          dataBase64: m.dataBase64,
        }).catch(() => {}); // idempotent — ignore if already exists
      }
      return entries;

    } else if (parsed.format === ENCRYPTED_EXPORT_VERSION && parsed.payload) {
      // Entries-only encrypted backup (v1)
      const result = await decrypt(parsed.payload, password);
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Decryption failed — wrong password?');
      }
      base64Data = result.data;
    } else {
      // JSON but unknown format — treat as legacy base64
      base64Data = data;
    }
  } catch (e) {
    if (e instanceof SyntaxError) {
      // Not JSON — treat as legacy base64
      base64Data = data;
    } else {
      throw e;
    }
  }

  return importData(base64Data);
}
