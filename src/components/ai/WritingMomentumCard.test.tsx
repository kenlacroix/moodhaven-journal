import { render, screen } from '@testing-library/react';
import { WritingMomentumCard } from './WritingMomentumCard';
import type { FrequencyPattern } from '../../types/ai';

const PATTERNS: Array<{ freq: FrequencyPattern; label: string }> = [
  { freq: 'daily',    label: 'On a roll' },
  { freq: 'regular',  label: 'Building momentum' },
  { freq: 'sporadic', label: 'Getting started' },
  { freq: 'rare',     label: 'Just warming up' },
];

describe('WritingMomentumCard', () => {
  it.each(PATTERNS)('renders "$label" for $freq frequency', ({ freq, label }) => {
    render(<WritingMomentumCard frequency={freq} entriesThisWeek={2} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('shows entries this week count', () => {
    render(<WritingMomentumCard frequency="daily" entriesThisWeek={5} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('defaults weeklyGoal to 3', () => {
    render(<WritingMomentumCard frequency="regular" entriesThisWeek={2} />);
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('uses provided weeklyGoal', () => {
    render(<WritingMomentumCard frequency="regular" entriesThisWeek={4} weeklyGoal={7} />);
    expect(screen.getByText('4 / 7')).toBeInTheDocument();
  });

  it('clamps bar width to 100% when entries exceed goal', () => {
    const { container } = render(
      <WritingMomentumCard frequency="daily" entriesThisWeek={10} weeklyGoal={3} />,
    );
    const bar = container.querySelector('[style*="width: 100%"]');
    expect(bar).toBeInTheDocument();
  });

  it('renders 0% bar width when entries is 0', () => {
    const { container } = render(
      <WritingMomentumCard frequency="rare" entriesThisWeek={0} weeklyGoal={3} />,
    );
    const bar = container.querySelector('[style*="width: 0%"]');
    expect(bar).toBeInTheDocument();
  });
});
