import { render, screen } from '@testing-library/react';
import { GratitudeStreakCard } from './GratitudeStreakCard';

describe('GratitudeStreakCard', () => {
  it('renders nothing when streak is 0', () => {
    const { container } = render(<GratitudeStreakCard currentStreak={0} longestStreak={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the current streak count', () => {
    render(<GratitudeStreakCard currentStreak={5} longestStreak={10} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows "day" (singular) for a 1-day streak', () => {
    render(<GratitudeStreakCard currentStreak={1} longestStreak={1} />);
    expect(screen.getByText('day')).toBeInTheDocument();
  });

  it('shows "days" (plural) for streaks > 1', () => {
    render(<GratitudeStreakCard currentStreak={3} longestStreak={10} />);
    expect(screen.getByText('days')).toBeInTheDocument();
  });

  it('shows "Personal best!" badge when currentStreak equals longestStreak', () => {
    render(<GratitudeStreakCard currentStreak={10} longestStreak={10} />);
    expect(screen.getByText('Personal best!')).toBeInTheDocument();
  });

  it('does not show "Personal best!" when streak is below longest', () => {
    render(<GratitudeStreakCard currentStreak={5} longestStreak={10} />);
    expect(screen.queryByText('Personal best!')).not.toBeInTheDocument();
  });

  it('shows days-to-milestone text when under a milestone', () => {
    render(<GratitudeStreakCard currentStreak={5} longestStreak={10} />);
    expect(screen.getByText(/more days to reach your 7-day milestone/i)).toBeInTheDocument();
  });

  it('shows best streak in the right panel', () => {
    render(<GratitudeStreakCard currentStreak={5} longestStreak={14} />);
    expect(screen.getByText('14d')).toBeInTheDocument();
  });
});
