/**
 * Rate Limit Service
 *
 * Provides exponential-backoff rate limiting for the lock screen.
 * Persists attempt count via the Rust get_setting/set_setting backend
 * so lockouts survive app restarts.
 *
 * Password and recovery key share one counter.
 * Factory reset / "Forgot password?" are never gated.
 */

import { invoke } from '@tauri-apps/api/core';

const RATE_LIMIT_KEY = 'rate_limit_state';
const FREE_ATTEMPTS = 4;

/** Lockout durations in ms, indexed by (failedAttempts - FREE_ATTEMPTS - 1) */
const LOCKOUT_SCHEDULE_MS: number[] = [
  30 * 1000,       // 5th failure  → 30 seconds
  60 * 1000,       // 6th failure  → 1 minute
  5 * 60 * 1000,   // 7th failure  → 5 minutes
  15 * 60 * 1000,  // 8th failure  → 15 minutes
  30 * 60 * 1000,  // 9th failure  → 30 minutes
  60 * 60 * 1000,  // 10th+ failure → 60 minutes (cap)
];

export interface RateLimitState {
  failedAttempts: number;
  lockoutUntil: string | null;   // ISO timestamp
  lastFailedAt: string | null;   // ISO timestamp
}

function defaultState(): RateLimitState {
  return { failedAttempts: 0, lockoutUntil: null, lastFailedAt: null };
}

/**
 * Look up the lockout duration for a given number of failed attempts.
 */
function lockoutDurationForAttempts(failedAttempts: number): number {
  if (failedAttempts <= FREE_ATTEMPTS) return 0;
  const index = Math.min(failedAttempts - FREE_ATTEMPTS - 1, LOCKOUT_SCHEDULE_MS.length - 1);
  return LOCKOUT_SCHEDULE_MS[index];
}

// ── Persistence ──────────────────────────────────────────────

/**
 * Load persisted rate-limit state from the backend.
 * Returns default (zero) state if nothing is stored or data is corrupted.
 */
export async function loadRateLimitState(): Promise<RateLimitState> {
  try {
    const raw = await invoke<string | null>('get_setting', { key: RATE_LIMIT_KEY });
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // Basic shape validation
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.failedAttempts === 'number'
    ) {
      return {
        failedAttempts: parsed.failedAttempts,
        lockoutUntil: typeof parsed.lockoutUntil === 'string' ? parsed.lockoutUntil : null,
        lastFailedAt: typeof parsed.lastFailedAt === 'string' ? parsed.lastFailedAt : null,
      };
    }
    return defaultState();
  } catch {
    return defaultState();
  }
}

async function persistState(state: RateLimitState): Promise<void> {
  await invoke('set_setting', { key: RATE_LIMIT_KEY, value: JSON.stringify(state) });
}

// ── Actions ──────────────────────────────────────────────────

/**
 * Record a failed authentication attempt.
 * Increments the counter, computes the new lockout window, and persists.
 */
export async function recordFailedAttempt(current: RateLimitState): Promise<RateLimitState> {
  const now = new Date();
  const newAttempts = current.failedAttempts + 1;
  const duration = lockoutDurationForAttempts(newAttempts);

  const newState: RateLimitState = {
    failedAttempts: newAttempts,
    lockoutUntil: duration > 0 ? new Date(now.getTime() + duration).toISOString() : null,
    lastFailedAt: now.toISOString(),
  };

  await persistState(newState);
  return newState;
}

/**
 * Reset rate-limit state (e.g. after successful unlock).
 * Deletes the persisted key entirely.
 */
export async function resetRateLimit(): Promise<void> {
  await invoke('delete_setting', { key: RATE_LIMIT_KEY });
}

// ── Pure helpers ─────────────────────────────────────────────

/** Whether the user is currently locked out. */
export function isLockedOut(state: RateLimitState): boolean {
  if (!state.lockoutUntil) return false;
  return new Date(state.lockoutUntil).getTime() > Date.now();
}

/** Milliseconds remaining in the current lockout, or 0. */
export function getRemainingLockoutMs(state: RateLimitState): number {
  if (!state.lockoutUntil) return 0;
  return Math.max(0, new Date(state.lockoutUntil).getTime() - Date.now());
}

/** How many free attempts remain before the first lockout kicks in. */
export function getRemainingFreeAttempts(state: RateLimitState): number {
  return Math.max(0, FREE_ATTEMPTS - state.failedAttempts);
}

/** The lockout duration the *next* failure would trigger (in ms), or 0. */
export function getNextLockoutDuration(state: RateLimitState): number {
  return lockoutDurationForAttempts(state.failedAttempts + 1);
}

/**
 * Format a millisecond duration as a human-readable string.
 *   ≤0      → "0 seconds"
 *   <60s    → "X second(s)"
 *   <60m    → "X minute(s)"
 *   else    → "X hour(s)"
 */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '0 seconds';

  const totalSeconds = Math.ceil(ms / 1000);

  if (totalSeconds < 60) {
    return totalSeconds === 1 ? '1 second' : `${totalSeconds} seconds`;
  }

  const totalMinutes = Math.ceil(totalSeconds / 60);

  if (totalMinutes < 60) {
    return totalMinutes === 1 ? '1 minute' : `${totalMinutes} minutes`;
  }

  const totalHours = Math.ceil(totalMinutes / 60);
  return totalHours === 1 ? '1 hour' : `${totalHours} hours`;
}
