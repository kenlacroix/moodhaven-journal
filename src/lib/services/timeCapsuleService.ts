import { invoke } from '@tauri-apps/api/core';
import type { EncryptedData } from './crypto';

type CapsuleType = 'letter' | 'vault' | 'anniversary';

/** Shape returned by Rust for capsule-related entry queries */
export interface CapsuleEntryRow {
  id: string;
  /** null for sealed entries not yet due */
  encrypted_content: EncryptedData | null;
  mood: number;
  privacy_mode: number;
  location_weather?: string;
  book_id: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  tags: string[];
  sealed_until: string | null;
  capsule_type: CapsuleType | null;
  linked_original_id: string | null;
  unsealed_at: string | null;
}

export interface MoodDelta {
  avg_since: number | null;
  mood_today: number | null;
}

/** Seal an existing entry until `unlockAt` (ISO 8601). Min: today+2d. */
export async function sealEntry(
  id: string,
  unlockAt: string,
  capsuleType: 'letter' | 'vault',
): Promise<void> {
  return invoke('seal_entry', { id, unlockAt, capsuleType });
}

/**
 * Return the next capsule that is ready to reveal, or null if none.
 * Priority: scheduled capsules first, then automatic anniversaries.
 * Entries that are today's On-This-Day anniversary are excluded.
 */
export async function getDueCapsules(includeAnniversary = true): Promise<CapsuleEntryRow | null> {
  // Pass the local wall-clock date (YYYY-MM-DD) so the Rust command compares
  // against the user's timezone rather than UTC ('now' in SQLite).
  const localDate = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  return invoke('get_due_capsules', { includeAnniversary, localDate });
}

/**
 * Mark an entry as revealed.
 * Sets `unsealed_at`, defaults `capsule_type` to 'anniversary', clears `sealed_until`.
 */
export async function unsealEntry(id: string): Promise<void> {
  return invoke('unseal_entry', { id });
}

/** Return mood context for the reveal modal. */
export async function getMoodDelta(
  entryId: string,
  entryCreatedAt: string,
): Promise<MoodDelta> {
  return invoke('get_mood_delta', { entryId, entryCreatedAt });
}
