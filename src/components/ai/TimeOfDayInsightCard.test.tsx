import { render, screen } from '@testing-library/react';
import { TimeOfDayInsightCard } from './TimeOfDayInsightCard';
import type { TimeOfDay } from '../../types/ai';

const TIME_SLOTS: Array<{ tod: TimeOfDay; label: string }> = [
  { tod: 'morning',   label: 'Morning' },
  { tod: 'afternoon', label: 'Afternoon' },
  { tod: 'evening',   label: 'Evening' },
  { tod: 'night',     label: 'Night' },
];

describe('TimeOfDayInsightCard', () => {
  it.each(TIME_SLOTS)('renders "$label" label for $tod time of day', ({ tod, label }) => {
    render(<TimeOfDayInsightCard bestTimeOfDay={tod} currentStreak={0} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('highlights the active slot bar', () => {
    const { container } = render(<TimeOfDayInsightCard bestTimeOfDay="morning" currentStreak={0} />);
    const bars = container.querySelectorAll('[class*="bg-violet-500"]');
    expect(bars.length).toBeGreaterThan(0);
  });

  it('shows streak message when currentStreak > 0', () => {
    render(<TimeOfDayInsightCard bestTimeOfDay="evening" currentStreak={7} />);
    expect(screen.getByText(/7-day writing streak/)).toBeInTheDocument();
  });

  it('hides streak message when currentStreak is 0', () => {
    render(<TimeOfDayInsightCard bestTimeOfDay="evening" currentStreak={0} />);
    expect(screen.queryByText(/writing streak/)).not.toBeInTheDocument();
  });

  it('renders "Best writing time" heading', () => {
    render(<TimeOfDayInsightCard bestTimeOfDay="morning" currentStreak={0} />);
    expect(screen.getByText('Best writing time')).toBeInTheDocument();
  });
});
