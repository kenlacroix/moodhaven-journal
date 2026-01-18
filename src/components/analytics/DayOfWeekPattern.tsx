/**
 * DayOfWeekPattern - Bar chart showing mood patterns by day of week
 */

import { getMoodColor } from '../../lib/chartUtils';
import type { DayOfWeekStats } from '../../types/analytics';

interface DayOfWeekPatternProps {
  data: DayOfWeekStats[];
  isLoading?: boolean;
}

const SHORT_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DayOfWeekPattern({ data, isLoading = false }: DayOfWeekPatternProps) {
  const hasData = data.some((d) => d.entryCount > 0);
  const maxEntries = Math.max(...data.map((d) => d.entryCount), 1);

  if (isLoading) {
    return (
      <div className="card p-4">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-4">
          Weekly Pattern
        </h3>
        <div className="flex items-end justify-around h-32 gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2 flex-1">
              <div className="w-full h-20 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
              <div className="w-8 h-3 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-4">
        Weekly Pattern
      </h3>

      {!hasData ? (
        <div className="h-32 flex items-center justify-center text-slate-500 dark:text-slate-400">
          <div className="text-center">
            <p>No data yet</p>
            <p className="text-xs mt-1">Track mood across days to see patterns</p>
          </div>
        </div>
      ) : (
        <div className="flex items-end justify-around h-32 gap-2">
          {data.map((dayStats) => {
            const barHeight = dayStats.entryCount > 0
              ? Math.max(20, (dayStats.entryCount / maxEntries) * 100)
              : 0;
            const moodColor = dayStats.entryCount > 0
              ? getMoodColor(dayStats.averageMood)
              : '#e2e8f0'; // slate-200

            return (
              <div
                key={dayStats.dayOfWeek}
                className="flex flex-col items-center gap-2 flex-1"
              >
                {/* Bar */}
                <div className="relative w-full flex items-end justify-center h-20">
                  <div
                    className="w-full max-w-[32px] rounded-t-md transition-all duration-500 ease-out"
                    style={{
                      height: `${barHeight}%`,
                      backgroundColor: moodColor,
                    }}
                    title={dayStats.entryCount > 0
                      ? `${dayStats.dayName}: ${dayStats.averageMood.toFixed(1)} avg (${dayStats.entryCount} entries)`
                      : `${dayStats.dayName}: No entries`
                    }
                  />
                </div>

                {/* Day label */}
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {SHORT_DAY_NAMES[dayStats.dayOfWeek]}
                </span>

                {/* Mood value */}
                {dayStats.entryCount > 0 && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    {dayStats.averageMood.toFixed(1)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      {hasData && (
        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
            Bar height = entry count, color = average mood
          </p>
        </div>
      )}
    </div>
  );
}
