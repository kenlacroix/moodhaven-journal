import { render, screen } from '@testing-library/react';
import { WellbeingCard } from './WellbeingCard';
import type { WellbeingContext } from '../../lib/stillService';

const BASE: WellbeingContext = {
  oura_readiness_today: null,
  last_still_session_days_ago: null,
  yesterday_mood_avg: null,
  yesterday_entry_count: 0,
  streak_days: 0,
};

describe('WellbeingCard', () => {
  it('renders nothing when all data is null', () => {
    const { container } = render(<WellbeingCard context={BASE} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows Oura readiness when present', () => {
    render(<WellbeingCard context={{ ...BASE, oura_readiness_today: 72 }} />);
    expect(screen.getByText(/Oura readiness/)).toBeInTheDocument();
    expect(screen.getByText(/72/)).toBeInTheDocument();
  });

  it('hides Oura row when readiness is null', () => {
    render(<WellbeingCard context={{ ...BASE, last_still_session_days_ago: 3 }} />);
    expect(screen.queryByText(/Oura readiness/)).not.toBeInTheDocument();
  });

  it('shows StillHaven last session when present', () => {
    render(<WellbeingCard context={{ ...BASE, last_still_session_days_ago: 2 }} />);
    expect(screen.getByText(/Last grounding/)).toBeInTheDocument();
    expect(screen.getByText(/2 days ago/)).toBeInTheDocument();
  });

  it('hides StillHaven row when no sessions', () => {
    render(<WellbeingCard context={{ ...BASE, oura_readiness_today: 80 }} />);
    expect(screen.queryByText(/Last grounding/)).not.toBeInTheDocument();
  });

  it('shows yesterday mood when present with entries', () => {
    render(
      <WellbeingCard
        context={{ ...BASE, yesterday_mood_avg: 3.8, yesterday_entry_count: 2 }}
      />,
    );
    expect(screen.getByText(/Yesterday/)).toBeInTheDocument();
    expect(screen.getByText(/2 entries/)).toBeInTheDocument();
  });

  it('hides yesterday mood when entry count is 0', () => {
    render(
      <WellbeingCard
        context={{ ...BASE, yesterday_mood_avg: 3.5, yesterday_entry_count: 0 }}
      />,
    );
    expect(screen.queryByText(/Yesterday/)).not.toBeInTheDocument();
  });

  it('shows streak when streak > 1', () => {
    render(<WellbeingCard context={{ ...BASE, oura_readiness_today: 80, streak_days: 7 }} />);
    expect(screen.getByText(/7-day streak/)).toBeInTheDocument();
  });

  it('hides streak text when streak <= 1', () => {
    render(<WellbeingCard context={{ ...BASE, oura_readiness_today: 80, streak_days: 1 }} />);
    expect(screen.queryByText(/1-day streak/)).not.toBeInTheDocument();
  });
});
