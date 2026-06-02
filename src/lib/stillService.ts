import { invoke } from '@tauri-apps/api/core';

export interface StillSession {
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

export interface StillActivationSample {
  id: number;
  session_id: string;
  phase: 'pre' | 'post';
  activation: number;
  hrv_manual: number | null;
  hrv_source: 'manual' | 'oura' | 'fitbit' | null;
  note: string | null;
  sampled_at: string;
}

export interface StillSessionWithSamples {
  session: StillSession;
  samples: StillActivationSample[];
}

export async function stillCreateSession(params: {
  id: string;
  protocol: string;
  environment: string;
  bilateralMode: string;
  durationSeconds: number;
  startedAt: string;
}): Promise<StillSession> {
  return invoke('still_create_session', params);
}

export async function stillRecordActivation(params: {
  sessionId: string;
  phase: 'pre' | 'post';
  activation: number;
  hrvManual?: number | null;
  hrvSource?: string | null;
  note?: string | null;
}): Promise<StillActivationSample> {
  return invoke('still_record_activation', params);
}

export async function stillCompleteSession(params: {
  id: string;
  completedAt: string;
  durationSeconds: number;
}): Promise<void> {
  return invoke('still_complete_session', params);
}

export async function stillAbandonSession(params: {
  id: string;
  abandonedAt: string;
}): Promise<void> {
  return invoke('still_abandon_session', params);
}

export async function stillListSessions(limit?: number): Promise<StillSession[]> {
  return invoke('still_list_sessions', { limit });
}

export async function stillGetSessionWithSamples(
  id: string,
): Promise<StillSessionWithSamples | null> {
  return invoke('still_get_session_with_samples', { id });
}

// ── v1.3.0 narrative layer ────────────────────────────────────────────────────

export interface StillSessionBrief {
  protocol: string;
  duration_seconds: number;
  pre_activation: number | null;
  post_activation: number | null;
}

export interface JournalBrief {
  entry_id: string;
  mood: number;
  word_count: number | null;
  created_at: string;
}

export interface WellbeingContext {
  oura_readiness_today: number | null;
  last_still_session_days_ago: number | null;
  yesterday_mood_avg: number | null;
  yesterday_entry_count: number;
  streak_days: number;
}

export async function stillGetSessionBrief(
  sessionId: string,
): Promise<StillSessionBrief | null> {
  return invoke('still_get_session_brief', { sessionId });
}

export async function stillGetJournalBriefForSession(
  sessionId: string,
): Promise<JournalBrief | null> {
  return invoke('still_get_journal_brief_for_session', { sessionId });
}

export async function stillGetWellbeingContext(): Promise<WellbeingContext> {
  return invoke('still_get_wellbeing_context');
}

// ── v1.4.0 StillHaven Effect ──────────────────────────────────────────────────

export interface ProtocolEffect {
  protocol: string;
  session_count: number;
  /** pre − post activation; positive = improvement. */
  avg_activation_delta: number | null;
  /** Average mood on the journal entry written after the session (1–5). */
  avg_mood_after: number | null;
}

export interface StillEffectStats {
  per_protocol: ProtocolEffect[];
  /** Protocol with highest avg activation delta (requires ≥2 qualifying sessions). */
  best_protocol: string | null;
  /** Total sessions included in the analysis. */
  sessions_with_data: number;
  /** Overall average mood across all qualifying sessions. */
  avg_mood_after: number | null;
}

export async function stillGetEffectStats(): Promise<StillEffectStats> {
  return invoke('still_get_effect_stats');
}
