import { invoke } from '@tauri-apps/api/core';
import { pinIsEnabled, pinSetup, pinUnlock, pinDisable } from './pinUnlockService';

const mockInvoke = vi.mocked(invoke);

beforeEach(() => vi.clearAllMocks());

describe('pinIsEnabled', () => {
  it('returns true when backend reports enabled', async () => {
    mockInvoke.mockResolvedValue(true);
    await expect(pinIsEnabled()).resolves.toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith('pin_is_enabled');
  });

  it('returns false when backend reports disabled', async () => {
    mockInvoke.mockResolvedValue(false);
    await expect(pinIsEnabled()).resolves.toBe(false);
  });
});

describe('pinSetup', () => {
  it('calls pin_setup with password and pin', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await pinSetup('mypassword', '1234');
    expect(mockInvoke).toHaveBeenCalledWith('pin_setup', { password: 'mypassword', pin: '1234' });
  });

  it('propagates errors from the backend', async () => {
    mockInvoke.mockRejectedValue(new Error('PIN must be 4–6 digits'));
    await expect(pinSetup('pass', '12')).rejects.toThrow('PIN must be 4–6 digits');
  });
});

describe('pinUnlock', () => {
  it('returns decrypted password on success', async () => {
    mockInvoke.mockResolvedValue('secretpassword');
    await expect(pinUnlock('1234')).resolves.toBe('secretpassword');
    expect(mockInvoke).toHaveBeenCalledWith('pin_unlock', { pin: '1234' });
  });

  it('rejects with "Incorrect PIN" on wrong pin', async () => {
    mockInvoke.mockRejectedValue(new Error('Incorrect PIN'));
    await expect(pinUnlock('9999')).rejects.toThrow('Incorrect PIN');
  });

  it('rejects with "locked:{secs}" on lockout', async () => {
    mockInvoke.mockRejectedValue(new Error('locked:30'));
    await expect(pinUnlock('1234')).rejects.toThrow('locked:30');
  });
});

describe('pinUnlock — additional edge cases', () => {
  it('calls pin_unlock with the provided pin', async () => {
    mockInvoke.mockResolvedValue('password123');
    await pinUnlock('123456');
    expect(mockInvoke).toHaveBeenCalledWith('pin_unlock', { pin: '123456' });
  });

  it('propagates unexpected errors from the backend', async () => {
    mockInvoke.mockRejectedValue(new Error('Database error'));
    await expect(pinUnlock('1234')).rejects.toThrow('Database error');
  });
});

describe('pinDisable', () => {
  it('calls pin_disable', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await pinDisable();
    expect(mockInvoke).toHaveBeenCalledWith('pin_disable');
  });

  it('propagates errors from the backend', async () => {
    mockInvoke.mockRejectedValue(new Error('Session is locked'));
    await expect(pinDisable()).rejects.toThrow('Session is locked');
  });
});
