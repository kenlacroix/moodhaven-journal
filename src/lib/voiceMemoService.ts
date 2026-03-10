/**
 * voiceMemoService — TypeScript IPC wrappers for the voice_memos Rust commands.
 *
 * Voice memos originate from Wear OS watch recordings (RecordFragment) and
 * arrive on the phone via the Wear OS ChannelAPI. Once stored, they can be
 * transcribed with whisper.cpp and linked to journal entries.
 */

import { invoke } from '@tauri-apps/api/core';

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
  /** Linked journal entry id (null until user attaches it) */
  entry_id: string | null;
  /** Origin: "watch" | "phone" */
  source: string;
  created_at: string;
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

/** Link a voice memo to a journal entry for contextual display. */
export async function linkVoiceMemoToEntry(
  memoId: string,
  entryId: string,
): Promise<void> {
  return invoke<void>('link_voice_memo_to_entry', { memoId, entryId });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Format a duration in ms as "M:SS". */
export function formatDuration(durationMs: number): string {
  const s = Math.floor(durationMs / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Parse heart rate from health_json. Returns null if unavailable. */
export function extractHeartRate(healthJson: string | null): number | null {
  if (!healthJson) return null;
  try {
    const parsed = JSON.parse(healthJson) as { hr?: number };
    return typeof parsed.hr === 'number' ? parsed.hr : null;
  } catch {
    return null;
  }
}
