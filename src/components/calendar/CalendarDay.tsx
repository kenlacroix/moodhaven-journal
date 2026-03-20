/**
 * CalendarDay - Individual day cell in the calendar grid
 *
 * Shows date number with mood color indicator based on average mood.
 */

import { formatDate, isToday } from '../../lib/dateUtils';
import { MOOD_OPTIONS } from '../../types/journal';
import type { CalendarDayData } from '../../types/analytics';

interface CalendarDayProps {
  date: Date;
  isCurrentMonth: boolean;
  moodData?: CalendarDayData;
  isSelected: boolean;
  onClick: (dateStr: string) => void;
}

export function CalendarDay({
  date,
  isCurrentMonth,
  moodData,
  isSelected,
  onClick,
}: CalendarDayProps) {
  const dateStr = formatDate(date);
  const dayIsToday = isToday(date);
  const hasEntries = moodData && moodData.entryCount > 0;

  return (
    <button
      type="button"
      onClick={() => onClick(dateStr)}
      className={`
        relative flex flex-col items-center justify-center
        aspect-square p-1 rounded-xl
        transition-all duration-200 ease-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1
        ${
          isCurrentMonth
            ? 'text-slate-700 dark:text-slate-200'
            : 'text-slate-400 dark:text-slate-500'
        }
        ${
          isSelected
            ? 'bg-violet-100 dark:bg-violet-900/40 ring-2 ring-violet-500'
            : 'hover:bg-slate-100 dark:hover:bg-slate-800'
        }
        ${dayIsToday && !isSelected ? 'ring-1 ring-violet-300 dark:ring-violet-700' : ''}
      `}
      aria-label={`${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}${hasEntries ? `, ${moodData.entryCount} entries` : ''}`}
      aria-pressed={isSelected}
    >
      {/* Date number */}
      <span
        className={`
          text-sm font-medium leading-none mb-0.5
          ${dayIsToday ? 'text-violet-600 dark:text-violet-400' : ''}
        `}
      >
        {date.getDate()}
      </span>

      {/* Mood emoji (small, centered) replaces plain dot */}
      {hasEntries ? (
        <span
          className="text-base leading-none"
          title={`Average mood: ${moodData!.averageMood.toFixed(1)}`}
        >
          {MOOD_OPTIONS.find((o) => o.level === Math.round(moodData!.averageMood))?.emoji ?? '•'}
        </span>
      ) : (
        <span className="h-[10px]" />
      )}

      {/* Entry count badge (if multiple) */}
      {moodData && moodData.entryCount > 1 && (
        <span
          className="
            absolute top-0.5 right-0.5
            text-[9px] font-medium
            text-slate-400 dark:text-slate-500
          "
        >
          {moodData.entryCount}
        </span>
      )}
    </button>
  );
}
