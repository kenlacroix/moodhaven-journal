/**
 * Analytics and Calendar type definitions
 */

import type { MoodLevel } from './journal';

// Calendar day data from backend
export interface CalendarDayData {
  date: string; // YYYY-MM-DD
  averageMood: number;
  entryCount: number;
}

// Mood distribution for analytics
export interface MoodDistribution {
  mood: MoodLevel;
  count: number;
  percentage: number;
}

// Streak statistics
export interface StreakStats {
  currentStreak: number;
  longestStreak: number;
  lastEntryDate: string | null;
}

// Day of week statistics
export interface DayOfWeekStats {
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  dayName: string;
  averageMood: number;
  entryCount: number;
}

// Trend data point for charts
export interface TrendDataPoint {
  date: string;
  averageMood: number;
  entryCount: number;
}

// Analytics period options
export interface AnalyticsPeriod {
  label: string;
  days: number;
  key: '7' | '30' | '90' | 'all';
}

export const ANALYTICS_PERIODS: AnalyticsPeriod[] = [
  { label: '7 Days', days: 7, key: '7' },
  { label: '30 Days', days: 30, key: '30' },
  { label: '90 Days', days: 90, key: '90' },
  { label: 'All Time', days: 0, key: 'all' },
];

// Per-day mood data for the year heatmap
export interface HeatmapDay {
  date: string;
  averageMood: number;
  entryCount: number;
}

// Full analytics data
export interface AnalyticsData {
  averageMood: number;
  totalEntries: number;
  streakStats: StreakStats;
  moodDistribution: MoodDistribution[];
  dayOfWeekStats: DayOfWeekStats[];
  trendData: TrendDataPoint[];
}
