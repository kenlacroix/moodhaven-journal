import { invoke } from '@tauri-apps/api/core';
import {
  loadRateLimitState,
  recordFailedAttempt,
  resetRateLimit,
  isLockedOut,
  getRemainingLockoutMs,
  getRemainingFreeAttempts,
  getNextLockoutDuration,
  formatDuration,
  type RateLimitState,
} from './rateLimitService';

const mockInvoke = vi.mocked(invoke);

function makeState(overrides: Partial<RateLimitState> = {}): RateLimitState {
  return {
    failedAttempts: 0,
    lockoutUntil: null,
    lastFailedAt: null,
    ...overrides,
  };
}

describe('rateLimitService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // ── loadRateLimitState ──────────────────────────────────────

  describe('loadRateLimitState', () => {
    it('returns default state when nothing is stored', async () => {
      mockInvoke.mockResolvedValue(null);
      const state = await loadRateLimitState();
      expect(state).toEqual({ failedAttempts: 0, lockoutUntil: null, lastFailedAt: null });
    });

    it('parses stored JSON correctly', async () => {
      const stored: RateLimitState = {
        failedAttempts: 3,
        lockoutUntil: null,
        lastFailedAt: '2026-01-15T10:00:00.000Z',
      };
      mockInvoke.mockResolvedValue(JSON.stringify(stored));
      const state = await loadRateLimitState();
      expect(state).toEqual(stored);
    });

    it('returns default state for corrupted JSON', async () => {
      mockInvoke.mockResolvedValue('not valid json!!!');
      const state = await loadRateLimitState();
      expect(state).toEqual({ failedAttempts: 0, lockoutUntil: null, lastFailedAt: null });
    });

    it('returns default state for invalid shape', async () => {
      mockInvoke.mockResolvedValue(JSON.stringify({ wrong: 'shape' }));
      const state = await loadRateLimitState();
      expect(state).toEqual({ failedAttempts: 0, lockoutUntil: null, lastFailedAt: null });
    });

    it('returns default state when invoke throws', async () => {
      mockInvoke.mockRejectedValue(new Error('backend down'));
      const state = await loadRateLimitState();
      expect(state).toEqual({ failedAttempts: 0, lockoutUntil: null, lastFailedAt: null });
    });

    it('calls invoke with correct key', async () => {
      mockInvoke.mockResolvedValue(null);
      await loadRateLimitState();
      expect(mockInvoke).toHaveBeenCalledWith('get_setting', { key: 'rate_limit_state' });
    });
  });

  // ── recordFailedAttempt ─────────────────────────────────────

  describe('recordFailedAttempt', () => {
    it('increments failedAttempts by 1', async () => {
      mockInvoke.mockResolvedValue(undefined);
      const result = await recordFailedAttempt(makeState({ failedAttempts: 2 }));
      expect(result.failedAttempts).toBe(3);
    });

    it('no lockout for attempts 1-4', async () => {
      mockInvoke.mockResolvedValue(undefined);
      for (let i = 0; i < 4; i++) {
        const result = await recordFailedAttempt(makeState({ failedAttempts: i }));
        expect(result.lockoutUntil).toBeNull();
      }
    });

    it('5th failure triggers 30s lockout', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));
      mockInvoke.mockResolvedValue(undefined);

      const result = await recordFailedAttempt(makeState({ failedAttempts: 4 }));
      expect(result.failedAttempts).toBe(5);
      expect(result.lockoutUntil).toBe(new Date('2026-01-15T10:00:30.000Z').toISOString());
    });

    it('6th failure triggers 1 minute lockout', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));
      mockInvoke.mockResolvedValue(undefined);

      const result = await recordFailedAttempt(makeState({ failedAttempts: 5 }));
      expect(result.failedAttempts).toBe(6);
      expect(result.lockoutUntil).toBe(new Date('2026-01-15T10:01:00.000Z').toISOString());
    });

    it('7th failure triggers 5 minute lockout', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));
      mockInvoke.mockResolvedValue(undefined);

      const result = await recordFailedAttempt(makeState({ failedAttempts: 6 }));
      expect(result.failedAttempts).toBe(7);
      expect(result.lockoutUntil).toBe(new Date('2026-01-15T10:05:00.000Z').toISOString());
    });

    it('8th failure triggers 15 minute lockout', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));
      mockInvoke.mockResolvedValue(undefined);

      const result = await recordFailedAttempt(makeState({ failedAttempts: 7 }));
      expect(result.failedAttempts).toBe(8);
      expect(result.lockoutUntil).toBe(new Date('2026-01-15T10:15:00.000Z').toISOString());
    });

    it('9th failure triggers 30 minute lockout', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));
      mockInvoke.mockResolvedValue(undefined);

      const result = await recordFailedAttempt(makeState({ failedAttempts: 8 }));
      expect(result.failedAttempts).toBe(9);
      expect(result.lockoutUntil).toBe(new Date('2026-01-15T10:30:00.000Z').toISOString());
    });

    it('10th failure triggers 60 minute lockout (cap)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));
      mockInvoke.mockResolvedValue(undefined);

      const result = await recordFailedAttempt(makeState({ failedAttempts: 9 }));
      expect(result.failedAttempts).toBe(10);
      expect(result.lockoutUntil).toBe(new Date('2026-01-15T11:00:00.000Z').toISOString());
    });

    it('11th+ failures stay at 60 minute cap', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));
      mockInvoke.mockResolvedValue(undefined);

      const result = await recordFailedAttempt(makeState({ failedAttempts: 15 }));
      expect(result.failedAttempts).toBe(16);
      expect(result.lockoutUntil).toBe(new Date('2026-01-15T11:00:00.000Z').toISOString());
    });

    it('sets lastFailedAt to current time', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));
      mockInvoke.mockResolvedValue(undefined);

      const result = await recordFailedAttempt(makeState());
      expect(result.lastFailedAt).toBe('2026-01-15T10:00:00.000Z');
    });

    it('persists state via set_setting', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await recordFailedAttempt(makeState({ failedAttempts: 2 }));

      expect(mockInvoke).toHaveBeenCalledWith('set_setting', {
        key: 'rate_limit_state',
        value: expect.any(String),
      });

      const persistedJson = (mockInvoke.mock.calls[0][1] as { value: string }).value;
      const persisted = JSON.parse(persistedJson);
      expect(persisted.failedAttempts).toBe(3);
    });

    it('does not throw when set_setting rejects (session locked)', async () => {
      // Regression: before fix, a locked session caused recordFailedAttempt to throw,
      // which propagated through handleFailedAttempt → outer catch → "An error occurred."
      mockInvoke.mockRejectedValue(new Error('Session is locked'));
      await expect(recordFailedAttempt(makeState())).resolves.not.toThrow();
    });
  });

  // ── resetRateLimit ──────────────────────────────────────────

  describe('resetRateLimit', () => {
    it('calls delete_setting with correct key', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await resetRateLimit();
      expect(mockInvoke).toHaveBeenCalledWith('delete_setting', { key: 'rate_limit_state' });
    });
  });

  // ── isLockedOut ─────────────────────────────────────────────

  describe('isLockedOut', () => {
    it('returns false when lockoutUntil is null', () => {
      expect(isLockedOut(makeState())).toBe(false);
    });

    it('returns true when lockoutUntil is in the future', () => {
      const future = new Date(Date.now() + 60000).toISOString();
      expect(isLockedOut(makeState({ lockoutUntil: future }))).toBe(true);
    });

    it('returns false when lockoutUntil is in the past', () => {
      const past = new Date(Date.now() - 1000).toISOString();
      expect(isLockedOut(makeState({ lockoutUntil: past }))).toBe(false);
    });
  });

  // ── getRemainingLockoutMs ───────────────────────────────────

  describe('getRemainingLockoutMs', () => {
    it('returns 0 when no lockout', () => {
      expect(getRemainingLockoutMs(makeState())).toBe(0);
    });

    it('returns positive ms when locked out', () => {
      const future = new Date(Date.now() + 30000).toISOString();
      const remaining = getRemainingLockoutMs(makeState({ lockoutUntil: future }));
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(30000);
    });

    it('returns 0 when lockout has expired', () => {
      const past = new Date(Date.now() - 1000).toISOString();
      expect(getRemainingLockoutMs(makeState({ lockoutUntil: past }))).toBe(0);
    });
  });

  // ── getRemainingFreeAttempts ─────────────────────────────────

  describe('getRemainingFreeAttempts', () => {
    it('returns 4 for fresh state', () => {
      expect(getRemainingFreeAttempts(makeState())).toBe(4);
    });

    it('returns 3 after 1 failure', () => {
      expect(getRemainingFreeAttempts(makeState({ failedAttempts: 1 }))).toBe(3);
    });

    it('returns 0 after 4 failures', () => {
      expect(getRemainingFreeAttempts(makeState({ failedAttempts: 4 }))).toBe(0);
    });

    it('returns 0 after more than 4 failures', () => {
      expect(getRemainingFreeAttempts(makeState({ failedAttempts: 10 }))).toBe(0);
    });
  });

  // ── getNextLockoutDuration ──────────────────────────────────

  describe('getNextLockoutDuration', () => {
    it('returns 0 when under free attempt limit', () => {
      expect(getNextLockoutDuration(makeState({ failedAttempts: 2 }))).toBe(0);
    });

    it('returns 30s when at 4 attempts (next is 5th)', () => {
      expect(getNextLockoutDuration(makeState({ failedAttempts: 4 }))).toBe(30000);
    });

    it('returns 60s when at 5 attempts (next is 6th)', () => {
      expect(getNextLockoutDuration(makeState({ failedAttempts: 5 }))).toBe(60000);
    });

    it('returns 60 min cap when at 9+ attempts', () => {
      expect(getNextLockoutDuration(makeState({ failedAttempts: 9 }))).toBe(3600000);
      expect(getNextLockoutDuration(makeState({ failedAttempts: 20 }))).toBe(3600000);
    });
  });

  // ── formatDuration ──────────────────────────────────────────

  describe('formatDuration', () => {
    it('formats 0 ms', () => {
      expect(formatDuration(0)).toBe('0 seconds');
    });

    it('formats negative ms as 0 seconds', () => {
      expect(formatDuration(-1000)).toBe('0 seconds');
    });

    it('formats 1 second', () => {
      expect(formatDuration(1000)).toBe('1 second');
    });

    it('formats 30 seconds', () => {
      expect(formatDuration(30000)).toBe('30 seconds');
    });

    it('formats 59.5 seconds as 1 minute (ceil)', () => {
      expect(formatDuration(59500)).toBe('1 minute');
    });

    it('formats 60 seconds as 1 minute', () => {
      expect(formatDuration(60000)).toBe('1 minute');
    });

    it('formats 5 minutes', () => {
      expect(formatDuration(5 * 60 * 1000)).toBe('5 minutes');
    });

    it('formats 60 minutes as 1 hour', () => {
      expect(formatDuration(60 * 60 * 1000)).toBe('1 hour');
    });

    it('formats 120 minutes as 2 hours', () => {
      expect(formatDuration(120 * 60 * 1000)).toBe('2 hours');
    });
  });
});
