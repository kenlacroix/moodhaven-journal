import { render, screen } from '@testing-library/react';
import { MoodWeatherCard } from './MoodWeatherCard';
import type { AggregatedMetadata } from '../../types/ai';

function makeMetadata(moodAverage: number): AggregatedMetadata {
  return {
    periodDays: 30,
    totalEntries: 10,
    moodStats: {
      average: moodAverage,
      trend: 'stable',
      volatility: 'low',
      distribution: { 1: 0, 2: 0, 3: 2, 4: 4, 5: 4 },
      recentAverage: moodAverage,
    },
    patterns: {
      bestDayOfWeek: 'Tuesday',
      worstDayOfWeek: 'Monday',
      bestTimeOfDay: 'morning',
      frequency: 'daily',
      currentStreak: 5,
      longestStreak: 10,
    },
    emotionalProfile: {
      dominantIndicators: [],
      recentIndicators: [],
      gratitudeFrequency: 0.3,
      goalsFrequency: 0.2,
    },
    sentimentBreakdown: {
      positive: 0.6,
      negative: 0.1,
      neutral: 0.2,
      mixed: 0.1,
    },
  };
}

describe('MoodWeatherCard', () => {
  it('shows "Radiant" for high mood average (>= 4.3)', () => {
    render(<MoodWeatherCard metadata={makeMetadata(4.5)} />);
    expect(screen.getByText('Radiant')).toBeInTheDocument();
  });

  it('shows "Mostly Sunny" for mood average 3.5–4.3', () => {
    render(<MoodWeatherCard metadata={makeMetadata(3.8)} />);
    expect(screen.getByText('Mostly Sunny')).toBeInTheDocument();
  });

  it('shows "Partly Cloudy" for mood average 2.8–3.5', () => {
    render(<MoodWeatherCard metadata={makeMetadata(3.0)} />);
    expect(screen.getByText('Partly Cloudy')).toBeInTheDocument();
  });

  it('shows "Cloudy" for mood average 2.0–2.8', () => {
    render(<MoodWeatherCard metadata={makeMetadata(2.5)} />);
    expect(screen.getByText('Cloudy')).toBeInTheDocument();
  });

  it('shows "Stormy" for mood average below 2.0', () => {
    render(<MoodWeatherCard metadata={makeMetadata(1.5)} />);
    expect(screen.getByText('Stormy')).toBeInTheDocument();
  });

  it('renders the mood average', () => {
    render(<MoodWeatherCard metadata={makeMetadata(4.0)} />);
    expect(screen.getByText('4.0')).toBeInTheDocument();
  });
});
