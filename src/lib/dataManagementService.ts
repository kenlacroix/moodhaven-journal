/**
 * Data Management Service
 *
 * Handles factory reset, export, and import operations.
 */

import { invoke } from '@tauri-apps/api/core';

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
 * Download export as file
 * @param data - Backup data string
 * @param filename - Name of the file to download
 */
export function downloadBackup(data: string, filename: string): void {
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
