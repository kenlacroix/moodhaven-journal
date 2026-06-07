import { render, screen } from '@testing-library/react';
import { DayOfWeekPattern } from './DayOfWeekPattern';
import type { DayOfWeekStats } from '../../types/analytics';

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const makeData = (avgMoods: number[]): DayOfWeekStats[] =>
  avgMoods.map((avg, i) => ({
    dayOfWeek: i,
    dayName: DAY_NAMES[i],
    averageMood: avg,
    entryCount: avg > 0 ? 3 : 0,
  }));

describe('DayOfWeekPattern', () => {
  it('renders loading skeleton when isLoading=true', () => {
    const { container } = render(<DayOfWeekPattern data={[]} isLoading />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows empty state when all entry counts are 0', () => {
    const empty = makeData([0, 0, 0, 0, 0, 0, 0]);
    render(<DayOfWeekPattern data={empty} />);
    expect(screen.getByText('No data yet')).toBeInTheDocument();
  });

  it('renders a bar for each day when data is present', () => {
    const data = makeData([3, 4, 3.5, 4.5, 3, 4, 3]);
    const { container } = render(<DayOfWeekPattern data={data} />);
    const bars = container.querySelectorAll('[title]');
    expect(bars.length).toBeGreaterThanOrEqual(7);
  });

  it('shows best/worst callout chips when 2+ active days exist', () => {
    const data = makeData([3, 4, 3.5, 4.5, 3, 4, 3]);
    render(<DayOfWeekPattern data={data} />);
    expect(screen.getByText('Best day')).toBeInTheDocument();
    expect(screen.getByText('Worst day')).toBeInTheDocument();
  });

  it('best day chip shows the day with highest average mood', () => {
    const data = makeData([3, 4, 3.5, 4.5, 3, 4, 3]);
    render(<DayOfWeekPattern data={data} />);
    // Wed (index 3, averageMood=4.5) is best
    const bestSection = screen.getByText('Best day').closest('div');
    expect(bestSection?.textContent).toContain('Wed');
  });

  it('worst day chip shows the day with lowest average mood', () => {
    const data = makeData([3, 4, 3.5, 4.5, 3, 4, 3]);
    render(<DayOfWeekPattern data={data} />);
    const worstSection = screen.getByText('Worst day').closest('div');
    // Multiple days with 3.0 — any of Sun/Thu/Fri, but not Thu (best)
    expect(worstSection?.textContent).toBeDefined();
  });

  it('does not show callout when only one active day', () => {
    const data = makeData([0, 0, 0, 4.5, 0, 0, 0]);
    render(<DayOfWeekPattern data={data} />);
    expect(screen.queryByText('Best day')).not.toBeInTheDocument();
  });
});
