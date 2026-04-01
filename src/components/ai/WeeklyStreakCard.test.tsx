import { render, screen } from '@testing-library/react';
import { WeeklyStreakCard } from './WeeklyStreakCard';
import { countEntriesThisWeek, getISOWeekStart } from '../../lib/utils/dateUtils';

describe('WeeklyStreakCard', () => {
  it('H2-1: displays "3 of 3 this week" when entries_this_week=3, weekly_goal=3', () => {
    render(<WeeklyStreakCard entriesThisWeek={3} weeklyGoal={3} />);
    expect(screen.getByLabelText('3 of 3 this week')).toBeInTheDocument();
    expect(screen.getByText('Goal reached!')).toBeInTheDocument();
  });

  it('H2-2: animate-mood-pop applied when goal transitions from goal-1 to goal', () => {
    const { rerender } = render(<WeeklyStreakCard entriesThisWeek={2} weeklyGoal={3} />);
    expect(screen.queryByLabelText('2 of 3 this week')?.className).not.toContain('animate-mood-pop');

    rerender(<WeeklyStreakCard entriesThisWeek={3} weeklyGoal={3} />);
    const el = screen.getByLabelText('3 of 3 this week');
    expect(el.className).toContain('animate-mood-pop');
  });

  it('H2-3: shows "Write your first entry this week" when entries_this_week=0', () => {
    render(<WeeklyStreakCard entriesThisWeek={0} weeklyGoal={3} />);
    expect(screen.getByText('Write your first entry this week')).toBeInTheDocument();
    expect(screen.queryByLabelText(/of 3 this week/)).not.toBeInTheDocument();
  });
});

describe('countEntriesThisWeek (H2-4 — ISO week boundary)', () => {
  it('returns 0 for entries outside the current ISO week boundary', () => {
    // Build an entry dated to last Monday (safe: always in last week)
    const weekStart = getISOWeekStart(new Date());
    const lastWeekDate = new Date(weekStart);
    lastWeekDate.setDate(lastWeekDate.getDate() - 1); // Sunday of last week

    const entries = [{ created_at: lastWeekDate.toISOString() }];
    expect(countEntriesThisWeek(entries)).toBe(0);
  });

  it('counts entries within the current ISO week', () => {
    const weekStart = getISOWeekStart(new Date());
    const thisWeekDate = new Date(weekStart);
    thisWeekDate.setDate(thisWeekDate.getDate() + 1); // Tuesday of this week

    const entries = [
      { created_at: thisWeekDate.toISOString() },
      { created_at: new Date().toISOString() },
    ];
    expect(countEntriesThisWeek(entries)).toBe(2);
  });
});
