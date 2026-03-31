/**
 * useInsights
 *
 * Orchestrates all AI and local insights for the InsightsView.
 *
 * Privacy contract:
 * - Local patterns always use entries with privacyMode < 2 (Open + Mindful)
 * - LLM calls only use entries with privacyMode === 0 (Open)
 * - The actual journal text never leaves the device
 *
 * Performance:
 * - get_insights_metadata provides entriesThisWeek / topTags / totalEntries immediately (no decrypt)
 * - aggregateMetadata uses only the last 30 days of entries (not all-time)
 * - Gratitude streak uses a localStorage cache keyed by entry count to avoid cold-session decrypt
 * - settings.ai scoped dependency prevents non-AI settings changes from triggering reload
 */

import { useState, useEffect, useCallback } from 'react';
import { getAllEntries, getEntriesByDateRange } from '../lib/services/journalService';
import {
  aggregateMetadataBoth,
  calculateGratitudeStreak,
} from '../lib/utils/metadataExtractor';
import {
  generateInsights,
  generateWeeklyReflection,
  detectRecurringPatterns,
  createAIServiceConfig,
} from '../lib/services/aiService';
import { getInsightsMetadata } from '../lib/services/analyticsService';
import { useSettingsStore } from '../stores/settingsStore';
import { getDaysAgo } from '../lib/utils/dateUtils';
import type { AggregatedMetadata, WellnessInsight, RecurringPattern, WeeklyReflection } from '../types/ai';

const STREAK_CACHE_KEY = 'mb_gratitude_streak_cache';

interface StreakCache {
  streak: number;
  longestStreak: number;
  entryCount: number;
  lastEntryDate: string | null;
}

function loadStreakCache(): StreakCache | null {
  try {
    const raw = localStorage.getItem(STREAK_CACHE_KEY);
    return raw ? (JSON.parse(raw) as StreakCache) : null;
  } catch {
    return null;
  }
}

function saveStreakCache(streak: number, longestStreak: number, entryCount: number, lastEntryDate: string | null): void {
  try {
    localStorage.setItem(
      STREAK_CACHE_KEY,
      JSON.stringify({ streak, longestStreak, entryCount, lastEntryDate })
    );
  } catch {
    // localStorage unavailable — non-fatal
  }
}

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
  const settingsAi = useSettingsStore((s) => s.settings.ai);

  const [localMetadata, setLocalMetadata] = useState<AggregatedMetadata | null>(null);
  const [insights, setInsights] = useState<WellnessInsight[]>([]);
  const [patterns, setPatterns] = useState<RecurringPattern[]>([]);
  const [weeklyReflection, setWeeklyReflection] = useState<WeeklyReflection | null>(null);
  const [gratitudeStreak, setGratitudeStreak] = useState(0);
  const [gratitudeLongestStreak, setGratitudeLongestStreak] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isMetadataReady, setIsMetadataReady] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [entriesThisWeek, setEntriesThisWeek] = useState(0);
  const [topTags, setTopTags] = useState<string[]>([]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setIsMetadataReady(false);
    try {
      // Tier A: lightweight metadata — no decryption, renders immediately
      const meta = await getInsightsMetadata();

      if (meta.total_entries === 0) {
        setHasData(false);
        setIsMetadataReady(true);
        return;
      }

      setHasData(true);
      setEntriesThisWeek(meta.entries_this_week);
      setTopTags(meta.top_tags);
      setIsMetadataReady(true);

      // Gratitude streak: use localStorage cache if entry count AND last entry date match
      const cached = loadStreakCache();
      if (cached && cached.entryCount === meta.total_entries && cached.lastEntryDate === meta.last_entry_date) {
        setGratitudeStreak(cached.streak);
        setGratitudeLongestStreak(cached.longestStreak);
      }

      // Tier B: decrypt last 30 days only for aggregateMetadata
      const startDate = getDaysAgo(30);
      const recentEntries = await getEntriesByDateRange(startDate, new Date());

      if (recentEntries.length > 0) {
        const { localMeta, aiMeta } = aggregateMetadataBoth(recentEntries);
        setLocalMetadata(localMeta);
        setPatterns(detectRecurringPatterns(localMeta));

        if (settingsAi.enabled) {
          const config = createAIServiceConfig(useSettingsStore.getState().settings);
          const insightPromises: Promise<void>[] = [];

          if (settingsAi.features.wellnessInsights) {
            insightPromises.push(
              generateInsights(config, aiMeta).then((result) => {
                if (result.success && result.data) {
                  setInsights(result.data);
                }
              })
            );
          }

          if (settingsAi.features.weeklyReflections) {
            const { weekStart, weekEnd } = getWeekBounds();
            insightPromises.push(
              generateWeeklyReflection(config, aiMeta, weekStart, weekEnd).then((result) => {
                if (result.success && result.data) {
                  setWeeklyReflection(result.data);
                }
              })
            );
          }

          await Promise.allSettled(insightPromises);
        }
      }

      // Gratitude streak: recompute if cache is stale
      if (!cached || cached.entryCount !== meta.total_entries || cached.lastEntryDate !== meta.last_entry_date) {
        const allEntries = await getAllEntries();
        const gs = calculateGratitudeStreak(allEntries);
        setGratitudeStreak(gs.currentStreak);
        setGratitudeLongestStreak(gs.longestStreak);
        saveStreakCache(gs.currentStreak, gs.longestStreak, meta.total_entries, meta.last_entry_date);
      }
    } catch {
      // Silently fall back — local patterns are still shown
      setIsMetadataReady(true);
    } finally {
      setIsLoading(false);
    }
  }, [settingsAi]);

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
    isMetadataReady,
    hasData,
    isAIEnabled: settingsAi.enabled,
    dismissInsight,
    refresh: load,
  };
}
