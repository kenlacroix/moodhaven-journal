import { renderHook, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { useActivityAnalytics } from './useActivityAnalytics';

const mockInvoke = vi.mocked(invoke);

const rawStats = [
  { id: 'act_exercise', name: 'exercise', emoji: '🏃', is_custom: false, avg_mood: 4.5, entry_count: 10 },
  { id: 'act_social',   name: 'social',   emoji: '👥', is_custom: false, avg_mood: 3.8, entry_count: 5  },
  { id: 'act_work',     name: 'work',     emoji: '💼', is_custom: false, avg_mood: 2.9, entry_count: 8  },
  { id: 'act_rare',     name: 'rare',     emoji: '✨', is_custom: true,  avg_mood: 4.0, entry_count: 2  }, // filtered out (<3)
];

beforeEach(() => {
  vi.clearAllMocks();
  mockInvoke.mockResolvedValue(rawStats);
});

describe('useActivityAnalytics', () => {
  it('filters out activities with < 3 entries', async () => {
    const { result } = renderHook(() => useActivityAnalytics(3.5));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.stats.find((s) => s.id === 'act_rare')).toBeUndefined();
    expect(result.current.stats).toHaveLength(3);
  });

  it('computes moodDelta correctly vs overallAvgMood', async () => {
    const { result } = renderHook(() => useActivityAnalytics(3.5));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const exercise = result.current.stats.find((s) => s.id === 'act_exercise');
    expect(exercise?.moodDelta).toBeCloseTo(1.0, 5); // 4.5 - 3.5
    const work = result.current.stats.find((s) => s.id === 'act_work');
    expect(work?.moodDelta).toBeCloseTo(-0.6, 5); // 2.9 - 3.5
  });

  it('sorts by moodDelta descending', async () => {
    const { result } = renderHook(() => useActivityAnalytics(3.5));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const deltas = result.current.stats.map((s) => s.moodDelta ?? 0);
    expect(deltas[0]).toBeGreaterThanOrEqual(deltas[1]);
    expect(deltas[1]).toBeGreaterThanOrEqual(deltas[2]);
  });

  it('hasData is false when no activities pass the filter', async () => {
    mockInvoke.mockResolvedValueOnce([
      { id: 'act_rare', name: 'rare', emoji: '✨', is_custom: true, avg_mood: 4.0, entry_count: 1 },
    ]);
    const { result } = renderHook(() => useActivityAnalytics(3.5));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasData).toBe(false);
  });

  it('handles getActivityStats error gracefully', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('DB error'));
    const { result } = renderHook(() => useActivityAnalytics(3.5));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.stats).toHaveLength(0);
    expect(result.current.hasData).toBe(false);
  });

  it('re-fetches when overallAvgMood changes', async () => {
    const { result, rerender } = renderHook(
      ({ avg }: { avg: number }) => useActivityAnalytics(avg),
      { initialProps: { avg: 3.0 } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const firstCallCount = mockInvoke.mock.calls.length;

    rerender({ avg: 4.0 });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockInvoke.mock.calls.length).toBeGreaterThan(firstCallCount);
  });
});
