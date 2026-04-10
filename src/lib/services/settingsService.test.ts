import { invoke } from '@tauri-apps/api/core';
import { loadSettings, saveSettings } from './settingsService';
import { createDefaultSettings } from '../../types/settings';

vi.mock('./crypto', () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}));

vi.mock('./logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

const mockInvoke = vi.mocked(invoke);

describe('settingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── loadSettings ────────────────────────────────────────────

  describe('loadSettings', () => {
    it('returns defaults and does not throw when locked', async () => {
      mockInvoke.mockRejectedValue(new Error('Session is locked'));
      await expect(loadSettings()).resolves.toEqual(createDefaultSettings());
    });

    it('does not log an error when locked (expected pre-unlock state)', async () => {
      const { logger } = await import('./logger');
      mockInvoke.mockRejectedValue(new Error('Session is locked'));
      await loadSettings();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('logs an error for unexpected failures', async () => {
      const { logger } = await import('./logger');
      mockInvoke.mockRejectedValue(new Error('Database error'));
      await loadSettings();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to load settings:',
        expect.objectContaining({ error: expect.stringContaining('Database error') })
      );
    });

    it('returns defaults when nothing is stored', async () => {
      mockInvoke.mockResolvedValue(null);
      const result = await loadSettings();
      expect(result).toEqual(createDefaultSettings());
    });

    it('returns parsed settings when stored', async () => {
      const stored = { ...createDefaultSettings(), logLevel: 'debug' as const };
      mockInvoke.mockResolvedValue(JSON.stringify(stored));
      const result = await loadSettings();
      expect(result.logLevel).toBe('debug');
    });

    it('returns defaults for corrupted JSON', async () => {
      mockInvoke.mockResolvedValue('not valid json');
      await expect(loadSettings()).resolves.toEqual(createDefaultSettings());
    });
  });

  // ── saveSettings ────────────────────────────────────────────

  describe('saveSettings', () => {
    it('does not throw when locked', async () => {
      mockInvoke.mockRejectedValue(new Error('Session is locked'));
      const defaults = createDefaultSettings();
      await expect(saveSettings(defaults)).resolves.not.toThrow();
    });

    it('does not log an error when locked', async () => {
      const { logger } = await import('./logger');
      mockInvoke.mockRejectedValue(new Error('Session is locked'));
      await saveSettings(createDefaultSettings());
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('throws and logs for non-session-locked errors', async () => {
      const { logger } = await import('./logger');
      mockInvoke.mockRejectedValue(new Error('Disk full'));
      const defaults = createDefaultSettings();
      await expect(saveSettings(defaults)).rejects.toThrow('Disk full');
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to save settings:',
        expect.objectContaining({ error: expect.stringContaining('Disk full') })
      );
    });

    it('calls set_setting with the correct key', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await saveSettings(createDefaultSettings());
      expect(mockInvoke).toHaveBeenCalledWith('set_setting', {
        key: 'app_settings',
        value: expect.any(String),
      });
    });
  });
});
