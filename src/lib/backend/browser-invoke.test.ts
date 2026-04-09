/**
 * Tests for the browser-mode invoke shim, focused on the password-management
 * commands that were missing or incorrectly shaped (Sprint 1 / SEC-DEFER-001 fix).
 *
 * Uses fake-indexeddb (auto-imported in src/test/setup.ts) for in-memory IDB.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { invoke } from './browser-invoke';
import { openDB, dbGetSetting, dbSetSetting } from './browser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function clearSettings() {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction('settings', 'readwrite');
    const req = t.objectStore('settings').clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

beforeEach(async () => {
  await clearSettings();
});

// ---------------------------------------------------------------------------
// check_password_exists
// ---------------------------------------------------------------------------

describe('invoke("check_password_exists")', () => {
  it('returns false when no password is stored', async () => {
    expect(await invoke<boolean>('check_password_exists')).toBe(false);
  });

  it('returns true after storing a password hash', async () => {
    await dbSetSetting('password_hash', 'somehash');
    expect(await invoke<boolean>('check_password_exists')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// store_password_hash
// ---------------------------------------------------------------------------

describe('invoke("store_password_hash")', () => {
  it('persists hash and salt to IDB', async () => {
    await invoke('store_password_hash', { hash: 'testhash', salt: 'testsalt' });
    expect(await dbGetSetting('password_hash')).toBe('testhash');
    expect(await dbGetSetting('password_salt')).toBe('testsalt');
  });
});

// ---------------------------------------------------------------------------
// get_password_hash — field names must match Rust struct (password_hash / password_salt)
// ---------------------------------------------------------------------------

describe('invoke("get_password_hash")', () => {
  it('returns null when nothing is stored', async () => {
    expect(await invoke('get_password_hash')).toBeNull();
  });

  it('returns { password_hash, password_salt } — not { hash, salt }', async () => {
    await dbSetSetting('password_hash', 'h');
    await dbSetSetting('password_salt', 's');

    const result = await invoke<{ password_hash: string; password_salt: string }>(
      'get_password_hash',
    );

    expect(result).not.toBeNull();
    expect(result?.password_hash).toBe('h');
    expect(result?.password_salt).toBe('s');
    // Old shape must NOT be present
    expect((result as unknown as Record<string, unknown>)?.hash).toBeUndefined();
    expect((result as unknown as Record<string, unknown>)?.salt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// verify_password (SEC-DEFER-001)
// ---------------------------------------------------------------------------

describe('invoke("verify_password")', () => {
  it('returns false when no password has been set up', async () => {
    expect(await invoke<boolean>('verify_password', { password: 'anything' })).toBe(false);
  });

  it('returns true for the correct password', async () => {
    // Store a real PBKDF2 hash via the setup path
    await invoke('store_password_hash', { hash: 'placeholder', salt: 'placeholder' });

    // Use the actual hashPassword function to create a real hash for 'secret'
    const { hashPassword } = await import('../services/crypto');
    const { hash, salt } = await hashPassword('secret');
    await dbSetSetting('password_hash', hash);
    await dbSetSetting('password_salt', salt);

    expect(await invoke<boolean>('verify_password', { password: 'secret' })).toBe(true);
  });

  it('returns false for an incorrect password', async () => {
    const { hashPassword } = await import('../services/crypto');
    const { hash, salt } = await hashPassword('secret');
    await dbSetSetting('password_hash', hash);
    await dbSetSetting('password_salt', salt);

    expect(await invoke<boolean>('verify_password', { password: 'wrong' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// import_data shim — should not throw in browser mode
// ---------------------------------------------------------------------------

describe('invoke("import_data")', () => {
  it('resolves without throwing', async () => {
    await expect(
      invoke('import_data', { data: '{}', password: '' }),
    ).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Native-only no-ops should not throw
// ---------------------------------------------------------------------------

describe('native-only no-op commands', () => {
  const nativeCommands = [
    'store_session_password',
    'retrieve_session_password',
  ];

  for (const cmd of nativeCommands) {
    it(`"${cmd}" resolves without throwing`, async () => {
      await expect(invoke(cmd)).resolves.not.toThrow();
    });
  }
});
