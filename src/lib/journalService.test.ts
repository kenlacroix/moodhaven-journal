// Mock crypto module so we can spy on clearKeyCache
vi.mock('./crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./crypto')>();
  return {
    ...actual,
    clearKeyCache: vi.fn(),
  };
});

import { lockJournal, devBypassUnlock, isUnlocked } from './journalService';
import { clearKeyCache } from './crypto';

const mockClearKeyCache = vi.mocked(clearKeyCache);

beforeEach(() => {
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
  });
});
