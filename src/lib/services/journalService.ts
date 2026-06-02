/**
 * Journal Service
 *
 * Handles journal CRUD operations with automatic encryption/decryption.
 * All sensitive data is encrypted before storage and decrypted after retrieval.
 */

import { invoke } from '@tauri-apps/api/core';
import {
  encrypt,
  decrypt,
  clearKeyCache,
  hashPassword,
  type EncryptedData,
} from './crypto';
import { extractHashtags } from '../utils/markdownUtils';
import type {
  JournalEntry,
  JournalEntryFormData,
  LocationWeather,
  MoodLevel,
  MoodStatistics,
  PrivacyMode,
} from '../../types/journal';

// ============================================================================
// Types matching Rust backend
// ============================================================================

interface EncryptedJournalEntryRow {
  id: string;
  encrypted_content: EncryptedData | null; // null for sealed entries not yet due
  mood: number;
  privacy_mode: number;
  location_weather?: string; // JSON-encoded LocationWeather, not encrypted
  book_id: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  tags: string[]; // Populated by GROUP_CONCAT join in Rust
  sealed_until?: string | null;
  capsule_type?: string | null;
  linked_original_id?: string | null;
  unsealed_at?: string | null;
  session_id?: string | null;
  word_count?: number | null;
}


interface DailyStats {
  date: string;
  average_mood: number;
  entry_count: number;
}

// ============================================================================
// Password Management
// ============================================================================

/**
 * Check if user has set up their password
 */
export async function hasPassword(): Promise<boolean> {
  return invoke<boolean>('check_password_exists');
}

/**
 * Set up initial password
 */
export async function setupPassword(password: string): Promise<void> {
  const { hash, salt } = await hashPassword(password);
  await invoke('store_password_hash', { hash, salt });
}

/**
 * Verify user's password against stored hash.
 * Delegates to the Rust verify_password command (PBKDF2-HMAC-SHA-256, 600k iterations).
 */
export async function verifyUserPassword(password: string): Promise<boolean> {
  return invoke<boolean>('verify_password', { password });
}

// ============================================================================
// Session Management
// ============================================================================

// In-memory password for the session (cleared on app close)
let sessionPassword: string | null = null;

/**
 * Unlock the journal with password
 */
export async function unlockJournal(password: string): Promise<boolean> {
  const isValid = await verifyUserPassword(password);

  if (isValid) {
    sessionPassword = password;
    // Notify Rust backend so sensitive commands become callable.
    await (invoke('unlock_app') as Promise<void> | undefined)?.catch(() => {
      // Non-fatal: desktop-only command, not available in browser mode.
    });
    return true;
  }

  return false;
}

/**
 * Finalize an already-authenticated session by calling unlock_app directly,
 * without re-running verify_password. Use this after 2FA completion or when
 * the session bridge provides a password already verified by the main window.
 * Calling verify_password a second time resets TwoFactorPendingState and
 * causes unlock_app to reject — this path avoids that.
 */
export async function finalizeUnlock(password: string): Promise<boolean> {
  try {
    await invoke('unlock_app');
  } catch (e) {
    // "Authentication incomplete" is a real auth failure; re-throw it as false.
    // Any other error is the browser mode where unlock_app is unavailable.
    if (String(e).includes('Authentication incomplete')) {
      return false;
    }
  }
  sessionPassword = password;
  return true;
}

/**
 * Lock the journal (clear session password and derived key cache)
 */
export function lockJournal(): void {
  sessionPassword = null;
  clearKeyCache();
  // Notify Rust backend — sensitive commands will reject until next unlock.
  (invoke('lock_app') as Promise<void> | undefined)?.catch(() => {
    // Non-fatal: browser mode / test environment.
  });
}

/** Dev-only: set session password without DB verification. Never call in production. */
export function devBypassUnlock(password: string): void {
  sessionPassword = password;
}

/**
 * Check if journal is unlocked
 */
export function isUnlocked(): boolean {
  return sessionPassword !== null;
}

/**
 * Get session password (throws if locked)
 */
function getPassword(): string {
  if (!sessionPassword) {
    throw new Error('Journal is locked. Please unlock first.');
  }
  return sessionPassword;
}

/**
 * Return the current session password without throwing — null if locked.
 * Used by the breakout writer to hand off the password via the session bridge.
 */
export function getSessionPassword(): string | null {
  return sessionPassword;
}

// ============================================================================
// Journal Entry Operations
// ============================================================================

/**
 * Create a new journal entry (encrypts content automatically)
 */
function countWords(html: string): number {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.split(/\s+/).length : 0;
}

function extractAndStripSessionId(html: string): { cleaned: string; sessionId: string | null } {
  const match = html.match(/<span[^>]+data-still-session-id="([^"]+)"[^>]*>.*?<\/span>/);
  if (!match) return { cleaned: html, sessionId: null };
  return {
    cleaned: html.replace(match[0], ''),
    sessionId: match[1],
  };
}

