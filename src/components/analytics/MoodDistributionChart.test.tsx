import { render, screen } from '@testing-library/react';
import { MoodDistributionChart } from './MoodDistributionChart';
import type { MoodDistribution } from '../../types/analytics';

const mockData: MoodDistribution[] = [
  { mood: 5, count: 10, percentage: 40 },
  { mood: 4, count: 8, percentage: 32 },
  { mood: 3, count: 5, percentage: 20 },
  { mood: 2, count: 2, percentage: 8 },
  { mood: 1, count: 0, percentage: 0 },
];

describe('MoodDistributionChart', () => {
  it('bar element has correct width style', () => {
    const { container } = render(<MoodDistributionChart data={mockData} />);
    const bars = container.querySelectorAll('.animate-bar-grow');
    // Mood 5 should be the widest bar (40% = 100% of max)
    const topBar = bars[0] as HTMLElement;
    expect(topBar.style.width).toBe('100%');
  });

  it('bar element has animate-bar-grow and origin-left classes', () => {
    const { container } = render(<MoodDistributionChart data={mockData} />);
    const bars = container.querySelectorAll('.animate-bar-grow.origin-left');
    expect(bars.length).toBe(5);
  });

  it('shows empty state when no data', () => {
    const emptyData: MoodDistribution[] = [
      { mood: 5, count: 0, percentage: 0 },
      { mood: 4, count: 0, percentage: 0 },
      { mood: 3, count: 0, percentage: 0 },
      { mood: 2, count: 0, percentage: 0 },
      { mood: 1, count: 0, percentage: 0 },
    ];
    render(<MoodDistributionChart data={emptyData} />);
    expect(screen.getByText('No mood data yet')).toBeInTheDocument();
  });
});
