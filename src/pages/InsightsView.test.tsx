vi.mock('../hooks/useInsights', () => ({ useInsights: vi.fn() }));
vi.mock('../hooks/useAnalytics', () => ({ useAnalytics: vi.fn() }));
vi.mock('../hooks/useAIInsights', () => ({ useAIInsights: vi.fn() }));
vi.mock('../hooks/useActivityAnalytics', () => ({ useActivityAnalytics: vi.fn(() => ({ stats: [], isLoading: false, hasData: false })) }));
vi.mock('../stores/booksStore', () => ({ useBooksStore: vi.fn() }));

// Stub all child components so tests focus on InsightsView layout logic
vi.mock('../components/ai/MoodWeatherCard', () => ({ MoodWeatherCard: () => <div data-testid="mood-weather-card" /> }));
vi.mock('../components/ai/GratitudeStreakCard', () => ({ GratitudeStreakCard: () => <div data-testid="gratitude-streak-card" /> }));
vi.mock('../components/ai/WeeklyStreakCard', () => ({ WeeklyStreakCard: () => <div data-testid="weekly-streak-card" /> }));
vi.mock('../components/ai/InsightsPanel', () => ({ InsightsPanel: () => <div data-testid="insights-panel" /> }));
vi.mock('../components/ai/WeeklyReflectionCard', () => ({ WeeklyReflectionCard: () => <div data-testid="weekly-reflection-card" /> }));
vi.mock('../components/ai/TimeOfDayInsightCard', () => ({ TimeOfDayInsightCard: () => <div data-testid="time-of-day-card" /> }));
vi.mock('../components/ai/WritingMomentumCard', () => ({ WritingMomentumCard: () => <div data-testid="writing-momentum-card" /> }));
vi.mock('../components/analytics', () => ({
  StatsSummary: () => <div data-testid="stats-summary" />,
  MoodDistributionChart: () => <div data-testid="mood-distribution-chart" />,
  MoodTrendChart: () => <div data-testid="mood-trend-chart" />,
  DayOfWeekPattern: () => <div data-testid="day-of-week-pattern" />,
  EmotionalTrends: () => <div data-testid="emotional-trends" />,
  SentimentOverview: () => <div data-testid="sentiment-overview" />,
  JournalingHabits: () => <div data-testid="journaling-habits" />,
  ActivityCorrelationChart: () => <div data-testid="activity-correlation-chart" />,
  MoodYearHeatmap: () => <div data-testid="mood-year-heatmap" />,
  StreakCalendar: () => <div data-testid="streak-calendar" />,
}));

import { render, screen, fireEvent } from '@testing-library/react';
import { InsightsView } from './InsightsView';
import { useInsights } from '../hooks/useInsights';
import { useAnalytics } from '../hooks/useAnalytics';
import { useAIInsights } from '../hooks/useAIInsights';
import { useBooksStore } from '../stores/booksStore';

const mockUseInsights = vi.mocked(useInsights);
const mockUseAnalytics = vi.mocked(useAnalytics);
const mockUseAIInsights = vi.mocked(useAIInsights);
const mockUseBooksStore = vi.mocked(useBooksStore);

function defaultInsights(): ReturnType<typeof useInsights> {
  return {
    localMetadata: null,
    insights: [],
    patterns: [],
    weeklyReflection: null,
    gratitudeStreak: 0,
    gratitudeLongestStreak: 0,
    entriesThisWeek: 3,
    topTags: [],
    isLoading: false,
    isMetadataReady: true,
    hasData: true,
    isAIEnabled: false,
    dismissInsight: vi.fn(),
    refresh: vi.fn(),
  };
}

function defaultAnalytics(): ReturnType<typeof useAnalytics> {
  return {
    data: {
      averageMood: 3.5,
      totalEntries: 10,
      streakStats: { currentStreak: 3, longestStreak: 7, lastEntryDate: null },
      moodDistribution: [],
      dayOfWeekStats: [],
      trendData: [],
    },
    trendPeriod: { days: 30, label: 'Last 30 days', key: '30' as const },
    setTrendPeriod: vi.fn(),
    trendData: [],
    isLoading: false,
    isTrendLoading: false,
    heatmapData: [],
    isHeatmapLoading: false,
    error: null,
    refresh: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseInsights.mockReturnValue(defaultInsights());
  mockUseAnalytics.mockReturnValue(defaultAnalytics());
  mockUseAIInsights.mockReturnValue({
    metadata: null,
    patterns: [],
    prompts: [],
    insights: [],
    weeklyReflection: null,
    isLoading: false,
    isAIEnabled: false,
    error: null,
    refreshPrompts: vi.fn(),
    refreshInsights: vi.fn(),
    refreshWeeklyReflection: vi.fn(),
    dismissPrompt: vi.fn(),
    dismissInsight: vi.fn(),
  });
  mockUseBooksStore.mockReturnValue({ books: [], activeBookId: 'default', setActiveBook: vi.fn() } as unknown as ReturnType<typeof useBooksStore>);
});

