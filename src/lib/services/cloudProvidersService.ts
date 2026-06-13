/**
 * Cloud Providers Service
 *
 * IPC wrappers for cloud provider sync commands (Dropbox, Google Drive).
 * WebDAV remains in cloudSyncService.ts.
 */

import { invoke } from '@tauri-apps/api/core';
import { exportData } from './dataManagementService';
import { encryptedImport } from './dataManagementService';

export interface ProviderStatus {
  provider: string;
  connected: boolean;
  lastSyncAt: string | null;
}

export async function cloudProviderAuthStart(provider: 'dropbox' | 'gdrive'): Promise<void> {
  return invoke('cloud_provider_auth_start', { provider });
}

/**
 * Android only: fetch the cloud-token encryption key from the AndroidKeyStore-backed
 * `securekey` plugin and hand it to Rust, so OAuth tokens are encrypted under a
 * hardware-backed key instead of the bare 0600 fallback file. Best-effort — on
 * failure Rust falls back to its keyring→file path, so cloud sync still works.
 * Must run before any cloud-token operation; called once at startup.
 */
export async function bootstrapAndroidCloudTokenKey(): Promise<void> {
  const { key } = await invoke<{ key: string }>('plugin:securekey|getCloudTokenKey');
  await invoke('cloud_set_token_key', { keyHex: key });
}

async function cloudProviderUploadBlob(
  provider: 'dropbox' | 'gdrive',
  blob: string,
): Promise<void> {
  return invoke('cloud_provider_upload_blob', { provider, blob });
}

async function cloudProviderDownloadBlob(provider: 'dropbox' | 'gdrive'): Promise<string> {
  return invoke('cloud_provider_download_blob', { provider });
}

export async function cloudProviderStatus(provider?: string): Promise<ProviderStatus[]> {
  return invoke('cloud_provider_status', { provider: provider ?? null });
}

export async function cloudProviderDisconnect(provider: 'dropbox' | 'gdrive'): Promise<void> {
  return invoke('cloud_provider_disconnect', { provider });
}


export async function syncUpload(
  provider: 'dropbox' | 'gdrive',
  password: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const blob = await exportData(password);
    await cloudProviderUploadBlob(provider, blob);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function syncDownload(
  provider: 'dropbox' | 'gdrive',
  password: string,
): Promise<{ success: boolean; entriesCount?: number; error?: string }> {
  try {
    const blob = await cloudProviderDownloadBlob(provider);
    const count = await encryptedImport(blob, password);
    return { success: true, entriesCount: count };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
