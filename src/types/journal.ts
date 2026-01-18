/**
 * Journal and Mood entry type definitions
 */

import type { EncryptedData } from '../lib/crypto';

// Mood scale from 1-5 with semantic labels
export type MoodLevel = 1 | 2 | 3 | 4 | 5;

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
  content: string;
  mood: MoodLevel;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
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
