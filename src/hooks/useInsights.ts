/**
 * useInsights
 *
 * Orchestrates all AI and local insights for the InsightsView.
 *
 * Privacy contract:
 * - Local patterns always use entries with privacyMode < 2 (Open + Mindful)
 * - LLM calls only use entries with privacyMode === 0 (Open)
 * - The actual journal text never leaves the device
 */

import { useState, useEffect, useCallback } from 'react';
import { getAllEntries } from '../lib/journalService';
import {
  aggregateMetadata,
  calculateGratitudeStreak,
} from '../lib/metadataExtractor';
import {
  generateInsights,
  generateWeeklyReflection,
  detectRecurringPatterns,
  createAIServiceConfig,
} from '../lib/aiService';
import { useSettingsStore } from '../stores/settingsStore';
import type { AggregatedMetadata, WellnessInsight, RecurringPattern, WeeklyReflection } from '../types/ai';

function getWeekBounds(): { weekStart: string; weekEnd: string } {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    weekStart: monday.toISOString().split('T')[0],
    weekEnd: sunday.toISOString().split('T')[0],
  };
}

export function useInsights() {
  const settings = useSettingsStore((s) => s.settings);

  const [localMetadata, setLocalMetadata] = useState<AggregatedMetadata | null>(null);
  const [insights, setInsights] = useState<WellnessInsight[]>([]);
  const [patterns, setPatterns] = useState<RecurringPattern[]>([]);
  const [weeklyReflection, setWeeklyReflection] = useState<WeeklyReflection | null>(null);
  const [gratitudeStreak, setGratitudeStreak] = useState(0);
  const [gratitudeLongestStreak, setGratitudeLongestStreak] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [entriesThisWeek, setEntriesThisWeek] = useState(0);
  const [topTags, setTopTags] = useState<string[]>([]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const entries = await getAllEntries();

      if (entries.length === 0) {
        setHasData(false);
        return;
      }

      setHasData(true);

      // Entries this week
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay()); // Sunday
      weekStart.setHours(0, 0, 0, 0);
      setEntriesThisWeek(
        entries.filter((e) => new Date(e.created_at) >= weekStart).length
      );

      // Top tags across all entries
      const tagCounts = new Map<string, number>();
      for (const e of entries) {
        for (const t of e.tags) {
          tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
        }
      }
      setTopTags(
        Array.from(tagCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([t]) => t)
      );

      // Local analysis: Open + Mindful entries
      const meta = aggregateMetadata(entries, 30, false);
      setLocalMetadata(meta);
      setPatterns(detectRecurringPatterns(meta));

      // Gratitude streak (local)
      const gs = calculateGratitudeStreak(entries);
      setGratitudeStreak(gs.currentStreak);
      setGratitudeLongestStreak(gs.longestStreak);

      // AI features: Open entries only
      if (settings.ai.enabled) {
        const llmMeta = aggregateMetadata(entries, 30, true);
        const config = createAIServiceConfig(settings);

        const insightPromises: Promise<void>[] = [];

        if (settings.ai.features.wellnessInsights) {
          insightPromises.push(
            generateInsights(config, llmMeta).then((result) => {
              if (result.success && result.data) {
                setInsights(result.data);
              }
            })
          );
        }

        if (settings.ai.features.weeklyReflections) {
          const { weekStart, weekEnd } = getWeekBounds();
          insightPromises.push(
            generateWeeklyReflection(config, llmMeta, weekStart, weekEnd).then((result) => {
              if (result.success && result.data) {
                setWeeklyReflection(result.data);
              }
            })
          );
        }

        await Promise.allSettled(insightPromises);
      }
    } catch {
      // Silently fall back — local patterns are still shown
    } finally {
      setIsLoading(false);
    }
  }, [settings]);

  useEffect(() => {
    void load();
  }, [load]);

  const dismissInsight = useCallback((id: string) => {
    setInsights((prev) => prev.filter((i) => i.id !== id));
  }, []);

  return {
    localMetadata,
    insights,
    patterns,
    weeklyReflection,
    gratitudeStreak,
    gratitudeLongestStreak,
    entriesThisWeek,
    topTags,
    isLoading,
    hasData,
    isAIEnabled: settings.ai.enabled,
    dismissInsight,
    refresh: load,
  };
}
