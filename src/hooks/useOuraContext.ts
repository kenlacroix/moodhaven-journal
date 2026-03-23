/**
 * useOuraContext
 *
 * Loads the last 7 days of Oura health data and assembles a "merged context"
 * for the current journaling session.
 *
 * ## Temporal merging
 * Oura data is a set of daily aggregates with different availability windows:
 * - Sleep / Readiness / SpO2 → dated to the wake-up day, available from morning
 * - Activity / Stress        → finalize at end of day → use YESTERDAY's data
 *
 * So for a user journaling on day D the merged context contains:
 *   - sleep/readiness/SpO2 from D   (last night + this morning)
 *   - activity/stress      from D-1 (yesterday's complete day)
 *
 * ## Prompt modifier gating
 * Modifiers are only injected into AI prompts once enough history exists:
 * - < 3 days cached → no modifiers (single data point is noise)
 * - 3–6 days        → current-state modifiers ("had a restless night")
 * - 7+  days        → trend modifiers ("been sleeping poorly this week")
 *
 * ## Privacy contract
 * - Health data never leaves the device
 * - Only qualitative labels reach the AI (never raw biometric scores)
 */

import { useState, useEffect, useCallback } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { useAppStore } from '../stores/appStore';
import { syncToday, getHistory } from '../lib/ouraService';
import type { OuraHealthContext, OuraHealthSummary, OuraHealthBadge } from '../types/oura';

// ============================================================================
// Temporal merging
// ============================================================================

/**
 * Build a merged context from a 7-day history.
 * Takes sleep/readiness/SpO2 from today, activity/stress from yesterday.
 * Exported so useJournalPrompts can build health prompts from the same cache.
 */
