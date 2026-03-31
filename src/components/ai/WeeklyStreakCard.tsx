/**
 * WeeklyStreakCard
 *
 * Shows "X of Y this week" — anti-punishing weekly cadence model.
 * Fires animate-mood-pop animation the moment the weekly goal is reached.
 */

import { useRef } from 'react';

interface WeeklyStreakCardProps {
  entriesThisWeek: number;
  weeklyGoal?: number;
}

export function WeeklyStreakCard({ entriesThisWeek, weeklyGoal = 3 }: WeeklyStreakCardProps) {
  // Track previous count during render (no effect needed — ref update is synchronous)
  const prevCountRef = useRef<number>(entriesThisWeek);
  const prev = prevCountRef.current;
  const goalJustReached = prev < weeklyGoal && entriesThisWeek >= weeklyGoal;
  prevCountRef.current = entriesThisWeek;

  const goalReached = entriesThisWeek >= weeklyGoal;
  const filled = Math.min(entriesThisWeek, weeklyGoal);

  return (
    <div className="rounded-2xl border border-violet-100 dark:border-violet-900/40 bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-xl">
            📅
          </div>
          <div>
            <p className="text-xs font-medium text-violet-700 dark:text-violet-400 uppercase tracking-wide">
              This week
            </p>
            {entriesThisWeek === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Write your first entry this week
              </p>
            ) : (
              <div
                className={`flex items-baseline gap-1.5 mt-0.5 ${goalJustReached ? 'animate-mood-pop' : ''}`}
                aria-label={`${entriesThisWeek} of ${weeklyGoal} this week`}
              >
                <span className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
                  {entriesThisWeek}
                </span>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  of {weeklyGoal} this week
                </span>
                {goalReached && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400">
                    Goal reached!
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex gap-1.5" aria-hidden>
          {Array.from({ length: weeklyGoal }).map((_, i) => (
            <div
              key={i}
              className={`w-2.5 h-2.5 rounded-full transition-colors duration-200 ${
                i < filled
                  ? 'bg-violet-500'
                  : 'bg-violet-200 dark:bg-violet-800/40'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
