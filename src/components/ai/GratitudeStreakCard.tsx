/**
 * GratitudeStreakCard
 *
 * Celebrates the user's gratitude journaling habit.
 * Computed entirely from local metadata — no AI required.
 */

interface GratitudeStreakCardProps {
  currentStreak: number;
  longestStreak: number;
}

export function GratitudeStreakCard({ currentStreak, longestStreak }: GratitudeStreakCardProps) {
  if (currentStreak === 0) return null;

  const isRecord = currentStreak >= longestStreak && longestStreak > 0;
  const milestones = [3, 7, 14, 30, 60, 100];
  const nextMilestone = milestones.find((m) => m > currentStreak);
  const daysToNext = nextMilestone ? nextMilestone - currentStreak : null;

  return (
    <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-xl">
            🌱
          </div>
          <div>
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
              Gratitude streak
            </p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
                {currentStreak}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {currentStreak === 1 ? 'day' : 'days'}
              </span>
              {isRecord && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">
                  Personal best!
                </span>
              )}
            </div>
          </div>
        </div>

        {longestStreak > 0 && (
          <div className="text-right">
            <p className="text-xs text-slate-400 dark:text-slate-500">Best</p>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {longestStreak}d
            </p>
          </div>
        )}
      </div>

      {daysToNext && (
        <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-3">
          {daysToNext === 1
            ? 'Journal with gratitude tomorrow to reach your next milestone!'
            : `${daysToNext} more days to reach your ${nextMilestone}-day milestone`}
        </p>
      )}
    </div>
  );
}
