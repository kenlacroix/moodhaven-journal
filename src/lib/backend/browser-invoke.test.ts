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
// Activity commands — browser IDB backend
// ---------------------------------------------------------------------------

describe('invoke("list_activities")', () => {
  it('returns 15 predefined activities when no custom ones exist', async () => {
    const acts = await invoke<{ id: string; name: string; isCustom: boolean }[]>('list_activities');
    expect(acts.length).toBe(15);
    expect(acts.every((a) => !a.isCustom)).toBe(true);
  });

  it('returns predefined + custom activities after creation', async () => {
    await invoke('create_activity', { name: 'Yoga', emoji: '🧘' });
    const acts = await invoke<{ id: string; isCustom: boolean }[]>('list_activities');
    expect(acts.length).toBe(16);
    expect(acts.filter((a) => a.isCustom).length).toBe(1);
  });
});

describe('invoke("create_activity")', () => {
  it('creates a custom activity and returns it', async () => {
    const act = await invoke<{ id: string; name: string; emoji: string; isCustom: boolean }>(
      'create_activity',
      { name: 'Hiking', emoji: '🥾' },
    );
    expect(act.name).toBe('Hiking');
    expect(act.emoji).toBe('🥾');
    expect(act.isCustom).toBe(true);
    expect(act.id).toMatch(/^act_custom_/);
  });
});

describe('invoke("delete_activity")', () => {
  it('removes a custom activity', async () => {
    const created = await invoke<{ id: string }>('create_activity', { name: 'Temp', emoji: '🔥' });
    await invoke('delete_activity', { id: created.id });
    const acts = await invoke<{ id: string; isCustom: boolean }[]>('list_activities');
    expect(acts.find((a) => a.id === created.id)).toBeUndefined();
  });
});

describe('invoke("sync_entry_activities") + invoke("get_entry_activities")', () => {
  it('links activities to an entry and retrieves them', async () => {
    const now = new Date().toISOString();
    await dbCreateEntry({
      id: 'entry-act-1',
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

    await invoke('sync_entry_activities', {
      entryId: 'entry-act-1',
      activityIds: ['act_exercise', 'act_reading'],
    });

    const linked = await invoke<{ id: string }[]>('get_entry_activities', { entryId: 'entry-act-1' });
    expect(linked.map((a) => a.id).sort()).toEqual(['act_exercise', 'act_reading'].sort());
  });

  it('returns empty array for an entry with no activities', async () => {
    const now = new Date().toISOString();
    await dbCreateEntry({
      id: 'entry-act-2',
      encrypted_content: { iv: '', data: '', salt: '' },
      mood: 3,
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

    const linked = await invoke<unknown[]>('get_entry_activities', { entryId: 'entry-act-2' });
    expect(linked).toEqual([]);
  });
});

describe('invoke("get_activity_stats")', () => {
  it('returns stats for all activities with zero counts when no entries', async () => {
    const stats = await invoke<{ activityId: string; entryCount: number; avgMood: number }[]>(
      'get_activity_stats',
    );
    expect(stats.length).toBe(15);
    expect(stats.every((s) => s.entryCount === 0 && s.avgMood === 0)).toBe(true);
  });

  it('counts entries and computes avgMood for linked activities', async () => {
    const now = new Date().toISOString();
    await dbCreateEntry({
      id: 'entry-stats-1',
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
    await invoke('sync_entry_activities', {
      entryId: 'entry-stats-1',
      activityIds: ['act_exercise'],
    });

    const stats = await invoke<{ activityId: string; entryCount: number; avgMood: number }[]>(
      'get_activity_stats',
    );
    const exerciseStat = stats.find((s) => s.activityId === 'act_exercise');
    expect(exerciseStat?.entryCount).toBe(1);
    expect(exerciseStat?.avgMood).toBe(4);
  });
});
