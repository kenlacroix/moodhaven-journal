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
