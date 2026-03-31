/**
 * Journal and Mood entry type definitions
 */

import type { EncryptedData } from '../lib/services/crypto';

// Mood scale from 1-5 with semantic labels
export type MoodLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Privacy mode for a journal entry.
 * 0 = Open      — included in all local analysis and LLM metadata aggregation
 * 1 = Mindful   — included in local analysis, excluded from LLM calls
 * 2 = Private   — excluded from all analysis (no metadata extracted)
 */
export type PrivacyMode = 0 | 1 | 2;

export const PRIVACY_MODE_LABELS: Record<PrivacyMode, string> = {
  0: 'Open',
  1: 'Mindful',
  2: 'Private',
};

export const PRIVACY_MODE_DESCRIPTIONS: Record<PrivacyMode, string> = {
  0: 'Included in all analysis and AI suggestions',
  1: 'Included in local analysis, excluded from AI cloud calls',
  2: 'Fully excluded from all analysis',
};

export interface MoodOption {
  level: MoodLevel;
  label: string;
  emoji: string;
  color: string; // TailwindCSS color class
}

export const MOOD_OPTIONS: MoodOption[] = [
  { level: 1, label: 'Struggling', emoji: '😔', color: 'bg-rose-500' },
  { level: 2, label: 'Low', emoji: '😕', color: 'bg-orange-400' },
  { level: 3, label: 'Okay', emoji: '😐', color: 'bg-amber-400' },
  { level: 4, label: 'Good', emoji: '🙂', color: 'bg-lime-400' },
  { level: 5, label: 'Great', emoji: '😊', color: 'bg-emerald-500' },
];

/** Per-book settings stored as JSON in the books table */
export interface BookSettings {
  privacyDefault?: 0 | 1 | 2;       // default privacy for new entries in this book
  aiOptOut?: boolean;                // exclude from all AI metadata aggregation
  includeInOnThisDay?: boolean;      // default true
  autoLocationWeather?: boolean;     // override global setting
  concealContent?: boolean;          // blur entry previews in timeline
}

/** A named journal (book) that groups entries */
export interface Book {
  id: string;
  name: string;
  emoji: string;
  color: string;
  sort_order: number;
  description?: string;
  settings?: BookSettings;
  created_at: string;
}

/** Preset accent colors available for books */
export const BOOK_COLORS = [
  'violet', 'rose', 'amber', 'emerald', 'sky', 'indigo', 'teal', 'slate',
] as const;
export type BookColor = typeof BOOK_COLORS[number];

/**
 * Weather and location context captured at the time of writing.
 * Only city/region-level data is stored — precise coordinates are never persisted.
 * Captured via browser Geolocation API + Open-Meteo (weather) + Nominatim (geocoding).
 */
export interface LocationWeather {
  city?: string;          // e.g. "Amsterdam"
  region?: string;        // e.g. "North Holland"
  condition?: string;     // e.g. "Partly cloudy"
  temperature?: number;   // Celsius
  weatherCode?: number;   // WMO code (https://open-meteo.com/en/docs#weathervariables)
  capturedAt: string;     // ISO timestamp
}

// ── Media attachments ──────────────────────────────────────────────────────────

export type MediaCategory = 'image' | 'pdf' | 'audio' | 'video' | 'other';

export interface MediaAttachment {
  id: string;
  entryId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  encPath: string;
  createdAt: string;
}

export function getMediaCategory(mimeType: string): MediaCategory {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'other';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
}

// Decrypted journal entry (used in memory)
export interface JournalEntry {
  id: string;
  title?: string;
  content: string;
  mood: MoodLevel | null;
  tags: string[];
  privacyMode: PrivacyMode;
  locationWeather?: LocationWeather;
  book_id: string; // Which book this entry belongs to (default = 'default')
  pinned?: boolean; // Whether this entry is pinned/favourited
  created_at: string; // ISO string for easy serialization
  updated_at: string;
  // Time capsule fields
  sealedUntil?: string | null;
  capsuleType?: 'letter' | 'vault' | 'anniversary' | null;
  linkedOriginalId?: string | null;
  unsealedAt?: string | null;
}

// Encrypted journal entry (stored in database)
export interface EncryptedJournalEntry {
  id: string;
  encryptedContent: EncryptedData;
  mood: MoodLevel; // Not encrypted - allows mood analytics without decryption
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

// Form data for creating/editing entries
export interface JournalEntryFormData {
  content: string;
  mood: MoodLevel;
  tags: string[];
  privacyMode: PrivacyMode;
}

// Entry metadata for list views (no content loaded)
export interface JournalEntryMeta {
  id: string;
  mood: MoodLevel;
  preview: string; // First ~50 chars, decrypted on demand
  createdAt: Date;
}

// Statistics and analytics
export interface MoodStatistics {
  averageMood: number;
  totalEntries: number;
  moodDistribution: Record<MoodLevel, number>;
  streak: number; // Days in a row with entries
  longestStreak: number;
}

// Date range filter
export interface DateRange {
  start: Date;
  end: Date;
}

// Search/filter options
export interface JournalFilter {
  dateRange?: DateRange;
  moods?: MoodLevel[];
  tags?: string[];
  searchQuery?: string;
}
