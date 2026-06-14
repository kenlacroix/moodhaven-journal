// Mock crypto module so we can spy on the salt/cache lifecycle hooks.
vi.mock('./crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./crypto')>();
  return {
    ...actual,
    clearKeyCache: vi.fn(),
    setAccountSalt: vi.fn(),
    clearAccountSalt: vi.fn(),
  };
});

import { invoke } from '@tauri-apps/api/core';
import {
  lockJournal,
  devBypassUnlock,
  isUnlocked,
  unlockJournal,
  initAccountEncryption,
  getAccountSaltBase64,
} from './journalService';
import { clearKeyCache, setAccountSalt, clearAccountSalt } from './crypto';

const mockInvoke = vi.mocked(invoke);
const mockClearKeyCache = vi.mocked(clearKeyCache);
const mockSetAccountSalt = vi.mocked(setAccountSalt);
const mockClearAccountSalt = vi.mocked(clearAccountSalt);

beforeEach(() => {
  vi.clearAllMocks();
  // Reset module-level salt mirror by locking (clears accountSaltBase64).
  lockJournal();
  vi.clearAllMocks();
});

describe('journalService — session management', () => {
  describe('lockJournal', () => {
    it('clears the key cache on lock', () => {
      // Regression: ISSUE-QA-008 — lockJournal must call clearKeyCache so PBKDF2 cache is invalidated
      // Found by /qa on 2026-03-27
      // Report: .gstack/qa-reports/qa-report-feat-db-performance-2026-03-27.md
      lockJournal();
      expect(mockClearKeyCache).toHaveBeenCalledTimes(1);
    });

    it('marks journal as locked after call', () => {
      devBypassUnlock('any-password');
      expect(isUnlocked()).toBe(true);
      lockJournal();
      expect(isUnlocked()).toBe(false);
    });

    it('is idempotent — calling lock twice does not throw', () => {
      expect(() => {
        lockJournal();
        lockJournal();
      }).not.toThrow();
      expect(mockClearKeyCache).toHaveBeenCalledTimes(2);
    });

    it('clears the account salt and its mirror on lock', () => {
      devBypassUnlock('pw');
      lockJournal();
      expect(mockClearAccountSalt).toHaveBeenCalledTimes(1);
      expect(getAccountSaltBase64()).toBeNull();
    });
  });
});

describe('journalService — account encryption salt', () => {
  describe('initAccountEncryption', () => {
    it('generates and persists a fresh salt when none exists, then installs it', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'get_setting') return Promise.resolve(null);
        return Promise.resolve(undefined);
      });

      await initAccountEncryption();

      expect(mockInvoke).toHaveBeenCalledWith('get_setting', {
        key: 'encryption_salt',
      });
      // A new salt was persisted...
      const setCall = mockInvoke.mock.calls.find(
        (c) => c[0] === 'set_setting'
      );
      expect(setCall).toBeDefined();
      const persisted = (setCall![1] as { key: string; value: string });
      expect(persisted.key).toBe('encryption_salt');
      // 16 random bytes → base64 ("AAAA..." style), non-empty.
      expect(persisted.value.length).toBeGreaterThan(0);
      // ...and installed into crypto + mirrored locally.
      expect(mockSetAccountSalt).toHaveBeenCalledWith(persisted.value);
      expect(getAccountSaltBase64()).toBe(persisted.value);
    });

    it('loads and installs an existing salt without persisting a new one', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'get_setting') return Promise.resolve('STORED_SALT_B64');
        return Promise.resolve(undefined);
      });

      await initAccountEncryption();

      expect(mockInvoke).not.toHaveBeenCalledWith(
        'set_setting',
        expect.anything()
      );
      expect(mockSetAccountSalt).toHaveBeenCalledWith('STORED_SALT_B64');
      expect(getAccountSaltBase64()).toBe('STORED_SALT_B64');
    });

    it('is idempotent — re-running with an existing salt re-installs the same value', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'get_setting') return Promise.resolve('STABLE');
        return Promise.resolve(undefined);
      });

      await initAccountEncryption();
      await initAccountEncryption();

      expect(mockSetAccountSalt).toHaveBeenCalledTimes(2);
      expect(mockSetAccountSalt).toHaveBeenLastCalledWith('STABLE');
      // Never persists when the salt already exists.
      expect(mockInvoke).not.toHaveBeenCalledWith(
        'set_setting',
        expect.anything()
      );
    });
  });

  describe('unlockJournal', () => {
    it('installs the account salt after a successful unlock', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'verify_password') return Promise.resolve(true);
        if (cmd === 'get_setting') return Promise.resolve('UNLOCK_SALT');
        return Promise.resolve(undefined);
      });

      const ok = await unlockJournal('correct-pw');

      expect(ok).toBe(true);
      expect(isUnlocked()).toBe(true);
      expect(mockSetAccountSalt).toHaveBeenCalledWith('UNLOCK_SALT');
      expect(getAccountSaltBase64()).toBe('UNLOCK_SALT');
    });

    it('does not install a salt when the password is wrong', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'verify_password') return Promise.resolve(false);
        return Promise.resolve(undefined);
      });

      const ok = await unlockJournal('wrong-pw');

      expect(ok).toBe(false);
      expect(isUnlocked()).toBe(false);
      expect(mockSetAccountSalt).not.toHaveBeenCalled();
    });

    it('still unlocks if salt init fails (non-fatal)', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'verify_password') return Promise.resolve(true);
        if (cmd === 'get_setting') return Promise.reject(new Error('db error'));
        return Promise.resolve(undefined);
      });

      const ok = await unlockJournal('correct-pw');

      expect(ok).toBe(true);
      expect(isUnlocked()).toBe(true);
      // init threw before setAccountSalt ran.
      expect(mockSetAccountSalt).not.toHaveBeenCalled();
    });
  });
});
