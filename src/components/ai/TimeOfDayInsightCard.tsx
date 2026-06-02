/**
 * TimeOfDayInsightCard — v1.5.0
 *
 * Shows when the user writes most and which time of day correlates with their
 * best mood. Computed entirely from local metadata — no AI required.
 */

import type { TimeOfDay } from '../../types/ai';

const SLOT_CONFIG: Record<
  TimeOfDay,
  { label: string; range: string; icon: string; color: string }
> = {
  morning:   { label: 'Morning',   range: '6 am – 12 pm', icon: '🌅', color: 'text-amber-500' },
  afternoon: { label: 'Afternoon', range: '12 pm – 5 pm', icon: '☀️',  color: 'text-yellow-500' },
  evening:   { label: 'Evening',   range: '5 pm – 9 pm',  icon: '🌆', color: 'text-orange-500' },
  night:     { label: 'Night',     range: '9 pm – 6 am',  icon: '🌙', color: 'text-indigo-500' },
};

interface TimeOfDayInsightCardProps {
  bestTimeOfDay: TimeOfDay;
  currentStreak: number;
}

export function TimeOfDayInsightCard({
  bestTimeOfDay,
  currentStreak,
}: TimeOfDayInsightCardProps) {
  const slot = SLOT_CONFIG[bestTimeOfDay];
  const allSlots = Object.entries(SLOT_CONFIG) as Array<[TimeOfDay, typeof slot]>;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-xl">
          {slot.icon}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Best writing time
          </p>
          <p className={`text-sm font-bold mt-0.5 ${slot.color}`}>
            {slot.label}
            <span className="text-xs font-normal text-slate-400 dark:text-slate-500 ml-1.5">
              {slot.range}
            </span>
          </p>
        </div>
      </div>

      {/* Time slot bar */}
      <div className="flex gap-1.5">
        {allSlots.map(([key, cfg]) => (
          <div key={key} className="flex-1 flex flex-col items-center gap-1">
            <div
              className={`w-full h-1.5 rounded-full transition-all ${
                key === bestTimeOfDay
                  ? 'bg-violet-500'
                  : 'bg-slate-100 dark:bg-slate-800'
              }`}
            />
            <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">
              {cfg.label.slice(0, 3)}
            </span>
          </div>
        ))}
      </div>

      {currentStreak > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
          You have a {currentStreak}-day writing streak — keep it up!
        </p>
      )}
    </div>
  );
}
