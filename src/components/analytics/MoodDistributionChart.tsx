/**
 * MoodDistributionChart - Horizontal bar chart showing mood distribution
 */

import { MOOD_OPTIONS } from '../../types/journal';
import type { MoodDistribution } from '../../types/analytics';

interface MoodDistributionChartProps {
  data: MoodDistribution[];
  isLoading?: boolean;
}

export function MoodDistributionChart({ data, isLoading = false }: MoodDistributionChartProps) {
  const maxPercentage = Math.max(...data.map((d) => d.percentage), 1);

  if (isLoading) {
    return (
      <div className="card p-4">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-4">
          Mood Distribution
        </h3>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-6 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
              <div className="flex-1 h-6 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const hasData = data.some((d) => d.count > 0);

  return (
    <div className="card p-4">
      <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-4">
        Mood Distribution
      </h3>

      {!hasData ? (
        <div className="text-center py-8 text-slate-500 dark:text-slate-400">
          <p>No mood data yet</p>
          <p className="text-xs mt-1">Start tracking to see your distribution</p>
        </div>
      ) : (
        <div className="space-y-3">
          {MOOD_OPTIONS.slice().reverse().map((option) => {
            const moodData = data.find((d) => d.mood === option.level);
            const percentage = moodData?.percentage || 0;
            const count = moodData?.count || 0;
            const barWidth = (percentage / maxPercentage) * 100;

            return (
              <div key={option.level} className="flex items-center gap-3">
                {/* Emoji and label */}
                <div className="flex items-center gap-2 w-24 flex-shrink-0">
                  <span className="text-lg" role="img" aria-label={option.label}>
                    {option.emoji}
                  </span>
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    {option.label}
                  </span>
                </div>

                {/* Bar */}
                <div className="flex-1 h-6 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${option.color} transition-all duration-500 ease-out rounded-full animate-bar-grow origin-left`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>

                {/* Count and percentage */}
                <div className="w-16 text-right flex-shrink-0">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {count}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
                    ({percentage.toFixed(0)}%)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
