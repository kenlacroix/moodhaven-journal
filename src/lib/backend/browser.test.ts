/**
 * Tests for the IndexedDB browser backend.
 * Uses fake-indexeddb (auto-imported in src/test/setup.ts) for in-memory IDB.
 */

import {
  openDB,
  dbCreateEntry,
  dbGetEntry,
  dbGetAllEntries,
  dbGetEntriesByDate,
  dbUpdateEntry,
  dbDeleteEntry,
  dbSyncEntryTags,
  dbGetBookTags,
  dbGetMoodStatistics,
  dbGetMonthlyMoodData,
  dbGetOverallStatistics,
  dbGetMoodDistribution,
  dbGetStreakStats,
  dbGetDayOfWeekStats,
  dbGetSetting,
  dbSetSetting,
  dbDeleteSetting,
  dbGetAllSettings,
  dbListBooks,
  dbCreateBook,
  dbUpdateBook,
  dbDeleteBook,
  dbGetWebDAVState,
  dbSetWebDAVState,
  dbImportEntries,
  type BrowserEntryRow,
  type BrowserBook,
} from './browser';

// Reset the module-level _db singleton between tests so each test gets a fresh DB.
// fake-indexeddb resets when the module is re-imported; we clear all stores instead.
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

function makeEntry(overrides: Partial<BrowserEntryRow> = {}): BrowserEntryRow {
  return {
    id: crypto.randomUUID(),
    encrypted_content: { iv: 'iv', data: 'data', salt: 'salt' },
    mood: 3,
    privacy_mode: 0,
    location_weather: null,
    book_id: 'default',
    pinned: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    tags: [],
    sealed_until: null,
    capsule_type: null,
    linked_original_id: null,
    unsealed_at: null,
    status: null,
    ...overrides,
  };
}

beforeEach(async () => {
  await clearAllStores();
});

// --------------------------------------------------------------------------
// Journal entries
// --------------------------------------------------------------------------