describe('InsightsView', () => {
  it('shows empty state when no data', () => {
    mockUseInsights.mockReturnValue({ ...defaultInsights(), hasData: false });
    render(<InsightsView />);
    expect(screen.getByText('No entries yet')).toBeInTheDocument();
  });

  it('shows AI Insights section header', () => {
    render(<InsightsView />);
    expect(screen.getByText('AI Insights')).toBeInTheDocument();
  });

  it('shows AI disabled card when AI is off', () => {
    render(<InsightsView />);
    expect(screen.getByText('AI Insights — Off')).toBeInTheDocument();
  });

  it('shows enable AI button when AI is off', () => {
    render(<InsightsView />);
    expect(screen.getByText('Enable AI Insights →')).toBeInTheDocument();
  });

  it('calls onNavigateToSettings when enable button is clicked', () => {
    const onNavigateToSettings = vi.fn();
    render(<InsightsView onNavigateToSettings={onNavigateToSettings} />);
    fireEvent.click(screen.getByText('Enable AI Insights →'));
    expect(onNavigateToSettings).toHaveBeenCalledWith('ai');
  });

  it('shows AI cards when AI is enabled', () => {
    mockUseInsights.mockReturnValue({ ...defaultInsights(), isAIEnabled: true });
    render(<InsightsView />);
    expect(screen.getByTestId('weekly-streak-card')).toBeInTheDocument();
    expect(screen.getByTestId('insights-panel')).toBeInTheDocument();
  });

  it('shows book filter chips when multiple books exist', () => {
    mockUseBooksStore.mockReturnValue({
      books: [
        { id: 'b1', name: 'Morning', emoji: '🌅', color: '#8b5cf6', sort_order: 0, created_at: '' },
        { id: 'b2', name: 'Work', emoji: '💼', color: '#3b82f6', sort_order: 1, created_at: '' },
      ],
      activeBookId: 'default',
      setActiveBook: vi.fn(),
    } as unknown as ReturnType<typeof useBooksStore>);
    render(<InsightsView />);
    expect(screen.getByText((c) => c.includes('Morning'))).toBeInTheDocument();
    expect(screen.getByText((c) => c.includes('Work'))).toBeInTheDocument();
  });

  it('shows Deep Dive toggle button', () => {
    render(<InsightsView />);
    expect(screen.getByText('Deep Dive')).toBeInTheDocument();
  });

  it('reveals chart section when Deep Dive is toggled open', () => {
    render(<InsightsView />);
    fireEvent.click(screen.getByText('Deep Dive'));
    expect(screen.getByTestId('mood-trend-chart')).toBeInTheDocument();
  });

  it('shows analytics error with retry button', () => {
    mockUseAnalytics.mockReturnValue({ ...defaultAnalytics(), error: 'Failed to load' });
    render(<InsightsView />);
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });

  it('shows At a Glance section header', () => {
    render(<InsightsView />);
    expect(screen.getByText('At a Glance')).toBeInTheDocument();
  });

  it('renders TimeOfDayInsightCard and WritingMomentumCard when AI enabled and localMetadata loaded', () => {
    const localMetadata = {
      periodDays: 30,
      totalEntries: 10,
      moodStats: { average: 3.5, trend: 'stable' as const, volatility: 'low' as const, distribution: { 1: 0, 2: 0, 3: 5, 4: 3, 5: 2 }, recentAverage: 3.5 },
      patterns: { bestDayOfWeek: 'Tuesday', worstDayOfWeek: 'Monday', bestTimeOfDay: 'morning' as const, frequency: 'regular' as const, currentStreak: 4, longestStreak: 10 },
      emotionalProfile: { dominantIndicators: [], recentIndicators: [], gratitudeFrequency: 0.2, goalsFrequency: 0.1 },
      sentimentBreakdown: { positive: 0.6, negative: 0.1, neutral: 0.2, mixed: 0.1 },
    };
    mockUseInsights.mockReturnValue({ ...defaultInsights(), isAIEnabled: true, localMetadata, isLoading: false });
    render(<InsightsView />);
    expect(screen.getByTestId('time-of-day-card')).toBeInTheDocument();
    expect(screen.getByTestId('writing-momentum-card')).toBeInTheDocument();
  });
});
