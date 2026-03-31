/**
 * StatsSummary - Overview cards showing key statistics
 */

import { getMoodEmoji } from '../../lib/utils/chartUtils';

interface StatsSummaryProps {
  averageMood: number;
  totalEntries: number;
  currentStreak: number;
  longestStreak: number;
  isLoading?: boolean;
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  subtext?: string;
  isLoading?: boolean;
  primary?: boolean;
}

function StatCard({ label, value, icon, subtext, isLoading, primary }: StatCardProps) {
  return (
    <div className={`card p-4 ${primary ? 'ring-1 ring-violet-100 dark:ring-violet-900/40' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
          {isLoading ? (
            <div className={`${primary ? 'h-10 w-20' : 'h-8 w-16'} bg-slate-200 dark:bg-slate-700 rounded animate-pulse mt-1`} />
          ) : (
            <p className={`${primary ? 'text-3xl' : 'text-2xl'} font-bold text-slate-800 dark:text-slate-100 mt-1`}>{value}</p>
          )}
          {subtext && !isLoading && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{subtext}</p>
          )}
        </div>
        <div className={primary ? 'text-3xl' : 'text-2xl'}>{icon}</div>
      </div>
    </div>
  );
}

export function StatsSummary({
  averageMood,
  totalEntries,
  currentStreak,
  longestStreak,
  isLoading = false,
}: StatsSummaryProps) {
  const moodEmoji = getMoodEmoji(averageMood);
  const moodLabel = averageMood > 0 ? averageMood.toFixed(1) : '-';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Average Mood"
        value={moodLabel}
        icon={<span role="img" aria-label="mood">{moodEmoji}</span>}
        subtext={averageMood > 0 ? 'out of 5' : 'No data yet'}
        isLoading={isLoading}
        primary
      />

      <StatCard
        label="Total Entries"
        value={totalEntries}
        icon={<span role="img" aria-label="entries">📝</span>}
        subtext={totalEntries === 1 ? 'entry' : 'entries'}
        isLoading={isLoading}
      />

      <StatCard
        label="Current Streak"
        value={currentStreak}
        icon={<span role="img" aria-label="streak">🔥</span>}
        subtext={currentStreak === 1 ? 'day' : 'days'}
        isLoading={isLoading}
      />

      <StatCard
        label="Longest Streak"
        value={longestStreak}
        icon={<span role="img" aria-label="record">🏆</span>}
        subtext={longestStreak === 1 ? 'day' : 'days'}
        isLoading={isLoading}
      />
    </div>
  );
}
