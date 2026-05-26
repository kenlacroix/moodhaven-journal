/**
 * Browser backend — IndexedDB implementation of all Tauri command equivalents.
 *
 * Storage model:
 *   journal_entries — full entry rows including encrypted_content
 *   settings        — key/value pairs
 *   books           — book rows
 *   webdav_state    — singleton: { filename, etag } for ETag-guarded uploads
 *
 * Tags are denormalized into journal_entries as string[] to avoid cross-store
 * transaction complexity.
 */

const DB_NAME = 'moodhaven';
const DB_VERSION = 2;

// --------------------------------------------------------------------------
// DB open / upgrade
// --------------------------------------------------------------------------

let _db: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('journal_entries')) {
        const store = db.createObjectStore('journal_entries', { keyPath: 'id' });
        store.createIndex('created_at', 'created_at');
        store.createIndex('book_id', 'book_id');
        store.createIndex('mood', 'mood');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('books')) {
        db.createObjectStore('books', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('webdav_state')) {
        db.createObjectStore('webdav_state', { keyPath: 'id' });
      }
      // v2: StillHaven session storage
      if (!db.objectStoreNames.contains('still_sessions')) {
        const ss = db.createObjectStore('still_sessions', { keyPath: 'id' });
        ss.createIndex('started_at', 'started_at');
        ss.createIndex('protocol', 'protocol');
      }
      if (!db.objectStoreNames.contains('still_activation_samples')) {
        const sa = db.createObjectStore('still_activation_samples', {
          keyPath: 'id',
          autoIncrement: true,
        });
        sa.createIndex('session_id', 'session_id');
      }
      // v2: session_id index on journal_entries
      if (db.objectStoreNames.contains('journal_entries')) {
        const t = (e as IDBVersionChangeEvent & { target: IDBOpenDBRequest }).target.transaction!;
        const jeStore = t.objectStore('journal_entries');
        if (!jeStore.indexNames.contains('session_id')) {
          jeStore.createIndex('session_id', 'session_id');
        }
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

// --------------------------------------------------------------------------
// Generic helpers
// --------------------------------------------------------------------------

function tx(
  db: IDBDatabase,
  store: string | string[],
  mode: IDBTransactionMode = 'readonly',
): IDBTransaction {
  return db.transaction(store, mode);
}

function all<T>(store: IDBObjectStore | IDBIndex): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

function get<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function put(store: IDBObjectStore, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function del(store: IDBObjectStore, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface BrowserEntryRow {
  id: string;
  encrypted_content: { iv: string; data: string; salt: string };
  mood: number;
  privacy_mode: number;
  location_weather: string | null;
  book_id: string;
  pinned: number;
  created_at: string;
  updated_at: string;
  tags: string[];
  sealed_until: string | null;
  capsule_type: string | null;
  linked_original_id: string | null;
  unsealed_at: string | null;
  status: string | null;
}

// --------------------------------------------------------------------------
// Journal Entries
// --------------------------------------------------------------------------

export async function dbCreateEntry(entry: BrowserEntryRow): Promise<BrowserEntryRow> {
  const db = await openDB();
  const t = tx(db, 'journal_entries', 'readwrite');
  await put(t.objectStore('journal_entries'), entry);
  return entry;
}

export async function dbGetEntry(id: string): Promise<BrowserEntryRow | null> {
  const db = await openDB();
  const t = tx(db, 'journal_entries');
  const row = await get<BrowserEntryRow>(t.objectStore('journal_entries'), id);
  return row ?? null;
}

export async function dbGetAllEntries(limit?: number): Promise<BrowserEntryRow[]> {
  const db = await openDB();
  const t = tx(db, 'journal_entries');
  const rows = await all<BrowserEntryRow>(t.objectStore('journal_entries'));
  // Sort newest first
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return limit ? rows.slice(0, limit) : rows;
}

export async function dbGetEntriesByDate(
  startDate: string,
  endDate: string,
): Promise<BrowserEntryRow[]> {
  const db = await openDB();
  const t = tx(db, 'journal_entries');
  const rows = await all<BrowserEntryRow>(t.objectStore('journal_entries'));
  return rows
    .filter((r) => r.created_at >= startDate && r.created_at <= endDate + 'T23:59:59.999Z')
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function dbUpdateEntry(
  id: string,
  patch: Partial<BrowserEntryRow>,
): Promise<BrowserEntryRow | null> {
  const db = await openDB();
  const t = tx(db, 'journal_entries', 'readwrite');
  const store = t.objectStore('journal_entries');
  const existing = await get<BrowserEntryRow>(store, id);
  if (!existing) return null;
  const updated = { ...existing, ...patch, updated_at: new Date().toISOString() };
  await put(store, updated);
  return updated;
}

export async function dbDeleteEntry(id: string): Promise<boolean> {
  const db = await openDB();
  const t = tx(db, 'journal_entries', 'readwrite');
  await del(t.objectStore('journal_entries'), id);
  return true;
}

export async function dbSyncEntryTags(id: string, tags: string[]): Promise<void> {
  const db = await openDB();
  const t = tx(db, 'journal_entries', 'readwrite');
  const store = t.objectStore('journal_entries');
  const existing = await get<BrowserEntryRow>(store, id);
  if (existing) {
    await put(store, { ...existing, tags });
  }
}

export async function dbGetBookTags(bookId: string): Promise<string[]> {
  const db = await openDB();
  const t = tx(db, 'journal_entries');
  const rows = await all<BrowserEntryRow>(t.objectStore('journal_entries'));
  const tagSet = new Set<string>();
  rows.filter((r) => r.book_id === bookId).forEach((r) => r.tags.forEach((tag) => tagSet.add(tag)));
  return Array.from(tagSet);
}

// --------------------------------------------------------------------------
// Analytics helpers
// --------------------------------------------------------------------------

export async function dbGetMoodStatistics(
  startDate: string,
  endDate: string,
): Promise<Array<{ date: string; avgMood: number; count: number }>> {
  const entries = await dbGetEntriesByDate(startDate, endDate);
  const byDate = new Map<string, number[]>();
  entries.forEach((e) => {
    const date = e.created_at.slice(0, 10);
    const arr = byDate.get(date) ?? [];
    arr.push(e.mood);
    byDate.set(date, arr);
  });
  return Array.from(byDate.entries()).map(([date, moods]) => ({
    date,
    avgMood: moods.reduce((a, b) => a + b, 0) / moods.length,
    count: moods.length,
  }));
}

export async function dbGetOverallStatistics(): Promise<[number, number]> {
  const entries = await dbGetAllEntries();
  if (entries.length === 0) return [0, 0];
  const avg = entries.reduce((s, e) => s + e.mood, 0) / entries.length;
  return [avg, entries.length];
}

export async function dbGetMoodDistribution(): Promise<Array<{ mood: number; count: number }>> {
  const entries = await dbGetAllEntries();
  const dist = [1, 2, 3, 4, 5].map((mood) => ({
    mood,
    count: entries.filter((e) => e.mood === mood).length,
  }));
  return dist;
}

export async function dbGetStreakStats(): Promise<{
  currentStreak: number;
  longestStreak: number;
  totalDays: number;
}> {
  const entries = await dbGetAllEntries();
  const days = [...new Set(entries.map((e) => e.created_at.slice(0, 10)))].sort();
  if (days.length === 0) return { currentStreak: 0, longestStreak: 0, totalDays: 0 };

  let longest = 1;
  let current = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]);
    const curr = new Date(days[i]);
    const diff = (curr.getTime() - prev.getTime()) / 86400000;
    if (diff === 1) {
      current++;
      if (current > longest) longest = current;
    } else {
      current = 1;
    }
  }

  // Check if streak is active (last day is today or yesterday)
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const lastDay = days[days.length - 1];
  const activeStreak = lastDay === today || lastDay === yesterday ? current : 0;

  return { currentStreak: activeStreak, longestStreak: longest, totalDays: days.length };
}

export async function dbGetDayOfWeekStats(): Promise<
  Array<{ dayOfWeek: number; avgMood: number; count: number }>
> {
  const entries = await dbGetAllEntries();
  const buckets: number[][] = Array.from({ length: 7 }, () => []);
  entries.forEach((e) => {
    const dow = new Date(e.created_at).getDay();
    buckets[dow].push(e.mood);
  });
  return buckets.map((moods, dow) => ({
    dayOfWeek: dow,
    avgMood: moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : 0,
    count: moods.length,
  }));
}

export async function dbGetMonthlyMoodData(
  year: number,
  month: number,
): Promise<Array<{ date: string; avgMood: number; count: number }>> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  // Date(year, month, 0) gives the last day of the target month (month is 1-indexed here)
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return dbGetMoodStatistics(start, end);
}

// --------------------------------------------------------------------------
// Settings
// --------------------------------------------------------------------------

export async function dbGetSetting(key: string): Promise<string | null> {
  const db = await openDB();
  const t = tx(db, 'settings');
  const row = await get<{ key: string; value: string }>(t.objectStore('settings'), key);
  return row?.value ?? null;
}

export async function dbSetSetting(key: string, value: string): Promise<void> {
  const db = await openDB();
  const t = tx(db, 'settings', 'readwrite');
  await put(t.objectStore('settings'), { key, value });
}

export async function dbDeleteSetting(key: string): Promise<void> {
  const db = await openDB();
  const t = tx(db, 'settings', 'readwrite');
  await del(t.objectStore('settings'), key);
}

export async function dbGetAllSettings(): Promise<Array<{ key: string; value: string }>> {
  const db = await openDB();
  const t = tx(db, 'settings');
  return all(t.objectStore('settings'));
}

// --------------------------------------------------------------------------
// Books
// --------------------------------------------------------------------------

export interface BrowserBook {
  id: string;
  name: string;
  emoji: string;
  color: string;
  description: string | null;
  sort_order: number;
  settings: string | null;
  created_at: string;
}

const DEFAULT_BOOK: BrowserBook = {
  id: 'default',
  name: 'Journal',
  emoji: '📔',
  color: '#8b5cf6',
  description: null,
  sort_order: 0,
  settings: null,
  created_at: new Date().toISOString(),
};

async function ensureDefaultBook(db: IDBDatabase): Promise<void> {
  const t = tx(db, 'books', 'readwrite');
  const existing = await get<BrowserBook>(t.objectStore('books'), 'default');
  if (!existing) {
    await put(t.objectStore('books'), DEFAULT_BOOK);
  }
}

export async function dbListBooks(): Promise<BrowserBook[]> {
  const db = await openDB();
  await ensureDefaultBook(db);
  const t = tx(db, 'books');
  const rows = await all<BrowserBook>(t.objectStore('books'));
  return rows.sort((a, b) => a.sort_order - b.sort_order);
}

export async function dbCreateBook(book: BrowserBook): Promise<BrowserBook> {
  const db = await openDB();
  const t = tx(db, 'books', 'readwrite');
  await put(t.objectStore('books'), book);
  return book;
}

export async function dbUpdateBook(book: BrowserBook): Promise<void> {
  const db = await openDB();
  const t = tx(db, 'books', 'readwrite');
  await put(t.objectStore('books'), book);
}

export async function dbDeleteBook(id: string): Promise<void> {
  if (id === 'default') return;
  const db = await openDB();
  // Single multi-store transaction avoids a race between reading entries and deleting the book.
  return new Promise((resolve, reject) => {
    const t = db.transaction(['journal_entries', 'books'], 'readwrite');
    const entriesStore = t.objectStore('journal_entries');
    const booksStore = t.objectStore('books');

    // Cursor-scan entries: reassign any in the deleted book to 'default'
    const cursorReq = entriesStore.openCursor();
    cursorReq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        if ((cursor.value as BrowserEntryRow).book_id === id) {
          cursor.update({ ...cursor.value, book_id: 'default' });
        }
        cursor.continue();
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);

    booksStore.delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// --------------------------------------------------------------------------
// WebDAV ETag state
// --------------------------------------------------------------------------

export interface WebDAVState {
  id: 'singleton';
  filename: string;
  etag: string | null;
}

export async function dbGetWebDAVState(): Promise<WebDAVState | null> {
  const db = await openDB();
  const t = tx(db, 'webdav_state');
  const row = await get<WebDAVState>(t.objectStore('webdav_state'), 'singleton');
  return row ?? null;
}

export async function dbSetWebDAVState(filename: string, etag: string | null): Promise<void> {
  const db = await openDB();
  const t = tx(db, 'webdav_state', 'readwrite');
  await put(t.objectStore('webdav_state'), { id: 'singleton', filename, etag });
}

// --------------------------------------------------------------------------
// Import / Export helpers (used by browser-invoke for export_data / import_data)
// --------------------------------------------------------------------------

export async function dbExportAll(): Promise<BrowserEntryRow[]> {
  return dbGetAllEntries();
}

export async function dbImportEntries(entries: BrowserEntryRow[]): Promise<number> {
  const db = await openDB();
  const t = tx(db, 'journal_entries', 'readwrite');
  const store = t.objectStore('journal_entries');
  for (const entry of entries) {
    const existing = await get<BrowserEntryRow>(store, entry.id);
    if (!existing || entry.updated_at > existing.updated_at) {
      await put(store, entry);
    }
  }
  return entries.length;
}

// --------------------------------------------------------------------------
// StillHaven (somatic sessions)
// --------------------------------------------------------------------------

export interface BrowserStillSession {
  id: string;
  protocol: string;
  environment: string;
  bilateral_mode: string;
  duration_seconds: number;
  started_at: string;
  completed_at: string | null;
  abandoned_at: string | null;
  created_at: string;
}

export interface BrowserStillActivationSample {
  id?: number;
  session_id: string;
  phase: 'pre' | 'post';
  activation: number;
  hrv_manual: number | null;
  hrv_source: string | null;
  note: string | null;
  sampled_at: string;
}

export async function dbStillCreateSession(session: BrowserStillSession): Promise<BrowserStillSession> {
  const db = await openDB();
  const t = tx(db, 'still_sessions', 'readwrite');
  await put(t.objectStore('still_sessions'), session);
  return session;
}

export async function dbStillRecordActivation(
  sample: BrowserStillActivationSample,
): Promise<BrowserStillActivationSample> {
  const db = await openDB();
  const t = tx(db, 'still_activation_samples', 'readwrite');
  const store = t.objectStore('still_activation_samples');
  const id: number = await new Promise((resolve, reject) => {
    const req = store.add(sample);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
  return { ...sample, id };
}

export async function dbStillUpdateSession(
  id: string,
  patch: Partial<BrowserStillSession>,
): Promise<void> {
  const db = await openDB();
  const t = tx(db, 'still_sessions', 'readwrite');
  const store = t.objectStore('still_sessions');
  const existing = await get<BrowserStillSession>(store, id);
  if (!existing) throw new Error(`StillSession not found: ${id}`);
  await put(store, { ...existing, ...patch });
}

export async function dbStillListSessions(limit = 50): Promise<BrowserStillSession[]> {
  const db = await openDB();
  const t = tx(db, 'still_sessions', 'readonly');
  const all_rows = await all<BrowserStillSession>(t.objectStore('still_sessions'));
  return all_rows
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, limit);
}

export async function dbStillGetSessionWithSamples(
  id: string,
): Promise<{ session: BrowserStillSession; samples: BrowserStillActivationSample[] } | null> {
  const db = await openDB();
  const tSess = tx(db, 'still_sessions', 'readonly');
  const session = await get<BrowserStillSession>(tSess.objectStore('still_sessions'), id);
  if (!session) return null;
  const tSamp = tx(db, 'still_activation_samples', 'readonly');
  const allSamples = await all<BrowserStillActivationSample>(
    tSamp.objectStore('still_activation_samples'),
  );
  const samples = allSamples
    .filter((s) => s.session_id === id)
    .sort((a, b) => a.sampled_at.localeCompare(b.sampled_at));
  return { session, samples };
}

// --------------------------------------------------------------------------
// Data stats
// --------------------------------------------------------------------------

export async function dbGetDataStats(): Promise<{
  entryCount: number;
  totalSizeBytes: number;
  lastModified: string | null;
}> {
  const entries = await dbGetAllEntries();
  const totalSizeBytes = entries.reduce((s, e) => s + JSON.stringify(e).length, 0);
  const lastModified =
    entries.length > 0 ? entries[0].updated_at : null;
  return { entryCount: entries.length, totalSizeBytes, lastModified };
}
