import { invoke } from '@tauri-apps/api/core';
import { getFullAnalytics, getInsightsMetadata } from './analyticsService';

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('analyticsService', () => {
  describe('getInsightsMetadata', () => {
    // Regression: ISSUE-QA-006 — getInsightsMetadata must call get_insights_metadata and return correct shape
    // Found by /qa on 2026-03-27
    // Report: .gstack/qa-reports/qa-report-feat-db-performance-2026-03-27.md

    it('calls get_insights_metadata with no extra args', async () => {
      mockInvoke.mockResolvedValue({ entries_this_week: 3, total_entries: 42, top_tags: ['work', 'health'] });
      await getInsightsMetadata();
      expect(mockInvoke).toHaveBeenCalledWith('get_insights_metadata');
    });

    it('returns entries_this_week, total_entries, top_tags as-is', async () => {
      const payload = { entries_this_week: 5, total_entries: 100, top_tags: ['gratitude', 'sleep'] };
      mockInvoke.mockResolvedValue(payload);
      const result = await getInsightsMetadata();
      expect(result.entries_this_week).toBe(5);
      expect(result.total_entries).toBe(100);
      expect(result.top_tags).toEqual(['gratitude', 'sleep']);
    });

    it('returns zero counts for empty DB', async () => {
      mockInvoke.mockResolvedValue({ entries_this_week: 0, total_entries: 0, top_tags: [] });
      const result = await getInsightsMetadata();
      expect(result.total_entries).toBe(0);
      expect(result.top_tags).toHaveLength(0);
    });
  });

  describe('getFullAnalytics', () => {
    // Regression: ISSUE-QA-007 — getFullAnalytics bundle must map all fields to AnalyticsData shape
    // Found by /qa on 2026-03-27
    // Report: .gstack/qa-reports/qa-report-feat-db-performance-2026-03-27.md

    const mockBundle = {
      average_mood: 3.7,
      total_entries: 50,
      streak_stats: { current_streak: 5, longest_streak: 14, last_entry_date: '2024-06-15' },
      mood_distribution: [
        { mood: 1, count: 2 },
        { mood: 2, count: 5 },
        { mood: 3, count: 15 },
        { mood: 4, count: 20 },
        { mood: 5, count: 8 },
      ],
      day_of_week_stats: [
        { day_of_week: 1, day_name: 'Monday', average_mood: 4.0, entry_count: 10 },
      ],
      trend_data: [
        { date: '2024-06-14', average_mood: 3.5, entry_count: 2 },
        { date: '2024-06-15', average_mood: 4.0, entry_count: 1 },
      ],
    };

    it('calls get_full_analytics_bundle with trendDays param', async () => {
      mockInvoke.mockResolvedValue(mockBundle);
      await getFullAnalytics(30);
      expect(mockInvoke).toHaveBeenCalledWith('get_full_analytics_bundle', { trendDays: 30 });
    });

    it('uses default trendDays of 30', async () => {
      mockInvoke.mockResolvedValue(mockBundle);
      await getFullAnalytics();
      expect(mockInvoke).toHaveBeenCalledWith('get_full_analytics_bundle', { trendDays: 30 });
    });

    it('maps averageMood and totalEntries correctly', async () => {
      mockInvoke.mockResolvedValue(mockBundle);
      const result = await getFullAnalytics(30);
      expect(result.averageMood).toBe(3.7);
      expect(result.totalEntries).toBe(50);
    });

    it('maps streakStats correctly', async () => {
      mockInvoke.mockResolvedValue(mockBundle);
      const result = await getFullAnalytics(30);
      expect(result.streakStats.currentStreak).toBe(5);
      expect(result.streakStats.longestStreak).toBe(14);
      expect(result.streakStats.lastEntryDate).toBe('2024-06-15');
    });

    it('moodDistribution fills all 5 mood levels (missing levels get count 0)', async () => {
      mockInvoke.mockResolvedValue({ ...mockBundle, mood_distribution: [{ mood: 3, count: 10 }] });
      const result = await getFullAnalytics(30);
      expect(result.moodDistribution).toHaveLength(5);
      expect(result.moodDistribution[0].count).toBe(0); // mood 1 missing → 0
      expect(result.moodDistribution[2].count).toBe(10); // mood 3 present
    });

    it('moodDistribution calculates percentages from total', async () => {
      mockInvoke.mockResolvedValue(mockBundle);
      const result = await getFullAnalytics(30);
      const total = 2 + 5 + 15 + 20 + 8; // 50
      const mood4 = result.moodDistribution.find((d) => d.mood === 4)!;
      expect(mood4.percentage).toBeCloseTo((20 / total) * 100);
    });

    it('dayOfWeekStats fills all 7 days (missing days get 0 entryCount)', async () => {
      mockInvoke.mockResolvedValue(mockBundle); // only Monday provided
      const result = await getFullAnalytics(30);
      expect(result.dayOfWeekStats).toHaveLength(7);
      const sunday = result.dayOfWeekStats[0];
      expect(sunday.dayOfWeek).toBe(0);
      expect(sunday.dayName).toBe('Sunday');
      expect(sunday.entryCount).toBe(0);
    });

    it('trendData maps date, averageMood, entryCount', async () => {
      mockInvoke.mockResolvedValue(mockBundle);
      const result = await getFullAnalytics(30);
      expect(result.trendData).toHaveLength(2);
      expect(result.trendData[0]).toEqual({ date: '2024-06-14', averageMood: 3.5, entryCount: 2 });
    });

    it('empty DB returns zeroed AnalyticsData', async () => {
      mockInvoke.mockResolvedValue({
        average_mood: 0,
        total_entries: 0,
        streak_stats: { current_streak: 0, longest_streak: 0, last_entry_date: null },
        mood_distribution: [],
        day_of_week_stats: [],
        trend_data: [],
      });
      const result = await getFullAnalytics(30);
      expect(result.totalEntries).toBe(0);
      expect(result.moodDistribution.every((d) => d.count === 0)).toBe(true);
      expect(result.trendData).toHaveLength(0);
    });
  });
});
