import {
  shouldFireToday,
  getMillisecondsUntilReminder,
  ensureNotificationPermission,
  sendTestNotification,
  sendReminderNotification,
} from './reminderService';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import type { ReminderSettings } from '../types/settings';

const mockIsPermissionGranted = vi.mocked(isPermissionGranted);
const mockRequestPermission = vi.mocked(requestPermission);
const mockSendNotification = vi.mocked(sendNotification);

function createSettings(overrides: Partial<ReminderSettings> = {}): ReminderSettings {
  return {
    enabled: true,
    time: '20:00',
    frequency: 'daily',
    customDays: [],
    message: 'Time to reflect on your day',
    sound: true,
    ...overrides,
  };
}

describe('reminderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPermissionGranted.mockResolvedValue(true);
    mockRequestPermission.mockResolvedValue('granted');
  });

  describe('shouldFireToday', () => {
    it('returns false when disabled', () => {
      const settings = createSettings({ enabled: false });
      expect(shouldFireToday(settings)).toBe(false);
    });

    it('returns true for daily frequency on any day', () => {
      const settings = createSettings({ frequency: 'daily' });
      // Regardless of the day, daily should always return true
      expect(shouldFireToday(settings)).toBe(true);
    });

    describe('weekdays frequency', () => {
      it('returns true on Monday', () => {
        // Monday = day 1
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 26, 12, 0)); // Monday Jan 26 2026
        expect(shouldFireToday(createSettings({ frequency: 'weekdays' }))).toBe(true);
        vi.useRealTimers();
      });

      it('returns true on Friday', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 30, 12, 0)); // Friday Jan 30 2026
        expect(shouldFireToday(createSettings({ frequency: 'weekdays' }))).toBe(true);
        vi.useRealTimers();
      });

      it('returns false on Saturday', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 31, 12, 0)); // Saturday Jan 31 2026
        expect(shouldFireToday(createSettings({ frequency: 'weekdays' }))).toBe(false);
        vi.useRealTimers();
      });

      it('returns false on Sunday', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 1, 1, 12, 0)); // Sunday Feb 1 2026
        expect(shouldFireToday(createSettings({ frequency: 'weekdays' }))).toBe(false);
        vi.useRealTimers();
      });
    });

    describe('weekends frequency', () => {
      it('returns true on Saturday', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 31, 12, 0)); // Saturday
        expect(shouldFireToday(createSettings({ frequency: 'weekends' }))).toBe(true);
        vi.useRealTimers();
      });

      it('returns true on Sunday', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 1, 1, 12, 0)); // Sunday
        expect(shouldFireToday(createSettings({ frequency: 'weekends' }))).toBe(true);
        vi.useRealTimers();
      });

      it('returns false on Wednesday', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 28, 12, 0)); // Wednesday
        expect(shouldFireToday(createSettings({ frequency: 'weekends' }))).toBe(false);
        vi.useRealTimers();
      });
    });

    describe('custom frequency', () => {
      it('returns true when today is in customDays', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 28, 12, 0)); // Wednesday = 3
        const settings = createSettings({ frequency: 'custom', customDays: [1, 3, 5] });
        expect(shouldFireToday(settings)).toBe(true);
        vi.useRealTimers();
      });

      it('returns false when today is not in customDays', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 29, 12, 0)); // Thursday = 4
        const settings = createSettings({ frequency: 'custom', customDays: [1, 3, 5] });
        expect(shouldFireToday(settings)).toBe(false);
        vi.useRealTimers();
      });

      it('returns false when customDays is empty', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 28, 12, 0));
        const settings = createSettings({ frequency: 'custom', customDays: [] });
        expect(shouldFireToday(settings)).toBe(false);
        vi.useRealTimers();
      });
    });
  });

  describe('getMillisecondsUntilReminder', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns positive ms for a future time today', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 0, 26, 10, 0, 0)); // 10:00 AM Monday
      const settings = createSettings({ time: '20:00' }); // 8 PM
      const ms = getMillisecondsUntilReminder(settings);
      expect(ms).toBe(10 * 60 * 60 * 1000); // 10 hours
    });

    it('returns null when time has already passed today', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 0, 26, 21, 0, 0)); // 9 PM
      const settings = createSettings({ time: '20:00' }); // 8 PM
      const ms = getMillisecondsUntilReminder(settings);
      expect(ms).toBeNull();
    });

    it('returns null when reminder is disabled', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 0, 26, 10, 0, 0));
      const settings = createSettings({ enabled: false, time: '20:00' });
      expect(getMillisecondsUntilReminder(settings)).toBeNull();
    });

    it('returns null when today is not a scheduled day', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 0, 31, 10, 0, 0)); // Saturday
      const settings = createSettings({ frequency: 'weekdays', time: '20:00' });
      expect(getMillisecondsUntilReminder(settings)).toBeNull();
    });

    it('returns 0 when time is exactly now', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 0, 26, 20, 0, 0));
      const settings = createSettings({ time: '20:00' });
      expect(getMillisecondsUntilReminder(settings)).toBe(0);
    });
  });

  describe('ensureNotificationPermission', () => {
    it('returns true when permission is already granted', async () => {
      mockIsPermissionGranted.mockResolvedValue(true);
      const result = await ensureNotificationPermission();
      expect(result).toBe(true);
      expect(mockRequestPermission).not.toHaveBeenCalled();
    });

    it('requests permission when not already granted', async () => {
      mockIsPermissionGranted.mockResolvedValue(false);
      mockRequestPermission.mockResolvedValue('granted');
      const result = await ensureNotificationPermission();
      expect(result).toBe(true);
      expect(mockRequestPermission).toHaveBeenCalled();
    });

    it('returns false when permission is denied', async () => {
      mockIsPermissionGranted.mockResolvedValue(false);
      mockRequestPermission.mockResolvedValue('denied');
      const result = await ensureNotificationPermission();
      expect(result).toBe(false);
    });
  });

  describe('sendTestNotification', () => {
    it('sends notification with given message', async () => {
      await sendTestNotification('Hello!');
      expect(mockSendNotification).toHaveBeenCalledWith({
        title: 'MoodHaven Reminder',
        body: 'Hello!',
      });
    });

    it('uses default message when empty string provided', async () => {
      await sendTestNotification('');
      expect(mockSendNotification).toHaveBeenCalledWith({
        title: 'MoodHaven Reminder',
        body: 'Time to reflect on your day',
      });
    });

    it('throws when permission is denied', async () => {
      mockIsPermissionGranted.mockResolvedValue(false);
      mockRequestPermission.mockResolvedValue('denied');
      await expect(sendTestNotification('Test')).rejects.toThrow('Notification permission denied');
    });
  });

  describe('sendReminderNotification', () => {
    it('sends notification with settings message', async () => {
      const settings = createSettings({ message: 'Check in!' });
      await sendReminderNotification(settings);
      expect(mockSendNotification).toHaveBeenCalledWith({
        title: 'MoodHaven',
        body: 'Check in!',
      });
    });

    it('does not throw when permission is denied', async () => {
      mockIsPermissionGranted.mockResolvedValue(false);
      mockRequestPermission.mockResolvedValue('denied');
      const settings = createSettings();
      // Should not throw
      await sendReminderNotification(settings);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });
  });
});
