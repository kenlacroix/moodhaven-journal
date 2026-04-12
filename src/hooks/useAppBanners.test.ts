import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppBanners } from './useAppBanners';

vi.mock('../lib/services/analyticsService', () => ({
  getStreakStats: vi.fn(),
}));

vi.mock('../lib/services/journalService', () => ({
  getEntriesOnThisDay: vi.fn(),
}));

import { getStreakStats } from '../lib/services/analyticsService';
import { getEntriesOnThisDay } from '../lib/services/journalService';

const mockStreak = vi.mocked(getStreakStats);
const mockOtd = vi.mocked(getEntriesOnThisDay);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mockStreak.mockResolvedValue({ currentStreak: 0, longestStreak: 0, lastEntryDate: null });
  mockOtd.mockResolvedValue([]);
});

describe('useAppBanners', () => {
  it('does not fetch when enabled=false', async () => {
    renderHook(() => useAppBanners(false));
    await act(async () => { /* flush */ });
    expect(mockStreak).not.toHaveBeenCalled();
    expect(mockOtd).not.toHaveBeenCalled();
  });

  it('shows no toast when streak is below 7', async () => {
    mockStreak.mockResolvedValue({ currentStreak: 6, longestStreak: 6, lastEntryDate: null });
    const { result } = renderHook(() => useAppBanners(true));
    await waitFor(() => expect(mockStreak).toHaveBeenCalled());
    expect(result.current.streakToast).toBeNull();
  });

  it('shows 7-day milestone toast', async () => {
    mockStreak.mockResolvedValue({ currentStreak: 7, longestStreak: 7, lastEntryDate: null });
    const { result } = renderHook(() => useAppBanners(true));
    await waitFor(() => expect(result.current.streakToast).not.toBeNull());
    expect(result.current.streakToast).toMatch(/7.day/i);
  });

  it('shows 30-day milestone toast (not 7-day)', async () => {
    mockStreak.mockResolvedValue({ currentStreak: 30, longestStreak: 30, lastEntryDate: null });
    const { result } = renderHook(() => useAppBanners(true));
    await waitFor(() => expect(result.current.streakToast).not.toBeNull());
    expect(result.current.streakToast).toMatch(/30.day/i);
  });

  it('shows 100-day milestone toast', async () => {
    mockStreak.mockResolvedValue({ currentStreak: 100, longestStreak: 100, lastEntryDate: null });
    const { result } = renderHook(() => useAppBanners(true));
    await waitFor(() => expect(result.current.streakToast).not.toBeNull());
    expect(result.current.streakToast).toMatch(/100/);
  });

  it('sessionStorage gate prevents second fetch on re-render', async () => {
    mockStreak.mockResolvedValue({ currentStreak: 7, longestStreak: 7, lastEntryDate: null });
    const { rerender } = renderHook(() => useAppBanners(true));
    await waitFor(() => expect(mockStreak).toHaveBeenCalledTimes(1));
    // Unmount and remount while sessionStorage key remains
    rerender();
    await act(async () => { /* flush */ });
    expect(mockStreak).toHaveBeenCalledTimes(1);
  });

  it('sets onThisDayCount from OTD entries', async () => {
    const fakeEntry = (year: number) => ({
      id: `e${year}`,
      created_at: `${year}-04-12T10:00:00Z`,
      content: '',
      mood: 3,
      privacyMode: 0,
      tags: [],
      book_id: 'default',
      pinned: false,
      updated_at: `${year}-04-12T10:00:00Z`,
    });
    mockOtd.mockResolvedValue([fakeEntry(2024), fakeEntry(2023)] as never);
    const { result } = renderHook(() => useAppBanners(true));
    await waitFor(() => expect(result.current.onThisDayCount).toBe(2));
    expect(result.current.onThisDayOldestYear).toBe(2023);
  });

  it('dismissStreakToast clears the toast', async () => {
    mockStreak.mockResolvedValue({ currentStreak: 7, longestStreak: 7, lastEntryDate: null });
    const { result } = renderHook(() => useAppBanners(true));
    await waitFor(() => expect(result.current.streakToast).not.toBeNull());
    act(() => result.current.dismissStreakToast());
    expect(result.current.streakToast).toBeNull();
  });

  it('dismissOnThisDay clears count and year', async () => {
    const fakeEntry = { id: 'x', created_at: '2023-04-12T10:00:00Z', content: '', mood: 3, privacyMode: 0, tags: [], book_id: 'default', pinned: false, updated_at: '' };
    mockOtd.mockResolvedValue([fakeEntry] as never);
    const { result } = renderHook(() => useAppBanners(true));
    await waitFor(() => expect(result.current.onThisDayCount).toBe(1));
    act(() => result.current.dismissOnThisDay());
    expect(result.current.onThisDayCount).toBe(0);
    expect(result.current.onThisDayOldestYear).toBeNull();
  });
});
