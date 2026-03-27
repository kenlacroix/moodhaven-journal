/**
 * Reminder Service
 *
 * Handles notification permissions, scheduling logic, and delivery
 * for mood journaling reminders.
 */

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import type { ReminderSettings, DayOfWeek } from '../types/settings';

/**
 * Check and request notification permission if needed.
 * Returns true if permission is granted.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  let granted = await isPermissionGranted();

  if (!granted) {
    const result = await requestPermission();
    granted = result === 'granted';
  }

  return granted;
}

/**
 * Send a test notification with the given message.
 * Throws if permission is denied.
 */
export async function sendTestNotification(message: string): Promise<void> {
  const hasPermission = await ensureNotificationPermission();

  if (!hasPermission) {
    throw new Error('Notification permission denied');
  }

  sendNotification({
    title: 'MoodHaven Reminder',
    body: message || 'Time to reflect on your day',
  });
}

/**
 * Send the actual reminder notification.
 * Silently returns if permission is not granted.
 */
export async function sendReminderNotification(settings: ReminderSettings): Promise<void> {
  const hasPermission = await ensureNotificationPermission();

  if (!hasPermission) {
    return;
  }

  sendNotification({
    title: 'MoodHaven',
    body: settings.message || 'Time to reflect on your day',
  });
}

/**
 * Check whether a reminder should fire today based on frequency and custom days.
 */
export function shouldFireToday(settings: ReminderSettings): boolean {
  if (!settings.enabled) return false;

  const today = new Date().getDay() as DayOfWeek;

  switch (settings.frequency) {
    case 'daily':
      return true;
    case 'weekdays':
      return today >= 1 && today <= 5;
    case 'weekends':
      return today === 0 || today === 6;
    case 'custom':
      return settings.customDays.includes(today);
    default:
      return false;
  }
}

/**
 * Calculate milliseconds until the configured reminder time today.
 * Returns null if the time has already passed or if the reminder
 * should not fire today.
 */
export function getMillisecondsUntilReminder(settings: ReminderSettings): number | null {
  if (!shouldFireToday(settings)) return null;

  const now = new Date();
  const [hours, minutes] = settings.time.split(':').map(Number);

  const target = new Date();
  target.setHours(hours, minutes, 0, 0);

  const diff = target.getTime() - now.getTime();

  if (diff < 0) return null;

  return diff;
}
