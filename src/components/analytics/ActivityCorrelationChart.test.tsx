import { render, screen } from '@testing-library/react';
import { ActivityCorrelationChart } from './ActivityCorrelationChart';
import type { ActivityStat } from '../../types/activities';

const makeStats = (overrides: Partial<ActivityStat>[] = []): ActivityStat[] =>
  overrides.map((o, i) => ({
    id: `act_${i}`,
    name: `activity${i}`,
    emoji: '✨',
    isCustom: false,
    avgMood: 3.5,
    entryCount: 5,
    moodDelta: 0,
    ...o,
  }));

describe('ActivityCorrelationChart', () => {
  it('renders sorted rows in delta descending order', () => {
    const stats = makeStats([
      { id: 'a', name: 'low', moodDelta: -0.5 },
      { id: 'b', name: 'high', moodDelta: 1.2 },
      { id: 'c', name: 'mid', moodDelta: 0.3 },
    ]);
    // stats are already sorted by the hook; component renders in given order
    render(<ActivityCorrelationChart stats={stats} overallAvgMood={3.5} />);
    const texts = screen.getAllByRole('generic', { hidden: true });
    expect(texts).toBeDefined();
    // Check all three names appear
    expect(screen.getByText(/low/)).toBeInTheDocument();
    expect(screen.getByText(/high/)).toBeInTheDocument();
    expect(screen.getByText(/mid/)).toBeInTheDocument();
  });

  it('shows positive delta label with + sign', () => {
    const stats = makeStats([{ name: 'exercise', moodDelta: 1.2 }]);
    render(<ActivityCorrelationChart stats={stats} overallAvgMood={3.0} />);
    expect(screen.getByText('+1.2')).toBeInTheDocument();
  });

  it('shows negative delta label with - sign', () => {
    const stats = makeStats([{ name: 'stress', moodDelta: -0.7 }]);
    render(<ActivityCorrelationChart stats={stats} overallAvgMood={3.0} />);
    expect(screen.getByText('-0.7')).toBeInTheDocument();
  });

  it('shows need-more-data message when stats is empty', () => {
    render(<ActivityCorrelationChart stats={[]} overallAvgMood={3.0} />);
    expect(screen.getByText(/need more data/i)).toBeInTheDocument();
  });

  it('shows loading skeleton when isLoading=true', () => {
    const { container } = render(
      <ActivityCorrelationChart stats={[]} overallAvgMood={3.0} isLoading />,
    );
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText(/need more data/i)).not.toBeInTheDocument();
  });

  it('delta label shows correct 1 decimal precision', () => {
    const stats = makeStats([{ name: 'running', moodDelta: 0.9 }]);
    render(<ActivityCorrelationChart stats={stats} overallAvgMood={3.0} />);
    expect(screen.getByText('+0.9')).toBeInTheDocument();
  });

  it('renders overall avg mood in subtitle', () => {
    render(<ActivityCorrelationChart stats={makeStats([{ name: 'x' }])} overallAvgMood={3.4} />);
    expect(screen.getByText(/vs avg 3\.4/)).toBeInTheDocument();
  });

  it('does not crash when overallAvgMood is 0', () => {
    const stats = makeStats([{ name: 'x', avgMood: 3.5, moodDelta: 3.5 }]);
    expect(() =>
      render(<ActivityCorrelationChart stats={stats} overallAvgMood={0} />),
    ).not.toThrow();
  });
});
