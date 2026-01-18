/**
 * Analytics Service
 *
 * Handles analytics and calendar data fetching from Tauri backend.
 * No encryption needed - mood data is stored unencrypted for analytics.
 */

import { invoke } from '@tauri-apps/api/core';
import { formatDate, getDaysAgo } from './dateUtils';
import type {
  CalendarDayData,
  MoodDistribution,
  StreakStats,
  DayOfWeekStats,
  TrendDataPoint,
  AnalyticsData,
} from '../types/analytics';
import type { MoodLevel } from '../types/journal';

// ============================================================================
// Types matching Rust backend (snake_case)
// ============================================================================

interface MoodDistributionRow {
  mood: number;
  count: number;
}

interface StreakStatsRow {
  current_streak: number;
  longest_streak: number;
  last_entry_date: string | null;
}

interface DayOfWeekStatsRow {
  day_of_week: number;
  day_name: string;
  average_mood: number;
  entry_count: number;
}

interface CalendarDayDataRow {
  date: string;
  average_mood: number;
  entry_count: number;
}

interface DailyStatsRow {
  date: string;
  average_mood: number;
  entry_count: number;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get mood distribution (count per mood level 1-5)
 */
export async function getMoodDistribution(): Promise<MoodDistribution[]> {
  const rows = await invoke<MoodDistributionRow[]>('get_mood_distribution');

  // Calculate total for percentages
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  // Convert to frontend format and fill in missing moods
  const distribution: MoodDistribution[] = [];
  for (let mood = 1; mood <= 5; mood++) {
    const row = rows.find((r) => r.mood === mood);
    distribution.push({
      mood: mood as MoodLevel,
      count: row?.count || 0,
      percentage: total > 0 ? ((row?.count || 0) / total) * 100 : 0,
    });
  }

  return distribution;
}

/**
 * Get streak statistics
 */
export async function getStreakStats(): Promise<StreakStats> {
  const row = await invoke<StreakStatsRow>('get_streak_stats');

  return {
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    lastEntryDate: row.last_entry_date,
  };
}

/**
 * Get day of week statistics
 */
export async function getDayOfWeekStats(): Promise<DayOfWeekStats[]> {
  const rows = await invoke<DayOfWeekStatsRow[]>('get_day_of_week_stats');

  // Fill in missing days with zero values
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const stats: DayOfWeekStats[] = [];

  for (let day = 0; day < 7; day++) {
    const row = rows.find((r) => r.day_of_week === day);
    stats.push({
      dayOfWeek: day,
      dayName: row?.day_name || dayNames[day],
      averageMood: row?.average_mood || 0,
      entryCount: row?.entry_count || 0,
    });
  }

  return stats;
}

/**
 * Get monthly mood data for calendar view
 */
export async function getMonthlyMoodData(
  year: number,
  month: number
): Promise<Map<string, CalendarDayData>> {
  const rows = await invoke<CalendarDayDataRow[]>('get_monthly_mood_data', {
    year,
    month,
  });

  const dataMap = new Map<string, CalendarDayData>();

  for (const row of rows) {
    dataMap.set(row.date, {
      date: row.date,
      averageMood: row.average_mood,
      entryCount: row.entry_count,
    });
  }

  return dataMap;
}

/**
 * Get mood trend data for a period
 */
export async function getMoodTrend(days: number): Promise<TrendDataPoint[]> {
  const endDate = new Date();
  const startDate = getDaysAgo(days);

  const rows = await invoke<DailyStatsRow[]>('get_mood_statistics', {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
  });

  return rows.map((row) => ({
    date: row.date,
    averageMood: row.average_mood,
    entryCount: row.entry_count,
  }));
}

/**
 * Get overall statistics (average mood, total entries)
 */
export async function getOverallStats(): Promise<{ averageMood: number; totalEntries: number }> {
  const [averageMood, totalEntries] = await invoke<[number, number]>('get_overall_statistics');

  return { averageMood, totalEntries };
}

/**
 * Get full analytics data (all data combined)
 */
export async function getFullAnalytics(trendDays: number = 30): Promise<AnalyticsData> {
  // Fetch all data in parallel
  const [overallStats, streakStats, moodDistribution, dayOfWeekStats, trendData] =
    await Promise.all([
      getOverallStats(),
      getStreakStats(),
      getMoodDistribution(),
      getDayOfWeekStats(),
      getMoodTrend(trendDays),
    ]);

  return {
    averageMood: overallStats.averageMood,
    totalEntries: overallStats.totalEntries,
    streakStats,
    moodDistribution,
    dayOfWeekStats,
    trendData,
  };
}
