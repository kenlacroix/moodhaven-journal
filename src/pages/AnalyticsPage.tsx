/**
 * AnalyticsPage - Dashboard showing mood analytics and insights
 */

import { useAnalytics } from '../hooks/useAnalytics';
import {
  StatsSummary,
  MoodDistributionChart,
  MoodTrendChart,
  DayOfWeekPattern,
} from '../components/analytics';

export function AnalyticsPage() {
  const analytics = useAnalytics();

  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Analytics
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Insights into your mood patterns
        </p>
      </div>

      {/* Error message */}
      {analytics.error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl">
          <p className="text-sm text-rose-600 dark:text-rose-400">{analytics.error}</p>
          <button
            type="button"
            onClick={analytics.refresh}
            className="mt-2 text-sm text-rose-600 dark:text-rose-400 underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Stats Summary */}
      <StatsSummary
        averageMood={analytics.data?.averageMood || 0}
        totalEntries={analytics.data?.totalEntries || 0}
        currentStreak={analytics.data?.streakStats.currentStreak || 0}
        longestStreak={analytics.data?.streakStats.longestStreak || 0}
        isLoading={analytics.isLoading}
      />

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mood Trend */}
        <MoodTrendChart
          data={analytics.trendData}
          period={analytics.trendPeriod}
          onPeriodChange={analytics.setTrendPeriod}
          isLoading={analytics.isLoading || analytics.isTrendLoading}
        />

        {/* Mood Distribution */}
        <MoodDistributionChart
          data={analytics.data?.moodDistribution || []}
          isLoading={analytics.isLoading}
        />
      </div>

      {/* Weekly Pattern */}
      <DayOfWeekPattern
        data={analytics.data?.dayOfWeekStats || []}
        isLoading={analytics.isLoading}
      />

      {/* Empty state encouragement */}
      {!analytics.isLoading && analytics.data?.totalEntries === 0 && (
        <div className="text-center py-8">
          <p className="text-slate-500 dark:text-slate-400">
            Start tracking your mood to see analytics and insights.
          </p>
        </div>
      )}
    </div>
  );
}
