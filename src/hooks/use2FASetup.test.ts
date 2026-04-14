import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { use2FASetup } from './use2FASetup';

vi.mock('../lib/services/twoFactorService', () => ({
  regenerateBackupCodes: vi.fn(),
  disable2FA: vi.fn(),
}));

import { regenerateBackupCodes, disable2FA } from '../lib/services/twoFactorService';

const mockRegen = vi.mocked(regenerateBackupCodes);
const mockDisable = vi.mocked(disable2FA);

const fakeCodes = { codes: ['aaa', 'bbb'], generated_at: '2026-04-12T00:00:00Z' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('use2FASetup', () => {
  it('clears backup codes before regenerating (no stale flash)', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    // Seed with existing codes first
    mockRegen.mockResolvedValueOnce(fakeCodes);
    const { result } = renderHook(() => use2FASetup(refresh));

    await act(async () => { await result.current.handleRegenerateBackupCodes(); });
    expect(result.current.backupCodes).toEqual(fakeCodes);

    // Second call: codes should be null while awaiting, then set
    let resolveRegen!: (v: typeof fakeCodes) => void;
    mockRegen.mockReturnValueOnce(new Promise<typeof fakeCodes>((res) => { resolveRegen = res; }));

    let p: Promise<void>;
    act(() => { p = result.current.handleRegenerateBackupCodes(); });
    // Codes cleared synchronously before await resolves
    expect(result.current.backupCodes).toBeNull();

    await act(async () => { resolveRegen(fakeCodes); await p; });
    expect(result.current.backupCodes).toEqual(fakeCodes);
  });

  it('sets backupCodes and opens showBackupCodes on success', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    mockRegen.mockResolvedValue(fakeCodes);
    const { result } = renderHook(() => use2FASetup(refresh));

    await act(async () => { await result.current.handleRegenerateBackupCodes(); });

    expect(result.current.backupCodes).toEqual(fakeCodes);
    expect(result.current.showBackupCodes).toBe(true);
    expect(refresh).toHaveBeenCalled();
  });

  it('does not throw when regenerateBackupCodes fails', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    mockRegen.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => use2FASetup(refresh));

    await expect(
      act(async () => { await result.current.handleRegenerateBackupCodes(); }),
    ).resolves.not.toThrow();
  });

  it('resets isDisabling2FA in finally even if disable2FA rejects', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    mockDisable.mockRejectedValue(new Error('server error'));
    const { result } = renderHook(() => use2FASetup(refresh));

    await act(async () => { await result.current.handleDisable2FA(); });

    expect(result.current.isDisabling2FA).toBe(false);
  });

  it('closes disable confirm dialog on success', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    mockDisable.mockResolvedValue(true);
    const { result } = renderHook(() => use2FASetup(refresh));

    act(() => result.current.setShowDisable2FAConfirm(true));
    await act(async () => { await result.current.handleDisable2FA(); });

    expect(result.current.showDisable2FAConfirm).toBe(false);
    expect(refresh).toHaveBeenCalled();
  });

  it('handle2FASetupComplete resets show2FASetup and calls refresh', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => use2FASetup(refresh));

    act(() => result.current.setShow2FASetup('totp'));
    expect(result.current.show2FASetup).toBe('totp');

    act(() => result.current.handle2FASetupComplete());
    expect(result.current.show2FASetup).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });
});
