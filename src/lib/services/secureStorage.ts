/**
 * Secure Storage
 *
 * Encrypts sensitive values (API keys, PATs, passwords) before writing to SQLite.
 * Uses the existing AES-256-GCM / PBKDF2 crypto stack from crypto.ts.
 *
 * Security model:
 * - Values are encrypted with the user's session password before `set_setting` is called.
 * - Stored blobs are prefixed with `__enc_v1:` so they can be distinguished from plaintext.
 * - Plaintext values (written by earlier versions) are returned as-is on read —
 *   they will be transparently re-encrypted on next write (migration path).
 * - If no password is supplied the raw stored value is returned unchanged.
 */

import { invoke } from '@tauri-apps/api/core';
import { encrypt, decrypt } from './crypto';

const MARKER = '__enc_v1:';

/**
 * Encrypt a value and store it under `key` in the settings table.
 * Requires the session password.
 */
export async function secureSet(
  key: string,
  value: string,
  password: string
): Promise<void> {
  const result = await encrypt(value, password);
  if (!result.success || !result.data) {
    throw new Error('secureSet: encryption failed');
  }
  await invoke('set_setting', {
    key,
    value: MARKER + JSON.stringify(result.data),
  });
}

/**
 * Read an encrypted value from the settings table and decrypt it.
 *
 * - If the stored value is an encrypted blob (starts with MARKER), decrypt and return.
 * - If the stored value is plaintext (migration), return it as-is.
 * - If no value is stored, return null.
 * - If decryption fails (wrong password), return null.
 */
export async function secureGet(
  key: string,
  password: string
): Promise<string | null> {
  const stored = await invoke<string | null>('get_setting', { key });
  if (!stored) return null;

  if (stored.startsWith(MARKER)) {
    try {
      const encData = JSON.parse(stored.slice(MARKER.length));
      const result = await decrypt(encData, password);
      return result.success ? (result.data ?? null) : null;
    } catch {
      return null;
    }
  }

  // Plaintext fallback — will be re-encrypted on next secureSet call
  return stored;
}

/**
 * Returns true if the stored value is an encrypted blob.
 * Useful for detecting whether migration has occurred.
 */
export async function isEncrypted(key: string): Promise<boolean> {
  const stored = await invoke<string | null>('get_setting', { key });
  return stored?.startsWith(MARKER) ?? false;
}