export function buildMergedContext(history: OuraHealthContext[]): OuraHealthContext | null {
  if (history.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  // Most recent entry as base (handles edge cases where today isn't synced yet)
  const base = history.find((d) => d.date === today) ?? history[history.length - 1];
  const prev = history.find((d) => d.date === yesterday);

  return {
    ...base,
    // Activity and stress: prefer yesterday's finalized data
    activityScore: prev?.activityScore ?? base.activityScore,
    activeCalories: prev?.activeCalories ?? base.activeCalories,
    steps: prev?.steps ?? base.steps,
    stressSummary: prev?.stressSummary ?? base.stressSummary,
    stressHighMinutes: prev?.stressHighMinutes ?? base.stressHighMinutes,
    recoveryHighMinutes: prev?.recoveryHighMinutes ?? base.recoveryHighMinutes,
  };
}

// ============================================================================
// Health context → human-readable summary
// ============================================================================

function summarizeSleep(ctx: OuraHealthContext): OuraHealthBadge | null {
  if (ctx.sleepScore == null) return null;
  const score = ctx.sleepScore;
  if (score >= 85) return { label: 'Sleep', value: `${score} — Great`, sentiment: 'good', icon: '😴' };
  if (score >= 70) return { label: 'Sleep', value: `${score} — Good`, sentiment: 'neutral', icon: '😴' };
  return { label: 'Sleep', value: `${score} — Restless`, sentiment: 'low', icon: '😴' };
}

function summarizeReadiness(ctx: OuraHealthContext): OuraHealthBadge | null {
  if (ctx.readinessScore == null) return null;
  const score = ctx.readinessScore;
  if (score >= 85) return { label: 'Readiness', value: `${score} — High`, sentiment: 'good', icon: '⚡' };
  if (score >= 70) return { label: 'Readiness', value: `${score} — Moderate`, sentiment: 'neutral', icon: '⚡' };
  return { label: 'Readiness', value: `${score} — Low`, sentiment: 'low', icon: '⚡' };
}

function summarizeStress(ctx: OuraHealthContext): OuraHealthBadge | null {
  if (!ctx.stressSummary) return null;
  const map: Record<string, { value: string; sentiment: OuraHealthBadge['sentiment']; icon: string }> = {
    restored:  { value: 'Restored',  sentiment: 'good',    icon: '🌿' },
    normal:    { value: 'Normal',    sentiment: 'neutral',  icon: '🌿' },
    stressful: { value: 'Stressful', sentiment: 'low',      icon: '🌿' },
    demanding: { value: 'Demanding', sentiment: 'low',      icon: '🌿' },
    engaged:   { value: 'Engaged',   sentiment: 'neutral',  icon: '🌿' },
  };
  const info = map[ctx.stressSummary] ?? { value: ctx.stressSummary, sentiment: 'neutral' as const, icon: '🌿' };
  return { label: 'Stress', ...info };
}

function buildHeadline(ctx: OuraHealthContext): string {
  const parts: string[] = [];
  if (ctx.readinessScore != null) {
    if (ctx.readinessScore >= 85) parts.push('high readiness');
    else if (ctx.readinessScore >= 70) parts.push('moderate readiness');
    else parts.push('low readiness');
  }
  if (ctx.stressSummary) {
    parts.push(`${ctx.stressSummary} stress`);
  } else if (ctx.sleepScore != null) {
    if (ctx.sleepScore >= 85) parts.push('great sleep');
    else if (ctx.sleepScore >= 70) parts.push('decent sleep');
    else parts.push('restless night');
  }
  if (parts.length === 0) return 'Health data available';
  return parts.map((p, i) => (i === 0 ? p[0].toUpperCase() + p.slice(1) : p)).join(', ');
}

// ============================================================================
// History-aware prompt modifiers
// ============================================================================

function avg(history: OuraHealthContext[], field: keyof OuraHealthContext): number | null {
  const values = history
    .map((d) => d[field] as number | null | undefined)
    .filter((v): v is number => v != null);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Build plain-language descriptors for AI prompt enrichment.
 *
 * These are NEVER raw biometric values — they are qualitative labels.
 * Gated by history depth to avoid single-data-point noise:
 *   < 3 days  → []
 *   3–6 days  → simple current-state context
 *   7+ days   → trend-aware context
 */
function buildPromptModifiers(ctx: OuraHealthContext, history: OuraHealthContext[]): string[] {
  const depth = history.length;
  if (depth < 3) return [];

  const mods: string[] = [];
  const useTrends = depth >= 7;

  // Sleep
  if (ctx.sleepScore != null) {
    if (useTrends) {
      const mean = avg(history, 'sleepScore');
      if (mean != null) {
        if (mean < 70) mods.push('the user has been sleeping poorly this week');
        else if (mean >= 85) mods.push('the user has been sleeping well this week');
      }
    } else {
      if (ctx.sleepScore < 70) mods.push('the user had a restless night and may feel tired');
      else if (ctx.sleepScore >= 85) mods.push('the user is well rested');
    }
  }

  // Readiness
  if (ctx.readinessScore != null) {
    if (useTrends) {
      const mean = avg(history, 'readinessScore');
      if (mean != null) {
        if (mean < 70) mods.push('the user has had low energy levels this week');
        else if (mean >= 85) mods.push('the user has been feeling energized this week');
      }
    } else {
      if (ctx.readinessScore < 70) mods.push('the user has low energy today');
      else if (ctx.readinessScore >= 85) mods.push('the user is feeling energized');
    }
  }

  // Stress (from yesterday's finalized data)
  if (ctx.stressSummary === 'stressful' || ctx.stressSummary === 'demanding') {
    if (useTrends) {
      const highDays = history.filter(
        (d) => d.stressSummary === 'stressful' || d.stressSummary === 'demanding'
      ).length;
      if (highDays >= 4) {
        mods.push('the user has had elevated stress for most of this week');
      } else {
        mods.push('the user experienced elevated stress recently');
      }
    } else {
      mods.push('the user experienced elevated stress recently');
    }
  } else if (ctx.stressSummary === 'restored') {
    mods.push('the user is in a good recovery state');
  }

  return mods;
}

/**
 * Build the full health summary (badges + prompt modifiers) from a merged context
 * and the backing history array.
 */
export function buildHealthSummary(
  ctx: OuraHealthContext,
  history: OuraHealthContext[] = []
): OuraHealthSummary {
  const badges: OuraHealthBadge[] = [
    summarizeSleep(ctx),
    summarizeReadiness(ctx),
    summarizeStress(ctx),
  ].filter((b): b is OuraHealthBadge => b !== null);

  return {
    headline: buildHeadline(ctx),
    badges,
    promptModifiers: buildPromptModifiers(ctx, history),
  };
}

// ============================================================================
// Hook
// ============================================================================

export function useOuraContext() {
  const settings = useSettingsStore((s) => s.settings);
  const setOuraSettings = useSettingsStore((s) => s.setOuraSettings);
  const sessionPassword = useAppStore((s) => s.sessionPassword);

  const [history, setHistory] = useState<OuraHealthContext[]>([]);
  const [context, setContext] = useState<OuraHealthContext | null>(null);
  const [summary, setSummary] = useState<OuraHealthSummary | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEnabled = settings.oura.enabled;

  const applyHistory = useCallback(
    (hist: OuraHealthContext[]) => {
      setHistory(hist);
      const merged = buildMergedContext(hist);
      if (merged) {
        setContext(merged);
        setSummary(buildHealthSummary(merged, hist));
        setOuraSettings({ lastSyncAt: merged.fetchedAt });
      }
    },
    [setOuraSettings]
  );

  const load = useCallback(async () => {
    if (!isEnabled) return;
    setError(null);
    setIsSyncing(true);
    try {
      // Auto-sync today+yesterday if enabled (best-effort — don't fail on network error)
      if (settings.oura.autoSyncOnOpen && sessionPassword) {
        try { await syncToday(sessionPassword); } catch { /* non-critical */ }
      }
      // Load 7-day history from local cache
      const hist = await getHistory(7);
      applyHistory(hist);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load health context');
    } finally {
      setIsSyncing(false);
    }
  }, [isEnabled, sessionPassword, settings.oura.autoSyncOnOpen, applyHistory]);

  const refresh = useCallback(async () => {
    if (!isEnabled || !sessionPassword) return;
    setError(null);
    setIsSyncing(true);
    try {
      await syncToday(sessionPassword);
      const hist = await getHistory(7);
      applyHistory(hist);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }, [isEnabled, sessionPassword, applyHistory]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    context,
    summary,
    history,
    isSyncing,
    error,
    isEnabled,
    enrichPrompts: settings.oura.enrichPrompts,
    refresh,
  };
}
