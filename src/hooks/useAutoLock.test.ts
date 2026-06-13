import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/services/journalService', () => ({
  hasPassword: vi.fn(),
  setupPassword: vi.fn(),
  unlockJournal: vi.fn(),
  finalizeUnlock: vi.fn(),
  lockJournal: vi.fn(),
  devBypassUnlock: vi.fn(),
}));

import { useAutoLock } from './useAutoLock';
import { useAppStore } from '../stores/appStore';
import { useSettingsStore } from '../stores/settingsStore';
import { createDefaultSettings } from '../types/settings';

function setPrivacy(autoLockTimeout: number, clearClipboardOnLock: boolean) {
  const settings = createDefaultSettings();
  settings.privacy.autoLockTimeout = autoLockTimeout;
  settings.privacy.clearClipboardOnLock = clearClipboardOnLock;
  useSettingsStore.setState({ settings });
}

describe('useAutoLock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAppStore.setState({ isUnlocked: true });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('does not lock when timeout is 0 (disabled)', () => {
    setPrivacy(0, false);
    renderHook(() => useAutoLock());
    act(() => vi.advanceTimersByTime(60 * 60 * 1000));
    expect(useAppStore.getState().isUnlocked).toBe(true);
  });

  it('does not arm when locked', () => {
    useAppStore.setState({ isUnlocked: false });
    setPrivacy(5, false);
    renderHook(() => useAutoLock());
    act(() => vi.advanceTimersByTime(10 * 60 * 1000));
    expect(useAppStore.getState().isUnlocked).toBe(false);
  });

  it('locks after the configured inactivity timeout', () => {
    setPrivacy(1, false);
    renderHook(() => useAutoLock());
    expect(useAppStore.getState().isUnlocked).toBe(true);
    act(() => vi.advanceTimersByTime(60 * 1000));
    expect(useAppStore.getState().isUnlocked).toBe(false);
  });

  it('resets the timer on user interaction', () => {
    setPrivacy(1, false);
    renderHook(() => useAutoLock());
    act(() => vi.advanceTimersByTime(50 * 1000));
    act(() => window.dispatchEvent(new Event('keydown')));
    act(() => vi.advanceTimersByTime(50 * 1000));
    expect(useAppStore.getState().isUnlocked).toBe(true);
    act(() => vi.advanceTimersByTime(10 * 1000));
    expect(useAppStore.getState().isUnlocked).toBe(false);
  });

  it('clears the clipboard on lock when clearClipboardOnLock is set', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    setPrivacy(1, true);
    renderHook(() => useAutoLock());
    act(() => vi.advanceTimersByTime(60 * 1000));
    expect(writeText).toHaveBeenCalledWith('');
    expect(useAppStore.getState().isUnlocked).toBe(false);
    vi.unstubAllGlobals();
  });

  it('does not touch the clipboard when clearClipboardOnLock is off', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    setPrivacy(1, false);
    renderHook(() => useAutoLock());
    act(() => vi.advanceTimersByTime(60 * 1000));
    expect(writeText).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('cleans up listeners on unmount (no lock after unmount)', () => {
    setPrivacy(1, false);
    const { unmount } = renderHook(() => useAutoLock());
    unmount();
    act(() => vi.advanceTimersByTime(60 * 1000));
    expect(useAppStore.getState().isUnlocked).toBe(true);
  });
});
