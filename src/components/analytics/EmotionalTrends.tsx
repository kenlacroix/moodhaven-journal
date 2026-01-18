/**
 * EmotionalTrends - Visualize emotional indicators over time (offline)
 *
 * Shows which emotions appear most frequently in journal entries,
 * computed entirely from local metadata.
 */

import { useMemo } from 'react';
import type { EmotionalIndicator } from '../../types/ai';

interface EmotionalTrendsProps {
  indicators: EmotionalIndicator[];
  isLoading?: boolean;
}

const INDICATOR_CONFIG: Record<
  EmotionalIndicator,
  { emoji: string; color: string; bgColor: string }
> = {
  anxious: { emoji: '😰', color: 'text-amber-600', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
  stressed: { emoji: '😤', color: 'text-orange-600', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
  hopeful: { emoji: '🌟', color: 'text-sky-600', bgColor: 'bg-sky-100 dark:bg-sky-900/30' },
  grateful: { emoji: '🙏', color: 'text-emerald-600', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30' },
  sad: { emoji: '😢', color: 'text-blue-600', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  happy: { emoji: '😊', color: 'text-yellow-600', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30' },
  angry: { emoji: '😠', color: 'text-red-600', bgColor: 'bg-red-100 dark:bg-red-900/30' },
  calm: { emoji: '😌', color: 'text-teal-600', bgColor: 'bg-teal-100 dark:bg-teal-900/30' },
  overwhelmed: { emoji: '😵', color: 'text-purple-600', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
  motivated: { emoji: '💪', color: 'text-lime-600', bgColor: 'bg-lime-100 dark:bg-lime-900/30' },
  lonely: { emoji: '🥺', color: 'text-indigo-600', bgColor: 'bg-indigo-100 dark:bg-indigo-900/30' },
  loved: { emoji: '🥰', color: 'text-pink-600', bgColor: 'bg-pink-100 dark:bg-pink-900/30' },
  confused: { emoji: '😕', color: 'text-slate-600', bgColor: 'bg-slate-100 dark:bg-slate-800' },
  confident: { emoji: '😎', color: 'text-violet-600', bgColor: 'bg-violet-100 dark:bg-violet-900/30' },
};

export function EmotionalTrends({ indicators, isLoading }: EmotionalTrendsProps) {
  // Count occurrences and calculate percentages
  const indicatorStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const indicator of indicators) {
      counts[indicator] = (counts[indicator] || 0) + 1;
    }

    const total = indicators.length || 1;
    return Object.entries(counts)
      .map(([indicator, count]) => ({
        indicator: indicator as EmotionalIndicator,
        count,
        percentage: (count / total) * 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8); // Top 8
  }, [indicators]);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
          <div className="flex flex-wrap gap-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-8 w-24 bg-slate-200 dark:bg-slate-700 rounded-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (indicatorStats.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
          Emotional Themes
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Add more journal entries to see emotional patterns.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Emotional Themes
        </h3>
        <span className="text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
          Offline
        </span>
      </div>

      {/* Emotion tags */}
      <div className="flex flex-wrap gap-2 mb-4">
        {indicatorStats.map(({ indicator, count }) => {
          const config = INDICATOR_CONFIG[indicator];
          return (
            <div
              key={indicator}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-full
                ${config.bgColor} ${config.color}
                text-sm font-medium capitalize
              `}
            >
              <span>{config.emoji}</span>
              <span>{indicator}</span>
              <span className="text-xs opacity-70">({count})</span>
            </div>
          );
        })}
      </div>

      {/* Bar chart */}
      <div className="space-y-2 mt-4">
        {indicatorStats.slice(0, 5).map(({ indicator, percentage }) => {
          const config = INDICATOR_CONFIG[indicator];
          return (
            <div key={indicator} className="flex items-center gap-3">
              <span className="w-6 text-center">{config.emoji}</span>
              <span className="w-24 text-sm text-slate-600 dark:text-slate-300 capitalize truncate">
                {indicator}
              </span>
              <div className="flex-1 h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${config.bgColor}`}
                  style={{ width: `${Math.max(percentage, 5)}%` }}
                />
              </div>
              <span className="w-12 text-right text-xs text-slate-500 dark:text-slate-400">
                {Math.round(percentage)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