export async function createEntry(
  data: JournalEntryFormData & { locationWeather?: LocationWeather; bookId?: string }
): Promise<JournalEntry> {
  const password = getPassword();

  // Strip hidden StillHaven session marker before encrypting
  const { cleaned: cleanedContent, sessionId } = extractAndStripSessionId(data.content);
  const contentToSave = sessionId ? cleanedContent : data.content;

  // Compute word count from plaintext before encryption
  const wordCount = countWords(contentToSave);

  // Encrypt the content
  const result = await encrypt(contentToSave, password);

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Encryption failed');
  }

  // Generate UUID
  const id = crypto.randomUUID();

  // Store in database
  const row = await invoke<EncryptedJournalEntryRow>('create_journal_entry', {
    id,
    encryptedContent: result.data,
    mood: data.mood,
    privacyMode: data.privacyMode,
    locationWeather: data.locationWeather ? JSON.stringify(data.locationWeather) : null,
    bookId: data.bookId ?? null,
    wordCount,
  });

  // Persist tags — call unconditionally so removing all tags deletes them from DB
  await invoke('sync_entry_tags', { id, tags: data.tags });

  // Link to StillHaven session if marker was present
  if (sessionId) {
    linkEntryToSession(id, sessionId).catch((e) => {
      console.warn('[journalService] session link failed (non-fatal):', e);
    });
  }

  // Return decrypted entry
  return {
    id: row.id,
    content: contentToSave,
    mood: row.mood as MoodLevel,
    privacyMode: (row.privacy_mode ?? 0) as PrivacyMode,
    tags: data.tags,
    locationWeather: row.location_weather ? (JSON.parse(row.location_weather) as LocationWeather) : undefined,
    book_id: row.book_id ?? 'default',
    pinned: row.pinned ?? false,
    created_at: row.created_at,
    updated_at: row.updated_at,
    sessionId: row.session_id ?? null,
  };
}

/**
 * Get a single entry by ID (decrypts automatically)
 */
export async function getEntry(id: string): Promise<JournalEntry | null> {
  const password = getPassword();

  const row = await invoke<EncryptedJournalEntryRow | null>(
    'get_journal_entry',
    { id }
  );

  if (!row) {
    return null;
  }

  return decryptEntry(row, password);
}

/**
 * Get all entries (decrypts automatically)
 */
export async function getAllEntries(
  limit?: number
): Promise<JournalEntry[]> {
  const password = getPassword();

  const rows = await invoke<EncryptedJournalEntryRow[]>(
    'get_all_journal_entries',
    { limit }
  );

  // Skip sealed entries (encrypted_content is null until revealed)
  const decryptable = rows.filter((row) => row.encrypted_content !== null);
  const entries = await Promise.all(
    decryptable.map((row) => decryptEntry(row, password))
  );

  return entries;
}

/**
 * Get entries by date range
 */
export async function getEntriesByDateRange(
  startDate: Date,
  endDate: Date
): Promise<JournalEntry[]> {
  const password = getPassword();

  const rows = await invoke<EncryptedJournalEntryRow[]>(
    'get_journal_entries_by_date',
    {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
    }
  );

  // Skip sealed entries (encrypted_content is null until revealed)
  const decryptable = rows.filter((row) => row.encrypted_content !== null);
  const entries = await Promise.all(
    decryptable.map((row) => decryptEntry(row, password))
  );

  return entries;
}

/**
 * Update an existing entry
 */
export async function updateEntry(
  id: string,
  data: JournalEntryFormData
): Promise<JournalEntry> {
  const password = getPassword();

  // Encrypt the new content
  const result = await encrypt(data.content, password);

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Encryption failed');
  }

  const wordCount = countWords(data.content);

  const row = await invoke<EncryptedJournalEntryRow>('update_journal_entry', {
    id,
    encryptedContent: result.data,
    mood: data.mood,
    privacyMode: data.privacyMode,
    wordCount,
  });

  // Sync tags (always — this replaces the previous set)
  await invoke('sync_entry_tags', { id, tags: data.tags });

  return {
    id: row.id,
    content: data.content,
    mood: row.mood as MoodLevel,
    privacyMode: (row.privacy_mode ?? 0) as PrivacyMode,
    tags: data.tags,
    book_id: row.book_id ?? 'default',
    pinned: row.pinned ?? false,
    created_at: row.created_at,
    updated_at: row.updated_at,
    sessionId: row.session_id ?? null,
  };
}

/**
 * Delete an entry
 */
