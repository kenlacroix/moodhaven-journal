import type { WellbeingContext } from '../../lib/stillService';

interface WellbeingCardProps {
  context: WellbeingContext;
}

function ouraLabel(score: number): string {
  if (score >= 85) return 'optimal';
  if (score >= 70) return 'good';
  if (score >= 60) return 'fair';
  return 'low';
}

function moodLabel(avg: number): string {
  if (avg >= 4.5) return 'excellent';
  if (avg >= 3.5) return 'good';
  if (avg >= 2.5) return 'neutral';
  if (avg >= 1.5) return 'low';
  return 'difficult';
}

function sessionAgo(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function WellbeingCard({ context }: WellbeingCardProps) {
  const {
    oura_readiness_today,
    last_still_session_days_ago,
    yesterday_mood_avg,
    yesterday_entry_count,
    streak_days,
  } = context;

  const hasAnyData =
    oura_readiness_today !== null ||
    last_still_session_days_ago !== null ||
    yesterday_mood_avg !== null;

  if (!hasAnyData) return null;

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div
      className="
        mb-4 px-4 py-3 rounded-xl
        bg-violet-50 dark:bg-violet-950/40
        border border-violet-100 dark:border-violet-800/50
        text-sm
      "
      data-testid="wellbeing-card"
    >
      <p className="font-medium text-violet-700 dark:text-violet-300 mb-2">
        {greeting}.
        {streak_days > 1 && (
          <span className="ml-1 text-violet-500 dark:text-violet-400 font-normal">
            {streak_days}-day streak.
          </span>
        )}
      </p>

      <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
        {oura_readiness_today !== null && (
          <span>
            Oura readiness:{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {oura_readiness_today} ({ouraLabel(oura_readiness_today)})
            </span>
          </span>
        )}

        {last_still_session_days_ago !== null && (
          <span>
            Last grounding:{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {sessionAgo(Number(last_still_session_days_ago))}
            </span>
          </span>
        )}

        {yesterday_mood_avg !== null && yesterday_entry_count > 0 && (
          <span>
            Yesterday:{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {moodLabel(yesterday_mood_avg)} ({yesterday_entry_count}{' '}
              {yesterday_entry_count === 1 ? 'entry' : 'entries'})
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
