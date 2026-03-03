/**
 * HealthContextBadge
 *
 * Shown in the WritingView when Oura is connected and data available.
 * Displays today's health context in a calm, non-clinical way.
 */

import type { OuraHealthSummary } from '../../types/oura';

interface HealthContextBadgeProps {
  summary: OuraHealthSummary;
  onRefresh?: () => void;
  isSyncing?: boolean;
}

const SENTIMENT_STYLES = {
  good:    'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800',
  neutral: 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-slate-100 dark:border-slate-700',
  low:     'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-800',
};

export function HealthContextBadge({ summary, onRefresh, isSyncing }: HealthContextBadgeProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Oura ring icon + headline */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
        </svg>
        <span>{summary.headline}</span>
      </div>

      {/* Individual metric badges */}
      {summary.badges.map((badge) => (
        <span
          key={badge.label}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${SENTIMENT_STYLES[badge.sentiment]}`}
        >
          <span>{badge.icon}</span>
          <span className="font-medium">{badge.label}:</span>
          <span>{badge.value}</span>
        </span>
      ))}

      {/* Refresh button */}
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={isSyncing}
          title="Refresh health data"
          className="text-slate-300 dark:text-slate-600 hover:text-slate-400 dark:hover:text-slate-500 transition-colors disabled:opacity-50"
        >
          <svg
            className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        </button>
      )}
    </div>
  );
}
