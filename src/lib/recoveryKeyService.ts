/**
 * Recovery Key Service
 *
 * Handles generation, storage, and verification of optional recovery keys.
 * Recovery keys provide an alternative way to access data if the password is forgotten.
 *
 * Security Model:
 * - Recovery key is a 24-character random string (displayed as 6 groups of 4)
 * - The key is shown only once during setup and must be written down
 * - A salted hash of the recovery key is stored in settings
 * - The password is encrypted with the recovery key and stored for recovery
 * - Recovery key can be used to unlock the app by decrypting the stored password
 *
 * This is a form of key escrow - the user controls the recovery key
 */

import { invoke } from '@tauri-apps/api/core';
import { encrypt, decrypt, EncryptedData } from './crypto';

const RECOVERY_KEY_ENABLED_SETTING = 'recovery_key_enabled';
const RECOVERY_KEY_ENCRYPTED_PASSWORD_SETTING = 'recovery_key_encrypted_password';

/**
 * Generate a random recovery key
 * Format: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (24 characters, uppercase alphanumeric)
 */
export function generateRecoveryKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous: 0,O,1,I
  // chars.length === 32, which is a power of 2, so modulo bias is zero.
  const groups: string[] = [];

  for (let g = 0; g < 6; g++) {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    let group = '';
    for (let i = 0; i < 4; i++) {
      group += chars[bytes[i] % chars.length];
    }
    groups.push(group);
  }

  return groups.join('-');
}

/**
 * Normalize recovery key for use as encryption password (remove dashes, uppercase)
 */
function normalizeKey(key: string): string {
  return key.replace(/-/g, '').toUpperCase();
}

/**
 * Store recovery key by encrypting the user's password with it
 * @param recoveryKey - The plaintext recovery key
 * @param password - The user's password to encrypt for recovery
 */
export async function storeRecoveryKey(recoveryKey: string, password: string): Promise<void> {
  const normalizedKey = normalizeKey(recoveryKey);

  // Encrypt the password with the recovery key
  const result = await encrypt(password, normalizedKey);
  if (!result.success || !result.data) {
    throw new Error('Failed to encrypt password for recovery');
  }

  // Store the encrypted password
  await invoke('set_setting', {
    key: RECOVERY_KEY_ENCRYPTED_PASSWORD_SETTING,
    value: JSON.stringify(result.data),
  });
  await invoke('set_setting', { key: RECOVERY_KEY_ENABLED_SETTING, value: 'true' });
}

/**
 * Recover the password using the recovery key
 * @param recoveryKey - The recovery key
 * @returns The decrypted password, or null if invalid
 */
export async function recoverPassword(recoveryKey: string): Promise<string | null> {
  try {
    const encryptedPasswordJson = await invoke<string | null>('get_setting', {
      key: RECOVERY_KEY_ENCRYPTED_PASSWORD_SETTING,
    });

    if (!encryptedPasswordJson) {
      return null;
    }

    const encryptedData: EncryptedData = JSON.parse(encryptedPasswordJson);
    const normalizedKey = normalizeKey(recoveryKey);

    const result = await decrypt(encryptedData, normalizedKey);
    if (!result.success || !result.data) {
      return null;
    }

    return result.data;
  } catch {
    return null;
  }
}

/**
 * Verify a recovery key by attempting to decrypt the stored password
 * @param recoveryKey - The recovery key to verify
 * @returns True if the key is valid
 */
export async function verifyRecoveryKey(recoveryKey: string): Promise<boolean> {
  const password = await recoverPassword(recoveryKey);
  return password !== null;
}

/**
 * Check if recovery key is enabled
 */
export async function isRecoveryKeyEnabled(): Promise<boolean> {
  try {
    const enabled = await invoke<string | null>('get_setting', {
      key: RECOVERY_KEY_ENABLED_SETTING,
    });
    return enabled === 'true';
  } catch {
    return false;
  }
}

/**
 * Remove recovery key (used when resetting the app)
 */
export async function removeRecoveryKey(): Promise<void> {
  await invoke('delete_setting', { key: RECOVERY_KEY_ENCRYPTED_PASSWORD_SETTING });
  await invoke('delete_setting', { key: RECOVERY_KEY_ENABLED_SETTING });
}
