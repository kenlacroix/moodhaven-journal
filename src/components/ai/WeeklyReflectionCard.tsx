/**
 * WeeklyReflectionCard
 *
 * Shows the AI-generated weekly summary: highlights, reflection prompts,
 * and a gentle suggestion for the coming week.
 * Only shown when AI is enabled and a reflection is available.
 */

import { useState } from 'react';
import type { WeeklyReflection } from '../../types/ai';

interface WeeklyReflectionCardProps {
  reflection: WeeklyReflection | null;
  isLoading: boolean;
  onUsePrompt?: (text: string) => void;
}

export function WeeklyReflectionCard({
  reflection,
  isLoading,
  onUsePrompt,
}: WeeklyReflectionCardProps) {
  const [expandedPrompt, setExpandedPrompt] = useState<number | null>(null);

  if (isLoading && !reflection) {
    return (
      <div className="rounded-2xl border border-violet-100 dark:border-violet-900/40 bg-violet-50 dark:bg-violet-950/20 p-6 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-violet-200 dark:bg-violet-800 rounded-lg" />
          <div className="h-5 w-40 bg-violet-200 dark:bg-violet-800 rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-4 bg-violet-200 dark:bg-violet-800 rounded w-full" />
          <div className="h-4 bg-violet-200 dark:bg-violet-800 rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (!reflection) return null;

  const moodTrendEmoji = reflection.summary.moodTrend === 'up' ? '📈' : reflection.summary.moodTrend === 'down' ? '📉' : '➡️';

  return (
    <div className="rounded-2xl border border-violet-100 dark:border-violet-900/40 bg-violet-50/50 dark:bg-violet-950/10 overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-violet-100 dark:border-violet-900/30">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
            <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">Weekly Reflection</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {reflection.weekStart} – {reflection.weekEnd}
            </p>
          </div>
          <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400">
            AI
          </span>
        </div>

        {/* Mini stats */}
        <div className="flex gap-4 mt-3 text-sm">
          <div>
            <span className="text-slate-500 dark:text-slate-400">Avg mood </span>
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {reflection.summary.moodAverage.toFixed(1)} {moodTrendEmoji}
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">Entries </span>
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {reflection.summary.entryCount}
            </span>
          </div>
        </div>
      </div>

      {/* Highlights */}
      {reflection.highlights.length > 0 && (
        <div className="px-6 py-4 border-b border-violet-100 dark:border-violet-900/30">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
            Highlights
          </p>
          <ul className="space-y-2">
            {reflection.highlights.map((highlight, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                <span className="text-violet-500 mt-0.5 flex-shrink-0">✦</span>
                {highlight}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Reflection prompts */}
      {reflection.reflectionPrompts.length > 0 && (
        <div className="px-6 py-4 border-b border-violet-100 dark:border-violet-900/30">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
            Reflect on this
          </p>
          <div className="space-y-2">
            {reflection.reflectionPrompts.map((prompt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setExpandedPrompt(expandedPrompt === i ? null : i);
                }}
                className="w-full text-left"
              >
                <div className={`px-4 py-3 rounded-xl border text-sm transition-colors ${
                  expandedPrompt === i
                    ? 'bg-violet-100 dark:bg-violet-900/30 border-violet-200 dark:border-violet-800 text-violet-800 dark:text-violet-200'
                    : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-violet-200 dark:hover:border-violet-800'
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <span>{prompt}</span>
                    {onUsePrompt && expandedPrompt === i && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUsePrompt(prompt);
                        }}
                        className="flex-shrink-0 text-xs px-2 py-1 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
                      >
                        Write
                      </button>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Focus suggestion */}
      {reflection.focusSuggestion && (
        <div className="px-6 py-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
            This week
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-300 italic">
            "{reflection.focusSuggestion}"
          </p>
        </div>
      )}
    </div>
  );
}
