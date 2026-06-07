import type { HeatmapDay } from '../../types/analytics';
import { getMoodColor } from '../../lib/utils/chartUtils';

interface StreakCalendarProps {
  heatmapData: HeatmapDay[];
  isLoading?: boolean;
}

const WEEKS = 12;
const DAYS = 7;
const DOT = 8;
const GAP = 4;
const DAY_NAMES_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function StreakCalendar({ heatmapData, isLoading }: StreakCalendarProps) {
  if (isLoading) {
    return (
      <div className="flex gap-1">
        {Array.from({ length: WEEKS }).map((_, w) => (
          <div key={w} className="flex flex-col gap-1">
            {Array.from({ length: DAYS }).map((_, d) => (
              <div
                key={d}
                className="rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse"
                style={{ width: DOT, height: DOT }}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Start from Sunday of the week 12 weeks ago (inclusive)
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - (WEEKS * 7 - 1) - startDate.getDay());

  const dataMap = new Map(heatmapData.map((d) => [d.date, d]));

  const grid: Array<{ date: Date; isoDate: string; isToday: boolean; isFuture: boolean; data: HeatmapDay | undefined }[]> = [];
  for (let w = 0; w < WEEKS; w++) {
    const col: typeof grid[0] = [];
    for (let d = 0; d < DAYS; d++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + w * 7 + d);
      const isoDate = date.toISOString().slice(0, 10);
      col.push({
        date,
        isoDate,
        isToday: date.getTime() === now.getTime(),
        isFuture: date > now,
        data: dataMap.get(isoDate),
      });
    }
    grid.push(col);
  }

  const monthLabels: { col: number; label: string }[] = [];
  for (let w = 0; w < WEEKS; w++) {
    const firstDay = grid[w][0].date;
    if (firstDay.getDate() <= 7 || w === 0) {
      const label = firstDay.toLocaleString('default', { month: 'short' });
      if (monthLabels.length === 0 || monthLabels[monthLabels.length - 1].label !== label) {
        monthLabels.push({ col: w, label });
      }
    }
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-0 items-start">
        {/* Day labels */}
        <div className="flex flex-col pt-5 mr-1" style={{ gap: GAP }}>
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <div
              key={d}
              className="text-[9px] text-slate-400 dark:text-slate-500 flex items-center justify-end pr-1"
              style={{ height: DOT, lineHeight: `${DOT}px` }}
            >
              {d % 2 === 1 ? DAY_NAMES_SHORT[d] : ''}
            </div>
          ))}
        </div>
        {/* Grid columns */}
        <div className="flex flex-col">
          {/* Month labels row */}
          <div className="flex h-5 relative" style={{ gap: GAP }}>
            {grid.map((_col, w) => {
              const lbl = monthLabels.find((m) => m.col === w);
              return (
                <div
                  key={w}
                  className="text-[9px] text-slate-400 dark:text-slate-500 flex-shrink-0"
                  style={{ width: DOT }}
                >
                  {lbl ? lbl.label : ''}
                </div>
              );
            })}
          </div>
          {/* Dot grid */}
          <div className="flex" style={{ gap: GAP }}>
            {grid.map((col, w) => (
              <div key={w} className="flex flex-col flex-shrink-0" style={{ gap: GAP }}>
                {col.map((cell) => {
                  if (cell.isFuture) {
                    return (
                      <div
                        key={cell.isoDate}
                        className="rounded-full"
                        style={{ width: DOT, height: DOT }}
                      />
                    );
                  }
                  const bg = cell.data
                    ? getMoodColor(cell.data.averageMood)
                    : undefined;
                  const title = cell.data
                    ? `${cell.isoDate}: mood ${cell.data.averageMood.toFixed(1)} (${cell.data.entryCount} ${cell.data.entryCount === 1 ? 'entry' : 'entries'})`
                    : `${cell.isoDate}: no entries`;
                  return (
                    <div
                      key={cell.isoDate}
                      className={`rounded-full flex-shrink-0${cell.data ? '' : ' bg-slate-100 dark:bg-slate-800'}${cell.isToday ? ' ring-1 ring-slate-400 dark:ring-slate-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900' : ''}`}
                      style={{ width: DOT, height: DOT, backgroundColor: bg }}
                      title={title}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
