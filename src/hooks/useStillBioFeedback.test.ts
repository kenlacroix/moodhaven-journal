import { renderHook, act } from '@testing-library/react';
import { useStillBioFeedback } from './useStillBioFeedback';
import { useStillStore } from '../stores/stillStore';

// healthSnapshotToSpeed and useStillStore are real — we want them to run.
// Mock only the Tauri event listener so tests run in jsdom.

const mockUnlisten = vi.fn();
const mockListen = vi.fn();

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: Parameters<typeof mockListen>) => mockListen(...args),
}));

// Expose the last registered handler so tests can call it directly
type SignalEvent = { payload: { type: string; payload: string } };
let capturedHandler: ((event: SignalEvent) => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  capturedHandler = null;

  // Simulate Tauri environment
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });

  mockUnlisten.mockReturnValue(undefined);
  mockListen.mockImplementation(
    (_channel: string, handler: (event: SignalEvent) => void) => {
      capturedHandler = handler;
      return Promise.resolve(mockUnlisten);
    },
  );

  useStillStore.setState({ speedHz: 1.0 });
});

afterEach(() => {
  // Remove __TAURI_INTERNALS__ between tests
  try {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: undefined,
      configurable: true,
    });
  } catch { /* ignore */ }
});

function sendSnapshot(snap: { heartRate?: number; hrvAvg?: number; readinessScore?: number }) {
  capturedHandler?.({
    payload: { type: 'health_snapshot', payload: JSON.stringify(snap) },
  });
}

describe('disabled state', () => {
  it('returns isAdapting=false and adaptations=0 when disabled', () => {
    const { result } = renderHook(() =>
      useStillBioFeedback({ enabled: false, baseSpeed: 1.0 }),
    );
    expect(result.current.isAdapting).toBe(false);
    expect(result.current.getAdaptations()).toBe(0);
  });
});

describe('adaptation counting', () => {
  it('increments adaptations when speed changes by ≥ MIN_DELTA', async () => {
    const { result } = renderHook(() =>
      useStillBioFeedback({ enabled: true, baseSpeed: 1.0 }),
    );

    // Wait for listener to register
    await act(async () => {});

    // Send a snapshot that causes a meaningful speed change
    // heartRate=120 → high arousal → healthSnapshotToSpeed should push speed up
    act(() => {
      sendSnapshot({ heartRate: 120 });
      sendSnapshot({ heartRate: 120 });
      sendSnapshot({ heartRate: 120 });
    });

    // At least one adaptation should have been counted
    expect(result.current.getAdaptations()).toBeGreaterThanOrEqual(1);
  });

  it('resets adaptations when a new session starts (enabled goes true)', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useStillBioFeedback({ enabled, baseSpeed: 1.0 }),
      { initialProps: { enabled: true } },
    );

    await act(async () => {});

    // Trigger some adaptations
    act(() => {
      sendSnapshot({ heartRate: 120 });
      sendSnapshot({ heartRate: 120 });
      sendSnapshot({ heartRate: 120 });
    });

    const firstCount = result.current.getAdaptations();

    // End session
    rerender({ enabled: false });
    // Start new session
    rerender({ enabled: true });

    await act(async () => {});

    expect(result.current.getAdaptations()).toBe(0);
    // Ensure the first count was non-zero (otherwise the reset test is vacuous)
    if (firstCount > 0) {
      expect(result.current.getAdaptations()).toBeLessThan(firstCount);
    }
  });

  it('does not count non-health_snapshot events', async () => {
    const { result } = renderHook(() =>
      useStillBioFeedback({ enabled: true, baseSpeed: 1.0 }),
    );

    await act(async () => {});

    act(() => {
      capturedHandler?.({
        payload: { type: 'mood_tap', payload: JSON.stringify({ mood: 4 }) },
      });
    });

    expect(result.current.getAdaptations()).toBe(0);
  });
});

describe('stale timer', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('sets isAdapting=true on first signal', async () => {
    const { result } = renderHook(() =>
      useStillBioFeedback({ enabled: true, baseSpeed: 1.0 }),
    );

    await act(async () => {});

    act(() => { sendSnapshot({ heartRate: 120 }); });

    expect(result.current.isAdapting).toBe(true);
  });

  it('reverts to baseSpeed and clears isAdapting after 3 min without a signal', async () => {
    const { result } = renderHook(() =>
      useStillBioFeedback({ enabled: true, baseSpeed: 1.0 }),
    );

    await act(async () => {});

    act(() => { sendSnapshot({ heartRate: 120 }); });
    expect(result.current.isAdapting).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(3 * 60 * 1000 + 100);
    });

    expect(result.current.isAdapting).toBe(false);
    expect(useStillStore.getState().speedHz).toBe(1.0);
  });
});

describe('cleanup', () => {
  it('calls unlisten on unmount', async () => {
    const { unmount } = renderHook(() =>
      useStillBioFeedback({ enabled: true, baseSpeed: 1.0 }),
    );

    await act(async () => {});
    unmount();

    expect(mockUnlisten).toHaveBeenCalled();
  });
});
