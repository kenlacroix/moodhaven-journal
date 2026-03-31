/**
 * MoodTrendChart - SVG line chart showing mood trends over time
 */

import { useMemo } from 'react';
import { generateLinePath, generateAreaPath, mapToChartCoordinates, getMoodColor } from '../../lib/utils/chartUtils';
import type { TrendDataPoint, AnalyticsPeriod } from '../../types/analytics';
import { ANALYTICS_PERIODS } from '../../types/analytics';

interface MoodTrendChartProps {
  data: TrendDataPoint[];
  period: AnalyticsPeriod;
  onPeriodChange: (period: AnalyticsPeriod) => void;
  isLoading?: boolean;
}

const CHART_WIDTH = 400;
const CHART_HEIGHT = 200;
const PADDING = { top: 20, right: 20, bottom: 30, left: 40 };

export function MoodTrendChart({
  data,
  period,
  onPeriodChange,
  isLoading = false,
}: MoodTrendChartProps) {
  const chartData = useMemo(() => {
    if (data.length === 0) return { points: [], linePath: '', areaPath: '', avgMood: 0 };

    const points = mapToChartCoordinates(
      data.map((d) => ({ value: d.averageMood })),
      CHART_WIDTH,
      CHART_HEIGHT,
      PADDING,
      1,
      5
    );

    const linePath = generateLinePath(points, true);
    const areaPath = generateAreaPath(points, CHART_HEIGHT - PADDING.bottom, true);
    const avgMood = data.reduce((sum, d) => sum + d.averageMood, 0) / data.length;

    return { points, linePath, areaPath, avgMood };
  }, [data]);

  const yAxisLabels = [5, 4, 3, 2, 1];
  const chartHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  return (
    <div className="card p-4">
      {/* Header with period selector */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Mood Trend
        </h3>

        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
          {ANALYTICS_PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => onPeriodChange(p)}
              className={`
                px-3 py-1 text-xs font-medium rounded-md
                transition-colors duration-200
                ${
                  period.key === p.key
                    ? 'bg-white dark:bg-slate-700 text-violet-600 dark:text-violet-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }
              `}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {isLoading ? (
        <div className="h-[200px] bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
      ) : data.length === 0 ? (
        <div className="h-[200px] flex items-center justify-center text-slate-500 dark:text-slate-400">
          <div className="text-center">
            <p>No mood data for this period</p>
            <p className="text-xs mt-1">Track your mood to see trends</p>
          </div>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="w-full h-auto"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Grid lines */}
          {yAxisLabels.map((label) => {
            const y = PADDING.top + ((5 - label) / 4) * chartHeight;
            return (
              <g key={label}>
                <line
                  x1={PADDING.left}
                  y1={y}
                  x2={CHART_WIDTH - PADDING.right}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity={0.1}
                  className="text-slate-400"
                />
                <text
                  x={PADDING.left - 8}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="text-[10px] fill-slate-400"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={getMoodColor(chartData.avgMood)} stopOpacity={0.3} />
              <stop offset="100%" stopColor={getMoodColor(chartData.avgMood)} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <path
            d={chartData.areaPath}
            fill="url(#areaGradient)"
          />

          {/* Line */}
          <path
            d={chartData.linePath}
            fill="none"
            stroke={getMoodColor(chartData.avgMood)}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data points */}
          {chartData.points.map((point, i) => (
            <circle
              key={i}
              cx={point.x}
              cy={point.y}
              r={3}
              fill={getMoodColor(data[i].averageMood)}
              stroke="white"
              strokeWidth={1.5}
              className="opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
            >
              <title>
                {data[i].date}: {data[i].averageMood.toFixed(1)}
              </title>
            </circle>
          ))}

          {/* X-axis labels (first, middle, last) */}
          {data.length > 0 && (
            <>
              <text
                x={PADDING.left}
                y={CHART_HEIGHT - 8}
                textAnchor="start"
                className="text-[10px] fill-slate-400"
              >
                {formatDateLabel(data[0].date)}
              </text>
              {data.length > 2 && (
                <text
                  x={CHART_WIDTH / 2}
                  y={CHART_HEIGHT - 8}
                  textAnchor="middle"
                  className="text-[10px] fill-slate-400"
                >
                  {formatDateLabel(data[Math.floor(data.length / 2)].date)}
                </text>
              )}
              <text
                x={CHART_WIDTH - PADDING.right}
                y={CHART_HEIGHT - 8}
                textAnchor="end"
                className="text-[10px] fill-slate-400"
              >
                {formatDateLabel(data[data.length - 1].date)}
              </text>
            </>
          )}
        </svg>
      )}
    </div>
  );
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
