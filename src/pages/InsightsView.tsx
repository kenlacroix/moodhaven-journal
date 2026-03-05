/**
 * InsightsView - Merged Insights + Analytics view
 *
 * Sections (top to bottom):
 *   🤖 AI Insights  [Off / Beta / Active badge]
 *   ─────────────────────────────
 *   MoodWeatherCard
 *   GratitudeStreakCard (if streak > 0)
 *   InsightsPanel (patterns + AI observations)
 *   WeeklyReflectionCard (if AI enabled)
 *   ── If AI disabled: feature explanation CTA card ──
 *
 *   📊 Your Stats  [Computed on-device badge]
 *   ─────────────────────────────
 *   Book filter chips (if multiple books)
 *   StatsSummary
 *   Mood Trend + Mood Distribution
 *   Sentiment Overview + Journaling Habits
 *   Emotional Trends + Day of Week
 */

import { useState } from 'react';
import { useInsights } from '../hooks/useInsights';
import { useAnalytics } from '../hooks/useAnalytics';
import { useAIInsights } from '../hooks/useAIInsights';
import { useBooksStore } from '../stores/booksStore';
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

// ── Section header ──────────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  badge,
  badgeColor = 'slate',
}: {
  icon: string;
  title: string;
  badge: string;
  badgeColor?: 'slate' | 'violet' | 'emerald' | 'amber';
}) {
  const badgeClasses = {
    slate: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
    violet: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400',
    emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  };
  return (
    <div className="flex items-center gap-3 mt-8 mb-5">
      <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
        <span>{icon}</span>
        {title}
      </h2>
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${badgeClasses[badgeColor]}`}>
        {badge}
      </span>
      <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

// ── AI disabled CTA ─────────────────────────────────────────────────────────────

function AIDisabledCard({ onEnable }: { onEnable?: () => void }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm p-6 mb-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center text-lg">
          🤖
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">AI Insights — Off</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Get personalised journaling prompts and mood trend analysis powered by AI.
          </p>
        </div>
      </div>

      <div className="space-y-1.5 mb-4">
        {[
          'Only mood metadata is processed — never your journal content',
          'Your journal text never leaves your device',
          'You control which journals and entries are included',
        ].map((item) => (
          <div key={item} className="flex items-start gap-2">
            <span className="text-emerald-500 text-xs mt-0.5 flex-shrink-0">✅</span>
            <span className="text-xs text-slate-600 dark:text-slate-300">{item}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onEnable}
          className="px-4 py-2 text-xs font-semibold bg-violet-500 text-white rounded-xl hover:bg-violet-600 transition-colors"
        >
          Enable AI Insights →
        </button>
      </div>
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

  const { books } = useBooksStore();
  const [selectedBookFilter, setSelectedBookFilter] = useState<string | null>(null);

  const allIndicators = aiMetadata?.emotionalProfile.dominantIndicators || [];

  const aiStatusBadge = isAIEnabled ? 'Active' : 'Off';
  const aiStatusColor: 'emerald' | 'slate' = isAIEnabled ? 'emerald' : 'slate';

  // Empty state (no entries at all)
  if (!isLoading && !hasData) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-3xl">
            🌱
          </div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
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
      <SectionHeader
        icon="🤖"
        title="AI Insights"
        badge={aiStatusBadge}
        badgeColor={aiStatusColor}
      />

      {/* Refresh button */}
      <div className="flex items-center justify-end mb-4">
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

      {/* AI disabled — feature explanation CTA */}
      {!isAIEnabled && (
        <AIDisabledCard onEnable={() => onNavigateToSettings?.('ai')} />
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
      <SectionHeader
        icon="📊"
        title="Your Stats"
        badge="Computed on-device"
        badgeColor="slate"
      />

      {/* Book filter chips (if multiple books) */}
      {books.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            type="button"
            onClick={() => setSelectedBookFilter(null)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              selectedBookFilter === null
                ? 'bg-violet-500 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            📚 All books
          </button>
          {books.map((book) => (
            <button
              key={book.id}
              type="button"
              onClick={() => setSelectedBookFilter(book.id === selectedBookFilter ? null : book.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                selectedBookFilter === book.id
                  ? 'bg-violet-500 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {book.emoji} {book.name}
            </button>
          ))}
          {selectedBookFilter && (
            <span className="flex items-center text-xs text-slate-400 italic">
              — stats for selected journal
            </span>
          )}
        </div>
      )}

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
        <div>
          <MoodTrendChart
            data={analytics.trendData}
            period={analytics.trendPeriod}
            onPeriodChange={analytics.setTrendPeriod}
            isLoading={analytics.isLoading || analytics.isTrendLoading}
          />
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 text-center">
            Mood score (1–5) over time
          </p>
        </div>
        <div>
          <MoodDistributionChart
            data={analytics.data?.moodDistribution || []}
            isLoading={analytics.isLoading}
          />
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 text-center">
            Distribution of mood entries by level
          </p>
        </div>
      </div>

      {/* Row 2: Sentiment + Habits */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div>
          <SentimentOverview
            sentimentBreakdown={aiMetadata?.sentimentBreakdown || {
              positive: 0,
              negative: 0,
              neutral: 0,
              mixed: 0,
            }}
            isLoading={isMetadataLoading}
          />
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 text-center">
            Emotional tone extracted from your writing
          </p>
        </div>
        <div>
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
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 text-center">
            When and how often you journal
          </p>
        </div>
      </div>

      {/* Emotional Themes */}
      <div className="mb-6">
        <EmotionalTrends
          indicators={allIndicators}
          isLoading={isMetadataLoading}
        />
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 text-center">
          Recurring themes detected across your entries
        </p>
      </div>

      {/* Day of Week */}
      <div className="mb-6">
        <DayOfWeekPattern
          data={analytics.data?.dayOfWeekStats || []}
          isLoading={analytics.isLoading}
        />
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 text-center">
          Average mood by day of week
        </p>
      </div>

      {/* Empty state */}
      {!analytics.isLoading && analytics.data?.totalEntries === 0 && (
        <div className="text-center py-8">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-2xl">
            📈
          </div>
          <p className="text-slate-600 dark:text-slate-300 font-medium mb-1">No data yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Start tracking your mood to see analytics here.
          </p>
        </div>
      )}
    </div>
  );
}
