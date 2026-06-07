import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { TrustedDevice, PairingTokenInfo } from '../../types/peerSync';
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
  type PairingIncomingEvent,
} from './peerPairingService';
import { formatCountdown } from '../../components/peer-sync/PairingHooks';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);

function makeTrustedDevice(overrides: Partial<TrustedDevice> = {}): TrustedDevice {
  return {
    deviceId: 'aabbccdd11223344',
    deviceName: 'Test Phone',
    deviceType: 'phone',
    publicKey: 'base64pubkey==',
    pairedAt: '2026-01-01T00:00:00Z',
    lastSeen: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makePairingTokenInfo(overrides: Partial<PairingTokenInfo> = {}): PairingTokenInfo {
  return {
    pin: '123456',
    qrPayload: '{"host":"192.168.1.1","port":42425,"deviceId":"aabbccdd11223344","pin":"123456"}',
    expiresAt: Math.floor(Date.now() / 1000) + 300,
    localHost: '192.168.1.1',
    pairingPort: 42425,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── generatePairingToken ───────────────────────────────────────────────────────

describe('generatePairingToken', () => {
  it('returns token info with pin, qrPayload, and pairingPort on success', async () => {
    const token = makePairingTokenInfo();
    mockInvoke.mockResolvedValue(token);

    const result = await generatePairingToken();

    expect(mockInvoke).toHaveBeenCalledWith('peer_generate_pairing_token');
    expect(result.pin).toBe('123456');
    expect(result.qrPayload).toBe(token.qrPayload);
    expect(result.pairingPort).toBe(42425);
  });

  it('propagates errors from invoke', async () => {
    mockInvoke.mockRejectedValue(new Error('pairing server already active'));

    await expect(generatePairingToken()).rejects.toThrow('pairing server already active');
  });
});

// ── acceptPairing ─────────────────────────────────────────────────────────────

describe('acceptPairing', () => {
  it('calls invoke with correct args and returns TrustedDevice on success', async () => {
    const device = makeTrustedDevice();
    mockInvoke.mockResolvedValue(device);

    const result = await acceptPairing('192.168.1.10', 'peer-device-id-001', '123456');

    expect(mockInvoke).toHaveBeenCalledWith('peer_accept_pairing', {
      targetHost: '192.168.1.10',
      peerDeviceId: 'peer-device-id-001',
      pin: '123456',
    });
    expect(result).toEqual(device);
  });

  it('propagates errors for wrong PIN', async () => {
    mockInvoke.mockRejectedValue(new Error('Invalid PIN'));

    await expect(acceptPairing('192.168.1.10', 'peer-device-id-001', '999999')).rejects.toThrow(
      'Invalid PIN'
    );
  });

  it('propagates errors when session is locked out', async () => {
    mockInvoke.mockRejectedValue(new Error('pairing locked: too many failed attempts'));

    await expect(acceptPairing('192.168.1.10', 'peer-device-id-001', '000000')).rejects.toThrow(
      'pairing locked'
    );
  });
});

// ── PIN validation edge cases ─────────────────────────────────────────────────
// The service passes the pin string through to Rust unchanged.
// Validation is enforced server-side; tests verify no client-side sanitization occurs.

describe('acceptPairing — PIN passthrough (validation is Rust-side)', () => {
  beforeEach(() => {
    mockInvoke.mockResolvedValue(makeTrustedDevice());
  });

  it('passes empty string pin to invoke unchanged', async () => {
    await acceptPairing('192.168.1.10', 'peer-id', '').catch(() => {});
    expect(mockInvoke).toHaveBeenCalledWith('peer_accept_pairing', expect.objectContaining({ pin: '' }));
  });

  it('passes 5-digit pin to invoke unchanged', async () => {
    await acceptPairing('192.168.1.10', 'peer-id', '12345').catch(() => {});
    expect(mockInvoke).toHaveBeenCalledWith('peer_accept_pairing', expect.objectContaining({ pin: '12345' }));
  });

  it('passes 7-digit pin to invoke unchanged', async () => {
    await acceptPairing('192.168.1.10', 'peer-id', '1234567').catch(() => {});
    expect(mockInvoke).toHaveBeenCalledWith('peer_accept_pairing', expect.objectContaining({ pin: '1234567' }));
  });

  it('passes non-numeric pin to invoke unchanged', async () => {
    await acceptPairing('192.168.1.10', 'peer-id', 'abc123').catch(() => {});
    expect(mockInvoke).toHaveBeenCalledWith('peer_accept_pairing', expect.objectContaining({ pin: 'abc123' }));
  });

  it('passes SQL injection string to invoke unchanged', async () => {
    const injection = "'; DROP TABLE trusted_devices; --";
    await acceptPairing('192.168.1.10', 'peer-id', injection).catch(() => {});
    expect(mockInvoke).toHaveBeenCalledWith(
      'peer_accept_pairing',
      expect.objectContaining({ pin: injection })
    );
  });

  it('passes correct 6-digit pin to invoke unchanged', async () => {
    await acceptPairing('192.168.1.10', 'peer-id', '123456').catch(() => {});
    expect(mockInvoke).toHaveBeenCalledWith('peer_accept_pairing', expect.objectContaining({ pin: '123456' }));
  });
});

// ── getTrustedDevices ─────────────────────────────────────────────────────────

describe('getTrustedDevices', () => {
  it('returns an empty array when no devices are paired', async () => {
    mockInvoke.mockResolvedValue([]);

    const result = await getTrustedDevices();

    expect(mockInvoke).toHaveBeenCalledWith('peer_get_trusted');
    expect(result).toEqual([]);
  });

  it('returns an array of TrustedDevice objects', async () => {
    const devices = [
      makeTrustedDevice({ deviceId: 'td-1', deviceName: 'Laptop' }),
      makeTrustedDevice({ deviceId: 'td-2', deviceName: 'Phone', deviceType: 'phone' }),
    ];
    mockInvoke.mockResolvedValue(devices);

    const result = await getTrustedDevices();

    expect(result).toHaveLength(2);
    expect(result[0].deviceId).toBe('td-1');
    expect(result[1].deviceId).toBe('td-2');
  });

  it('each device has required fields: deviceId, deviceName, publicKey, pairedAt', async () => {
    const device = makeTrustedDevice();
    mockInvoke.mockResolvedValue([device]);

    const [result] = await getTrustedDevices();

    expect(result).toHaveProperty('deviceId');
    expect(result).toHaveProperty('deviceName');
    expect(result).toHaveProperty('publicKey');
    expect(result).toHaveProperty('pairedAt');
  });
});

// ── revokeDevice ──────────────────────────────────────────────────────────────

describe('revokeDevice', () => {
  it('calls invoke with the correct deviceId', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await revokeDevice('aabbccdd11223344');

    expect(mockInvoke).toHaveBeenCalledWith('peer_revoke_device', { deviceId: 'aabbccdd11223344' });
  });

  it('returns void on success', async () => {
    mockInvoke.mockResolvedValue(undefined);

    const result = await revokeDevice('some-device-id');

    expect(result).toBeUndefined();
  });
});

// ── cancelPairing ─────────────────────────────────────────────────────────────

describe('cancelPairing', () => {
  it('calls invoke peer_cancel_pairing with no args', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await cancelPairing();

    expect(mockInvoke).toHaveBeenCalledWith('peer_cancel_pairing');
  });

  it('returns void on success', async () => {
    mockInvoke.mockResolvedValue(undefined);

    const result = await cancelPairing();

    expect(result).toBeUndefined();
  });
});

// ── isPairingActive ───────────────────────────────────────────────────────────

describe('isPairingActive', () => {
  it('returns true when pairing server is running', async () => {
    mockInvoke.mockResolvedValue(true);

    const result = await isPairingActive();

    expect(mockInvoke).toHaveBeenCalledWith('peer_pairing_is_active');
    expect(result).toBe(true);
  });

  it('returns false when pairing server is not running', async () => {
    mockInvoke.mockResolvedValue(false);

    const result = await isPairingActive();

    expect(result).toBe(false);
  });
});

// ── Event listeners ───────────────────────────────────────────────────────────

describe('onPeerPaired', () => {
  it('listens on peer:paired event name', async () => {
    await onPeerPaired(() => {});

    expect(mockListen).toHaveBeenCalledWith('peer:paired', expect.any(Function));
  });

  it('calls the callback with the event payload', async () => {
    const device = makeTrustedDevice();
    mockListen.mockImplementation((_event, handler) => {
      handler({ payload: device, id: 1, event: 'peer:paired' } as never);
      return Promise.resolve(() => {});
    });

    const callback = vi.fn();
    await onPeerPaired(callback);

    expect(callback).toHaveBeenCalledWith(device);
  });
});

describe('onPairingAttemptFailed', () => {
  it('listens on peer:pairing_attempt_failed event name', async () => {
    await onPairingAttemptFailed(() => {});

    expect(mockListen).toHaveBeenCalledWith('peer:pairing_attempt_failed', expect.any(Function));
  });

  it('calls the callback with remainingAttempts payload', async () => {
    const payload = { remainingAttempts: 2 };
    mockListen.mockImplementation((_event, handler) => {
      handler({ payload, id: 2, event: 'peer:pairing_attempt_failed' } as never);
      return Promise.resolve(() => {});
    });

    const callback = vi.fn();
    await onPairingAttemptFailed(callback);

    expect(callback).toHaveBeenCalledWith(payload);
  });
});

describe('onPairingLocked', () => {
  it('listens on peer:pairing_locked event name', async () => {
    await onPairingLocked(() => {});

    expect(mockListen).toHaveBeenCalledWith('peer:pairing_locked', expect.any(Function));
  });

  it('calls the callback with reason payload', async () => {
    const payload = { reason: 'too many failed attempts' };
    mockListen.mockImplementation((_event, handler) => {
      handler({ payload, id: 3, event: 'peer:pairing_locked' } as never);
      return Promise.resolve(() => {});
    });

    const callback = vi.fn();
    await onPairingLocked(callback);

    expect(callback).toHaveBeenCalledWith(payload);
  });
});

describe('onPairingIncoming', () => {
  it('listens on peer:pairing_incoming event name', async () => {
    await onPairingIncoming(() => {});

    expect(mockListen).toHaveBeenCalledWith('peer:pairing_incoming', expect.any(Function));
  });

  it('calls the callback with PairingIncomingEvent payload', async () => {
    const payload: PairingIncomingEvent = {
      deviceName: 'Ken\'s Watch',
      deviceType: 'watch',
      deviceId: 'ccddee001122',
    };
    mockListen.mockImplementation((_event, handler) => {
      handler({ payload, id: 4, event: 'peer:pairing_incoming' } as never);
      return Promise.resolve(() => {});
    });

    const callback = vi.fn();
    await onPairingIncoming(callback);

    expect(callback).toHaveBeenCalledWith(payload);
  });
});

// ── formatCountdown ───────────────────────────────────────────────────────────

describe('formatCountdown', () => {
  it('formats 0 seconds as 0:00', () => {
    expect(formatCountdown(0)).toBe('0:00');
  });

  it('formats 59 seconds as 0:59', () => {
    expect(formatCountdown(59)).toBe('0:59');
  });

  it('formats 60 seconds as 1:00', () => {
    expect(formatCountdown(60)).toBe('1:00');
  });

  it('formats 90 seconds as 1:30', () => {
    expect(formatCountdown(90)).toBe('1:30');
  });

  it('formats 299 seconds as 4:59', () => {
    expect(formatCountdown(299)).toBe('4:59');
  });

  it('formats 300 seconds (token TTL) as 5:00', () => {
    expect(formatCountdown(300)).toBe('5:00');
  });

  it('formats negative values — function does not clamp (Rust layer clamps before emit)', () => {
    // formatCountdown itself does not guard against negative inputs;
    // callers (useCountdown) clamp via Math.max(0, ...) before calling this.
    // Verifying the raw arithmetic: Math.floor(-1/60)=-1, -1%60=-1 → "-1:-1"
    expect(formatCountdown(-1)).toBe('-1:-1');
  });
});
