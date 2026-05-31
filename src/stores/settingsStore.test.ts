import { useSettingsStore } from './settingsStore';
import { createDefaultSettings } from '../types/settings';

// Mock settingsService
vi.mock('../lib/services/settingsService', () => ({
  loadSettings: vi.fn(),
  saveSettings: vi.fn(),
  getAppVersion: vi.fn(),
  resetSettings: vi.fn(),
}));

import {
  loadSettings,
  saveSettings,
  getAppVersion,
  resetSettings as resetSettingsService,
} from '../lib/services/settingsService';

const mockLoadSettings = vi.mocked(loadSettings);
const mockSaveSettings = vi.mocked(saveSettings);
const mockGetAppVersion = vi.mocked(getAppVersion);
const mockResetSettings = vi.mocked(resetSettingsService);

describe('settingsStore', () => {
  const defaults = createDefaultSettings();

  beforeEach(() => {
    useSettingsStore.setState({
      settings: createDefaultSettings(),
      appVersion: '0.0.0',
      isLoading: true,
      error: null,
      hasUnsavedChanges: false,
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('settings are default values', () => {
      const state = useSettingsStore.getState();
      expect(state.settings.ai.enabled).toBe(false);
      expect(state.settings.appearance.theme).toBe('system');
    });

    it('isLoading is true', () => {
      expect(useSettingsStore.getState().isLoading).toBe(true);
    });

    it('hasUnsavedChanges is false', () => {
      expect(useSettingsStore.getState().hasUnsavedChanges).toBe(false);
    });
  });

  describe('loadSettings', () => {
    it('sets settings and version after loading', async () => {
      const customSettings = { ...defaults, version: '2.0.0' };
      mockLoadSettings.mockResolvedValue(customSettings);
      mockGetAppVersion.mockResolvedValue('0.4.0');

      await useSettingsStore.getState().loadSettings();

      const state = useSettingsStore.getState();
      expect(state.settings.version).toBe('2.0.0');
      expect(state.appVersion).toBe('0.4.0');
      expect(state.isLoading).toBe(false);
      expect(state.hasUnsavedChanges).toBe(false);
    });

    it('sets error on failure', async () => {
      mockLoadSettings.mockRejectedValue(new Error('Load failed'));
      mockGetAppVersion.mockResolvedValue('0.4.0');

      await useSettingsStore.getState().loadSettings();

      expect(useSettingsStore.getState().error).toBe('Load failed');
      expect(useSettingsStore.getState().isLoading).toBe(false);
    });
  });

  describe('saveSettings', () => {
    it('calls saveSettings service with current settings', async () => {
      mockSaveSettings.mockResolvedValue(undefined);
      await useSettingsStore.getState().saveSettings();
      expect(mockSaveSettings).toHaveBeenCalledWith(
        useSettingsStore.getState().settings,
        undefined  // no session password in test environment
      );
    });

    it('clears hasUnsavedChanges on success', async () => {
      useSettingsStore.setState({ hasUnsavedChanges: true });
      mockSaveSettings.mockResolvedValue(undefined);
      await useSettingsStore.getState().saveSettings();
      expect(useSettingsStore.getState().hasUnsavedChanges).toBe(false);
    });

    it('sets error and re-throws on failure', async () => {
      mockSaveSettings.mockRejectedValue(new Error('Save failed'));
      await expect(
        useSettingsStore.getState().saveSettings()
      ).rejects.toThrow('Save failed');
      expect(useSettingsStore.getState().error).toBe('Save failed');
    });
  });

  describe('resetSettings', () => {
    it('resets to default settings', async () => {
      mockResetSettings.mockResolvedValue(defaults);
      useSettingsStore.setState({
        settings: { ...defaults, version: '99.0.0' },
        hasUnsavedChanges: true,
      });

      await useSettingsStore.getState().resetSettings();

      expect(useSettingsStore.getState().settings.version).toBe(
        defaults.version
      );
      expect(useSettingsStore.getState().hasUnsavedChanges).toBe(false);
    });
  });

  describe('updateSettings', () => {
    it('merges partial updates into settings', () => {
      useSettingsStore.getState().updateSettings({ version: '3.0.0' });
      expect(useSettingsStore.getState().settings.version).toBe('3.0.0');
    });

    it('marks hasUnsavedChanges as true', () => {
      useSettingsStore.getState().updateSettings({ version: '3.0.0' });
      expect(useSettingsStore.getState().hasUnsavedChanges).toBe(true);
    });
  });

  describe('AI setters', () => {
    it('setAIEnabled toggles ai.enabled', () => {
      useSettingsStore.getState().setAIEnabled(true);
      expect(useSettingsStore.getState().settings.ai.enabled).toBe(true);
      expect(useSettingsStore.getState().hasUnsavedChanges).toBe(true);
    });

    it('setAIProvider updates ai.provider', () => {
      useSettingsStore.getState().setAIProvider('openai');
      expect(useSettingsStore.getState().settings.ai.provider).toBe('openai');
    });

    it('setOpenAIKey updates nested ai.openai.apiKey', () => {
      useSettingsStore.getState().setOpenAIKey('sk-test');
      expect(useSettingsStore.getState().settings.ai.openai.apiKey).toBe(
        'sk-test'
      );
    });
  });

  describe('appearance setters', () => {
    it('setTheme updates appearance.theme', () => {
      useSettingsStore.getState().setTheme('dark');
      expect(useSettingsStore.getState().settings.appearance.theme).toBe(
        'dark'
      );
      expect(useSettingsStore.getState().hasUnsavedChanges).toBe(true);
    });

    it('setCompactMode updates appearance.compactMode', () => {
      useSettingsStore.getState().setCompactMode(true);
      expect(useSettingsStore.getState().settings.appearance.compactMode).toBe(
        true
      );
    });

    describe('setWritingAppearance', () => {
      it('merges a partial patch into appearance.writing', () => {
        useSettingsStore.getState().setWritingAppearance({ fontFamily: 'iowan' });
        const writing = useSettingsStore.getState().settings.appearance.writing;
        expect(writing.fontFamily).toBe('iowan');
        // Other defaults preserved
        expect(writing.backgroundTint).toBe('cream');
        expect(writing.fontSize).toBe('md');
        expect(useSettingsStore.getState().hasUnsavedChanges).toBe(true);
      });

      it('clamps textScale above 2.0 down to 2.0', () => {
        useSettingsStore.getState().setWritingAppearance({ textScale: 5 });
        expect(
          useSettingsStore.getState().settings.appearance.writing.textScale
        ).toBe(2.0);
      });

      it('clamps textScale below 0.8 up to 0.8', () => {
        useSettingsStore.getState().setWritingAppearance({ textScale: 0.1 });
        expect(
          useSettingsStore.getState().settings.appearance.writing.textScale
        ).toBe(0.8);
      });

      it('falls back to 1.0 when textScale is NaN', () => {
        useSettingsStore.getState().setWritingAppearance({ textScale: NaN });
        expect(
          useSettingsStore.getState().settings.appearance.writing.textScale
        ).toBe(1.0);
      });

      it('preserves writing when patch is empty', () => {
        const before =
          useSettingsStore.getState().settings.appearance.writing;
        useSettingsStore.getState().setWritingAppearance({});
        const after =
          useSettingsStore.getState().settings.appearance.writing;
        expect(after).toEqual(before);
      });
    });

    it('setHasSeenWritingDrawerHint flips the tutorial flag', () => {
      expect(
        useSettingsStore.getState().settings.tutorial.hasSeenWritingDrawerHint
      ).toBe(false);
      useSettingsStore.getState().setHasSeenWritingDrawerHint(true);
      expect(
        useSettingsStore.getState().settings.tutorial.hasSeenWritingDrawerHint
      ).toBe(true);
    });
  });

  describe('privacy setters', () => {
    it('setAutoLockTimeout updates privacy.autoLockTimeout', () => {
      useSettingsStore.getState().setAutoLockTimeout(15);
      expect(
        useSettingsStore.getState().settings.privacy.autoLockTimeout
      ).toBe(15);
      expect(useSettingsStore.getState().hasUnsavedChanges).toBe(true);
    });
  });

  describe('journal setters', () => {
    it('setShowPrompts updates journal.showPrompts', () => {
      useSettingsStore.getState().setShowPrompts(false);
      expect(useSettingsStore.getState().settings.journal.showPrompts).toBe(
        false
      );
      expect(useSettingsStore.getState().hasUnsavedChanges).toBe(true);
    });
  });
});
