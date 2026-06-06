import { invoke } from '@tauri-apps/api/core';
import { getDeviceId, getDeviceName, setDeviceName } from './deviceIdentity';

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
  // Reset navigator.userAgent to a generic value
  Object.defineProperty(navigator, 'userAgent', {
    value: 'Mozilla/5.0 (X11; Linux x86_64)',
    configurable: true,
  });
});

describe('getDeviceId', () => {
  it('returns existing device id from settings', async () => {
    mockInvoke.mockResolvedValue('existing-device-uuid');

    const id = await getDeviceId();

    expect(id).toBe('existing-device-uuid');
    expect(mockInvoke).toHaveBeenCalledWith('get_setting', { key: 'sync_device_id' });
    // Should NOT call set_setting since id already exists
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('generates and stores a new UUID when none exists', async () => {
    // First call (get_setting) returns null — no stored id
    mockInvoke.mockResolvedValueOnce(null);
    // Second call (set_setting) succeeds
    mockInvoke.mockResolvedValueOnce(undefined);

    const id = await getDeviceId();

    // Should be a UUID-like string
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(10);
    expect(mockInvoke).toHaveBeenCalledWith('set_setting', {
      key: 'sync_device_id',
      value: id,
    });
  });

  it('returns a new uuid even when set_setting fails', async () => {
    mockInvoke.mockResolvedValueOnce(null);
    mockInvoke.mockRejectedValueOnce(new Error('DB locked'));

    // Should not throw — set_setting failure is caught
    const id = await getDeviceId();
    expect(typeof id).toBe('string');
  });

  it('returns existing id when get_setting throws', async () => {
    // get_setting throws → treated as no id → generate new one
    mockInvoke.mockRejectedValueOnce(new Error('DB error'));
    mockInvoke.mockResolvedValueOnce(undefined);

    const id = await getDeviceId();
    expect(typeof id).toBe('string');
  });
});

describe('getDeviceName', () => {
  it('returns stored device name when set', async () => {
    mockInvoke.mockResolvedValue('My Desktop PC');

    const name = await getDeviceName();

    expect(name).toBe('My Desktop PC');
    expect(mockInvoke).toHaveBeenCalledWith('get_setting', { key: 'sync_device_name' });
  });

  it('falls back to Linux Desktop for Linux user agent', async () => {
    mockInvoke.mockResolvedValue(null);
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64)',
      configurable: true,
    });

    const name = await getDeviceName();

    expect(name).toBe('Linux Desktop');
  });

  it('falls back to Mac for macOS user agent', async () => {
    mockInvoke.mockResolvedValue(null);
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      configurable: true,
    });

    const name = await getDeviceName();

    expect(name).toBe('Mac');
  });

  it('falls back to Windows PC for Windows user agent', async () => {
    mockInvoke.mockResolvedValue(null);
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      configurable: true,
    });

    const name = await getDeviceName();

    expect(name).toBe('Windows PC');
  });

  it('falls back to Android for Android user agent', async () => {
    mockInvoke.mockResolvedValue(null);
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 13; Pixel 7)',
      configurable: true,
    });

    const name = await getDeviceName();

    expect(name).toBe('Android');
  });

  it('falls back to iOS for iPhone user agent', async () => {
    mockInvoke.mockResolvedValue(null);
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      configurable: true,
    });

    const name = await getDeviceName();

    expect(name).toBe('iOS');
  });

  it('returns fallback when get_setting throws', async () => {
    mockInvoke.mockRejectedValue(new Error('DB error'));

    const name = await getDeviceName();
    // Should not throw, returns platform guess
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });
});

describe('setDeviceName', () => {
  it('calls set_setting with trimmed name', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await setDeviceName('  My PC  ');

    expect(mockInvoke).toHaveBeenCalledWith('set_setting', {
      key: 'sync_device_name',
      value: 'My PC',
    });
  });

  it('propagates invoke errors', async () => {
    mockInvoke.mockRejectedValue(new Error('Write failed'));

    await expect(setDeviceName('Name')).rejects.toThrow('Write failed');
  });
});
