// @vitest-environment node
/**
 * Tests for the browser-mode invoke shim, focused on the password-management
 * commands that were missing or incorrectly shaped (Sprint 1 / SEC-DEFER-001 fix),
 * and get_data_stats shape fix.
 *
 * Uses fake-indexeddb (auto-imported in src/test/setup.ts) for in-memory IDB.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { invoke } from './browser-invoke';
import { openDB, dbGetSetting, dbSetSetting, dbCreateEntry } from './browser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  // Default to an unlocked session so data-command tests run normally. The
  // dedicated lock-gate describe block manages its own lock state explicitly.
  await invoke('unlock_app');
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
// get_data_stats — shape fix: must return {totalEntries, averageMood}
// ---------------------------------------------------------------------------

describe('invoke("get_data_stats")', () => {
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
      location_weather: null,
      book_id: 'default',
      pinned: 0,
      created_at: now,
      updated_at: now,
      tags: [],
      sealed_until: null,
      capsule_type: null,
      linked_original_id: null,
      unsealed_at: null,
      status: null,
    });
    await dbCreateEntry({
      id: 'b',
      encrypted_content: { iv: '', data: '', salt: '' },
      mood: 2,
      privacy_mode: 0,
      location_weather: null,
      book_id: 'default',
      pinned: 0,
      created_at: now,
      updated_at: now,
      tags: [],
      sealed_until: null,
      capsule_type: null,
      linked_original_id: null,
      unsealed_at: null,
      status: null,
    });

    const result = await invoke<{ totalEntries: number; averageMood: number }>('get_data_stats');
    expect(result.totalEntries).toBe(2);
    expect(result.averageMood).toBe(3); // (4+2)/2
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

// ---------------------------------------------------------------------------
// Voice memo stubs — desktop/Wear OS only; must return safe defaults in browser
// ---------------------------------------------------------------------------

describe('voice memo browser stubs', () => {
  it('list_voice_memos returns empty array', async () => {
    expect(await invoke('list_voice_memos')).toEqual([]);
  });

  const nullStubs = [
    'get_voice_memo',
    'delete_voice_memo',
    'patch_voice_memo_transcription',
    'link_voice_memo_to_entry',
    'transcribe_voice_memo',
    'store_voice_memo',
  ];

  for (const cmd of nullStubs) {
    it(`"${cmd}" resolves to null`, async () => {
      expect(await invoke(cmd)).toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// get_entries_on_this_day — SQL filtered on desktop; returns [] in browser
// ---------------------------------------------------------------------------

describe('invoke("get_entries_on_this_day")', () => {
  it('returns an empty array in browser mode', async () => {
    expect(await invoke('get_entries_on_this_day')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Session lock gate — PT6 parity with Rust require_unlocked guards
// ---------------------------------------------------------------------------

describe('session lock gate (activity commands)', () => {
  it('rejects list_activities while locked', async () => {
    await invoke('lock_app');
    await expect(invoke('list_activities')).rejects.toThrow('Session is locked');
  });

  it('rejects create_activity while locked', async () => {
    await invoke('lock_app');
    await expect(
      invoke('create_activity', { name: 'hiking', emoji: '🥾' })
    ).rejects.toThrow('Session is locked');
  });

  it('allows list_activities after unlock_app', async () => {
    await invoke('unlock_app');
    await expect(invoke('list_activities')).resolves.toBeDefined();
    await invoke('lock_app');
  });
});

describe('session lock gate (data commands — PT7 default-deny parity)', () => {
  // Representative sensitive commands across each gated category. While locked,
  // browser mode must reject them identically to the Rust require_unlocked guards.
  const gatedWhileLocked: Array<[string, Record<string, unknown>?]> = [
    ['get_all_journal_entries'],
    ['get_setting', { key: 'app_settings' }],
    ['set_setting', { key: 'x', value: 'y' }],
    ['get_all_settings'],
    ['list_books'],
    ['get_data_stats'],
    ['get_full_analytics_bundle', { trendDays: 30 }],
    ['get_entry_timestamps'],
    ['upsert_entry_from_sync', { entryJson: '{}' }],
    ['get_due_capsules', { includeAnniversary: false }],
    ['still_list_sessions'],
  ];

  for (const [cmd, args] of gatedWhileLocked) {
    it(`rejects ${cmd} while locked`, async () => {
      await invoke('lock_app');
      await expect(invoke(cmd, args)).rejects.toThrow('Session is locked');
    });
  }

  it('allows a gated data command after unlock_app', async () => {
    await invoke('unlock_app');
    await expect(invoke('get_all_journal_entries')).resolves.toBeDefined();
    await invoke('lock_app');
  });
});

// ---------------------------------------------------------------------------
// pin_* — desktop-only stubs (no "unhandled command" warning in browser)
// ---------------------------------------------------------------------------

describe('PIN unlock browser stubs', () => {
  it('pin_is_enabled returns false', async () => {
    expect(await invoke<boolean>('pin_is_enabled')).toBe(false);
  });

  it('pin_unlock throws a desktop-only error', async () => {
    await expect(invoke('pin_unlock', { pin: '1234' })).rejects.toThrow(/desktop app/);
  });
});

// ---------------------------------------------------------------------------
// factory_reset — forgot-password escape hatch (must work while locked)
// ---------------------------------------------------------------------------

describe('invoke("factory_reset")', () => {
  it('clears all stores even while locked', async () => {
    await dbSetSetting('password_hash', 'somehash');
    await dbCreateEntry({
      id: 'e1',
      encrypted_content: { iv: 'i', data: 'd', salt: 's' },
      mood: 3,
      privacy_mode: 0,
      location_weather: null,
      book_id: 'default',
      pinned: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      tags: [],
      sealed_until: null,
      capsule_type: null,
      linked_original_id: null,
      unsealed_at: null,
      status: null,
    });
    await invoke('lock_app');
    await expect(invoke<boolean>('factory_reset')).resolves.toBe(true);
    expect(await dbGetSetting('password_hash')).toBeNull();
    expect(await invoke('get_all_journal_entries').catch(() => 'locked')).toBe('locked');
  });
});
