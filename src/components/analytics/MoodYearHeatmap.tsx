import type { HeatmapDay } from '../../types/analytics';
import { getMoodColor } from '../../lib/utils/chartUtils';

interface MoodYearHeatmapProps {
  data: HeatmapDay[];
  isLoading?: boolean;
}

const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
const WEEKS = 53;
const DAYS = 7;
const LEFT_PAD = 22; // space for Mon/Wed/Fri labels
const TOP_PAD = 18; // space for month labels
const SVG_W = LEFT_PAD + WEEKS * STEP;
const SVG_H = TOP_PAD + DAYS * STEP;

const DAY_LABELS: [number, string][] = [
  [1, 'M'],
  [3, 'W'],
  [5, 'F'],
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function MoodLegend() {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
      <span>Low</span>
      {[1, 2, 3, 4, 5].map((m) => (
        <div
          key={m}
          className="w-3 h-3 rounded-sm"
          style={{ backgroundColor: getMoodColor(m) }}
        />
      ))}
      <span>High</span>
    </div>
  );
}

export function MoodYearHeatmap({ data, isLoading = false }: MoodYearHeatmapProps) {
  if (isLoading) {
    return (
      <div className="overflow-x-auto">
        <svg width={SVG_W} height={SVG_H} className="block">
          {Array.from({ length: WEEKS }, (_, w) =>
            Array.from({ length: DAYS }, (_, d) => (
              <rect
                key={`${w}-${d}`}
                x={LEFT_PAD + w * STEP}
                y={TOP_PAD + d * STEP}
                width={CELL}
                height={CELL}
                rx={2}
                className="fill-slate-200 dark:fill-slate-700 animate-pulse"
              />
            ))
          )}
        </svg>
      </div>
    );
  }

  // Build a map from date string → HeatmapDay
  const dayMap = new Map<string, HeatmapDay>();
  for (const d of data) {
    dayMap.set(d.date, d);
  }

  // Start from 364 days ago (Monday-aligned to current week start)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find the Sunday of the week 52 weeks ago (ISO: Monday = 1)
  const start = new Date(today);
  start.setDate(start.getDate() - 364);
  // Align to Sunday of that week
  const startDow = start.getDay(); // 0=Sun
  start.setDate(start.getDate() - startDow);

  // Build cell grid: columns=weeks, rows=days (0=Sun..6=Sat)
  type Cell = { date: string; col: number; row: number; day: HeatmapDay | undefined };
  const cells: Cell[] = [];
  const monthLabelCols = new Map<number, string>();

  const cur = new Date(start);
  let col = 0;
  while (cur <= today) {
    const row = cur.getDay(); // 0=Sun
    const dateStr = cur.toISOString().slice(0, 10);
    cells.push({ date: dateStr, col, row, day: dayMap.get(dateStr) });

    // Track first column of each month
    if (cur.getDate() === 1 || (col === 0 && row === 0)) {
      monthLabelCols.set(col, MONTH_NAMES[cur.getMonth()]);
    }

    cur.setDate(cur.getDate() + 1);
    if (row === 6) col++;
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <svg
          width={SVG_W}
          height={SVG_H}
          className="block"
          role="img"
          aria-label="Year mood heatmap"
        >
          {/* Month labels */}
          {Array.from(monthLabelCols.entries()).map(([c, name]) => (
            <text
              key={`m-${c}`}
              x={LEFT_PAD + c * STEP}
              y={TOP_PAD - 5}
              className="fill-slate-400 dark:fill-slate-500"
              fontSize={9}
            >
              {name}
            </text>
          ))}

          {/* Day-of-week labels */}
          {DAY_LABELS.map(([row, label]) => (
            <text
              key={`dl-${row}`}
              x={LEFT_PAD - 4}
              y={TOP_PAD + row * STEP + CELL - 2}
              textAnchor="end"
              className="fill-slate-400 dark:fill-slate-500"
              fontSize={9}
            >
              {label}
            </text>
          ))}

          {/* Cells */}
          {cells.map(({ date, col: c, row: r, day }) => (
            <rect
              key={date}
              x={LEFT_PAD + c * STEP}
              y={TOP_PAD + r * STEP}
              width={CELL}
              height={CELL}
              rx={2}
              fill={day ? getMoodColor(day.averageMood) : 'var(--heatmap-empty, #e2e8f0)'}
              className={!day ? 'dark:[fill:#334155]' : ''}
            >
              <title>
                {day
                  ? `${date}: mood ${day.averageMood.toFixed(1)} (${day.entryCount} ${day.entryCount === 1 ? 'entry' : 'entries'})`
                  : `${date}: no entries`}
              </title>
            </rect>
          ))}
        </svg>
      </div>
      <MoodLegend />
    </div>
  );
}
