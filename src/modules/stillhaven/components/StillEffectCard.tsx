import type { StillEffectStats } from '../../../lib/stillService';

const MIN_SESSIONS = 3;

function protocolLabel(id: string): string {
  if (id === 'general_activation') return 'Everyday Settling';
  if (id === 'fake_danger') return 'Heightened State';
  return id.replace(/_/g, ' ');
}

function moodColor(avg: number): string {
  if (avg >= 4.5) return 'text-emerald-500';
  if (avg >= 3.5) return 'text-lime-500';
  if (avg >= 2.5) return 'text-yellow-500';
  if (avg >= 1.5) return 'text-orange-500';
  return 'text-rose-500';
}

interface Props {
  stats: StillEffectStats;
}

export function StillEffectCard({ stats }: Props) {
  if (stats.sessions_with_data < MIN_SESSIONS) {
    return (
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700"
        data-testid="still-effect-card-empty"
      >
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
          The Effect
        </h2>
        <p className="text-xs text-slate-400">
          Complete {MIN_SESSIONS - stats.sessions_with_data} more session
          {MIN_SESSIONS - stats.sessions_with_data !== 1 ? 's' : ''} with a journal entry to see
          your effect pattern.
        </p>
      </div>
    );
  }

  const rows = stats.per_protocol.filter(
    (p) => p.avg_activation_delta !== null || p.avg_mood_after !== null,
  );

  return (
    <div
      className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700"
      data-testid="still-effect-card"
    >
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">The Effect</h2>
        <span className="text-[10px] text-slate-400">{stats.sessions_with_data} sessions</span>
      </div>

      {/* Column header */}
      <div className="flex items-center gap-2 mb-1.5 pb-1.5 border-b border-slate-100 dark:border-slate-700">
        <span className="text-[10px] text-slate-400 flex-1">Protocol</span>
        <span className="text-[10px] text-slate-400 w-12 text-right">Avg drop</span>
        <span className="text-[10px] text-slate-400 w-8 text-right">Mood</span>
      </div>

      {/* Per-protocol rows */}
      <div className="flex flex-col gap-2 mb-3">
        {rows.map((p) => (
          <div key={p.protocol} className="flex items-center gap-2">
            <span className="text-xs text-slate-600 dark:text-slate-300 flex-1 truncate">
              {protocolLabel(p.protocol)}
            </span>
            <span
              className={`text-xs font-semibold tabular-nums w-12 text-right ${
                (p.avg_activation_delta ?? 0) > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-400'
              }`}
            >
              {p.avg_activation_delta !== null
                ? `−${p.avg_activation_delta.toFixed(1)}`
                : '—'}
            </span>
            <span
              className={`text-xs font-medium tabular-nums w-8 text-right ${
                p.avg_mood_after !== null ? moodColor(p.avg_mood_after) : 'text-slate-300'
              }`}
            >
              {p.avg_mood_after !== null ? `${p.avg_mood_after.toFixed(1)}★` : '—'}
            </span>
          </div>
        ))}
      </div>

      {/* Recommendation chip */}
      {stats.best_protocol && (
        <div className="flex items-start gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
          <span className="text-[#F28C38] text-xs leading-4">✦</span>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            <span className="font-medium">{protocolLabel(stats.best_protocol)}</span> tends to work
            best for you
          </p>
        </div>
      )}
    </div>
  );
}
