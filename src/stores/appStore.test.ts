import { useAppStore } from './appStore';

// Mock journalService functions
vi.mock('../lib/journalService', () => ({
  hasPassword: vi.fn(),
  setupPassword: vi.fn(),
  unlockJournal: vi.fn(),
  lockJournal: vi.fn(),
  devBypassUnlock: vi.fn(),
}));

import {
  hasPassword,
  setupPassword,
  unlockJournal,
  lockJournal,
  devBypassUnlock,
} from '../lib/journalService';

const mockHasPassword = vi.mocked(hasPassword);
const mockSetupPassword = vi.mocked(setupPassword);
const mockUnlockJournal = vi.mocked(unlockJournal);
const mockLockJournal = vi.mocked(lockJournal);
const mockDevBypassUnlock = vi.mocked(devBypassUnlock);

describe('appStore', () => {
  beforeEach(() => {
    // Reset store state
    useAppStore.setState({
      isInitialized: false,
      isUnlocked: false,
      theme: 'system',
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('isInitialized is false', () => {
      expect(useAppStore.getState().isInitialized).toBe(false);
    });

    it('isUnlocked is false', () => {
      expect(useAppStore.getState().isUnlocked).toBe(false);
    });

    it('theme is system', () => {
      expect(useAppStore.getState().theme).toBe('system');
    });
  });

  describe('checkInitialization', () => {
    it('sets isInitialized to true when hasPassword returns true', async () => {
      mockHasPassword.mockResolvedValue(true);
      await useAppStore.getState().checkInitialization();
      expect(useAppStore.getState().isInitialized).toBe(true);
    });

    it('sets isInitialized to false when hasPassword returns false', async () => {
      mockHasPassword.mockResolvedValue(false);
      await useAppStore.getState().checkInitialization();
      expect(useAppStore.getState().isInitialized).toBe(false);
    });

    it('sets isInitialized to false on error', async () => {
      mockHasPassword.mockRejectedValue(new Error('DB error'));
      await useAppStore.getState().checkInitialization();
      expect(useAppStore.getState().isInitialized).toBe(false);
    });

    it('bypasses DB when VITE_DEV_MODE is bypass', async () => {
      vi.stubEnv('VITE_DEV_MODE', 'bypass');
      await useAppStore.getState().checkInitialization();
      expect(mockDevBypassUnlock).toHaveBeenCalledWith('dev-bypass');
      expect(useAppStore.getState().isInitialized).toBe(true);
      expect(useAppStore.getState().isUnlocked).toBe(true);
      expect(useAppStore.getState().sessionPassword).toBe('dev-bypass');
      expect(mockHasPassword).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
    });
  });

  describe('initialize', () => {
    it('calls setupPassword with the provided password', async () => {
      mockSetupPassword.mockResolvedValue(undefined);
      mockUnlockJournal.mockResolvedValue(true);
      await useAppStore.getState().initialize('my-password');
      expect(mockSetupPassword).toHaveBeenCalledWith('my-password');
    });

    it('auto-unlocks after successful setup', async () => {
      mockSetupPassword.mockResolvedValue(undefined);
      mockUnlockJournal.mockResolvedValue(true);
      const result = await useAppStore.getState().initialize('password');
      expect(result).toBe(true);
      expect(useAppStore.getState().isInitialized).toBe(true);
      expect(useAppStore.getState().isUnlocked).toBe(true);
    });

    it('returns false on error', async () => {
      mockSetupPassword.mockRejectedValue(new Error('Failed'));
      const result = await useAppStore.getState().initialize('password');
      expect(result).toBe(false);
    });
  });

  describe('unlock', () => {
    it('sets isUnlocked to true when unlockJournal succeeds', async () => {
      mockUnlockJournal.mockResolvedValue(true);
      const result = await useAppStore.getState().unlock('password');
      expect(result).toBe(true);
      expect(useAppStore.getState().isUnlocked).toBe(true);
    });

    it('keeps isUnlocked false when unlockJournal returns false', async () => {
      mockUnlockJournal.mockResolvedValue(false);
      const result = await useAppStore.getState().unlock('wrong');
      expect(result).toBe(false);
      expect(useAppStore.getState().isUnlocked).toBe(false);
    });

    it('returns false on error', async () => {
      mockUnlockJournal.mockRejectedValue(new Error('Failed'));
      const result = await useAppStore.getState().unlock('password');
      expect(result).toBe(false);
    });
  });

  describe('lock', () => {
    it('sets isUnlocked to false', () => {
      useAppStore.setState({ isUnlocked: true });
      useAppStore.getState().lock();
      expect(useAppStore.getState().isUnlocked).toBe(false);
    });

    it('calls lockJournal', () => {
      useAppStore.getState().lock();
      expect(mockLockJournal).toHaveBeenCalled();
    });
  });

  describe('setTheme', () => {
    it('updates theme to dark', () => {
      useAppStore.getState().setTheme('dark');
      expect(useAppStore.getState().theme).toBe('dark');
    });

    it('updates theme to light', () => {
      useAppStore.getState().setTheme('light');
      expect(useAppStore.getState().theme).toBe('light');
    });

    it('updates theme to system', () => {
      useAppStore.getState().setTheme('system');
      expect(useAppStore.getState().theme).toBe('system');
    });
  });
});
