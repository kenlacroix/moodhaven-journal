/**
 * Oura Ring integration types for MoodHaven Journal
 */

// Stress classification from Oura API
export type OuraStressSummary = 'restored' | 'normal' | 'stressful' | 'demanding' | 'engaged';

// Daily health context synthesized from multiple Oura endpoints
export interface OuraHealthContext {
  date: string; // YYYY-MM-DD
  // Sleep (previous night)
  sleepScore: number | null; // 0-100
  sleepTotalMinutes: number | null;
  sleepRemMinutes: number | null;
  sleepDeepMinutes: number | null;
  sleepEfficiency: number | null; // 0-100
  // Readiness
  readinessScore: number | null; // 0-100
  // Activity
  activityScore: number | null; // 0-100
  activeCalories: number | null;
  steps: number | null;
  // Stress
  stressSummary: OuraStressSummary | null;
  stressHighMinutes: number | null;
  recoveryHighMinutes: number | null;
  // SpO2
  avgSpo2: number | null; // percentage e.g. 98.4
  // Cache metadata
  fetchedAt: string; // ISO timestamp
}

// Connection status response from backend
export interface OuraStatusResponse {
  connected: boolean;
  connectedAt: string | null;
  lastSyncAt: string | null;
}

// Human-readable health summary for prompts and badge
export interface OuraHealthSummary {
  headline: string;         // e.g. "Well rested, normal stress"
  badges: OuraHealthBadge[];
  promptModifiers: string[]; // Injected into AI prompt context
}

export interface OuraHealthBadge {
  label: string;
  value: string;
  sentiment: 'good' | 'neutral' | 'low';
  icon: string; // emoji
}
