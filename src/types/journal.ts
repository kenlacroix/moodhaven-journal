/**
 * Journal and Mood entry type definitions
 */

import type { EncryptedData } from '../lib/crypto';

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

// Decrypted journal entry (used in memory)
export interface JournalEntry {
  id: string;
  title?: string;
  content: string;
  mood: MoodLevel | null;
  tags: string[];
  privacyMode: PrivacyMode;
  created_at: string; // ISO string for easy serialization
  updated_at: string;
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
