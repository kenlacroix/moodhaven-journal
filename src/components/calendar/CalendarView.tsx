/**
 * CalendarView - Monthly calendar grid with mood indicators
 */

import { formatDate, getShortDayName } from '../../lib/dateUtils';
import { CalendarHeader } from './CalendarHeader';
import { CalendarDay } from './CalendarDay';
import type { CalendarDayData } from '../../types/analytics';

interface CalendarViewProps {
  year: number;
  month: number;
  monthName: string;
  calendarDates: Date[];
  moodData: Map<string, CalendarDayData>;
  selectedDate: string | null;
  isLoading: boolean;
  onSelectDate: (date: string) => void;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
}

const DAY_HEADERS = [0, 1, 2, 3, 4, 5, 6]; // Sunday to Saturday

export function CalendarView({
  year,
  month,
  monthName,
  calendarDates,
  moodData,
  selectedDate,
  isLoading,
  onSelectDate,
  onPreviousMonth,
  onNextMonth,
  onToday,
}: CalendarViewProps) {
  return (
    <div className="card p-4 sm:p-6">
      <CalendarHeader
        year={year}
        monthName={monthName}
        onPreviousMonth={onPreviousMonth}
        onNextMonth={onNextMonth}
        onToday={onToday}
      />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 flex items-center justify-center rounded-2xl z-10">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Day of week headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {DAY_HEADERS.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 py-2"
          >
            {getShortDayName(day)}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDates.map((date, index) => {
          const dateStr = formatDate(date);
          const isCurrentMonth = date.getMonth() + 1 === month;
          const dayMoodData = moodData.get(dateStr);

          return (
            <CalendarDay
              key={index}
              date={date}
              isCurrentMonth={isCurrentMonth}
              moodData={dayMoodData}
              isSelected={selectedDate === dateStr}
              onClick={onSelectDate}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Great</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-lime-400" />
            <span>Good</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>Okay</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-orange-400" />
            <span>Low</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>Struggling</span>
          </div>
        </div>
      </div>
    </div>
  );
}
