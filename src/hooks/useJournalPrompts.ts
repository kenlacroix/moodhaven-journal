/**
 * useJournalPrompts
 *
 * Loads writing prompts for the PromptDrawer. Fires once on mount for new entries.
 *
 * Returns three separate arrays for the drawer's tab system:
 *   forYouPrompts  — AI-personalised (or smart fallback when AI is off)
 *   generalPrompts — always-local, all categories, never requires AI
 *   healthPrompts  — locally generated from Oura context (empty if no data / < 3 days)
 *
 * Privacy contract:
 * - generalPrompts and healthPrompts are always purely local (no network)
 * - forYouPrompts only calls the AI API with aggregated metadata (Open entries only)
 * - The actual journal text never leaves the device
 */

import { useState, useEffect, useCallback } from 'react';
import { getAllEntries } from '../lib/services/journalService';
import { aggregateMetadata } from '../lib/utils/metadataExtractor';
import {
  generatePrompts,
  getFallbackPrompts,
  buildHealthContextPrompts,
  detectRecurringPatterns,
  createAIServiceConfig,
} from '../lib/services/aiService';
import { useSettingsStore } from '../stores/settingsStore';
import { getHistory } from '../lib/services/ouraService';
import { buildMergedContext } from './useOuraContext';
import type { AIPrompt, RecurringPattern } from '../types/ai';

function deriveNudge(patterns: RecurringPattern[]): string | null {
  const best = patterns
    .filter((p) => p.type === 'positive_habit' || p.type === 'weekly_pattern')
    .sort((a, b) => b.confidence - a.confidence)[0];
  return best?.description ?? null;
}

export function useJournalPrompts(isNewEntry: boolean) {
  const settings = useSettingsStore((s) => s.settings);

  const [forYouPrompts, setForYouPrompts] = useState<AIPrompt[]>([]);
  const [generalPrompts, setGeneralPrompts] = useState<AIPrompt[]>([]);
  const [healthPrompts, setHealthPrompts] = useState<AIPrompt[]>([]);
  const [nudge, setNudge] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasNewPrompts, setHasNewPrompts] = useState(false);

  const load = useCallback(async () => {
    if (!isNewEntry || !settings.journal.showPrompts) return;

    setIsLoading(true);
    try {
      const entries = await getAllEntries();

      // Local pattern nudge (privacy-safe, uses all entries)
      const localMetadata = aggregateMetadata(entries, 30, false);
      const patterns = detectRecurringPatterns(localMetadata);
      setNudge(deriveNudge(patterns));

      // ── General prompts ── always local, all categories, no AI needed
      setGeneralPrompts(getFallbackPrompts(6));

      // ── For You prompts ── AI if enabled, otherwise smart fallback
      if (settings.ai.enabled && settings.ai.features.contextualPrompts) {
        const llmMetadata = aggregateMetadata(entries, 30, true);
        const config = createAIServiceConfig(settings);
        const result = await generatePrompts(config, llmMetadata, 4, []);
        if (result.success && result.data && result.data.length > 0) {
          setForYouPrompts(result.data);
        } else {
          setForYouPrompts(getFallbackPrompts(4));
        }
      } else {
        setForYouPrompts(getFallbackPrompts(4));
      }

      // ── Health prompts ── locally generated from Oura cache (no API call)
      if (settings.oura.enabled && settings.oura.enrichPrompts) {
        try {
          const history = await getHistory(7);
          const merged = buildMergedContext(history);
          if (merged) {
            const hp = buildHealthContextPrompts(merged, history.length);
            setHealthPrompts(hp);
          }
        } catch {
          // Non-critical — health prompts are best-effort
        }
      }

      setHasNewPrompts(true);
    } catch {
      setForYouPrompts(getFallbackPrompts(4));
      setGeneralPrompts(getFallbackPrompts(6));
    } finally {
      setIsLoading(false);
    }
  }, [isNewEntry, settings]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    setForYouPrompts([]);
    setGeneralPrompts([]);
    setHealthPrompts([]);
    setHasNewPrompts(false);
    void load();
  }, [load]);

  return {
    forYouPrompts,
    generalPrompts,
    healthPrompts,
    nudge,
    isLoading,
    isAIEnabled: settings.ai.enabled,
    hasNewPrompts,
    refresh,
  };
}
