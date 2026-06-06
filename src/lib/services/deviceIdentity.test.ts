import { invoke } from '@tauri-apps/api/core';
import { getDeviceId, getDeviceName, setDeviceName } from './deviceIdentity';

const mockInvoke = vi.mocked(invoke);

describe('deviceIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getDeviceId ───────────────────────────────────────────────────────────────

  describe('getDeviceId', () => {
    it('returns the stored device UUID when one exists', async () => {
      mockInvoke.mockResolvedValue('existing-device-uuid');
      const id = await getDeviceId();
      expect(id).toBe('existing-device-uuid');
      expect(mockInvoke).toHaveBeenCalledWith('get_setting', { key: 'sync_device_id' });
    });

    it('generates a new UUID when no device ID is stored', async () => {
      mockInvoke
        .mockResolvedValueOnce(null)      // get_setting → null
        .mockResolvedValueOnce(undefined); // set_setting → ok

      const id = await getDeviceId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(10);
    });

    it('persists the generated UUID to settings', async () => {
      mockInvoke
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(undefined);

      const id = await getDeviceId();
      expect(mockInvoke).toHaveBeenCalledWith('set_setting', {
        key: 'sync_device_id',
        value: id,
      });
    });

    it('returns the same value on repeated calls (stable ID)', async () => {
      const uuid = 'stable-device-uuid';
      mockInvoke.mockResolvedValue(uuid);
      expect(await getDeviceId()).toBe(uuid);
      expect(await getDeviceId()).toBe(uuid);
    });

    it('returns a generated UUID even when set_setting fails', async () => {
      mockInvoke
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('DB locked'));

      const id = await getDeviceId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });

  // ── getDeviceName ─────────────────────────────────────────────────────────────

  describe('getDeviceName', () => {
    it('returns the stored human-readable name', async () => {
      mockInvoke.mockResolvedValue('My MacBook Pro');
      const name = await getDeviceName();
      expect(name).toBe('My MacBook Pro');
      expect(mockInvoke).toHaveBeenCalledWith('get_setting', { key: 'sync_device_name' });
    });

    it('falls back to a non-empty platform guess when no name is stored', async () => {
      mockInvoke.mockResolvedValue(null);
      const name = await getDeviceName();
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    });

    it('falls back gracefully when invoke throws (e.g. session locked)', async () => {
      mockInvoke.mockRejectedValue(new Error('Session is locked'));
      const name = await getDeviceName();
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    });

    it('falls back gracefully when invoke returns empty string', async () => {
      mockInvoke.mockResolvedValue('');
      const name = await getDeviceName();
      // Empty string is falsy → must fall back to platform guess
      expect(name.length).toBeGreaterThan(0);
    });
  });

  // ── setDeviceName ─────────────────────────────────────────────────────────────

  describe('setDeviceName', () => {
    it('invokes set_setting with the trimmed name', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await setDeviceName('  My Phone  ');
      expect(mockInvoke).toHaveBeenCalledWith('set_setting', {
        key: 'sync_device_name',
        value: 'My Phone',
      });
    });

    it('persists a name that has no leading/trailing whitespace unchanged', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await setDeviceName('Desktop PC');
      expect(mockInvoke).toHaveBeenCalledWith('set_setting', {
        key: 'sync_device_name',
        value: 'Desktop PC',
      });
    });
  });
});