describe('journal entries', () => {
  it('creates and retrieves an entry', async () => {
    const entry = makeEntry({ mood: 4 });
    await dbCreateEntry(entry);
    const retrieved = await dbGetEntry(entry.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.mood).toBe(4);
    expect(retrieved!.id).toBe(entry.id);
  });

  it('returns null for missing entry', async () => {
    const result = await dbGetEntry('nonexistent-id');
    expect(result).toBeNull();
  });

  it('gets all entries sorted newest first', async () => {
    const old = makeEntry({ created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' });
    const newEntry = makeEntry({ created_at: '2026-03-01T00:00:00.000Z', updated_at: '2026-03-01T00:00:00.000Z' });
    await dbCreateEntry(old);
    await dbCreateEntry(newEntry);
    const all = await dbGetAllEntries();
    expect(all[0].id).toBe(newEntry.id);
    expect(all[1].id).toBe(old.id);
  });

  it('respects limit in getAllEntries', async () => {
    await dbCreateEntry(makeEntry());
    await dbCreateEntry(makeEntry());
    await dbCreateEntry(makeEntry());
    const limited = await dbGetAllEntries(2);
    expect(limited).toHaveLength(2);
  });

  it('filters entries by date range', async () => {
    await dbCreateEntry(makeEntry({ id: 'jan', created_at: '2026-01-15T00:00:00.000Z', updated_at: '2026-01-15T00:00:00.000Z' }));
    await dbCreateEntry(makeEntry({ id: 'mar', created_at: '2026-03-15T00:00:00.000Z', updated_at: '2026-03-15T00:00:00.000Z' }));
    const results = await dbGetEntriesByDate('2026-01-01', '2026-02-28');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('jan');
  });

  it('updates an entry', async () => {
    const entry = makeEntry({ mood: 2 });
    await dbCreateEntry(entry);
    const updated = await dbUpdateEntry(entry.id, { mood: 5 });
    expect(updated!.mood).toBe(5);
    const retrieved = await dbGetEntry(entry.id);
    expect(retrieved!.mood).toBe(5);
  });

  it('returns null when updating nonexistent entry', async () => {
    const result = await dbUpdateEntry('does-not-exist', { mood: 3 });
    expect(result).toBeNull();
  });

  it('deletes an entry', async () => {
    const entry = makeEntry();
    await dbCreateEntry(entry);
    await dbDeleteEntry(entry.id);
    expect(await dbGetEntry(entry.id)).toBeNull();
  });

  it('syncs entry tags', async () => {
    const entry = makeEntry({ tags: [] });
    await dbCreateEntry(entry);
    await dbSyncEntryTags(entry.id, ['happy', 'work']);
    const retrieved = await dbGetEntry(entry.id);
    expect(retrieved!.tags).toEqual(['happy', 'work']);
  });

  it('getBookTags returns unique tags for a book', async () => {
    await dbCreateEntry(makeEntry({ book_id: 'b1', tags: ['a', 'b'] }));
    await dbCreateEntry(makeEntry({ book_id: 'b1', tags: ['b', 'c'] }));
    await dbCreateEntry(makeEntry({ book_id: 'b2', tags: ['x'] }));
    const tags = await dbGetBookTags('b1');
    expect(tags.sort()).toEqual(['a', 'b', 'c']);
  });
});

// --------------------------------------------------------------------------
// Analytics
// --------------------------------------------------------------------------

describe('analytics', () => {
  beforeEach(async () => {
    await dbCreateEntry(makeEntry({ mood: 5, created_at: '2026-03-01T10:00:00.000Z', updated_at: '2026-03-01T10:00:00.000Z' }));
    await dbCreateEntry(makeEntry({ mood: 3, created_at: '2026-03-01T15:00:00.000Z', updated_at: '2026-03-01T15:00:00.000Z' }));
    await dbCreateEntry(makeEntry({ mood: 2, created_at: '2026-03-03T10:00:00.000Z', updated_at: '2026-03-03T10:00:00.000Z' }));
  });

  it('getMonthlyMoodData uses correct last day for short months', async () => {
    // Feb 2026 has 28 days — must not include March 1-3 entries
    await dbCreateEntry(makeEntry({ mood: 1, created_at: '2026-02-28T10:00:00.000Z', updated_at: '2026-02-28T10:00:00.000Z' }));
    await dbCreateEntry(makeEntry({ mood: 5, created_at: '2026-03-01T10:00:00.000Z', updated_at: '2026-03-01T10:00:00.000Z' }));
    const stats = await dbGetMonthlyMoodData(2026, 2);
    expect(stats.some((s) => s.date === '2026-02-28')).toBe(true);
    expect(stats.some((s) => s.date === '2026-03-01')).toBe(false);
  });

  it('getMoodStatistics returns per-day averages', async () => {
    const stats = await dbGetMoodStatistics('2026-03-01', '2026-03-03');
    const march1 = stats.find((s) => s.date === '2026-03-01');
    expect(march1).toBeDefined();
    expect(march1!.avgMood).toBe(4);
    expect(march1!.count).toBe(2);
  });

  it('getOverallStatistics returns [avgMood, totalEntries]', async () => {
    const [avg, total] = await dbGetOverallStatistics();
    expect(total).toBe(3);
    expect(avg).toBeCloseTo((5 + 3 + 2) / 3, 5);
  });

  it('getOverallStatistics returns [0, 0] when empty', async () => {
    await clearAllStores();
    const [avg, total] = await dbGetOverallStatistics();
    expect(avg).toBe(0);
    expect(total).toBe(0);
  });

  it('getMoodDistribution counts all mood levels', async () => {
    const dist = await dbGetMoodDistribution();
    expect(dist).toHaveLength(5);
    const mood5 = dist.find((d) => d.mood === 5);
    expect(mood5!.count).toBe(1);
    const mood3 = dist.find((d) => d.mood === 3);
    expect(mood3!.count).toBe(1);
  });

  it('getDayOfWeekStats groups moods by day of week', async () => {
    const stats = await dbGetDayOfWeekStats();
    expect(stats).toHaveLength(7);
    const total = stats.reduce((s, d) => s + d.count, 0);
    expect(total).toBe(3);
  });
});

describe('streak stats', () => {
  it('returns zeros when no entries', async () => {
    const stats = await dbGetStreakStats();
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(0);
    expect(stats.totalDays).toBe(0);
  });

  it('counts consecutive days', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    await dbCreateEntry(makeEntry({ created_at: `${twoDaysAgo}T10:00:00.000Z`, updated_at: `${twoDaysAgo}T10:00:00.000Z` }));
    await dbCreateEntry(makeEntry({ created_at: `${yesterday}T10:00:00.000Z`, updated_at: `${yesterday}T10:00:00.000Z` }));
    await dbCreateEntry(makeEntry({ created_at: `${today}T10:00:00.000Z`, updated_at: `${today}T10:00:00.000Z` }));
    const stats = await dbGetStreakStats();
    expect(stats.currentStreak).toBe(3);
    expect(stats.longestStreak).toBe(3);
    expect(stats.totalDays).toBe(3);
  });
});

// --------------------------------------------------------------------------
// Settings
// --------------------------------------------------------------------------

describe('settings', () => {
  it('sets and gets a setting', async () => {
    await dbSetSetting('foo', 'bar');
    expect(await dbGetSetting('foo')).toBe('bar');
  });

  it('returns null for missing key', async () => {
    expect(await dbGetSetting('nonexistent')).toBeNull();
  });

  it('overwrites existing setting', async () => {
    await dbSetSetting('key', 'v1');
    await dbSetSetting('key', 'v2');
    expect(await dbGetSetting('key')).toBe('v2');
  });

  it('deletes a setting', async () => {
    await dbSetSetting('del_key', 'val');
    await dbDeleteSetting('del_key');
    expect(await dbGetSetting('del_key')).toBeNull();
  });

  it('getAllSettings returns all pairs', async () => {
    await dbSetSetting('a', '1');
    await dbSetSetting('b', '2');
    const all = await dbGetAllSettings();
    const keys = all.map((s) => s.key).sort();
    expect(keys).toContain('a');
    expect(keys).toContain('b');
  });
});

// --------------------------------------------------------------------------
// Books
// --------------------------------------------------------------------------

describe('books', () => {
  it('creates default book on first list', async () => {
    const books = await dbListBooks();
    expect(books.some((b) => b.id === 'default')).toBe(true);
  });

  it('creates and retrieves a book', async () => {
    const book: BrowserBook = {
      id: 'b-test',
      name: 'My Book',
      emoji: '📓',
      color: '#ff0000',
      description: null,
      sort_order: 1,
      settings: null,
      created_at: new Date().toISOString(),
    };
    await dbCreateBook(book);
    const books = await dbListBooks();
    expect(books.some((b) => b.id === 'b-test')).toBe(true);
  });

  it('sorts books by sort_order', async () => {
    await dbCreateBook({ id: 'z', name: 'Z', emoji: '📒', color: '#000', description: null, sort_order: 10, settings: null, created_at: new Date().toISOString() });
    await dbCreateBook({ id: 'a', name: 'A', emoji: '📒', color: '#000', description: null, sort_order: 2, settings: null, created_at: new Date().toISOString() });
    const books = await dbListBooks();
    const ids = books.map((b) => b.id);
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('z'));
  });

  it('updates a book', async () => {
    const book: BrowserBook = { id: 'upd', name: 'Old', emoji: '📔', color: '#000', description: null, sort_order: 0, settings: null, created_at: new Date().toISOString() };
    await dbCreateBook(book);
    await dbUpdateBook({ ...book, name: 'New' });
    const books = await dbListBooks();
    expect(books.find((b) => b.id === 'upd')!.name).toBe('New');
  });

  it('deletes a book and reassigns its entries to default', async () => {
    const book: BrowserBook = { id: 'del-book', name: 'Del', emoji: '📔', color: '#000', description: null, sort_order: 0, settings: null, created_at: new Date().toISOString() };
    await dbCreateBook(book);
    await dbCreateEntry(makeEntry({ book_id: 'del-book' }));
    await dbDeleteBook('del-book');
    const books = await dbListBooks();
    expect(books.some((b) => b.id === 'del-book')).toBe(false);
    const entries = await dbGetAllEntries();
    expect(entries.every((e) => e.book_id !== 'del-book')).toBe(true);
  });

  it('cannot delete the default book', async () => {
    await dbDeleteBook('default');
    const books = await dbListBooks();
    expect(books.some((b) => b.id === 'default')).toBe(true);
  });
});

