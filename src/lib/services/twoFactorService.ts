/**
 * Two-Factor Authentication Service
 *
 * Provides functions to manage 2FA (TOTP, WebAuthn, backup codes)
 * through Tauri commands.
 */

import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import type {
  TwoFactorStatus,
  TotpSetupData,
  BackupCodes,
} from '../../types/twoFactor';

// ============================================================================
// Status & Info
// ============================================================================

/**
 * Get current 2FA status
 */
export async function get2FAStatus(): Promise<TwoFactorStatus> {
  return invoke('get_2fa_status');
}

/**
 * Get remaining backup codes count
 */
export async function getBackupCodesCount(): Promise<number> {
  return invoke('get_backup_codes_count');
}

// ============================================================================
// TOTP Setup & Verification
// ============================================================================

/**
 * Generate a new TOTP secret for setup.
 * The password is required so Rust can encrypt the secret before storage.
 */
export async function generateTotpSecret(password: string): Promise<TotpSetupData> {
  return invoke('generate_totp_secret', { password });
}

/**
 * Enable TOTP after successful verification.
 * Returns backup codes that must be shown to user.
 */
export async function enableTotp(code: string, password: string): Promise<BackupCodes> {
  return invoke('enable_totp', { code, password });
}

/**
 * Verify TOTP code during login.
 * The password is required to decrypt the stored secret.
 */
export async function verify2FATotp(code: string, password: string): Promise<boolean> {
  return invoke('verify_2fa_totp', { code, password });
}

/**
 * Returns true if 2FA TOTP is enabled but the secret is stored as legacy plaintext
 * (predates v1.2.0 encryption). User should re-enable TOTP to re-encrypt.
 */
export async function totpNeedsReencryption(): Promise<boolean> {
  return invoke('totp_needs_reencryption');
}

// ============================================================================
// Hardware Key (Native FIDO2)
// ============================================================================

// NOTE: Hardware key registration and verification is now handled by
// native Rust FIDO2/CTAP2 libraries, not browser WebAuthn APIs.
// See src/lib/hardwareKeyService.ts for the new implementation.
//
// The browser WebAuthn APIs do not work in Tauri WebView, so we use
// native USB HID communication with FIDO2 devices instead.

// ============================================================================
// Backup Codes
// ============================================================================

/**
 * Generate new backup codes (replaces existing)
 */
export async function regenerateBackupCodes(): Promise<BackupCodes> {
  return invoke('regenerate_backup_codes');
}

/**
 * Verify a backup code (single-use)
 */
export async function verifyBackupCode(code: string): Promise<boolean> {
  return invoke('verify_backup_code', { code });
}

// ============================================================================
// Management
// ============================================================================

/**
 * Disable 2FA completely
 * Note: Password verification should be done on frontend before calling
 */
export async function disable2FA(): Promise<boolean> {
  return invoke('disable_2fa');
}

/**
 * Download backup codes as a text file
 */
export async function downloadBackupCodes(codes: string[]): Promise<void> {
  const content = [
    'MoodHaven Journal Backup Codes',
    '=====================',
    '',
    'Keep these codes in a safe place.',
    'Each code can only be used once.',
    '',
    ...codes.map((code, i) => `${i + 1}. ${code}`),
    '',
    `Generated: ${new Date().toISOString()}`,
  ].join('\n');

  const filePath = await save({
    defaultPath: 'moodhaven-backup-codes.txt',
    filters: [{ name: 'Text Files', extensions: ['txt'] }],
  });

  if (!filePath) return;

  await invoke('write_text_file', { path: filePath, contents: content });
}

/**
 * Copy backup codes to clipboard
 */
export async function copyBackupCodesToClipboard(codes: string[]): Promise<void> {
  const content = codes.join('\n');
  await navigator.clipboard.writeText(content);
}
