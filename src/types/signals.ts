/**
 * Signal type definitions
 *
 * Signals are lightweight, append-only data points captured from any source
 * (phone, Wear OS watch, health integrations). They feed into reflections
 * (journal entries) and drive the sync engine.
 *
 * Encryption: signal payloads are encrypted client-side (AES-256-GCM) before
 * being sent to the Rust layer. Rust stores opaque encrypted blobs only.
 */


// ── Signal source ─────────────────────────────────────────────────────────────

export type SignalSource =
  | 'phone'       // captured in the Android/desktop companion app
  | 'watch'       // captured on a paired Wear OS device
  | 'desktop'     // captured on the desktop (Windows/macOS/Linux) app
  | 'health'      // imported from a health platform (Oura, Health Connect, etc.)
  | 'import';     // restored from a backup / migration

// ── Signal type ───────────────────────────────────────────────────────────────

export type SignalType =
  | 'mood_tap'        // quick single-tap mood rating (1-5)
  | 'check_in'        // structured multi-field check-in (mood + note + tags)
  | 'voice_memo'      // short audio snippet (references an attachment id)
  | 'health_snapshot' // biometric snapshot (sleep, HRV, readiness, steps)
  | 'location_tag'    // voluntary location tag (city-level, never coordinates)
  | 'custom';         // extensible — future watch faces / widgets

// ── Signal payload shapes (before encryption) ────────────────────────────────

export interface MoodTapPayload {
  mood: 1 | 2 | 3 | 4 | 5;
  note?: string;          // optional one-liner (max 140 chars)
}

export interface CheckInPayload {
  mood: 1 | 2 | 3 | 4 | 5;
  note?: string;
  tags?: string[];
  energy?: 1 | 2 | 3 | 4 | 5;
}

export interface VoiceMemoPayload {
  attachmentId: string;   // references entry_media.id
  durationMs: number;
  transcript?: string;    // whisper.cpp output (optional, local)
}

export interface HealthSnapshotPayload {
  sleepScore?: number;
  readinessScore?: number;
  hrvAvg?: number;
  steps?: number;
  source: 'oura' | 'health_connect' | 'manual';
}

export interface LocationTagPayload {
  city?: string;
  country?: string;
  timezone?: string;
}

export type SignalPayload =
  | MoodTapPayload
  | CheckInPayload
  | VoiceMemoPayload
  | HealthSnapshotPayload
  | LocationTagPayload
  | Record<string, unknown>; // custom / future types

// ── Signal as returned by the Rust layer ─────────────────────────────────────

/** A signal row as returned from Rust (payload is still encrypted) */
export interface SignalRow {
  id: string;
  timestamp: string;       // ISO-8601 local time
  signal_type: string;
  source: string;
  /** JSON-serialised EncryptedContent — decrypt with signalService.decryptPayload() */
  payload: string;
  synced: boolean;
  created_at: string;
}

/** A signal row with its payload already decrypted (frontend-only type) */
export interface Signal<T extends SignalPayload = SignalPayload> {
  id: string;
  timestamp: string;
  type: SignalType;
  source: SignalSource;
  payload: T;
  synced: boolean;
  createdAt: string;
}

// ── Sync log ──────────────────────────────────────────────────────────────────

export interface SyncLogRow {
  id: number;
  object_id: string;
  object_type: 'journal_entry' | 'signal' | 'book' | string;
  action: 'insert' | 'update' | 'delete';
  created_at: string;
}

// ── Watch message envelope (Wear OS Data Layer) ───────────────────────────────
// Defined here so the Android WearPlugin and the TypeScript layer share the same
// shape. The phone app de-serialises these messages and calls create_signal().

export interface WatchSignalMessage {
  /** UUID generated on the watch */
  id: string;
  /** ISO-8601 UTC timestamp from watch clock */
  timestamp: string;
  type: SignalType;
  /** Plaintext payload — encrypted by the phone app before DB insertion */
  payload: SignalPayload;
}