export async function deleteEntry(id: string): Promise<boolean> {
  return invoke<boolean>('delete_journal_entry', { id });
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get mood statistics for a date range
 */
export async function getMoodStatistics(
  startDate: Date,
  endDate: Date
): Promise<DailyStats[]> {
  return invoke<DailyStats[]>('get_mood_statistics', {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
  });
}

interface MoodDistributionRow {
  mood: number;
  count: number;
}

interface StreakStatsRow {
  current_streak: number;
  longest_streak: number;
  last_entry_date: string | null;
}

/**
 * Get overall statistics
 */
export async function getOverallStatistics(): Promise<MoodStatistics> {
  const [[averageMood, totalEntries], distributionRows, streakRow] = await Promise.all([
    invoke<[number, number]>('get_overall_statistics'),
    invoke<MoodDistributionRow[]>('get_mood_distribution'),
    invoke<StreakStatsRow>('get_streak_stats'),
  ]);

  const moodDistribution: Record<MoodLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of distributionRows) {
    if (row.mood >= 1 && row.mood <= 5) {
      moodDistribution[row.mood as MoodLevel] = row.count;
    }
  }

  return {
    averageMood,
    totalEntries,
    moodDistribution,
    streak: streakRow.current_streak,
    longestStreak: streakRow.longest_streak,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Decrypt an encrypted entry row
 */
async function decryptEntry(
  row: EncryptedJournalEntryRow,
  password: string
): Promise<JournalEntry> {
  if (!row.encrypted_content) {
    throw new Error('Entry is sealed — content not available');
  }
  const result = await decrypt(row.encrypted_content, password);

  if (!result.success || result.data === undefined) {
    throw new Error(result.error || 'Decryption failed');
  }

  return {
    id: row.id,
    content: result.data,
    mood: row.mood as MoodLevel,
    privacyMode: (row.privacy_mode ?? 0) as PrivacyMode,
    tags: row.tags ?? [],
    locationWeather: row.location_weather ? (JSON.parse(row.location_weather) as LocationWeather) : undefined,
    book_id: row.book_id ?? 'default',
    pinned: row.pinned ?? false,
    created_at: row.created_at,
    updated_at: row.updated_at,
    sealedUntil: row.sealed_until ?? null,
    capsuleType: (row.capsule_type ?? null) as 'letter' | 'vault' | 'anniversary' | null,
    linkedOriginalId: row.linked_original_id ?? null,
    unsealedAt: row.unsealed_at ?? null,
    sessionId: row.session_id ?? null,
    wordCount: row.word_count ?? null,
  };
}

/**
 * Format date as YYYY-MM-DD for SQLite (using local calendar date, not UTC)
 */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ============================================================================
// Additional Functions for New UI
// ============================================================================

/**
 * Get entry by ID (alias for getEntry)
 */
export async function getEntryById(id: string): Promise<JournalEntry | null> {
  return getEntry(id);
}

/**
 * Save entry (create or update).
 * locationWeather is only applied on initial creation — not on subsequent updates.
 * bookId is only applied on initial creation.
 */
export async function saveEntry(data: {
  id?: string;
  title?: string;
  content: string;
  mood?: number;
  privacyMode?: PrivacyMode;
  locationWeather?: LocationWeather;
  bookId?: string;
}): Promise<JournalEntry> {
  const formData: JournalEntryFormData = {
    content: data.content,
    mood: (data.mood || 3) as MoodLevel,
    tags: extractHashtags(data.content),
    privacyMode: data.privacyMode ?? 0,
  };

  if (data.id) {
    return updateEntry(data.id, formData);
  } else {
    return createEntry({ ...formData, locationWeather: data.locationWeather, bookId: data.bookId });
  }
}

/**
 * Attach location/weather data to an already-created entry.
 * Used when geolocation resolves after the first auto-save has fired.
 */
export async function patchEntryLocationWeather(
  id: string,
  weather: LocationWeather
): Promise<void> {
  await invoke('patch_entry_location_weather', {
    id,
    locationWeather: JSON.stringify(weather),
  });
}

/**
 * Toggle the pinned/favourite state of an entry.
 */
export async function patchEntryPinned(id: string, pinned: boolean): Promise<void> {
  await invoke('patch_entry_pinned', { id, pinned });
}

/**
 * Link a journal entry to a StillHaven session after the entry is created.
 */
export async function linkEntryToSession(entryId: string, sessionId: string): Promise<void> {
  await invoke('link_journal_entry_to_session', { entryId, sessionId });
}

/**
 * Sync tags for an entry (replaces all existing tags with the provided list).
 */
export async function syncEntryTags(id: string, tags: string[]): Promise<void> {
  await invoke('sync_entry_tags', { id, tags });
}

/**
 * Get all unique tag names used across entries in a given book.
 */
export async function getBookTags(bookId: string): Promise<string[]> {
  return invoke('get_book_tags', { bookId });
}

/**
 * Search entries by content
 */
export async function searchEntries(query: string): Promise<JournalEntry[]> {
  // Get all entries and filter client-side (since content is encrypted)
  const entries = await getAllEntries();
  const lowerQuery = query.toLowerCase();

  return entries.filter(
    (entry) =>
      entry.content.toLowerCase().includes(lowerQuery) ||
      (entry.title?.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Get entries from same day in previous years (On This Day).
 * Uses a dedicated Rust command that filters in SQL rather than fetching all entries.
 */
export async function getEntriesOnThisDay(): Promise<JournalEntry[]> {
  const password = getPassword();
  const rows = await invoke<EncryptedJournalEntryRow[]>('get_entries_on_this_day');
  const decryptable = rows.filter((row) => row.encrypted_content !== null);
  return Promise.all(decryptable.map((row) => decryptEntry(row, password)));
}
