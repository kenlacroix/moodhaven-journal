import { render, screen } from '@testing-library/react';
import { StillEffectCard } from './StillEffectCard';
import type { StillEffectStats } from '../../../lib/stillService';

const emptyStats: StillEffectStats = {
  per_protocol: [],
  best_protocol: null,
  sessions_with_data: 0,
  avg_mood_after: null,
};

const oneSession: StillEffectStats = {
  per_protocol: [
    { protocol: 'general_activation', session_count: 1, avg_activation_delta: 2.5, avg_mood_after: 4.0 },
  ],
  best_protocol: null,
  sessions_with_data: 1,
  avg_mood_after: 4.0,
};

const twoSessions: StillEffectStats = {
  per_protocol: [
    { protocol: 'general_activation', session_count: 2, avg_activation_delta: 2.5, avg_mood_after: 4.0 },
  ],
  best_protocol: null,
  sessions_with_data: 2,
  avg_mood_after: 4.0,
};

const fullStats: StillEffectStats = {
  per_protocol: [
    { protocol: 'general_activation', session_count: 4, avg_activation_delta: 3.2, avg_mood_after: 4.1 },
    { protocol: 'fake_danger', session_count: 2, avg_activation_delta: 1.8, avg_mood_after: 3.6 },
  ],
  best_protocol: 'general_activation',
  sessions_with_data: 6,
  avg_mood_after: 3.9,
};

const noMoodStats: StillEffectStats = {
  per_protocol: [
    { protocol: 'general_activation', session_count: 3, avg_activation_delta: 2.0, avg_mood_after: null },
  ],
  best_protocol: null,
  sessions_with_data: 3,
  avg_mood_after: null,
};

describe('StillEffectCard', () => {
  it('shows empty state with remaining count when sessions_with_data < 3', () => {
    render(<StillEffectCard stats={emptyStats} />);
    expect(screen.getByTestId('still-effect-card-empty')).toBeInTheDocument();
    expect(screen.getByText(/3 more sessions/)).toBeInTheDocument();
  });

  it('shows 2 remaining (plural) when sessions_with_data is 1', () => {
    render(<StillEffectCard stats={oneSession} />);
    expect(screen.getByText(/2 more sessions/)).toBeInTheDocument();
  });

  it('shows 1 remaining (singular "session") when sessions_with_data is 2', () => {
    render(<StillEffectCard stats={twoSessions} />);
    expect(screen.getByText(/1 more session[^s]/)).toBeInTheDocument();
  });

  it('renders full card when sessions_with_data >= 3', () => {
    render(<StillEffectCard stats={fullStats} />);
    expect(screen.getByTestId('still-effect-card')).toBeInTheDocument();
  });

  it('displays protocol labels correctly', () => {
    render(<StillEffectCard stats={fullStats} />);
    expect(screen.getAllByText('Everyday Settling').length).toBeGreaterThan(0);
    expect(screen.getByText('Heightened State')).toBeInTheDocument();
  });

  it('shows activation delta values', () => {
    render(<StillEffectCard stats={fullStats} />);
    expect(screen.getByText('−3.2')).toBeInTheDocument();
    expect(screen.getByText('−1.8')).toBeInTheDocument();
  });

  it('shows mood values with star', () => {
    render(<StillEffectCard stats={fullStats} />);
    expect(screen.getByText('4.1★')).toBeInTheDocument();
    expect(screen.getByText('3.6★')).toBeInTheDocument();
  });

  it('shows recommendation when best_protocol is set', () => {
    render(<StillEffectCard stats={fullStats} />);
    expect(screen.getByText(/tends to work best for you/)).toBeInTheDocument();
  });

  it('hides recommendation when best_protocol is null', () => {
    render(<StillEffectCard stats={noMoodStats} />);
    expect(screen.queryByText(/tends to work best/)).not.toBeInTheDocument();
  });

  it('shows — for null mood values', () => {
    render(<StillEffectCard stats={noMoodStats} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows session count', () => {
    render(<StillEffectCard stats={fullStats} />);
    expect(screen.getByText('6 sessions')).toBeInTheDocument();
  });

  it('shows + prefix when activation worsened (negative delta)', () => {
    const worsenedStats: StillEffectStats = {
      per_protocol: [
        { protocol: 'general_activation', session_count: 3, avg_activation_delta: -1.5, avg_mood_after: 3.0 },
      ],
      best_protocol: null,
      sessions_with_data: 3,
      avg_mood_after: 3.0,
    };
    render(<StillEffectCard stats={worsenedStats} />);
    expect(screen.getByText('+1.5')).toBeInTheDocument();
  });
});
