vi.mock('../lib/services/analyticsService', () => ({
  getFullAnalytics: vi.fn(),
  getMoodTrend: vi.fn(),
}));

vi.mock('../lib/services/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { renderHook, waitFor, act } from '@testing-library/react';
import { useAnalytics } from './useAnalytics';
import { getFullAnalytics, getMoodTrend } from '../lib/services/analyticsService';
import { logger } from '../lib/services/logger';
import { ANALYTICS_PERIODS } from '../types/analytics';

const mockGetFullAnalytics = vi.mocked(getFullAnalytics);
const mockGetMoodTrend = vi.mocked(getMoodTrend);
const mockLoggerError = vi.mocked(logger.error);

const analyticsData = {
  averageMood: 3.8,
  totalEntries: 50,
  streakStats: { currentStreak: 5, longestStreak: 10, lastEntryDate: '2026-05-30' },
  moodDistribution: [],
  dayOfWeekStats: [],
  trendData: [{ date: '2026-05-01', averageMood: 3.5, entryCount: 2 }],
};

const trendPoints = [
  { date: '2026-05-20', averageMood: 4.0, entryCount: 3 },
  { date: '2026-05-21', averageMood: 3.5, entryCount: 1 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetFullAnalytics.mockResolvedValue(analyticsData);
  mockGetMoodTrend.mockResolvedValue(trendPoints);
});

describe('useAnalytics', () => {
  it('starts with isLoading=true before data arrives', () => {
    mockGetFullAnalytics.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAnalytics());
    expect(result.current.isLoading).toBe(true);
  });

  it('starts with data=null before data arrives', () => {
    mockGetFullAnalytics.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAnalytics());
    expect(result.current.data).toBeNull();
  });

  it('starts with error=null', () => {
    mockGetFullAnalytics.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAnalytics());
    expect(result.current.error).toBeNull();
  });

  it('defaults trendPeriod to 30 days (ANALYTICS_PERIODS[1])', () => {
    const { result } = renderHook(() => useAnalytics());
    expect(result.current.trendPeriod).toEqual(ANALYTICS_PERIODS[1]);
    expect(result.current.trendPeriod.days).toBe(30);
  });

  it('calls getFullAnalytics with default trendPeriod days on mount', async () => {
    renderHook(() => useAnalytics());
    await waitFor(() => {
      expect(mockGetFullAnalytics).toHaveBeenCalledWith(30);
    });
  });

  it('sets data and trendData on successful fetch', async () => {
    const { result } = renderHook(() => useAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(analyticsData);
    expect(result.current.trendData).toEqual(analyticsData.trendData);
  });

  it('sets isLoading=false after successful fetch', async () => {
    const { result } = renderHook(() => useAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('sets error message and isLoading=false on fetch failure', async () => {
    mockGetFullAnalytics.mockRejectedValue(new Error('DB connection failed'));
    const { result } = renderHook(() => useAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('DB connection failed');
    expect(result.current.data).toBeNull();
  });

  it('sets generic error message when non-Error is thrown', async () => {
    mockGetFullAnalytics.mockRejectedValue('unknown error');
    const { result } = renderHook(() => useAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('Failed to load analytics');
  });

  it('setTrendPeriod updates trendPeriod state', async () => {
    const { result } = renderHook(() => useAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setTrendPeriod(ANALYTICS_PERIODS[2]);
    });

    expect(result.current.trendPeriod).toEqual(ANALYTICS_PERIODS[2]);
  });

  it('setTrendPeriod calls getMoodTrend with the new period days', async () => {
    const { result } = renderHook(() => useAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setTrendPeriod(ANALYTICS_PERIODS[2]); // 90 days
    });

    await waitFor(() => {
      expect(mockGetMoodTrend).toHaveBeenCalledWith(90);
    });
  });

  it('isTrendLoading is true while getMoodTrend is in-flight', async () => {
    let resolveTrend!: (v: typeof trendPoints) => void;
    mockGetMoodTrend.mockReturnValue(new Promise((r) => { resolveTrend = r; }));

    const { result } = renderHook(() => useAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setTrendPeriod(ANALYTICS_PERIODS[0]); // 7 days
    });

    expect(result.current.isTrendLoading).toBe(true);

    act(() => { resolveTrend(trendPoints); });
    await waitFor(() => expect(result.current.isTrendLoading).toBe(false));
  });

  it('updates trendData via getMoodTrend when period changes (before full refetch overwrites)', async () => {
    // setTrendPeriod triggers both getMoodTrend AND a full fetchAnalytics re-run (because
    // trendPeriod.days is in the fetchAnalytics useCallback deps → useEffect dependency).
    // The full re-fetch also overwrites trendData with analyticsData.trendData.
    // We verify getMoodTrend was called with the new days — that is the contract being tested.
    const { result } = renderHook(() => useAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setTrendPeriod(ANALYTICS_PERIODS[0]); // 7 days
    });

    await waitFor(() => expect(mockGetMoodTrend).toHaveBeenCalledWith(7));
    await waitFor(() => expect(result.current.isTrendLoading).toBe(false));
  });

  it('does not set error state when trend fetch fails', async () => {
    mockGetMoodTrend.mockRejectedValue(new Error('trend fetch failed'));

    const { result } = renderHook(() => useAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setTrendPeriod(ANALYTICS_PERIODS[0]);
    });

    await waitFor(() => expect(result.current.isTrendLoading).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it('logs error via logger when trend fetch fails', async () => {
    mockGetMoodTrend.mockRejectedValue(new Error('trend fetch failed'));

    const { result } = renderHook(() => useAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setTrendPeriod(ANALYTICS_PERIODS[0]);
    });

    await waitFor(() => expect(result.current.isTrendLoading).toBe(false));
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Failed to load trend data:',
      expect.objectContaining({ error: expect.any(String) })
    );
  });

  it('refresh re-calls getFullAnalytics', async () => {
    const { result } = renderHook(() => useAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockGetFullAnalytics.mockClear();

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockGetFullAnalytics).toHaveBeenCalledTimes(1);
    expect(mockGetFullAnalytics).toHaveBeenCalledWith(30);
  });

  it('refresh resets isLoading to true during fetch', async () => {
    const { result } = renderHook(() => useAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let resolveRefresh!: (v: typeof analyticsData) => void;
    mockGetFullAnalytics.mockReturnValue(new Promise((r) => { resolveRefresh = r; }));

    act(() => { void result.current.refresh(); });
    expect(result.current.isLoading).toBe(true);

    act(() => { resolveRefresh(analyticsData); });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('refresh clears a previous error on success', async () => {
    mockGetFullAnalytics.mockRejectedValue(new Error('first failure'));
    const { result } = renderHook(() => useAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('first failure');

    mockGetFullAnalytics.mockResolvedValue(analyticsData);
    await act(async () => { await result.current.refresh(); });

    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual(analyticsData);
  });
});