// --------------------------------------------------------------------------
// WebDAV ETag state
// --------------------------------------------------------------------------

describe('webdav state', () => {
  it('returns null when no state stored', async () => {
    expect(await dbGetWebDAVState()).toBeNull();
  });

  it('stores and retrieves ETag state', async () => {
    await dbSetWebDAVState('moodhaven-sync.moodhaven', '"abc123"');
    const state = await dbGetWebDAVState();
    expect(state).not.toBeNull();
    expect(state!.filename).toBe('moodhaven-sync.moodhaven');
    expect(state!.etag).toBe('"abc123"');
  });

  it('overwrites existing state', async () => {
    await dbSetWebDAVState('file.moodhaven', '"v1"');
    await dbSetWebDAVState('file.moodhaven', '"v2"');
    const state = await dbGetWebDAVState();
    expect(state!.etag).toBe('"v2"');
  });

  it('stores null etag', async () => {
    await dbSetWebDAVState('file.moodhaven', null);
    const state = await dbGetWebDAVState();
    expect(state!.etag).toBeNull();
  });
});

// --------------------------------------------------------------------------
// Import (LWW merge)
// --------------------------------------------------------------------------

describe('dbImportEntries', () => {
  it('inserts new entries', async () => {
    const entry = makeEntry({ id: 'import-1' });
    const count = await dbImportEntries([entry]);
    expect(count).toBe(1);
    expect(await dbGetEntry('import-1')).not.toBeNull();
  });

  it('overwrites older entries (LWW)', async () => {
    const old = makeEntry({ id: 'lww', mood: 1, updated_at: '2026-01-01T00:00:00.000Z' });
    const newer = makeEntry({ id: 'lww', mood: 5, updated_at: '2026-06-01T00:00:00.000Z' });
    await dbCreateEntry(old);
    await dbImportEntries([newer]);
    expect((await dbGetEntry('lww'))!.mood).toBe(5);
  });

  it('does not overwrite newer local entries', async () => {
    const local = makeEntry({ id: 'lww2', mood: 5, updated_at: '2026-06-01T00:00:00.000Z' });
    const stale = makeEntry({ id: 'lww2', mood: 1, updated_at: '2026-01-01T00:00:00.000Z' });
    await dbCreateEntry(local);
    await dbImportEntries([stale]);
    expect((await dbGetEntry('lww2'))!.mood).toBe(5);
  });
});
