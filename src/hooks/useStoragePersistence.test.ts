import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useStoragePersistence } from './useStoragePersistence';

vi.mock('../lib/services/storagePersistence', () => ({
  ensurePersistentStorage: vi.fn(),
}));

// The global test setup stubs window.__TAURI_INTERNALS__, so usePlatform().isBrowser
// is false by default. Force browser mode here to exercise the hook's active path.
vi.mock('./usePlatform', () => ({
  usePlatform: () => ({ isBrowser: true }),
}));

import { ensurePersistentStorage } from '../lib/services/storagePersistence';

const mockEnsure = vi.mocked(ensurePersistentStorage);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mockEnsure.mockResolvedValue('persisted');
});

describe('useStoragePersistence', () => {
  it('does nothing when enabled=false', async () => {
    const { result } = renderHook(() => useStoragePersistence(false));
    await act(async () => { /* flush */ });
    expect(mockEnsure).not.toHaveBeenCalled();
    expect(result.current.showBackupNudge).toBe(false);
  });

  it('does not show the nudge when storage is persisted', async () => {
    mockEnsure.mockResolvedValue('persisted');
    const { result } = renderHook(() => useStoragePersistence(true));
    await waitFor(() => expect(mockEnsure).toHaveBeenCalled());
    expect(result.current.showBackupNudge).toBe(false);
  });

  it('shows the backup nudge when storage is denied', async () => {
    mockEnsure.mockResolvedValue('denied');
    const { result } = renderHook(() => useStoragePersistence(true));
    await waitFor(() => expect(result.current.showBackupNudge).toBe(true));
  });

  it('does not show the nudge when the API is unsupported', async () => {
    mockEnsure.mockResolvedValue('unsupported');
    const { result } = renderHook(() => useStoragePersistence(true));
    await waitFor(() => expect(mockEnsure).toHaveBeenCalled());
    expect(result.current.showBackupNudge).toBe(false);
  });

  it('checks only once per session', async () => {
    const first = renderHook(() => useStoragePersistence(true));
    await waitFor(() => expect(mockEnsure).toHaveBeenCalledTimes(1));
    first.unmount();

    renderHook(() => useStoragePersistence(true));
    await act(async () => { /* flush */ });
    expect(mockEnsure).toHaveBeenCalledTimes(1);
  });

  it('can be dismissed', async () => {
    mockEnsure.mockResolvedValue('denied');
    const { result } = renderHook(() => useStoragePersistence(true));
    await waitFor(() => expect(result.current.showBackupNudge).toBe(true));
    act(() => result.current.dismissBackupNudge());
    expect(result.current.showBackupNudge).toBe(false);
  });
});
