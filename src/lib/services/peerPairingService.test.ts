import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  generatePairingToken,
  acceptPairing,
  getTrustedDevices,
  revokeDevice,
  cancelPairing,
  isPairingActive,
  onPeerPaired,
  onPairingAttemptFailed,
  onPairingLocked,
  onPairingIncoming,
} from './peerPairingService';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);
const fakeUnlisten = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockListen.mockResolvedValue(fakeUnlisten);
});

function makeTrustedDevice(overrides = {}) {
  return {
    deviceId: 'trusted-001',
    deviceName: 'My Phone',
    deviceType: 'phone' as const,
    publicKey: 'pubkey==',
    pairedAt: '2026-01-01T00:00:00Z',
    lastSeen: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

describe('generatePairingToken', () => {
  it('calls peer_generate_pairing_token', async () => {
    const token = { pin: '123456', qrPayload: '{"host":"..."}', serverPort: 42425 };
    mockInvoke.mockResolvedValue(token);

    const result = await generatePairingToken();

    expect(mockInvoke).toHaveBeenCalledWith('peer_generate_pairing_token');
    expect(result).toEqual(token);
  });

  it('propagates errors', async () => {
    mockInvoke.mockRejectedValue(new Error('Server busy'));

    await expect(generatePairingToken()).rejects.toThrow('Server busy');
  });
});

describe('acceptPairing', () => {
  it('calls peer_accept_pairing with correct args', async () => {
    const device = makeTrustedDevice();
    mockInvoke.mockResolvedValue(device);

    const result = await acceptPairing('192.168.1.10', 'device-123', '654321');

    expect(mockInvoke).toHaveBeenCalledWith('peer_accept_pairing', {
      targetHost: '192.168.1.10',
      peerDeviceId: 'device-123',
      pin: '654321',
    });
    expect(result).toEqual(device);
  });

  it('throws on wrong PIN', async () => {
    mockInvoke.mockRejectedValue(new Error('Invalid PIN'));

    await expect(acceptPairing('192.168.1.1', 'dev', '000000')).rejects.toThrow('Invalid PIN');
  });
});

describe('getTrustedDevices', () => {
  it('calls peer_get_trusted and returns array', async () => {
    const devices = [makeTrustedDevice({ deviceId: 'a' }), makeTrustedDevice({ deviceId: 'b' })];
    mockInvoke.mockResolvedValue(devices);

    const result = await getTrustedDevices();

    expect(mockInvoke).toHaveBeenCalledWith('peer_get_trusted');
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no trusted devices', async () => {
    mockInvoke.mockResolvedValue([]);

    const result = await getTrustedDevices();

    expect(result).toEqual([]);
  });
});

describe('revokeDevice', () => {
  it('calls peer_revoke_device with deviceId', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await revokeDevice('device-to-revoke');

    expect(mockInvoke).toHaveBeenCalledWith('peer_revoke_device', { deviceId: 'device-to-revoke' });
  });
});

describe('cancelPairing', () => {
  it('calls peer_cancel_pairing', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await cancelPairing();

    expect(mockInvoke).toHaveBeenCalledWith('peer_cancel_pairing');
  });
});

describe('isPairingActive', () => {
  it('returns true when pairing server is running', async () => {
    mockInvoke.mockResolvedValue(true);

    const active = await isPairingActive();

    expect(mockInvoke).toHaveBeenCalledWith('peer_pairing_is_active');
    expect(active).toBe(true);
  });

  it('returns false when not pairing', async () => {
    mockInvoke.mockResolvedValue(false);

    const active = await isPairingActive();

    expect(active).toBe(false);
  });
});

describe('event listeners', () => {
  it('onPeerPaired registers listener on peer:paired', async () => {
    const cb = vi.fn();
    const unlisten = await onPeerPaired(cb);

    expect(mockListen).toHaveBeenCalledWith('peer:paired', expect.any(Function));
    expect(unlisten).toBe(fakeUnlisten);
  });

  it('onPeerPaired fires callback with trusted device', async () => {
    const cb = vi.fn();
    let capturedHandler: (e: unknown) => void = () => {};

    mockListen.mockImplementation(async (_event, handler) => {
      capturedHandler = handler as (e: unknown) => void;
      return fakeUnlisten;
    });

    await onPeerPaired(cb);

    const device = makeTrustedDevice();
    capturedHandler({ payload: device });

    expect(cb).toHaveBeenCalledWith(device);
  });

  it('onPairingAttemptFailed registers listener on peer:pairing_attempt_failed', async () => {
    const cb = vi.fn();
    await onPairingAttemptFailed(cb);

    expect(mockListen).toHaveBeenCalledWith('peer:pairing_attempt_failed', expect.any(Function));
  });

  it('onPairingAttemptFailed fires with remainingAttempts', async () => {
    const cb = vi.fn();
    let capturedHandler: (e: unknown) => void = () => {};

    mockListen.mockImplementation(async (_event, handler) => {
      capturedHandler = handler as (e: unknown) => void;
      return fakeUnlisten;
    });

    await onPairingAttemptFailed(cb);
    capturedHandler({ payload: { remainingAttempts: 2 } });

    expect(cb).toHaveBeenCalledWith({ remainingAttempts: 2 });
  });

  it('onPairingLocked registers listener on peer:pairing_locked', async () => {
    const cb = vi.fn();
    await onPairingLocked(cb);

    expect(mockListen).toHaveBeenCalledWith('peer:pairing_locked', expect.any(Function));
  });

  it('onPairingLocked fires with reason', async () => {
    const cb = vi.fn();
    let capturedHandler: (e: unknown) => void = () => {};

    mockListen.mockImplementation(async (_event, handler) => {
      capturedHandler = handler as (e: unknown) => void;
      return fakeUnlisten;
    });

    await onPairingLocked(cb);
    capturedHandler({ payload: { reason: 'Too many attempts' } });

    expect(cb).toHaveBeenCalledWith({ reason: 'Too many attempts' });
  });

  it('onPairingIncoming registers listener on peer:pairing_incoming', async () => {
    const cb = vi.fn();
    await onPairingIncoming(cb);

    expect(mockListen).toHaveBeenCalledWith('peer:pairing_incoming', expect.any(Function));
  });

  it('onPairingIncoming fires with device info', async () => {
    const cb = vi.fn();
    let capturedHandler: (e: unknown) => void = () => {};

    mockListen.mockImplementation(async (_event, handler) => {
      capturedHandler = handler as (e: unknown) => void;
      return fakeUnlisten;
    });

    await onPairingIncoming(cb);

    const incoming = { deviceName: 'New Phone', deviceType: 'phone', deviceId: 'new-dev' };
    capturedHandler({ payload: incoming });

    expect(cb).toHaveBeenCalledWith(incoming);
  });
});
