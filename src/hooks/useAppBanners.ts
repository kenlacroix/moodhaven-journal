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

const STREAK_MILESTONES = [100, 30, 7] as const;
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
      // F7: streak milestone
      if (!sessionStorage.getItem(SESSION_STREAK_KEY)) {
        try {
          const stats = await getStreakStats();
          if (!cancelled && stats.currentStreak >= 7) {
            const milestone = STREAK_MILESTONES.find((m) => stats.currentStreak >= m);
            if (milestone !== undefined) {
              setStreakToast(
                stats.currentStreak >= 100
                  ? `100 days in a row. That's extraordinary.`
                  : stats.currentStreak >= 30
                    ? `30-day streak! You're building something real.`
                    : `7-day streak — great momentum!`
              );
            }
          }
          sessionStorage.setItem(SESSION_STREAK_KEY, '1');
        } catch (err) {
          logger.warn('[useAppBanners] streak check failed', { error: String(err) });
        }
      }

      // F10: On This Day entries
      if (!cancelled && !sessionStorage.getItem(SESSION_OTD_KEY)) {
        try {
          const entries = await getEntriesOnThisDay();
          if (!cancelled && entries.length > 0) {
            setOnThisDayCount(entries.length);
            const years = entries.map((e) => new Date(e.created_at).getFullYear());
            setOnThisDayOldestYear(Math.min(...years));
          }
          sessionStorage.setItem(SESSION_OTD_KEY, '1');
        } catch (err) {
          logger.warn('[useAppBanners] on-this-day check failed', { error: String(err) });
        }
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
