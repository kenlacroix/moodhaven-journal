/**
 * InsightsView - Mood patterns, AI insights, and weekly reflections
 *
 * Architecture:
 * - Local features (mood weather, patterns, gratitude streak) always visible
 * - AI features (wellness insights, weekly reflection) shown when AI enabled
 * - Per the UX spec: AI content lives ONLY here, never interrupts writing
 */

import { useInsights } from '../hooks/useInsights';
import { MoodWeatherCard } from '../components/ai/MoodWeatherCard';
import { GratitudeStreakCard } from '../components/ai/GratitudeStreakCard';
import { InsightsPanel } from '../components/ai/InsightsPanel';
import { WeeklyReflectionCard } from '../components/ai/WeeklyReflectionCard';

export function InsightsView() {
  const {
    localMetadata,
    insights,
    patterns,
    weeklyReflection,
    gratitudeStreak,
    gratitudeLongestStreak,
    isLoading,
    hasData,
    isAIEnabled,
    dismissInsight,
    refresh,
  } = useInsights();

  // Empty state
  if (!isLoading && !hasData) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-3xl">
            🌱
          </div>
          <h2 className="text-lg font-medium text-slate-800 dark:text-slate-100 mb-2">
            No entries yet
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Start journaling to see your mood patterns and insights here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-1">
            Insights
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {isAIEnabled
              ? 'Your patterns and AI-powered observations'
              : 'Your mood patterns — all analysis is local'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={isLoading}
          className="p-2 rounded-lg text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
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
      </div>

      {/* Mood Weather — local, always visible */}
      {localMetadata && !isLoading && (
        <MoodWeatherCard metadata={localMetadata} />
      )}

      {/* Loading skeleton for weather card */}
      {isLoading && !localMetadata && (
        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-6 animate-pulse h-44" />
      )}

      {/* Gratitude Streak — local, always visible */}
      {gratitudeStreak > 0 && (
        <GratitudeStreakCard
          currentStreak={gratitudeStreak}
          longestStreak={gratitudeLongestStreak}
        />
      )}

      {/* Insights & Patterns panel (AI + local patterns) */}
      <InsightsPanel
        insights={insights}
        patterns={patterns}
        isLoading={isLoading}
        isAIEnabled={isAIEnabled}
        onDismissInsight={dismissInsight}
        onRefresh={refresh}
      />

      {/* Weekly Reflection — AI only */}
      {isAIEnabled && (
        <WeeklyReflectionCard
          reflection={weeklyReflection}
          isLoading={isLoading}
        />
      )}

      {/* AI disabled — gentle call to action */}
      {!isAIEnabled && (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            Unlock AI-powered insights
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Enable AI in Settings to get personalised wellness insights and weekly reflections.
            Only anonymised patterns are ever sent — never your actual words.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Settings → AI → Enable AI Features
          </p>
        </div>
      )}

      {/* Privacy footer */}
      <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 pb-2">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
        <span>
          {isAIEnabled
            ? 'Only anonymised patterns are shared with AI — your words never leave this device'
            : 'All analysis runs locally on your device'}
        </span>
      </div>
    </div>
  );
}
