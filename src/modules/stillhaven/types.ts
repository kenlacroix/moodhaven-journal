// StillHaven — shared types
// Phase 0: skeleton only. Full types added in Phase 1 (schema) and Phase 2 (engine).

export type StillEnvironment = 'underwater';

export type StillBilateralMode = 'audio';

export type StillPhase = 'pre' | 'post';

export type StillProtocol = 'general_activation' | 'fake_danger';

export interface StillSession {
  id: string;
  protocol: StillProtocol;
  environment: StillEnvironment;
  bilateral_mode: StillBilateralMode;
  duration_seconds: number;
  started_at: string;
  completed_at: string | null;
  abandoned_at: string | null;
  created_at: string;
}

export interface StillActivationSample {
  id: number;
  session_id: string;
  phase: StillPhase;
  activation: number;
  hrv_manual: number | null;
  hrv_source: 'manual' | 'oura' | 'fitbit' | null;
  note: string | null;
  sampled_at: string;
}
