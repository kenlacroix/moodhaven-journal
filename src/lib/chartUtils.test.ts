import {
  getMoodColor,
  getMoodColorClass,
  getMoodEmoji,
  generateLinePath,
  generateAreaPath,
  mapToChartCoordinates,
  formatNumber,
} from './chartUtils';

describe('chartUtils', () => {
  describe('getMoodColor', () => {
    it('returns rose for mood 1', () => {
      expect(getMoodColor(1)).toBe('#f43f5e');
    });

    it('returns orange for mood 2', () => {
      expect(getMoodColor(2)).toBe('#fb923c');
    });

    it('returns amber for mood 3', () => {
      expect(getMoodColor(3)).toBe('#fbbf24');
    });

    it('returns lime for mood 4', () => {
      expect(getMoodColor(4)).toBe('#a3e635');
    });

    it('returns emerald for mood 5', () => {
      expect(getMoodColor(5)).toBe('#10b981');
    });

    it('returns slate fallback for out-of-range value', () => {
      expect(getMoodColor(0)).toBe('#94a3b8');
      expect(getMoodColor(6)).toBe('#94a3b8');
    });

    it('rounds fractional values', () => {
      expect(getMoodColor(3.7)).toBe('#a3e635'); // rounds to 4
      expect(getMoodColor(2.3)).toBe('#fb923c'); // rounds to 2
    });
  });

  describe('getMoodColorClass', () => {
    it('returns correct class for mood 1', () => {
      expect(getMoodColorClass(1)).toBe('bg-rose-500');
    });

    it('returns correct class for mood 5', () => {
      expect(getMoodColorClass(5)).toBe('bg-emerald-500');
    });

    it('returns fallback for unknown mood', () => {
      expect(getMoodColorClass(0)).toBe('bg-slate-400');
    });
  });

  describe('getMoodEmoji', () => {
    it('returns correct emoji for each mood level', () => {
      expect(getMoodEmoji(1)).toBe('😔');
      expect(getMoodEmoji(2)).toBe('😕');
      expect(getMoodEmoji(3)).toBe('😐');
      expect(getMoodEmoji(4)).toBe('🙂');
      expect(getMoodEmoji(5)).toBe('😊');
    });

    it('returns default emoji for unknown mood', () => {
      expect(getMoodEmoji(0)).toBe('😐');
    });
  });

  describe('generateLinePath', () => {
    it('returns empty string for empty points array', () => {
      expect(generateLinePath([])).toBe('');
    });

    it('returns single M command for one point', () => {
      expect(generateLinePath([{ x: 10, y: 20 }])).toBe('M 10 20');
    });

    it('generates non-smooth path with M and L commands', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 20 },
        { x: 20, y: 10 },
      ];
      const path = generateLinePath(points, false);
      expect(path).toBe('M 0 0 L 10 20 L 20 10');
    });

    it('generates smooth Catmull-Rom path with C commands', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 20 },
        { x: 20, y: 10 },
      ];
      const path = generateLinePath(points, true);
      expect(path).toContain('M 0 0');
      expect(path).toContain('C'); // Has cubic bezier commands
    });

    it('smooth path has n-1 curve segments for n points', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 20 },
        { x: 20, y: 10 },
        { x: 30, y: 15 },
      ];
      const path = generateLinePath(points, true);
      const cCount = (path.match(/ C /g) || []).length;
      expect(cCount).toBe(3); // 4 points -> 3 curves
    });
  });

  describe('generateAreaPath', () => {
    it('returns empty string for empty points', () => {
      expect(generateAreaPath([], 100)).toBe('');
    });

    it('closes path at baseY', () => {
      const points = [
        { x: 0, y: 10 },
        { x: 50, y: 20 },
      ];
      const path = generateAreaPath(points, 100, false);
      expect(path).toContain('L 50 100'); // last point to base
      expect(path).toContain('L 0 100'); // first point base
      expect(path.endsWith('Z')).toBe(true);
    });
  });

  describe('mapToChartCoordinates', () => {
    const padding = { top: 10, right: 10, bottom: 10, left: 10 };

    it('maps single point to center of chart', () => {
      const result = mapToChartCoordinates([{ value: 3 }], 100, 100, padding);
      expect(result).toHaveLength(1);
      expect(result[0].x).toBe(10); // left padding
    });

    it('maps min value to bottom of chart area', () => {
      const result = mapToChartCoordinates([{ value: 1 }], 100, 100, padding);
      expect(result[0].y).toBe(90); // top + chartHeight - 0 * chartHeight = 10 + 80 = 90
    });

    it('maps max value to top of chart area', () => {
      const result = mapToChartCoordinates([{ value: 5 }], 100, 100, padding);
      expect(result[0].y).toBe(10); // top padding
    });

    it('distributes multiple points evenly across width', () => {
      const data = [{ value: 3 }, { value: 3 }, { value: 3 }];
      const result = mapToChartCoordinates(data, 100, 100, padding);
      expect(result[0].x).toBe(10); // left padding
      expect(result[1].x).toBe(50); // midpoint
      expect(result[2].x).toBe(90); // right edge
    });

    it('respects custom min/max values', () => {
      const result = mapToChartCoordinates(
        [{ value: 50 }],
        100,
        100,
        padding,
        0,
        100
      );
      // 50 is midpoint of 0-100, so y should be at middle of chart area
      expect(result[0].y).toBe(50);
    });
  });

  describe('formatNumber', () => {
    it('formats with 1 decimal by default', () => {
      expect(formatNumber(3.14159)).toBe('3.1');
    });

    it('formats with specified decimals', () => {
      expect(formatNumber(3.14159, 2)).toBe('3.14');
    });

    it('pads integer with trailing zero', () => {
      expect(formatNumber(5)).toBe('5.0');
    });
  });
});
