/**
 * Cloud Sync Service for MoodHaven Journal
 *
 * Orchestrates: export -> encrypt -> upload / download -> decrypt -> import
 * Uses webdavService for HTTP and dataManagementService for encryption.
 */

import type { WebDAVConfig } from '../types/settings';
import { encryptedExport, encryptedImport } from './dataManagementService';
import {
  testConnection,
  ensureDirectory,
  uploadFile,
  downloadFile,
  listFiles,
} from './webdavService';

export interface SyncResult {
  success: boolean;
  error?: string;
  entriesCount?: number;
  timestamp?: string;
  filename?: string;
}

/**
 * Generate backup filename with timestamp
 */
function generateBackupFilename(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  return `moodhaven-backup-${date}-${time}.moodhaven`;
}

/**
 * Upload encrypted backup to WebDAV
 *
 * Flow: test connection -> ensure directory -> export & encrypt -> upload
 */
export async function uploadBackup(
  password: string,
  webdavConfig: WebDAVConfig,
): Promise<SyncResult> {
  try {
    const connResult = await testConnection(webdavConfig);
    if (!connResult.success) {
      return { success: false, error: connResult.error || 'WebDAV connection failed' };
    }

    const dirResult = await ensureDirectory(webdavConfig);
    if (!dirResult.success) {
      return { success: false, error: dirResult.error || 'Failed to create backup directory' };
    }

    const encryptedData = await encryptedExport(password);

    const filename = generateBackupFilename();
    const uploadResult = await uploadFile(webdavConfig, filename, encryptedData);
    if (!uploadResult.success) {
      return { success: false, error: uploadResult.error || 'Upload failed' };
    }

    return {
      success: true,
      timestamp: new Date().toISOString(),
      filename,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

/**
 * Download and import latest backup from WebDAV
 *
 * Flow: list files (or use specified filename) -> download -> decrypt -> import
 */
export async function downloadBackup(
  password: string,
  webdavConfig: WebDAVConfig,
  filename?: string,
): Promise<SyncResult> {
  try {
    let targetFile = filename;
    if (!targetFile) {
      const listResult = await listFiles(webdavConfig);
      if (!listResult.success || !listResult.files || listResult.files.length === 0) {
        return { success: false, error: 'No backups found on server' };
      }
      // Sort by name (date-based names sort chronologically) — take latest
      targetFile = listResult.files.sort().reverse()[0];
    }

    const downloadResult = await downloadFile(webdavConfig, targetFile);
    if (!downloadResult.success || !downloadResult.data) {
      return { success: false, error: downloadResult.error || 'Download failed' };
    }

    const entriesCount = await encryptedImport(downloadResult.data, password);

    return {
      success: true,
      entriesCount,
      timestamp: new Date().toISOString(),
      filename: targetFile,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Download failed',
    };
  }
}

/**
 * List available backups on WebDAV, most recent first
 */
export async function listBackups(webdavConfig: WebDAVConfig): Promise<string[]> {
  const result = await listFiles(webdavConfig);
  if (!result.success || !result.files) {
    return [];
  }
  return result.files.sort().reverse();
}
