/**
 * SentimentOverview - Donut chart showing sentiment breakdown (offline)
 *
 * Displays the distribution of positive, negative, neutral, and mixed
 * sentiments across journal entries.
 */

import type { AggregatedMetadata } from '../../types/ai';

interface SentimentOverviewProps {
  sentimentBreakdown: AggregatedMetadata['sentimentBreakdown'];
  isLoading?: boolean;
}

const SENTIMENT_CONFIG = {
  positive: {
    label: 'Positive',
    color: '#10b981', // emerald-500
    bgColor: 'bg-emerald-500',
    lightBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    emoji: '😊',
  },
  negative: {
    label: 'Challenging',
    color: '#f43f5e', // rose-500
    bgColor: 'bg-rose-500',
    lightBg: 'bg-rose-100 dark:bg-rose-900/30',
    emoji: '😔',
  },
  neutral: {
    label: 'Neutral',
    color: '#94a3b8', // slate-400
    bgColor: 'bg-slate-400',
    lightBg: 'bg-slate-100 dark:bg-slate-700',
    emoji: '😐',
  },
  mixed: {
    label: 'Mixed',
    color: '#a78bfa', // violet-400
    bgColor: 'bg-violet-400',
    lightBg: 'bg-violet-100 dark:bg-violet-900/30',
    emoji: '🤔',
  },
};

export function SentimentOverview({ sentimentBreakdown, isLoading }: SentimentOverviewProps) {
  const total = sentimentBreakdown.positive +
    sentimentBreakdown.negative +
    sentimentBreakdown.neutral +
    sentimentBreakdown.mixed;

  // Calculate percentages for donut chart
  const segments = [
    { key: 'positive' as const, value: sentimentBreakdown.positive },
    { key: 'negative' as const, value: sentimentBreakdown.negative },
    { key: 'neutral' as const, value: sentimentBreakdown.neutral },
    { key: 'mixed' as const, value: sentimentBreakdown.mixed },
  ].filter(s => s.value > 0);

  // Calculate stroke-dasharray for donut segments
  const circumference = 2 * Math.PI * 40; // radius = 40
  let offset = 0;
  const donutSegments = segments.map(segment => {
    const percentage = total > 0 ? segment.value / total : 0;
    const dashArray = percentage * circumference;
    const dashOffset = -offset;
    offset += dashArray;
    return {
      ...segment,
      percentage,
      dashArray,
      dashOffset,
      config: SENTIMENT_CONFIG[segment.key],
    };
  });

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
          <div className="flex items-center justify-center">
            <div className="w-32 h-32 bg-slate-200 dark:bg-slate-700 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
          Sentiment Overview
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Add journal entries to see sentiment analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Sentiment Overview
        </h3>
        <span className="text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
          Offline
        </span>
      </div>

      <div className="flex items-center gap-6">
        {/* Donut Chart */}
        <div className="relative w-32 h-32 flex-shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            {/* Background circle */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              className="text-slate-100 dark:text-slate-700"
            />

            {/* Segments */}
            {donutSegments.map(segment => (
              <circle
                key={segment.key}
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke={segment.config.color}
                strokeWidth="12"
                strokeDasharray={`${segment.dashArray} ${circumference}`}
                strokeDashoffset={segment.dashOffset}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            ))}
          </svg>

          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              {Math.round(sentimentBreakdown.positive * 100)}%
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">positive</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-2">
          {donutSegments.map(segment => (
            <div key={segment.key} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${segment.config.bgColor}`} />
              <span className="flex-1 text-sm text-slate-600 dark:text-slate-300">
                {segment.config.emoji} {segment.config.label}
              </span>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {Math.round(segment.percentage * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
