/**
 * useReminderScheduler - Schedules and triggers reminder notifications
 *
 * Checks every minute whether a reminder should fire based on the user's
 * configured time and frequency. Prevents duplicate notifications on the
 * same day using a ref that resets at midnight.
 */

import { useEffect, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import {
  sendReminderNotification,
  getMillisecondsUntilReminder,
  shouldFireToday,
} from '../lib/reminderService';
import { logger } from '../lib/logger';

const CHECK_INTERVAL_MS = 60_000; // Check every 60 seconds

export function useReminderScheduler() {
  const reminders = useSettingsStore((s) => s.settings.reminders);
  const lastFiredDate = useRef<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!reminders.enabled) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const checkAndFire = async () => {
      const today = new Date().toDateString();

      // Already fired today
      if (lastFiredDate.current === today) return;

      // Not scheduled for today
      if (!shouldFireToday(reminders)) return;

      const msUntil = getMillisecondsUntilReminder(reminders);

      // Fire if reminder time is within the next check interval
      if (msUntil !== null && msUntil <= CHECK_INTERVAL_MS) {
        try {
          await sendReminderNotification(reminders);
          lastFiredDate.current = today;
        } catch (error) {
          logger.error('Failed to send reminder notification:', { error: String(error) });
        }
      }
    };

    // Check immediately on mount / settings change
    checkAndFire();

    // Set up periodic check
    intervalRef.current = window.setInterval(checkAndFire, CHECK_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [reminders]);

  // Reset lastFiredDate at midnight so tomorrow's reminder can fire
  useEffect(() => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    const timeout = window.setTimeout(() => {
      lastFiredDate.current = null;
    }, msUntilMidnight);

    return () => clearTimeout(timeout);
  }, []);
}
