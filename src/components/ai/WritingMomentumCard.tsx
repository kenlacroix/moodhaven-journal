/**
 * WritingMomentumCard — v1.5.0
 *
 * Reflects the user's recent journaling cadence using local metadata.
 * Shows frequency classification, entries this week, and streak.
 * No AI or external data required.
 */

import type { FrequencyPattern } from '../../types/ai';

interface MomentumConfig {
  label: string;
  subtext: string;
  icon: string;
  bar: number;     // 0–1 fill fraction
  color: string;
  barColor: string;
}

const MOMENTUM_MAP: Record<FrequencyPattern, MomentumConfig> = {
  daily: {
    label: 'On a roll',
    subtext: "You're journaling every day. That's remarkable.",
    icon: '🚀',
    bar: 1.0,
    color: 'text-emerald-600 dark:text-emerald-400',
    barColor: 'bg-emerald-500',
  },
  regular: {
    label: 'Building momentum',
    subtext: "You're journaling regularly. Keep the habit going.",
    icon: '📈',
    bar: 0.65,
    color: 'text-blue-600 dark:text-blue-400',
    barColor: 'bg-blue-400',
  },
  sporadic: {
    label: 'Getting started',
    subtext: 'Some weeks are better than others — every entry counts.',
    icon: '🌱',
    bar: 0.35,
    color: 'text-amber-600 dark:text-amber-400',
    barColor: 'bg-amber-400',
  },
  rare: {
    label: 'Just warming up',
    subtext: "It's great that you're here. One entry at a time.",
    icon: '☁️',
    bar: 0.12,
    color: 'text-slate-500 dark:text-slate-400',
    barColor: 'bg-slate-300 dark:bg-slate-600',
  },
};

interface WritingMomentumCardProps {
  frequency: FrequencyPattern;
  entriesThisWeek: number;
  weeklyGoal?: number;
}

export function WritingMomentumCard({
  frequency,
  entriesThisWeek,
  weeklyGoal = 3,
}: WritingMomentumCardProps) {
  const cfg = MOMENTUM_MAP[frequency];
  const goalFill = Math.min(entriesThisWeek / Math.max(1, weeklyGoal), 1);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-xl">
            {cfg.icon}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Writing momentum
            </p>
            <p className={`text-sm font-bold mt-0.5 ${cfg.color}`}>{cfg.label}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-slate-700 dark:text-slate-200">{entriesThisWeek}</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">this week</p>
        </div>
      </div>

      {/* Weekly goal progress bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">
            Weekly goal
          </span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            {entriesThisWeek} / {weeklyGoal}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${cfg.barColor}`}
            style={{ width: `${goalFill * 100}%` }}
          />
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">{cfg.subtext}</p>
    </div>
  );
}
