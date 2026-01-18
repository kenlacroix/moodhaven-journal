/**
 * InsightsPanel - Display AI insights and detected patterns
 */

import { InsightCard } from './InsightCard';
import { PatternCard } from './PatternCard';
import type { WellnessInsight, RecurringPattern } from '../../types/ai';

interface InsightsPanelProps {
  insights: WellnessInsight[];
  patterns: RecurringPattern[];
  isLoading: boolean;
  isAIEnabled: boolean;
  onDismissInsight: (id: string) => void;
  onRefresh: () => void;
}

export function InsightsPanel({
  insights,
  patterns,
  isLoading,
  isAIEnabled,
  onDismissInsight,
  onRefresh,
}: InsightsPanelProps) {
  const hasContent = insights.length > 0 || patterns.length > 0;

  if (!hasContent && !isLoading) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <svg className="w-5 h-5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          Insights & Patterns
          {isAIEnabled && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
              AI
            </span>
          )}
        </h3>

        {isAIEnabled && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            aria-label="Refresh insights"
          >
            <svg
              className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InsightSkeleton />
          <InsightSkeleton />
        </div>
      )}

      {/* AI Insights */}
      {!isLoading && insights.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400">
            AI Insights
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onDismiss={onDismissInsight}
              />
            ))}
          </div>
        </div>
      )}

      {/* Patterns (always available offline) */}
      {!isLoading && patterns.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
            Detected Patterns
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
              Offline
            </span>
          </h4>
          <div className="grid grid-cols-1 gap-3">
            {patterns.map((pattern) => (
              <PatternCard key={pattern.id} pattern={pattern} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InsightSkeleton() {
  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="w-24 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full" />
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
      </div>
      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mt-3" />
    </div>
  );
}
