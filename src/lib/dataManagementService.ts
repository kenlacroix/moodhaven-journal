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
 * Export all journal data to encrypted backup
 * @param password - Password to encrypt the backup
 * @returns Base64-encoded backup string
 */
export async function exportData(password: string): Promise<string> {
  return invoke<string>('export_data', { password });
}

/**
 * Import data from backup
 * @param data - Base64-encoded backup string
 * @param password - Password to decrypt the backup
 * @returns Number of entries imported
 */
export async function importData(data: string, password: string): Promise<number> {
  return invoke<number>('import_data', { data, password });
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
    if (parsed.format !== 'moodbloom-encrypted-v1' || !parsed.payload) {
      throw new Error('Export data is not encrypted. Aborting write.');
    }
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error('Export data is not in the expected encrypted format.');
    }
    throw e;
  }

  const filePath = await save({
    defaultPath: filename,
    filters: [{ name: 'MoodBloom Backup', extensions: ['moodbloom'] }],
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

const ENCRYPTED_EXPORT_VERSION = 'moodbloom-encrypted-v1';

interface EncryptedExportEnvelope {
  format: typeof ENCRYPTED_EXPORT_VERSION;
  payload: EncryptedData;
}

/**
 * Export data with AES-256-GCM encryption.
 * Calls the Rust export (base64 JSON), then encrypts with the given password.
 * @param password - Master password for encryption
 * @returns JSON string containing encrypted envelope
 */
export async function encryptedExport(password: string): Promise<string> {
  const base64Data = await exportData('');

  const result = await encrypt(base64Data, password);
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Encryption failed');
  }

  const envelope: EncryptedExportEnvelope = {
    format: ENCRYPTED_EXPORT_VERSION,
    payload: result.data,
  };

  return JSON.stringify(envelope);
}

/**
 * Import data from an encrypted or legacy backup.
 * Auto-detects format: encrypted envelope (new) or plain base64 (legacy).
 * @param data - Backup data string (encrypted JSON or legacy base64)
 * @param password - Master password for decryption
 * @returns Number of entries imported
 */
export async function encryptedImport(data: string, password: string): Promise<number> {
  let base64Data: string;

  try {
    const parsed = JSON.parse(data);
    if (parsed.format === ENCRYPTED_EXPORT_VERSION && parsed.payload) {
      const result = await decrypt(parsed.payload as EncryptedData, password);
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Decryption failed - wrong password?');
      }
      base64Data = result.data;
    } else {
      // JSON but not encrypted envelope — treat as legacy
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

  return importData(base64Data, '');
}
