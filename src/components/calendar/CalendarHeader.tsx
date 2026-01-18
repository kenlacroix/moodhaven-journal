/**
 * CalendarHeader - Month/year display with navigation controls
 */

interface CalendarHeaderProps {
  year: number;
  monthName: string;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
}

export function CalendarHeader({
  year,
  monthName,
  onPreviousMonth,
  onNextMonth,
  onToday,
}: CalendarHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      {/* Month/Year display */}
      <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
        {monthName} {year}
      </h2>

      {/* Navigation buttons */}
      <div className="flex items-center gap-2">
        {/* Today button */}
        <button
          type="button"
          onClick={onToday}
          className="
            px-3 py-1.5 text-sm font-medium
            text-violet-600 dark:text-violet-400
            hover:bg-violet-50 dark:hover:bg-violet-900/30
            rounded-lg transition-colors duration-200
            focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500
          "
        >
          Today
        </button>

        {/* Previous month */}
        <button
          type="button"
          onClick={onPreviousMonth}
          className="
            p-2 rounded-lg
            text-slate-600 dark:text-slate-300
            hover:bg-slate-100 dark:hover:bg-slate-800
            transition-colors duration-200
            focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500
          "
          aria-label="Previous month"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Next month */}
        <button
          type="button"
          onClick={onNextMonth}
          className="
            p-2 rounded-lg
            text-slate-600 dark:text-slate-300
            hover:bg-slate-100 dark:hover:bg-slate-800
            transition-colors duration-200
            focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500
          "
          aria-label="Next month"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
