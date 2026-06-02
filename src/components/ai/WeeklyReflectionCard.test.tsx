import { render, screen } from '@testing-library/react';
import { WeeklyReflectionCard } from './WeeklyReflectionCard';
import type { WeeklyReflection } from '../../types/ai';

const mockReflection: WeeklyReflection = {
  weekStart: 'May 11',
  weekEnd: 'May 17',
  summary: {
    moodAverage: 4.1,
    moodTrend: 'up',
    entryCount: 5,
    dominantEmotions: ['grateful'],
  },
  highlights: ['Completed a project', 'Went for a walk'],
  reflectionPrompts: ['What made this week good?', 'What would you change?'],
  focusSuggestion: 'Keep up the momentum',
};

describe('WeeklyReflectionCard', () => {
  it('shows loading skeleton when loading and no reflection', () => {
    const { container } = render(<WeeklyReflectionCard reflection={null} isLoading={true} />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders nothing when not loading and no reflection', () => {
    const { container } = render(<WeeklyReflectionCard reflection={null} isLoading={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the week date range', () => {
    render(<WeeklyReflectionCard reflection={mockReflection} isLoading={false} />);
    expect(screen.getByText('May 11 – May 17')).toBeInTheDocument();
  });

  it('renders Weekly Reflection heading', () => {
    render(<WeeklyReflectionCard reflection={mockReflection} isLoading={false} />);
    expect(screen.getByText('Weekly Reflection')).toBeInTheDocument();
  });

  it('shows the focus suggestion', () => {
    render(<WeeklyReflectionCard reflection={mockReflection} isLoading={false} />);
    expect(screen.getByText(/Keep up the momentum/)).toBeInTheDocument();
  });

  it('shows up-trend emoji for moodTrend "up"', () => {
    render(<WeeklyReflectionCard reflection={mockReflection} isLoading={false} />);
    expect(screen.getByText((c) => c.includes('📈'))).toBeInTheDocument();
  });

  it('shows down-trend emoji for moodTrend "down"', () => {
    const downReflection = { ...mockReflection, summary: { ...mockReflection.summary, moodTrend: 'down' as const } };
    render(<WeeklyReflectionCard reflection={downReflection} isLoading={false} />);
    expect(screen.getByText((c) => c.includes('📉'))).toBeInTheDocument();
  });
});
