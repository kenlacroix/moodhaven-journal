import type { ActivityStat } from '../../types/activities';

interface ActivityCorrelationChartProps {
  stats: ActivityStat[];
  overallAvgMood: number;
  isLoading?: boolean;
}

const CHART_WIDTH = 400;
const CENTER_X = 200;
const BAR_MAX_PX = 150; // px for a ±2.0 delta swing
const ROW_H = 28;
const LABEL_W = 130;
const GAP = 4;

function deltaToWidth(delta: number): number {
  return Math.min(Math.abs(delta) * (BAR_MAX_PX / 2.0), BAR_MAX_PX);
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-2 py-1.5 animate-pulse">
      <div className="w-28 h-4 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="flex-1 h-4 rounded bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}

export function ActivityCorrelationChart({
  stats,
  overallAvgMood,
  isLoading = false,
}: ActivityCorrelationChartProps) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800">
        <div className="h-5 w-48 rounded bg-slate-200 dark:bg-slate-700 animate-pulse mb-4" />
        {[0, 1, 2, 3].map((i) => <SkeletonRow key={i} />)}
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Activity Correlation</p>
        <p className="text-xs text-slate-400">
          Need more data — tag activities on at least 3 entries each to see mood patterns.
        </p>
      </div>
    );
  }

  const svgH = stats.length * (ROW_H + GAP) + 20;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800">
      <div className="flex items-baseline gap-2 mb-3">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Activity Correlation</p>
        <p className="text-[10px] text-slate-400">vs avg {overallAvgMood.toFixed(1)}</p>
      </div>

      <div className="overflow-x-auto">
        <svg
          width={CHART_WIDTH}
          height={svgH}
          viewBox={`0 0 ${CHART_WIDTH} ${svgH}`}
          aria-label="Activity mood correlation chart"
        >
          {/* Center line */}
          <line
            x1={CENTER_X}
            y1={0}
            x2={CENTER_X}
            y2={svgH}
            stroke="currentColor"
            strokeWidth={1}
            className="text-slate-200 dark:text-slate-700"
          />

          {stats.map((s, i) => {
            const delta = s.moodDelta ?? 0;
            const barW = deltaToWidth(delta);
            const y = i * (ROW_H + GAP) + 4;
            const isPositive = delta >= 0;
            const barX = isPositive ? CENTER_X : CENTER_X - barW;
            const deltaLabel = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`;

            return (
              <g key={s.id}>
                {/* Activity label */}
                <text
                  x={LABEL_W - 4}
                  y={y + ROW_H / 2 + 4}
                  textAnchor="end"
                  className="text-[11px] fill-slate-600 dark:fill-slate-300"
                  fontSize={11}
                  fill="currentColor"
                >
                  {s.emoji} {s.name}
                </text>

                {/* Bar */}
                {barW > 1 && (
                  <rect
                    x={barX}
                    y={y + 4}
                    width={barW}
                    height={ROW_H - 8}
                    rx={2}
                    fill={isPositive ? '#10b981' : '#fb7185'}
                    opacity={0.85}
                  />
                )}

                {/* Delta label */}
                <text
                  x={isPositive ? CENTER_X + barW + 4 : CENTER_X - barW - 4}
                  y={y + ROW_H / 2 + 4}
                  textAnchor={isPositive ? 'start' : 'end'}
                  fontSize={10}
                  fill={isPositive ? '#10b981' : '#fb7185'}
                >
                  {deltaLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <p className="mt-2 text-[10px] text-slate-400">
        Activities with 3+ tagged entries. Bars show avg mood vs your overall average.
      </p>
    </div>
  );
}
