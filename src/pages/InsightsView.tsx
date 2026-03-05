/**
 * InsightsView - Merged Insights + Analytics view
 *
 * Sections (top to bottom):
 *   ✦ AI Insights  [AI badge]
 *   ─────────────────────────────
 *   MoodWeatherCard
 *   GratitudeStreakCard (if streak > 0)
 *   InsightsPanel (patterns + AI observations)
 *   WeeklyReflectionCard (if AI enabled)
 *   ── If AI disabled: CTA card with link to Settings → AI ──
 *
 *   📊 Local Analytics  [Computed on-device badge]
 *   ─────────────────────────────
 *   StatsSummary
 *   Mood Trend + Mood Distribution
 *   Sentiment Overview + Journaling Habits
 *   Emotional Trends + Day of Week
 */

import { useInsights } from '../hooks/useInsights';
import { useAnalytics } from '../hooks/useAnalytics';
import { useAIInsights } from '../hooks/useAIInsights';
import { MoodWeatherCard } from '../components/ai/MoodWeatherCard';
import { GratitudeStreakCard } from '../components/ai/GratitudeStreakCard';
import { InsightsPanel } from '../components/ai/InsightsPanel';
import { WeeklyReflectionCard } from '../components/ai/WeeklyReflectionCard';
import {
  StatsSummary,
  MoodDistributionChart,
  MoodTrendChart,
  DayOfWeekPattern,
  EmotionalTrends,
  SentimentOverview,
  JournalingHabits,
} from '../components/analytics';

// ── Section divider ────────────────────────────────────────────────────────────

function SectionDivider({ label, badge }: { label: string; badge: string }) {
  return (
    <div className="flex items-center gap-2 my-5">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium">
        {badge}
      </span>
      <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface InsightsViewProps {
  onNavigateToSettings?: (section?: 'ai') => void;
}

export function InsightsView({ onNavigateToSettings }: InsightsViewProps) {
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

  const analytics = useAnalytics();
  const { metadata: aiMetadata, isLoading: isMetadataLoading } = useAIInsights();

  const allIndicators = aiMetadata?.emotionalProfile.dominantIndicators || [];

  // Empty state (no entries at all)
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
    <div className="max-w-2xl mx-auto px-6 py-8">

      {/* ── AI Insights section ── */}
      <SectionDivider label="✦ AI Insights" badge="Personalised" />

      {/* Header row */}
      <div className="flex items-start justify-between mb-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {isAIEnabled
            ? 'AI-powered observations based on your mood patterns'
            : 'Your mood patterns — all analysis runs locally'}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={isLoading}
          className="p-2 rounded-lg text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 flex-shrink-0 ml-2"
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
        <div className="mb-4">
          <MoodWeatherCard metadata={localMetadata} />
        </div>
      )}
      {isLoading && !localMetadata && (
        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-6 animate-pulse h-44 mb-4" />
      )}

      {/* Gratitude Streak — local, always visible */}
      {gratitudeStreak > 0 && (
        <div className="mb-4">
          <GratitudeStreakCard
            currentStreak={gratitudeStreak}
            longestStreak={gratitudeLongestStreak}
          />
        </div>
      )}

      {/* Insights & Patterns panel */}
      <div className="mb-4">
        <InsightsPanel
          insights={insights}
          patterns={patterns}
          isLoading={isLoading}
          isAIEnabled={isAIEnabled}
          onDismissInsight={dismissInsight}
          onRefresh={refresh}
        />
      </div>

      {/* Weekly Reflection — AI only */}
      {isAIEnabled && (
        <div className="mb-4">
          <WeeklyReflectionCard
            reflection={weeklyReflection}
            isLoading={isLoading}
          />
        </div>
      )}

      {/* AI disabled — CTA card */}
      {!isAIEnabled && (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center mb-4">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            Unlock AI Insights
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 max-w-xs mx-auto">
            Enable AI to get personalised prompts, wellness observations and weekly reflections based
            on your anonymised mood patterns.
          </p>
          <button
            type="button"
            onClick={() => onNavigateToSettings?.('ai')}
            className="text-xs font-medium text-violet-500 dark:text-violet-400 hover:text-violet-600 dark:hover:text-violet-300 transition-colors"
          >
            Enable in Settings → AI
          </button>
        </div>
      )}

      {/* Privacy note */}
      <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 mb-2">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
        <span>
          {isAIEnabled
            ? 'Only anonymised patterns are shared with AI — your words never leave this device'
            : 'All analysis runs locally on your device'}
        </span>
      </div>

      {/* ── Local Analytics section ── */}
      <SectionDivider label="📊 Local Analytics" badge="Computed on-device" />

      {/* Error */}
      {analytics.error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl mb-4">
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
      <div className="mb-6">
        <StatsSummary
          averageMood={analytics.data?.averageMood || 0}
          totalEntries={analytics.data?.totalEntries || 0}
          currentStreak={analytics.data?.streakStats.currentStreak || 0}
          longestStreak={analytics.data?.streakStats.longestStreak || 0}
          isLoading={analytics.isLoading}
        />
      </div>

      {/* Row 1: Mood Trend + Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <MoodTrendChart
          data={analytics.trendData}
          period={analytics.trendPeriod}
          onPeriodChange={analytics.setTrendPeriod}
          isLoading={analytics.isLoading || analytics.isTrendLoading}
        />
        <MoodDistributionChart
          data={analytics.data?.moodDistribution || []}
          isLoading={analytics.isLoading}
        />
      </div>

      {/* Row 2: Sentiment + Habits */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <SentimentOverview
          sentimentBreakdown={aiMetadata?.sentimentBreakdown || {
            positive: 0,
            negative: 0,
            neutral: 0,
            mixed: 0,
          }}
          isLoading={isMetadataLoading}
        />
        <JournalingHabits
          patterns={aiMetadata?.patterns || {
            bestDayOfWeek: 'Unknown',
            worstDayOfWeek: 'Unknown',
            bestTimeOfDay: 'evening',
            frequency: 'rare',
            currentStreak: 0,
            longestStreak: 0,
          }}
          emotionalProfile={aiMetadata?.emotionalProfile || {
            dominantIndicators: [],
            recentIndicators: [],
            gratitudeFrequency: 0,
            goalsFrequency: 0,
          }}
          isLoading={isMetadataLoading}
        />
      </div>

      {/* Emotional Themes */}
      <div className="mb-6">
        <EmotionalTrends
          indicators={allIndicators}
          isLoading={isMetadataLoading}
        />
      </div>

      {/* Day of Week */}
      <div className="mb-6">
        <DayOfWeekPattern
          data={analytics.data?.dayOfWeekStats || []}
          isLoading={analytics.isLoading}
        />
      </div>

      {/* Empty state */}
      {!analytics.isLoading && analytics.data?.totalEntries === 0 && (
        <div className="text-center py-8">
          <p className="text-slate-500 dark:text-slate-400">
            Start tracking your mood to see analytics here.
          </p>
        </div>
      )}
    </div>
  );
}
