/**
 * useAppBanners — fires once per unlock session to surface:
 *   F7: streak milestone toasts (7 / 30 / 100 day streaks)
 *   F10: "On This Day" banner when prior-year entries exist for today
 *
 * Both checks run once per session (stored in sessionStorage so they don't
 * fire again if the user locks and re-unlocks mid-session).
 */

import { useEffect, useState } from 'react';
import { getStreakStats } from '../lib/services/analyticsService';
import { getEntriesOnThisDay } from '../lib/services/journalService';
import { logger } from '../lib/services/logger';

export interface AppBannerState {
  /** Streak milestone message, or null */
  streakToast: string | null;
  dismissStreakToast: () => void;
  /** On This Day entry count, or 0 */
  onThisDayCount: number;
  /** Year of oldest On This Day entry, for display */
  onThisDayOldestYear: number | null;
  dismissOnThisDay: () => void;
}

const STREAK_MILESTONE_MESSAGES: readonly [number, string][] = [
  [100, `100 days in a row. That's extraordinary.`],
  [30, `30-day streak! You're building something real.`],
  [7, `7-day streak — great momentum!`],
];
const SESSION_STREAK_KEY = 'mb_streak_toast_shown';
const SESSION_OTD_KEY = 'mb_otd_banner_shown';

export function useAppBanners(enabled: boolean): AppBannerState {
  const [streakToast, setStreakToast] = useState<string | null>(null);
  const [onThisDayCount, setOnThisDayCount] = useState(0);
  const [onThisDayOldestYear, setOnThisDayOldestYear] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function run() {
      const needsStreak = !sessionStorage.getItem(SESSION_STREAK_KEY);
      const needsOtd = !sessionStorage.getItem(SESSION_OTD_KEY);

      // Run both IPC calls in parallel (F7 + F10)
      const [streakResult, otdResult] = await Promise.allSettled([
        needsStreak ? getStreakStats() : Promise.resolve(null),
        needsOtd ? getEntriesOnThisDay() : Promise.resolve(null),
      ]);

      if (cancelled) return;

      // F7: streak milestone
      if (needsStreak) {
        if (streakResult.status === 'fulfilled' && streakResult.value) {
          const { currentStreak } = streakResult.value;
          const match = STREAK_MILESTONE_MESSAGES.find(([m]) => currentStreak >= m);
          if (match) setStreakToast(match[1]);
        } else if (streakResult.status === 'rejected') {
          logger.warn('[useAppBanners] streak check failed', { error: String(streakResult.reason) });
        }
        sessionStorage.setItem(SESSION_STREAK_KEY, '1');
      }

      // F10: On This Day entries
      if (needsOtd) {
        if (otdResult.status === 'fulfilled' && otdResult.value && otdResult.value.length > 0) {
          const entries = otdResult.value;
          setOnThisDayCount(entries.length);
          const years = entries.map((e) => new Date(e.created_at).getFullYear());
          setOnThisDayOldestYear(Math.min(...years));
        } else if (otdResult.status === 'rejected') {
          logger.warn('[useAppBanners] on-this-day check failed', { error: String(otdResult.reason) });
        }
        sessionStorage.setItem(SESSION_OTD_KEY, '1');
      }
    }

    run();
    return () => { cancelled = true; };
  }, [enabled]);

  return {
    streakToast,
    dismissStreakToast: () => setStreakToast(null),
    onThisDayCount,
    onThisDayOldestYear,
    dismissOnThisDay: () => { setOnThisDayCount(0); setOnThisDayOldestYear(null); },
  };
}
