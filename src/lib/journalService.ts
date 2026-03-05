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
  hashPassword,
  verifyPasswordHash,
  type EncryptedData,
} from './crypto';
import type {
  JournalEntry,
  JournalEntryFormData,
  LocationWeather,
  MoodLevel,
  MoodStatistics,
  PrivacyMode,
} from '../types/journal';

// ============================================================================
// Types matching Rust backend
// ============================================================================

interface EncryptedJournalEntryRow {
  id: string;
  encrypted_content: EncryptedData;
  mood: number;
  privacy_mode: number;
  location_weather?: string; // JSON-encoded LocationWeather, not encrypted
  book_id: string;
  created_at: string;
  updated_at: string;
}

interface UserSettings {
  password_hash: string;
  password_salt: string;
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
 * Verify user's password against stored hash
 */
export async function verifyUserPassword(password: string): Promise<boolean> {
  const settings = await invoke<UserSettings | null>('get_password_hash');

  if (!settings) {
    return false;
  }

  return verifyPasswordHash(
    password,
    settings.password_hash,
    settings.password_salt
  );
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
    return true;
  }

  return false;
}

/**
 * Lock the journal (clear session password)
 */
export function lockJournal(): void {
  sessionPassword = null;
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
export async function createEntry(
  data: JournalEntryFormData & { locationWeather?: LocationWeather; bookId?: string }
): Promise<JournalEntry> {
  const password = getPassword();

  // Encrypt the content
  const result = await encrypt(data.content, password);

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
  });

  // Return decrypted entry
  return {
    id: row.id,
    content: data.content, // We already have the plaintext
    mood: row.mood as MoodLevel,
    privacyMode: (row.privacy_mode ?? 0) as PrivacyMode,
    tags: data.tags,
    locationWeather: row.location_weather ? (JSON.parse(row.location_weather) as LocationWeather) : undefined,
    book_id: row.book_id ?? 'default',
    created_at: row.created_at,
    updated_at: row.updated_at,
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

  // Decrypt all entries in parallel
  const entries = await Promise.all(
    rows.map((row) => decryptEntry(row, password))
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

  const entries = await Promise.all(
    rows.map((row) => decryptEntry(row, password))
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

  const row = await invoke<EncryptedJournalEntryRow>('update_journal_entry', {
    id,
    encryptedContent: result.data,
    mood: data.mood,
    privacyMode: data.privacyMode,
  });

  return {
    id: row.id,
    content: data.content,
    mood: row.mood as MoodLevel,
    privacyMode: (row.privacy_mode ?? 0) as PrivacyMode,
    tags: data.tags,
    book_id: row.book_id ?? 'default',
    created_at: row.created_at,
    updated_at: row.updated_at,
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

/**
 * Get overall statistics
 */
export async function getOverallStatistics(): Promise<MoodStatistics> {
  const [averageMood, totalEntries] = await invoke<[number, number]>(
    'get_overall_statistics'
  );

  // TODO: Calculate full statistics including streaks
  return {
    averageMood,
    totalEntries,
    moodDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    streak: 0,
    longestStreak: 0,
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
  const result = await decrypt(row.encrypted_content, password);

  if (!result.success || result.data === undefined) {
    throw new Error(result.error || 'Decryption failed');
  }

  return {
    id: row.id,
    content: result.data,
    mood: row.mood as MoodLevel,
    privacyMode: (row.privacy_mode ?? 0) as PrivacyMode,
    tags: [], // TODO: Fetch from entry_tags table
    locationWeather: row.location_weather ? (JSON.parse(row.location_weather) as LocationWeather) : undefined,
    book_id: row.book_id ?? 'default',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Format date as YYYY-MM-DD for SQLite
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
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
    tags: [],
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
 * Get entries from same day in previous years (On This Day)
 */
export async function getEntriesOnThisDay(): Promise<JournalEntry[]> {
  const entries = await getAllEntries();
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentDay = today.getDate();
  const currentYear = today.getFullYear();

  return entries.filter((entry) => {
    const entryDate = new Date(entry.created_at);
    return (
      entryDate.getMonth() === currentMonth &&
      entryDate.getDate() === currentDay &&
      entryDate.getFullYear() !== currentYear
    );
  });
}
