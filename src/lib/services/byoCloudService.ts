/**
 * BYO-Cloud Folder Sync
 *
 * Writes the same encrypted `.moodhaven` backup blob the export path produces into a
 * user-picked folder that the OS keeps mirrored to iCloud Drive / Google Drive / Dropbox /
 * OneDrive. No server, no OAuth, no per-provider API — the OS sync client handles
 * propagation. Upload = export → write file; download = read file → import.
 */

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { exportWithMedia, encryptedImport } from './dataManagementService';

const BACKUP_FILENAME = 'moodhaven-backup.moodhaven';

export interface ByoCloudResult {
  success: boolean;
  error?: string;
  entriesCount?: number;
}

/** Join a folder path and filename using the folder's native separator. */
function backupPathIn(folderPath: string): string {
  const sep = folderPath.includes('\\') ? '\\' : '/';
  const base = folderPath.endsWith(sep) ? folderPath.slice(0, -sep.length) : folderPath;
  return `${base}${sep}${BACKUP_FILENAME}`;
}

/**
 * Prompt the user to pick a sync folder. Returns the chosen absolute path, or null
 * if the user cancelled.
 */
export async function pickSyncFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Choose a sync folder (e.g. inside iCloud Drive, Google Drive, or Dropbox)',
  });
  if (!selected || Array.isArray(selected)) return null;
  return selected;
}

/**
 * Export the full encrypted backup (entries + media) and write it into the sync folder.
 */
export async function byoCloudUpload(
  password: string,
  folderPath: string,
): Promise<ByoCloudResult> {
  try {
    const blob = await exportWithMedia(password);
    const bytesWritten = await invoke<number>('write_text_file', {
      path: backupPathIn(folderPath),
      contents: blob,
    });
    if (!bytesWritten || bytesWritten === 0) {
      return { success: false, error: 'Backup file was not written.' };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Upload failed' };
  }
}

/**
 * Read the encrypted backup from the sync folder and merge it into the local store.
 */
export async function byoCloudDownload(
  password: string,
  folderPath: string,
): Promise<ByoCloudResult> {
  try {
    const blob = await invoke<string>('read_text_file', { path: backupPathIn(folderPath) });
    const entriesCount = await encryptedImport(blob, password);
    return { success: true, entriesCount };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Download failed' };
  }
}
