/**
 * useAnalytics Hook
 *
 * React hook for analytics data fetching.
 */

import { useState, useEffect, useCallback } from 'react';
import { getFullAnalytics, getMoodTrend, getYearHeatmap } from '../lib/services/analyticsService';
import type { AnalyticsData, TrendDataPoint, AnalyticsPeriod, HeatmapDay } from '../types/analytics';
import { ANALYTICS_PERIODS } from '../types/analytics';
import { logger } from '../lib/services/logger';

interface UseAnalyticsReturn {
  // Analytics data
  data: AnalyticsData | null;

  // Trend period selection
  trendPeriod: AnalyticsPeriod;
  setTrendPeriod: (period: AnalyticsPeriod) => void;
  trendData: TrendDataPoint[];

  // Year heatmap
  heatmapData: HeatmapDay[];
  isHeatmapLoading: boolean;

  // Loading states
  isLoading: boolean;
  isTrendLoading: boolean;
  error: string | null;

  // Refresh
  refresh: () => Promise<void>;
}

export function useAnalytics(): UseAnalyticsReturn {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [trendPeriod, setTrendPeriodState] = useState<AnalyticsPeriod>(ANALYTICS_PERIODS[1]); // 30 days default
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTrendLoading, setIsTrendLoading] = useState(false);
  const [isHeatmapLoading, setIsHeatmapLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all analytics data
  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const analyticsData = await getFullAnalytics(trendPeriod.days);
      setData(analyticsData);
      setTrendData(analyticsData.trendData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  }, [trendPeriod.days]);

  // Fetch trend data when period changes
  const fetchTrendData = useCallback(async (days: number) => {
    setIsTrendLoading(true);

    try {
      const newTrendData = await getMoodTrend(days);
      setTrendData(newTrendData);
    } catch (err) {
      // Don't set error for trend data - just log
      logger.error('Failed to load trend data:', { error: String(err) });
    } finally {
      setIsTrendLoading(false);
    }
  }, []);

  // Set trend period with data fetch
  const setTrendPeriod = useCallback(
    (period: AnalyticsPeriod) => {
      setTrendPeriodState(period);
      fetchTrendData(period.days);
    },
    [fetchTrendData]
  );

  // Initial fetch
  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Heatmap fetch — once on mount, independent of trend period
  useEffect(() => {
    setIsHeatmapLoading(true);
    getYearHeatmap()
      .then(setHeatmapData)
      .catch(() => {})
      .finally(() => setIsHeatmapLoading(false));
  }, []);

  return {
    data,
    trendPeriod,
    setTrendPeriod,
    trendData,
    heatmapData,
    isHeatmapLoading,
    isLoading,
    isTrendLoading,
    error,
    refresh: fetchAnalytics,
  };
}
