import { renderHook, act } from '@testing-library/react';
import { useWristLoop } from './useWristLoop';
import type { Signal } from '../types/signals';

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 'sig-1',
    timestamp: '2026-05-31T10:00:00Z',
    type: 'still_trigger',
    source: 'watch',
    payload: { protocol: 'general_activation' },
    synced: false,
    createdAt: '2026-05-31T10:00:00Z',
    ...overrides,
  };
}

describe('useWristLoop', () => {
  it('ignores signals that are not still_trigger', () => {
    const onAccept = vi.fn();
    const { result } = renderHook(() => useWristLoop({ onAccept }));

    act(() => { result.current.handleSignal(makeSignal({ type: 'mood_tap' })); });

    expect(result.current.pendingTrigger).toBeNull();
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('sets pendingTrigger when a still_trigger signal arrives', () => {
    const onAccept = vi.fn();
    const { result } = renderHook(() => useWristLoop({ onAccept }));

    act(() => {
      result.current.handleSignal(makeSignal({
        id: 'sig-abc',
        payload: { protocol: 'fake_danger' },
      }));
    });

    expect(result.current.pendingTrigger).not.toBeNull();
    expect(result.current.pendingTrigger?.signalId).toBe('sig-abc');
    expect(result.current.pendingTrigger?.protocol).toBe('fake_danger');
  });

  it('sets protocol to undefined when payload has no protocol field', () => {
    const onAccept = vi.fn();
    const { result } = renderHook(() => useWristLoop({ onAccept }));

    act(() => { result.current.handleSignal(makeSignal({ payload: {} })); });

    expect(result.current.pendingTrigger?.protocol).toBeUndefined();
  });

  it('accept calls onAccept with the trigger and clears pendingTrigger', () => {
    const onAccept = vi.fn();
    const { result } = renderHook(() => useWristLoop({ onAccept }));

    act(() => { result.current.handleSignal(makeSignal()); });
    act(() => { result.current.accept(); });

    expect(onAccept).toHaveBeenCalledWith(expect.objectContaining({ signalId: 'sig-1' }));
    expect(result.current.pendingTrigger).toBeNull();
  });

  it('accept is a no-op when pendingTrigger is null', () => {
    const onAccept = vi.fn();
    const { result } = renderHook(() => useWristLoop({ onAccept }));

    act(() => { result.current.accept(); });

    expect(onAccept).not.toHaveBeenCalled();
    expect(result.current.pendingTrigger).toBeNull();
  });

  it('dismiss clears pendingTrigger without calling onAccept', () => {
    const onAccept = vi.fn();
    const { result } = renderHook(() => useWristLoop({ onAccept }));

    act(() => { result.current.handleSignal(makeSignal()); });
    act(() => { result.current.dismiss(); });

    expect(result.current.pendingTrigger).toBeNull();
    expect(onAccept).not.toHaveBeenCalled();
  });
});
