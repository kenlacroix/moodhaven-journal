import { renderHook, waitFor, act } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { useWellbeingContext } from './useWellbeingContext';
import { useSettingsStore } from '../stores/settingsStore';
import type { WellbeingContext } from '../lib/stillService';

vi.mock('../lib/stillService', () => ({
  stillGetWellbeingContext: vi.fn(),
}));

import { stillGetWellbeingContext } from '../lib/stillService';

const mockGetWellbeing = vi.mocked(stillGetWellbeingContext);

function makeCtx(overrides: Partial<WellbeingContext> = {}): WellbeingContext {
  return {
    oura_readiness_today: null,
    last_still_session_days_ago: null,
    yesterday_mood_avg: null,
    yesterday_entry_count: 0,
    streak_days: 0,
    ...overrides,
  };
}

function setOuraConnected(connectedAt: string | null) {
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, oura: { ...s.settings.oura, connectedAt } },
  }));
}

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: not shown today (get_setting returns null)
  mockInvoke.mockResolvedValue(null);
  // Default: Oura not connected
  setOuraConnected(null);
});

describe('initial load', () => {
  it('loads and shows context when wellbeing data is available', async () => {
    const ctx = makeCtx({ streak_days: 3, yesterday_mood_avg: 4.2, yesterday_entry_count: 1 });
    mockGetWellbeing.mockResolvedValue(ctx);

    const { result } = renderHook(() => useWellbeingContext());

    await waitFor(() => expect(result.current.isVisible).toBe(true));
    expect(result.current.context).toEqual(ctx);
  });

  it('remains hidden when already shown today', async () => {
    const todayKey = (() => {
      const d = new Date();
      return `wellbeing_card_last_shown_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    mockInvoke.mockResolvedValue(todayKey);
    mockGetWellbeing.mockResolvedValue(makeCtx({ streak_days: 5 }));

    const { result } = renderHook(() => useWellbeingContext());

    await act(async () => {}); // flush microtasks
    expect(result.current.isVisible).toBe(false);
    expect(result.current.context).toBeNull();
  });

  it('stays hidden when context returns null', async () => {
    mockGetWellbeing.mockResolvedValue(null as unknown as WellbeingContext);

    const { result } = renderHook(() => useWellbeingContext());

    await act(async () => {});
    expect(result.current.isVisible).toBe(false);
  });

  it('context is null when wellbeing fetch rejects', async () => {
    mockGetWellbeing.mockRejectedValue(new Error('backend error'));

    const { result } = renderHook(() => useWellbeingContext());
    await act(async () => { await Promise.resolve(); });

    expect(result.current.context).toBeNull();
    expect(result.current.isVisible).toBe(false);
  });
});

describe('dismiss', () => {
  it('hides the card when dismiss is called', async () => {
    mockGetWellbeing.mockResolvedValue(makeCtx({ streak_days: 2 }));

    const { result } = renderHook(() => useWellbeingContext());
    await waitFor(() => expect(result.current.isVisible).toBe(true));

    act(() => result.current.dismiss());
    expect(result.current.isVisible).toBe(false);
  });
});

describe('onWordsWritten', () => {
  it('hides when word count reaches 5', async () => {
    mockGetWellbeing.mockResolvedValue(
      makeCtx({ streak_days: 1, yesterday_mood_avg: 3, yesterday_entry_count: 1 }),
    );

    const { result } = renderHook(() => useWellbeingContext());
    await waitFor(() => expect(result.current.isVisible).toBe(true));

    act(() => result.current.onWordsWritten(5));
    expect(result.current.isVisible).toBe(false);
  });

  it('does not hide when word count is below 5', async () => {
    mockGetWellbeing.mockResolvedValue(
      makeCtx({ streak_days: 1, yesterday_mood_avg: 3, yesterday_entry_count: 1 }),
    );

    const { result } = renderHook(() => useWellbeingContext());
    await waitFor(() => expect(result.current.isVisible).toBe(true));

    act(() => result.current.onWordsWritten(4));
    expect(result.current.isVisible).toBe(true);
  });

  it('is a no-op when card is already hidden', async () => {
    mockGetWellbeing.mockResolvedValue(makeCtx({ streak_days: 1 }));

    const { result } = renderHook(() => useWellbeingContext());
    await waitFor(() => expect(result.current.isVisible).toBe(true));

    act(() => result.current.dismiss());
    expect(result.current.isVisible).toBe(false);

    // Calling onWordsWritten after dismiss should not throw or change state
    act(() => result.current.onWordsWritten(10));
    expect(result.current.isVisible).toBe(false);
  });
});

describe('WELL-001: Oura readiness retry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('retries after 4s when readiness is null and Oura is connected', async () => {
    const initial = makeCtx({ streak_days: 1 });
    const fresh = makeCtx({ streak_days: 1, oura_readiness_today: 78 });
    mockGetWellbeing.mockResolvedValueOnce(initial).mockResolvedValueOnce(fresh);
    setOuraConnected('2026-05-31T08:00:00Z');

    const { result } = renderHook(() => useWellbeingContext());

    // Flush the initial async load (microtasks, not timers)
    await act(async () => {});
    expect(result.current.isVisible).toBe(true);
    expect(result.current.context?.oura_readiness_today).toBeNull();

    // Advance past the 4-second retry delay
    await act(async () => {
      vi.advanceTimersByTime(4001);
    });
    await act(async () => {}); // flush the retry promise

    expect(result.current.context?.oura_readiness_today).toBe(78);
    expect(mockGetWellbeing).toHaveBeenCalledTimes(2);
  });

  it('does not retry when Oura is not connected', async () => {
    mockGetWellbeing.mockResolvedValue(makeCtx({ streak_days: 1 }));
    // connectedAt: null (default)

    const { result } = renderHook(() => useWellbeingContext());

    await act(async () => {});
    expect(result.current.isVisible).toBe(true);

    await act(async () => { vi.advanceTimersByTime(4001); });
    await act(async () => {});

    expect(mockGetWellbeing).toHaveBeenCalledTimes(1);
  });

  it('does not update context if retry also returns null readiness', async () => {
    const ctx = makeCtx({ streak_days: 2 });
    mockGetWellbeing.mockResolvedValue(ctx);
    setOuraConnected('2026-05-31T08:00:00Z');

    const { result } = renderHook(() => useWellbeingContext());

    await act(async () => {});
    expect(result.current.context?.streak_days).toBe(2);

    await act(async () => { vi.advanceTimersByTime(4001); });
    await act(async () => {});

    // Retry ran but readiness still null — context streak_days unchanged
    expect(result.current.context?.oura_readiness_today).toBeNull();
    expect(result.current.context?.streak_days).toBe(2);
  });

  it('clears in-flight retryTimer on unmount before 4s fires', async () => {
    const initial = makeCtx({ streak_days: 1 });
    const fresh = makeCtx({ streak_days: 1, oura_readiness_today: 90 });
    mockGetWellbeing.mockResolvedValueOnce(initial).mockResolvedValueOnce(fresh);
    setOuraConnected('2026-05-31T08:00:00Z');

    const { result, unmount } = renderHook(() => useWellbeingContext());

    await act(async () => {});
    expect(result.current.context?.oura_readiness_today).toBeNull();

    // Unmount before the 4s timer fires
    unmount();

    // Advance past timer — retry callback should NOT run (cancelled)
    await act(async () => { vi.advanceTimersByTime(5000); });
    await act(async () => {});

    // Only one call (initial) — retry was cancelled by cleanup
    expect(mockGetWellbeing).toHaveBeenCalledTimes(1);
  });
});
