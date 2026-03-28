/**
 * useInsights tests
 *
 * Coverage targets (from /qa report, ISSUE-QA coverage audit):
 * - Tier A metadata loaded without decrypt
 * - localStorage streak cache hit (entry count unchanged)
 * - localStorage streak cache miss (stale — triggers full getAllEntries)
 * - AI disabled → no generateInsights call
 * - hasData=false when total_entries=0
 * - [settingsAi] dep isolation
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useInsights } from './useInsights';
import { useSettingsStore } from '../stores/settingsStore';
import { createDefaultSettings } from '../types/settings';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../lib/journalService', () => ({
  getAllEntries: vi.fn(),
  getEntriesByDateRange: vi.fn(),
}));

vi.mock('../lib/metadataExtractor', () => ({
  aggregateMetadataBoth: vi.fn(),
  calculateGratitudeStreak: vi.fn(),
}));

vi.mock('../lib/aiService', () => ({
  generateInsights: vi.fn(),
  generateWeeklyReflection: vi.fn(),
  detectRecurringPatterns: vi.fn(),
  createAIServiceConfig: vi.fn(),
}));

vi.mock('../lib/analyticsService', () => ({
  getInsightsMetadata: vi.fn(),
}));

vi.mock('../lib/dateUtils', () => ({
  getDaysAgo: vi.fn(() => new Date('2024-05-15')),
}));

import { getAllEntries, getEntriesByDateRange } from '../lib/journalService';
import { aggregateMetadataBoth, calculateGratitudeStreak } from '../lib/metadataExtractor';
import { generateInsights, generateWeeklyReflection, detectRecurringPatterns, createAIServiceConfig } from '../lib/aiService';
import { getInsightsMetadata } from '../lib/analyticsService';

const mockGetInsightsMetadata = vi.mocked(getInsightsMetadata);
const mockGetEntriesByDateRange = vi.mocked(getEntriesByDateRange);
const mockGetAllEntries = vi.mocked(getAllEntries);
const mockAggregateMetadataBoth = vi.mocked(aggregateMetadataBoth);
const mockCalculateGratitudeStreak = vi.mocked(calculateGratitudeStreak);
const mockGenerateInsights = vi.mocked(generateInsights);
const mockGenerateWeeklyReflection = vi.mocked(generateWeeklyReflection);
const mockDetectRecurringPatterns = vi.mocked(detectRecurringPatterns);
const mockCreateAIServiceConfig = vi.mocked(createAIServiceConfig);

// ── Defaults ─────────────────────────────────────────────────────────────────

const defaultMeta = { entries_this_week: 3, total_entries: 10, top_tags: ['work', 'health'], last_entry_date: '2024-06-15' };
const defaultLocalMeta = { totalEntries: 8, averageMood: 3.5, topEmotions: [], entryFrequency: 'daily' as const, preferredTime: 'morning' as const, moodTrend: 'stable' as const, recentMoodAverage: 3.5, dominantEmotions: [] };
const defaultAiMeta = { ...defaultLocalMeta, totalEntries: 5 };

function setupDefaultMocks() {
  mockGetInsightsMetadata.mockResolvedValue(defaultMeta);
  mockGetEntriesByDateRange.mockResolvedValue([]);
  mockGetAllEntries.mockResolvedValue([]);
  mockAggregateMetadataBoth.mockReturnValue({ localMeta: defaultLocalMeta, aiMeta: defaultAiMeta });
  mockDetectRecurringPatterns.mockReturnValue([]);
  mockCalculateGratitudeStreak.mockReturnValue({ currentStreak: 5, longestStreak: 14 });
  mockCreateAIServiceConfig.mockReturnValue({ provider: 'none' } as ReturnType<typeof createAIServiceConfig>);
  mockGenerateInsights.mockResolvedValue({ success: false });
  mockGenerateWeeklyReflection.mockResolvedValue({ success: false });
}

// ── Store reset ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useSettingsStore.setState({ settings: createDefaultSettings() });
  setupDefaultMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useInsights', () => {
  describe('Tier A — metadata load', () => {
    it('sets hasData=false and isMetadataReady=true when total_entries=0', async () => {
      // Regression: ISSUE-QA-009 — empty DB must set hasData=false, not stall
      // Found by /qa (coverage audit) on 2026-03-27
      mockGetInsightsMetadata.mockResolvedValue({ entries_this_week: 0, total_entries: 0, top_tags: [], last_entry_date: null });

      const { result } = renderHook(() => useInsights());

      await waitFor(() => expect(result.current.isMetadataReady).toBe(true));
      expect(result.current.hasData).toBe(false);
      // Should NOT call getEntriesByDateRange when there's nothing
      expect(mockGetEntriesByDateRange).not.toHaveBeenCalled();
    });

    it('sets entriesThisWeek and topTags from Tier A metadata', async () => {
      // Regression: ISSUE-QA-010 — Tier A fields must populate before decrypt completes
      // Found by /qa (coverage audit) on 2026-03-27
      const { result } = renderHook(() => useInsights());

      await waitFor(() => expect(result.current.isMetadataReady).toBe(true));
      expect(result.current.entriesThisWeek).toBe(3);
      expect(result.current.topTags).toEqual(['work', 'health']);
    });
  });

  describe('localStorage streak cache', () => {
    it('uses cached streak when entry count matches', async () => {
      // Regression: ISSUE-QA-011 — cache hit must prevent full getAllEntries decrypt
      // Found by /qa (coverage audit) on 2026-03-27
      localStorage.setItem('mb_gratitude_streak_cache', JSON.stringify({
        streak: 7, longestStreak: 21, entryCount: 10, lastEntryDate: '2024-06-15',
      }));

      const { result } = renderHook(() => useInsights());

      await waitFor(() => expect(result.current.isMetadataReady).toBe(true));
      // Should use cache, not recompute
      expect(mockGetAllEntries).not.toHaveBeenCalled();
      expect(result.current.gratitudeStreak).toBe(7);
      expect(result.current.gratitudeLongestStreak).toBe(21);
    });

    it('recomputes streak and updates cache when entry count differs (stale cache)', async () => {
      // Regression: ISSUE-QA-012 — stale cache must trigger fresh decrypt + cache update
      // Found by /qa (coverage audit) on 2026-03-27
      localStorage.setItem('mb_gratitude_streak_cache', JSON.stringify({
        streak: 3, longestStreak: 5, entryCount: 7, // total_entries is 10 → stale
      }));

      const { result } = renderHook(() => useInsights());

      await waitFor(() => !result.current.isLoading);
      expect(mockGetAllEntries).toHaveBeenCalledTimes(1);
      expect(result.current.gratitudeStreak).toBe(5); // from calculateGratitudeStreak mock
      // Cache should be updated
      const updated = JSON.parse(localStorage.getItem('mb_gratitude_streak_cache') ?? '{}');
      expect(updated.entryCount).toBe(10);
    });
  });

  describe('AI features', () => {
    it('does not call generateInsights when AI is disabled', async () => {
      // Regression: ISSUE-QA-013 — disabled AI must not trigger LLM calls
      // Found by /qa (coverage audit) on 2026-03-27
      useSettingsStore.setState({
        settings: { ...createDefaultSettings(), ai: { ...createDefaultSettings().ai, enabled: false } },
      });
      mockGetEntriesByDateRange.mockResolvedValue([{ id: '1' } as Parameters<typeof mockGetEntriesByDateRange>[0] extends never ? never : Awaited<ReturnType<typeof mockGetEntriesByDateRange>>[number]]);

      const { result } = renderHook(() => useInsights());

      await waitFor(() => !result.current.isLoading);
      expect(mockGenerateInsights).not.toHaveBeenCalled();
      expect(mockGenerateWeeklyReflection).not.toHaveBeenCalled();
    });
  });

  describe('return values', () => {
    it('exposes refresh function that re-runs load', async () => {
      const { result } = renderHook(() => useInsights());

      await waitFor(() => expect(result.current.isMetadataReady).toBe(true));
      expect(mockGetInsightsMetadata).toHaveBeenCalledTimes(1);

      await act(async () => { await result.current.refresh(); });
      expect(mockGetInsightsMetadata).toHaveBeenCalledTimes(2);
    });

    it('dismissInsight removes the insight by id', async () => {
      mockGetInsightsMetadata.mockResolvedValue(defaultMeta);
      useSettingsStore.setState({
        settings: {
          ...createDefaultSettings(),
          ai: { ...createDefaultSettings().ai, enabled: true, features: { ...createDefaultSettings().ai.features, wellnessInsights: true } },
        },
      });
      mockGetEntriesByDateRange.mockResolvedValue([{ id: '1' } as Awaited<ReturnType<typeof mockGetEntriesByDateRange>>[number]]);
      mockGenerateInsights.mockResolvedValue({ success: true, data: [{ id: 'i1', type: 'pattern', title: 'test', message: 'msg', priority: 'low' }] });

      const { result } = renderHook(() => useInsights());

      await waitFor(() => result.current.insights.length > 0);
      act(() => result.current.dismissInsight('i1'));
      expect(result.current.insights).toHaveLength(0);
    });
  });
});
