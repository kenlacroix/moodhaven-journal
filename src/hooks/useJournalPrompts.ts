/**
 * useJournalPrompts
 *
 * Loads AI-generated (or fallback) writing prompts and a local pattern nudge
 * for the writing view. Fires once on mount for new entries.
 *
 * Privacy contract:
 * - Fallback prompts are always purely local (no network)
 * - AI prompts only use aggregated metadata with forLLM=true (Open entries only)
 * - The actual journal text never leaves the device
 */

import { useState, useEffect, useCallback } from 'react';
import { getAllEntries } from '../lib/journalService';
import { aggregateMetadata } from '../lib/metadataExtractor';
import {
  generatePrompts,
  getFallbackPrompts,
  detectRecurringPatterns,
  createAIServiceConfig,
} from '../lib/aiService';
import { useSettingsStore } from '../stores/settingsStore';
import { getTodayContext } from '../lib/ouraService';
import { buildHealthSummary } from './useOuraContext';
import type { AIPrompt, RecurringPattern } from '../types/ai';

function deriveNudge(patterns: RecurringPattern[]): string | null {
  const best = patterns
    .filter((p) => p.type === 'positive_habit' || p.type === 'weekly_pattern')
    .sort((a, b) => b.confidence - a.confidence)[0];
  return best?.description ?? null;
}

export function useJournalPrompts(isNewEntry: boolean) {
  const settings = useSettingsStore((s) => s.settings);
  const [prompts, setPrompts] = useState<AIPrompt[]>([]);
  const [nudge, setNudge] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isNewEntry || !settings.journal.showPrompts) return;

    setIsLoading(true);
    try {
      const entries = await getAllEntries();

      // Local pattern nudge — uses local entries only (privacyMode < 2)
      const localMetadata = aggregateMetadata(entries, 30, false);
      const patterns = detectRecurringPatterns(localMetadata);
      setNudge(deriveNudge(patterns));

      // Prompts — AI if enabled, fallback otherwise
      if (settings.ai.enabled && settings.ai.features.contextualPrompts) {
        const llmMetadata = aggregateMetadata(entries, 30, true);
        const config = createAIServiceConfig(settings);

        // Enrich with Oura health context if enabled (qualitative modifiers only)
        let healthModifiers: string[] = [];
        if (settings.oura.enabled && settings.oura.enrichPrompts) {
          try {
            const ctx = await getTodayContext(false); // use cache only, don't auto-sync here
            if (ctx) {
              healthModifiers = buildHealthSummary(ctx).promptModifiers;
            }
          } catch {
            // Health enrichment is best-effort — never block prompt generation
          }
        }

        const result = await generatePrompts(config, llmMetadata, 3, healthModifiers);
        if (result.success && result.data && result.data.length > 0) {
          setPrompts(result.data);
        } else {
          setPrompts(getFallbackPrompts(3));
        }
      } else {
        setPrompts(getFallbackPrompts(3));
      }
    } catch {
      setPrompts(getFallbackPrompts(3));
    } finally {
      setIsLoading(false);
    }
  }, [isNewEntry, settings]);

  useEffect(() => {
    void load();
  }, [load]);

  const dismissPrompt = useCallback((id: string) => {
    setPrompts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const refresh = useCallback(() => {
    setPrompts([]);
    void load();
  }, [load]);

  return {
    prompts,
    nudge,
    isLoading,
    isAIEnabled: settings.ai.enabled,
    dismissPrompt,
    refresh,
  };
}
