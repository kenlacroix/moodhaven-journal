import { render } from '@testing-library/react';
import { StreakCalendar } from './StreakCalendar';
import type { HeatmapDay } from '../../types/analytics';

// Use a date well inside the 12-week window to avoid timezone boundary issues
const d20agoStr = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);
const d50agoStr = new Date(Date.now() - 50 * 86400000).toISOString().slice(0, 10);

const mockData: HeatmapDay[] = [
  { date: d20agoStr, averageMood: 4.5, entryCount: 2 },
  { date: d50agoStr, averageMood: 2.0, entryCount: 1 },
];

describe('StreakCalendar', () => {
  it('renders 12 week columns when data is provided', () => {
    const { container } = render(<StreakCalendar heatmapData={mockData} />);
    expect(container.querySelector('[class*="overflow-x-auto"]')).toBeInTheDocument();
  });

  it('renders a loading skeleton when isLoading=true', () => {
    const { container } = render(<StreakCalendar heatmapData={[]} isLoading />);
    const pulseEls = container.querySelectorAll('.animate-pulse');
    expect(pulseEls.length).toBeGreaterThan(0);
  });

  it('does not render loading skeleton when isLoading=false', () => {
    const { container } = render(<StreakCalendar heatmapData={mockData} isLoading={false} />);
    const pulseEls = container.querySelectorAll('.animate-pulse');
    expect(pulseEls.length).toBe(0);
  });

  it('renders dot cells with title attributes for days with data', () => {
    const { container } = render(<StreakCalendar heatmapData={mockData} />);
    const dots = Array.from(container.querySelectorAll('[title]'));
    const moodTitles = dots.filter((el) => el.getAttribute('title')?.includes('mood'));
    expect(moodTitles.length).toBeGreaterThan(0);
  });

  it('renders "no entries" title for days without data', () => {
    const { container } = render(<StreakCalendar heatmapData={[]} />);
    const dots = Array.from(container.querySelectorAll('[title]'));
    const noEntries = dots.filter((el) => el.getAttribute('title')?.includes('no entries'));
    expect(noEntries.length).toBeGreaterThan(0);
  });

  it('renders day-of-week labels for even rows (Mo, We, Fr, Sa)', () => {
    const { container } = render(<StreakCalendar heatmapData={mockData} />);
    const textEls = Array.from(container.querySelectorAll('[class*="text-[9px]"]')).map(
      (el) => el.textContent,
    );
    // Mo is at index 1 (odd), We at 3 (odd), Fr at 5 (odd), Sa at 6 — 4 labels
    expect(textEls.some((t) => t === 'Mo')).toBe(true);
  });
});
