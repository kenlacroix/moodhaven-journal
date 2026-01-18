/**
 * Chart utility functions for lightweight SVG-based charts
 */

import { MOOD_OPTIONS } from '../types/journal';

/**
 * Get mood color from mood level (1-5)
 */
export function getMoodColor(mood: number): string {
  const colors: Record<number, string> = {
    1: '#f43f5e', // rose-500
    2: '#fb923c', // orange-400
    3: '#fbbf24', // amber-400
    4: '#a3e635', // lime-400
    5: '#10b981', // emerald-500
  };
  return colors[Math.round(mood)] || '#94a3b8'; // slate-400 default
}

/**
 * Get mood color class from mood level
 */
export function getMoodColorClass(mood: number): string {
  const option = MOOD_OPTIONS.find((o) => o.level === Math.round(mood));
  return option?.color || 'bg-slate-400';
}

/**
 * Get mood emoji from mood level
 */
export function getMoodEmoji(mood: number): string {
  const option = MOOD_OPTIONS.find((o) => o.level === Math.round(mood));
  return option?.emoji || '😐';
}

/**
 * Generate SVG path for a line chart
 */
export function generateLinePath(
  points: Array<{ x: number; y: number }>,
  smooth: boolean = true
): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  if (!smooth) {
    return points
      .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
      .join(' ');
  }

  // Catmull-Rom spline for smooth curves
  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return path;
}

/**
 * Generate SVG area path (line path closed at bottom)
 */
export function generateAreaPath(
  points: Array<{ x: number; y: number }>,
  baseY: number,
  smooth: boolean = true
): string {
  if (points.length === 0) return '';

  const linePath = generateLinePath(points, smooth);
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];

  return `${linePath} L ${lastPoint.x} ${baseY} L ${firstPoint.x} ${baseY} Z`;
}

/**
 * Map data points to chart coordinates
 */
export function mapToChartCoordinates(
  data: Array<{ value: number }>,
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number },
  minValue: number = 1,
  maxValue: number = 5
): Array<{ x: number; y: number }> {
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  return data.map((d, i) => {
    const x = padding.left + (i / Math.max(1, data.length - 1)) * chartWidth;
    const normalizedValue = (d.value - minValue) / (maxValue - minValue);
    const y = padding.top + chartHeight - normalizedValue * chartHeight;

    return { x, y };
  });
}

/**
 * Format number for display
 */
export function formatNumber(value: number, decimals: number = 1): string {
  return value.toFixed(decimals);
}
