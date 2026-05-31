/**
 * useAIInsights Hook
 *
 * Provides AI-powered insights and prompts based on journal patterns.
 * Privacy-first: extracts metadata locally, only sends anonymous data to AI.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useJournal } from './useJournal';
import { useSettingsStore } from '../stores/settingsStore';
import { aggregateMetadata } from '../lib/utils/metadataExtractor';
import {
  createAIServiceConfig,
  generatePrompts,
  generateInsights,
  generateWeeklyReflection,
  detectRecurringPatterns,
  getFallbackPrompts,
} from '../lib/services/aiService';
import type {
  AggregatedMetadata,
  AIPrompt,
  WellnessInsight,
  WeeklyReflection,
  RecurringPattern,
} from '../types/ai';
import { logger } from '../lib/services/logger';

interface UseAIInsightsReturn {
  // Metadata (always available, computed locally)
  metadata: AggregatedMetadata | null;
  patterns: RecurringPattern[];

  // AI-generated content (requires AI enabled)
  prompts: AIPrompt[];
  insights: WellnessInsight[];
  weeklyReflection: WeeklyReflection | null;

  // State
  isLoading: boolean;
  isAIEnabled: boolean;
  error: string | null;

  // Actions
  refreshPrompts: () => Promise<void>;
  refreshInsights: () => Promise<void>;
  refreshWeeklyReflection: () => Promise<void>;
  dismissPrompt: (id: string) => void;
  dismissInsight: (id: string) => void;
}

export function useAIInsights(): UseAIInsightsReturn {
  const { entries } = useJournal();
  const settings = useSettingsStore((s) => s.settings);

  const [prompts, setPrompts] = useState<AIPrompt[]>([]);
  const [insights, setInsights] = useState<WellnessInsight[]>([]);
  const [weeklyReflection, setWeeklyReflection] = useState<WeeklyReflection | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissedPrompts, setDismissedPrompts] = useState<Set<string>>(new Set());
  const [dismissedInsights, setDismissedInsights] = useState<Set<string>>(new Set());

  // Check if AI is enabled and configured
  const isAIEnabled = useMemo(() => {
    if (!settings.ai.enabled) return false;
    if (!settings.ai.consent.agreedToTerms) return false;

    if (settings.ai.provider === 'openai') {
      return !!settings.ai.openai.apiKey;
    }
    if (settings.ai.provider === 'local') {
      return !!settings.ai.localAI.endpoint;
    }
    return false;
  }, [settings.ai]);

  // Extract metadata locally (always runs, no AI needed)
  const metadata = useMemo(() => {
    if (entries.length === 0) return null;
    return aggregateMetadata(entries, 30);
  }, [entries]);

  // Detect patterns locally (always runs, no AI needed)
  const patterns = useMemo(() => {
    if (!metadata) return [];
    return detectRecurringPatterns(metadata);
  }, [metadata]);

  // Get AI service config
  const aiConfig = useMemo(() => createAIServiceConfig(settings), [settings]);

  // Refresh prompts
  const refreshPrompts = useCallback(async () => {
    if (!metadata) return;

    setIsLoading(true);
    setError(null);

    try {
      if (isAIEnabled && settings.ai.features.contextualPrompts) {
        const result = await generatePrompts(aiConfig, metadata, 3);
        if (result.success && result.data) {
          setPrompts(result.data);
        } else {
          // Fall back to static prompts
          setPrompts(getFallbackPrompts(3));
          if (result.error) {
            logger.warn('AI prompt generation failed, using fallbacks:', { error: String(result.error) });
          }
        }
      } else {
        // Use fallback prompts when AI is disabled
        setPrompts(getFallbackPrompts(3));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate prompts');
      setPrompts(getFallbackPrompts(3));
    } finally {
      setIsLoading(false);
    }
  }, [metadata, isAIEnabled, aiConfig, settings.ai.features.contextualPrompts]);

  // Refresh insights
  const refreshInsights = useCallback(async () => {
    if (!metadata || !isAIEnabled || !settings.ai.features.wellnessInsights) {
      setInsights([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await generateInsights(aiConfig, metadata);
      if (result.success && result.data) {
        setInsights(result.data);
      } else {
        setError(result.error || 'Failed to generate insights');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate insights');
    } finally {
      setIsLoading(false);
    }
  }, [metadata, isAIEnabled, aiConfig, settings.ai.features.wellnessInsights]);

  // Refresh weekly reflection
  const refreshWeeklyReflection = useCallback(async () => {
    if (!metadata || !isAIEnabled || !settings.ai.features.weeklyReflections) {
      setWeeklyReflection(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const now = new Date();
      const weekEnd = now.toISOString().split('T')[0];
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const result = await generateWeeklyReflection(aiConfig, metadata, weekStart, weekEnd);
      if (result.success && result.data) {
        setWeeklyReflection(result.data);
      } else {
        setError(result.error || 'Failed to generate reflection');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate reflection');
    } finally {
      setIsLoading(false);
    }
  }, [metadata, isAIEnabled, aiConfig, settings.ai.features.weeklyReflections]);

  // Dismiss handlers
  const dismissPrompt = useCallback((id: string) => {
    setDismissedPrompts((prev) => new Set([...prev, id]));
  }, []);

  const dismissInsight = useCallback((id: string) => {
    setDismissedInsights((prev) => new Set([...prev, id]));
  }, []);

  // Auto-load prompts when journal data changes
  useEffect(() => {
    if (metadata && settings.journal.showPrompts) {
      refreshPrompts();
    }
  }, [metadata?.totalEntries, settings.journal.showPrompts]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional: only re-trigger on entry count change

  // Filter out dismissed items
  const visiblePrompts = useMemo(
    () => prompts.filter((p) => !dismissedPrompts.has(p.id)),
    [prompts, dismissedPrompts]
  );

  const visibleInsights = useMemo(
    () => insights.filter((i) => !dismissedInsights.has(i.id)),
    [insights, dismissedInsights]
  );

  return {
    metadata,
    patterns,
    prompts: visiblePrompts,
    insights: visibleInsights,
    weeklyReflection,
    isLoading,
    isAIEnabled,
    error,
    refreshPrompts,
    refreshInsights,
    refreshWeeklyReflection,
    dismissPrompt,
    dismissInsight,
  };
}
