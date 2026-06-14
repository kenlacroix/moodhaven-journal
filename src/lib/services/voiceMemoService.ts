/**
 * voiceMemoService — TypeScript IPC wrappers for the voice_memos Rust commands.
 *
 * Voice memos originate from Wear OS watch recordings (RecordFragment) and
 * arrive on the phone via the Wear OS ChannelAPI. Once stored, they can be
 * transcribed with whisper.cpp and linked to journal entries.
 */

import { invoke } from '@tauri-apps/api/core';
import type { EncryptedData } from './crypto';
import type { JournalEntry } from '../../types/journal';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Mirrors `VoiceMemoRow` in Rust (`src/db/mod.rs`) */
export interface VoiceMemo {
  id: string;
  timestamp: string;
  /** Recording length in milliseconds */
  duration_ms: number;
  /** Heart-rate JSON captured at recording time, e.g. `{"hr":78}` */
  health_json: string | null;
  /** Relative path from app_data_dir, e.g. `voice_memos/<id>.m4a` */
  file_path: string;
  /** Whisper.cpp transcription text (null until processed) */
  transcription: string | null;
  /** Raw unformatted transcription text before any formatting layer is applied (null if not yet transcribed) */
  rawTranscription: string | null;
  /** Linked journal entry id (null until user attaches it) */
  entry_id: string | null;
  /** Origin: "watch" | "phone" */
  source: string;
  created_at: string;
  /** Free-text context summary (health, location, etc.) attached after transcription */
  context?: string;
  /** Mood inferred from transcript text (1–5) */
  inferred_mood?: number;
  /** Book the draft will be published into (defaults to 'default') */
  book_id: string;
  /** 0 = pending review, 1 = reviewed/published or discarded */
  reviewed: number;
}

// ── Commands ──────────────────────────────────────────────────────────────────

/**
 * Move an incoming audio file from the staging directory to permanent storage
 * and record it in the database. This is called automatically by useWearSignals
 * on every "wear://voice_memo" Tauri event — you generally don't call it manually.
 */
export async function storeVoiceMemo(params: {
  id: string;
  timestamp: string;
  durationMs: number;
  healthJson: string | null;
  incomingFile: string;
}): Promise<VoiceMemo> {
  return invoke<VoiceMemo>('store_voice_memo', params);
}

/**
 * Persist a phone-recorded voice memo directly from raw base64 audio.
 * The whisper.cpp sidecar is desktop-only, so the memo is stored untranscribed
 * for later transcription once it reaches (or syncs to) a desktop instance.
 */
export async function storeVoiceMemoBytes(
  id: string,
  timestamp: string,
  durationMs: number,
  audioBase64: string,
  healthJson?: string,
): Promise<VoiceMemo> {
  return invoke<VoiceMemo>('store_voice_memo_bytes', {
    id,
    timestamp,
    durationMs,
    healthJson: healthJson ?? null,
    audioBase64,
  });
}

/** List voice memos newest first. */
export async function listVoiceMemos(limit?: number): Promise<VoiceMemo[]> {
  return invoke<VoiceMemo[]>('list_voice_memos', { limit: limit ?? null });
}

/** Get a single voice memo by id. Returns null if not found. */
export async function getVoiceMemo(id: string): Promise<VoiceMemo | null> {
  return invoke<VoiceMemo | null>('get_voice_memo', { id });
}

/** Delete a voice memo and its audio file. */
export async function deleteVoiceMemo(id: string): Promise<void> {
  return invoke<void>('delete_voice_memo', { id });
}

/** Set the transcription text (called after whisper.cpp processes the audio). */
export async function patchVoiceMemoTranscription(
  id: string,
  transcription: string,
): Promise<void> {
  return invoke<void>('patch_voice_memo_transcription', { id, transcription });
}

/**
 * Transcribe a stored voice memo using the local whisper.cpp sidecar.
 * Patches the `transcription` column in the database and returns the text.
 *
 * Requires a model to be downloaded first (e.g. via Settings → Speech to Text).
 * The whisper sidecar must support the audio format of the memo (M4A requires
 * a whisper-cli built with ffmpeg support).
 */
export async function transcribeVoiceMemo(id: string, model: string): Promise<string> {
  return invoke<string>('transcribe_voice_memo', { id, model });
}

/** Link a voice memo to a journal entry for contextual display. */
export async function linkVoiceMemoToEntry(
  memoId: string,
  entryId: string,
): Promise<void> {
  return invoke<void>('link_voice_memo_to_entry', { memoId, entryId });
}

/** Store the locally-inferred mood score (1–5) on the memo row. */
export async function patchVoiceMemoMood(id: string, inferredMood: number): Promise<void> {
  return invoke<void>('patch_voice_memo_mood', { id, inferredMood });
}

/**
 * Promote a draft voice memo into a journal entry.
 * Marks the memo as reviewed and links it to the created entry.
 */
export async function publishVoiceMemoDraft(
  id: string,
  encryptedContent: EncryptedData,
  mood: number,
  bookId: string,
  privacyMode: number,
): Promise<JournalEntry> {
  return invoke<JournalEntry>('publish_voice_memo_draft', { id, encryptedContent, mood, bookId, privacyMode });
}

/**
 * Discard a pending draft — marks it reviewed without creating a journal entry.
 * Deletes both the DB row and the audio file (best-effort). Do not call deleteVoiceMemo afterward.
 */
export async function discardVoiceMemoDraft(id: string): Promise<void> {
  return invoke<void>('discard_voice_memo_draft', { id });
}

/** List voice memos that have been transcribed but not yet reviewed (reviewed = 0). */
export async function listPendingDrafts(limit?: number): Promise<VoiceMemo[]> {
  return invoke<VoiceMemo[]>('list_pending_drafts', { limit: limit ?? null });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Format a duration in ms as "M:SS". */
export function formatDuration(durationMs: number): string {
  const s = Math.floor(durationMs / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Extract up to 3 hashtag suggestions from a transcript.
 * Filters stopwords and returns short keywords formatted as #tag.
 */
export function suggestHashtags(transcript: string): string[] {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'was', 'are', 'were',
    'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'this', 'that', 'these',
    'those', 'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
    'he', 'she', 'they', 'their',
  ]);
  return transcript
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && w.length <= 12 && !stopwords.has(w))
    .reduce<string[]>((acc, w) => (acc.includes(w) ? acc : [...acc, w]), [])
    .slice(0, 3)
    .map((w) => `#${w}`);
}
