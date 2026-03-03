/**
 * useOuraContext
 *
 * Loads today's Oura health context for the writing view.
 * Auto-syncs on mount if enabled and data not yet cached for today.
 *
 * Privacy contract:
 * - Health data never leaves the device
 * - Only used for contextual writing prompts (never sent to LLM as raw biometrics)
 * - Summarized into plain-language descriptors before inclusion in AI metadata
 */

import { useState, useEffect, useCallback } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { getTodayContext, syncToday } from '../lib/ouraService';
import type { OuraHealthContext, OuraHealthSummary, OuraHealthBadge } from '../types/oura';

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

/**
 * Build plain-language descriptors used to enrich AI writing prompts.
 * These are NEVER the raw biometric numbers — they are qualitative labels only.
 */
function buildPromptModifiers(ctx: OuraHealthContext): string[] {
  const mods: string[] = [];

  if (ctx.sleepScore != null) {
    if (ctx.sleepScore < 70) mods.push('the user had a restless night and may feel tired');
    else if (ctx.sleepScore >= 85) mods.push('the user is well rested');
  }

  if (ctx.readinessScore != null) {
    if (ctx.readinessScore < 70) mods.push('the user has low energy today');
    else if (ctx.readinessScore >= 85) mods.push('the user is feeling energized');
  }

  if (ctx.stressSummary === 'stressful' || ctx.stressSummary === 'demanding') {
    mods.push('the user has experienced elevated stress today');
  } else if (ctx.stressSummary === 'restored') {
    mods.push('the user is in a good recovery state');
  }

  return mods;
}

export function buildHealthSummary(ctx: OuraHealthContext): OuraHealthSummary {
  const badges: OuraHealthBadge[] = [
    summarizeSleep(ctx),
    summarizeReadiness(ctx),
    summarizeStress(ctx),
  ].filter((b): b is OuraHealthBadge => b !== null);

  return {
    headline: buildHeadline(ctx),
    badges,
    promptModifiers: buildPromptModifiers(ctx),
  };
}

// ============================================================================
// Hook
// ============================================================================

export function useOuraContext() {
  const settings = useSettingsStore((s) => s.settings);
  const setOuraSettings = useSettingsStore((s) => s.setOuraSettings);

  const [context, setContext] = useState<OuraHealthContext | null>(null);
  const [summary, setSummary] = useState<OuraHealthSummary | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEnabled = settings.oura.enabled;

  const load = useCallback(async () => {
    if (!isEnabled) return;

    setError(null);
    setIsSyncing(true);
    try {
      const ctx = await getTodayContext(settings.oura.autoSyncOnOpen);
      if (ctx) {
        setContext(ctx);
        setSummary(buildHealthSummary(ctx));
        setOuraSettings({ lastSyncAt: ctx.fetchedAt });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load health context');
    } finally {
      setIsSyncing(false);
    }
  }, [isEnabled, settings.oura.autoSyncOnOpen, setOuraSettings]);

  const refresh = useCallback(async () => {
    if (!isEnabled) return;
    setError(null);
    setIsSyncing(true);
    try {
      const ctx = await syncToday();
      setContext(ctx);
      setSummary(buildHealthSummary(ctx));
      setOuraSettings({ lastSyncAt: ctx.fetchedAt });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }, [isEnabled, setOuraSettings]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    context,
    summary,
    isSyncing,
    error,
    isEnabled,
    enrichPrompts: settings.oura.enrichPrompts,
    refresh,
  };
}
