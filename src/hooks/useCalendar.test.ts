vi.mock('../lib/services/analyticsService', () => ({
  getMonthlyMoodData: vi.fn(),
}));

import { renderHook, waitFor, act } from '@testing-library/react';
import { useCalendar } from './useCalendar';
import { getMonthlyMoodData } from '../lib/services/analyticsService';

const mockGetMonthlyMoodData = vi.mocked(getMonthlyMoodData);

// Pin time to 2026-05-15 so today-dependent assertions are deterministic.
const FAKE_NOW = new Date('2026-05-15T12:00:00');

beforeEach(() => {
  vi.clearAllMocks();
  // shouldAdvanceTime lets waitFor's internal setTimeout tick without manual timer advancement.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FAKE_NOW);
  mockGetMonthlyMoodData.mockResolvedValue(new Map());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCalendar', () => {
  it('initialises year to the current year', () => {
    const { result } = renderHook(() => useCalendar());
    expect(result.current.year).toBe(2026);
  });

  it('initialises month to the current month (1-12)', () => {
    const { result } = renderHook(() => useCalendar());
    expect(result.current.month).toBe(5); // May
  });

  it('starts with isLoading=true before data arrives', () => {
    mockGetMonthlyMoodData.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCalendar());
    expect(result.current.isLoading).toBe(true);
  });

  it('starts with selectedDate=null', () => {
    const { result } = renderHook(() => useCalendar());
    expect(result.current.selectedDate).toBeNull();
  });

  it('starts with an empty moodData Map', () => {
    mockGetMonthlyMoodData.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCalendar());
    expect(result.current.moodData.size).toBe(0);
  });

  it('calls getMonthlyMoodData with current year and month on mount', async () => {
    renderHook(() => useCalendar());
    await waitFor(() => {
      expect(mockGetMonthlyMoodData).toHaveBeenCalledWith(2026, 5);
    });
  });

  it('sets moodData on successful fetch', async () => {
    const moodMap = new Map([
      ['2026-05-10', { date: '2026-05-10', averageMood: 4.0, entryCount: 2 }],
    ]);
    mockGetMonthlyMoodData.mockResolvedValue(moodMap);

    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.moodData).toEqual(moodMap);
    expect(result.current.error).toBeNull();
  });

  it('sets isLoading=false after successful fetch', async () => {
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('sets error on failed fetch and isLoading=false', async () => {
    mockGetMonthlyMoodData.mockRejectedValue(new Error('DB read error'));
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('DB read error');
  });

  it('sets generic error message when non-Error is thrown', async () => {
    mockGetMonthlyMoodData.mockRejectedValue('oops');
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('Failed to load calendar data');
  });

  it('goToPreviousMonth navigates from May to April same year', async () => {
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.goToPreviousMonth(); });

    expect(result.current.year).toBe(2026);
    expect(result.current.month).toBe(4);
  });

  it('goToPreviousMonth wraps from January to December of previous year', async () => {
    vi.setSystemTime(new Date('2026-01-15T12:00:00'));
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.goToPreviousMonth(); });

    expect(result.current.year).toBe(2025);
    expect(result.current.month).toBe(12);
  });

  it('goToPreviousMonth clears selectedDate', async () => {
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.setSelectedDate('2026-05-10'); });
    expect(result.current.selectedDate).toBe('2026-05-10');

    act(() => { result.current.goToPreviousMonth(); });
    expect(result.current.selectedDate).toBeNull();
  });

  it('goToNextMonth navigates from May to June same year', async () => {
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.goToNextMonth(); });

    expect(result.current.year).toBe(2026);
    expect(result.current.month).toBe(6);
  });

  it('goToNextMonth wraps from December to January of next year', async () => {
    vi.setSystemTime(new Date('2026-12-15T12:00:00'));
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.goToNextMonth(); });

    expect(result.current.year).toBe(2027);
    expect(result.current.month).toBe(1);
  });

  it('goToNextMonth clears selectedDate', async () => {
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.setSelectedDate('2026-05-20'); });
    act(() => { result.current.goToNextMonth(); });

    expect(result.current.selectedDate).toBeNull();
  });

  it('goToToday resets year and month to today', async () => {
    vi.setSystemTime(new Date('2026-01-15T12:00:00'));
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Navigate away first
    act(() => { result.current.goToNextMonth(); });
    expect(result.current.month).toBe(2);

    vi.setSystemTime(new Date('2026-03-20T12:00:00'));
    act(() => { result.current.goToToday(); });

    expect(result.current.year).toBe(2026);
    expect(result.current.month).toBe(3);
  });

  it('goToToday sets selectedDate to today formatted as YYYY-MM-DD', async () => {
    vi.setSystemTime(new Date('2026-05-15T12:00:00'));
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.goToToday(); });

    expect(result.current.selectedDate).toBe('2026-05-15');
  });

  it('goToMonth sets year and month explicitly', async () => {
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.goToMonth(2025, 8); });

    expect(result.current.year).toBe(2025);
    expect(result.current.month).toBe(8);
  });

  it('goToMonth clears selectedDate', async () => {
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.setSelectedDate('2026-05-10'); });
    act(() => { result.current.goToMonth(2025, 11); });

    expect(result.current.selectedDate).toBeNull();
  });

  it('setSelectedDate stores the provided date string', async () => {
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.setSelectedDate('2026-05-22'); });
    expect(result.current.selectedDate).toBe('2026-05-22');
  });

  it('setSelectedDate accepts null to clear the selection', async () => {
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.setSelectedDate('2026-05-22'); });
    act(() => { result.current.setSelectedDate(null); });
    expect(result.current.selectedDate).toBeNull();
  });

  it('refresh re-calls getMonthlyMoodData for the current month', async () => {
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockGetMonthlyMoodData.mockClear();

    await act(async () => { await result.current.refresh(); });

    expect(mockGetMonthlyMoodData).toHaveBeenCalledTimes(1);
    expect(mockGetMonthlyMoodData).toHaveBeenCalledWith(2026, 5);
  });

  it('navigating month triggers a new getMonthlyMoodData fetch', async () => {
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockGetMonthlyMoodData.mockClear();

    act(() => { result.current.goToNextMonth(); });

    await waitFor(() => {
      expect(mockGetMonthlyMoodData).toHaveBeenCalledWith(2026, 6);
    });
  });

  it('returns a monthName string for the current month', async () => {
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(typeof result.current.monthName).toBe('string');
    expect(result.current.monthName.length).toBeGreaterThan(0);
  });

  it('returns calendarDates as a non-empty array of Date objects', async () => {
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(Array.isArray(result.current.calendarDates)).toBe(true);
    expect(result.current.calendarDates.length).toBeGreaterThan(0);
    expect(result.current.calendarDates[0]).toBeInstanceOf(Date);
  });
});
