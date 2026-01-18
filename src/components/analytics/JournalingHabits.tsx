/**
 * JournalingHabits - Visualize journaling patterns (offline)
 *
 * Shows time-of-day preferences, frequency, and streaks.
 */

import type { AggregatedMetadata } from '../../types/ai';

interface JournalingHabitsProps {
  patterns: AggregatedMetadata['patterns'];
  emotionalProfile: AggregatedMetadata['emotionalProfile'];
  isLoading?: boolean;
}

const TIME_CONFIG = {
  morning: { emoji: '🌅', label: 'Morning', color: 'bg-amber-400' },
  afternoon: { emoji: '☀️', label: 'Afternoon', color: 'bg-yellow-400' },
  evening: { emoji: '🌆', label: 'Evening', color: 'bg-orange-400' },
  night: { emoji: '🌙', label: 'Night', color: 'bg-indigo-400' },
};

const FREQUENCY_CONFIG = {
  daily: { label: 'Daily Journaler', emoji: '🏆', description: 'Writing every day!' },
  regular: { label: 'Regular Writer', emoji: '📝', description: 'Writing most days' },
  sporadic: { label: 'Occasional Writer', emoji: '✨', description: 'Writing when inspired' },
  rare: { label: 'Getting Started', emoji: '🌱', description: 'Building the habit' },
};

export function JournalingHabits({ patterns, emotionalProfile, isLoading }: JournalingHabitsProps) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-slate-200 dark:bg-slate-700 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const timeConfig = TIME_CONFIG[patterns.bestTimeOfDay];
  const frequencyConfig = FREQUENCY_CONFIG[patterns.frequency];

  return (
    <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Journaling Habits
        </h3>
        <span className="text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
          Offline
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Frequency Badge */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border border-violet-100 dark:border-violet-800">
          <span className="text-2xl">{frequencyConfig.emoji}</span>
          <p className="font-semibold text-violet-700 dark:text-violet-300 mt-1">
            {frequencyConfig.label}
          </p>
          <p className="text-xs text-violet-600/70 dark:text-violet-400/70">
            {frequencyConfig.description}
          </p>
        </div>

        {/* Preferred Time */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-100 dark:border-amber-800">
          <span className="text-2xl">{timeConfig.emoji}</span>
          <p className="font-semibold text-amber-700 dark:text-amber-300 mt-1">
            {timeConfig.label} Writer
          </p>
          <p className="text-xs text-amber-600/70 dark:text-amber-400/70">
            Your preferred time
          </p>
        </div>

        {/* Current Streak */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-100 dark:border-emerald-800">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {patterns.currentStreak}
            </span>
            <span className="text-sm text-emerald-600/70 dark:text-emerald-400/70">days</span>
          </div>
          <p className="font-medium text-emerald-700 dark:text-emerald-300 mt-1">
            Current Streak 🔥
          </p>
          <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
            Best: {patterns.longestStreak} days
          </p>
        </div>

        {/* Gratitude Practice */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20 border border-pink-100 dark:border-pink-800">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-pink-600 dark:text-pink-400">
              {Math.round(emotionalProfile.gratitudeFrequency * 100)}%
            </span>
          </div>
          <p className="font-medium text-pink-700 dark:text-pink-300 mt-1">
            Gratitude Practice 🙏
          </p>
          <p className="text-xs text-pink-600/70 dark:text-pink-400/70">
            Entries with gratitude
          </p>
        </div>
      </div>

      {/* Best/Worst Days */}
      <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center justify-between">
          <div className="text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Best Day</p>
            <p className="font-semibold text-emerald-600 dark:text-emerald-400">
              {patterns.bestDayOfWeek}
            </p>
          </div>
          <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
          <div className="text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Challenging Day</p>
            <p className="font-semibold text-rose-600 dark:text-rose-400">
              {patterns.worstDayOfWeek}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
