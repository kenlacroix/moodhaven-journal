// @vitest-environment node
/**
 * Tests for the browser-invoke shim.
 * Covers new/fixed cases: verify_password and get_data_stats.
 * Uses fake-indexeddb (auto-imported via src/test/setup.ts) for in-memory IDB.
 */

import { invoke } from './browser-invoke';
import { openDB, dbSetSetting, dbCreateEntry } from './browser';
import { hashPassword } from '../services/crypto';

async function clearAllStores() {
  const db = await openDB();
  for (const storeName of ['journal_entries', 'settings', 'books', 'webdav_state']) {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(storeName, 'readwrite');
      const req = t.objectStore(storeName).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

beforeEach(async () => {
  await clearAllStores();
});

describe('verify_password', () => {
  it('returns false when no password hash is stored', async () => {
    const result = await invoke<boolean>('verify_password', { password: 'any' });
    expect(result).toBe(false);
  });

  it('returns true for a correct password', async () => {
    const password = 'correct-horse-battery-staple';
    const { hash, salt } = await hashPassword(password);
    await dbSetSetting('password_hash', hash);
    await dbSetSetting('password_salt', salt);

    const result = await invoke<boolean>('verify_password', { password });
    expect(result).toBe(true);
  });

  it('returns false for a wrong password', async () => {
    const { hash, salt } = await hashPassword('correct');
    await dbSetSetting('password_hash', hash);
    await dbSetSetting('password_salt', salt);

    const result = await invoke<boolean>('verify_password', { password: 'wrong' });
    expect(result).toBe(false);
  });
});

describe('get_data_stats', () => {
  it('returns {totalEntries:0, averageMood:0} for an empty DB', async () => {
    const result = await invoke<{ totalEntries: number; averageMood: number }>('get_data_stats');
    expect(result).toEqual({ totalEntries: 0, averageMood: 0 });
  });

  it('returns correct totalEntries and averageMood with entries', async () => {
    const now = new Date().toISOString();
    await dbCreateEntry({
      id: 'a',
      encrypted_content: { iv: '', data: '', salt: '' },
      mood: 4,
      privacy_mode: 0,
      book_id: 'default',
      pinned: false,
      created_at: now,
      updated_at: now,
      tags: [],
    });
    await dbCreateEntry({
      id: 'b',
      encrypted_content: { iv: '', data: '', salt: '' },
      mood: 2,
      privacy_mode: 0,
      book_id: 'default',
      pinned: false,
      created_at: now,
      updated_at: now,
      tags: [],
    });

    const result = await invoke<{ totalEntries: number; averageMood: number }>('get_data_stats');
    expect(result.totalEntries).toBe(2);
    expect(result.averageMood).toBe(3); // (4+2)/2
  });
});
