/**
 * updaterService — IPC wrappers for the Rust update manager commands.
 *
 * All network I/O happens in Rust; this module is thin typed wrappers only.
 */

import { invoke } from '@tauri-apps/api/core';

export interface UpdateAsset {
  name: string;
  download_url: string;
  size: number;
  size_label: string;
  checksum: string;
}

/** Update urgency. "security" updates are non-skippable in the UI. */
export type UpdateSeverity = 'security' | 'recommended' | 'optional';

export interface UpdateInfo {
  version: string;
  current_version: string;
  notes: string;           // Raw markdown from GitHub release body
  pub_date: string;        // ISO-8601
  release_url: string;     // GitHub release page
  is_available: boolean;
  asset: UpdateAsset | null;
  can_self_update: boolean;
  platform: string;
  /**
   * Update urgency, computed in Rust. Currently-running versions below the
   * security floor (1.8.0, the pre-encryption cohort) report "security".
   */
  severity: UpdateSeverity;
}

/**
 * Check GitHub for a newer release. Safe to call on startup — fast, read-only.
 * Returns UpdateInfo whether or not an update is available.
 */
export async function checkForUpdate(): Promise<UpdateInfo> {
  return invoke<UpdateInfo>('check_for_update');
}

/**
 * Download the platform asset, verify SHA-256, then launch the installer.
 *
 * Progress is delivered via Tauri events:
 *   "update-progress"  → { downloaded: number, total: number, percent: number }
 *   "update-finished"  → { success: boolean, message: string }
 *
 * Throws on network or verification errors.
 */
export async function downloadAndInstallUpdate(asset: UpdateAsset): Promise<void> {
  return invoke<void>('download_and_install_update', {
    downloadUrl: asset.download_url,
    assetName: asset.name,
    expectedChecksum: asset.checksum,
  });
}
