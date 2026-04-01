import {
  formatDate,
  getToday,
  getDaysAgo,
  getFirstDayOfMonth,
  getLastDayOfMonth,
  getDaysInMonth,
  getFirstDayOfWeek,
  getMonthName,
  getShortMonthName,
  getDayName,
  getShortDayName,
  isSameDay,
  isToday,
  parseDate,
  getPreviousMonth,
  getNextMonth,
  getCalendarDates,
  formatDisplayDate,
  getRelativeDateLabel,
  getGreeting,
  GREETINGS,
  getISOWeekStart,
  countEntriesThisWeek,
} from './dateUtils';

describe('dateUtils', () => {
  describe('formatDate', () => {
    it('formats a Date to YYYY-MM-DD', () => {
      // Use UTC to avoid timezone issues
      const date = new Date(2024, 5, 15); // June 15, 2024
      expect(formatDate(date)).toBe('2024-06-15');
    });

    it('zero-pads single-digit months and days', () => {
      const date = new Date(2024, 0, 5); // Jan 5, 2024
      expect(formatDate(date)).toBe('2024-01-05');
    });

    it('handles Dec 31 correctly', () => {
      const date = new Date(2024, 11, 31);
      expect(formatDate(date)).toBe('2024-12-31');
    });
  });

  describe('getToday', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2024, 5, 15, 12, 0, 0)); // June 15, 2024 noon
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns today formatted as YYYY-MM-DD', () => {
      expect(getToday()).toBe('2024-06-15');
    });
  });

  describe('getDaysAgo', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2024, 2, 3, 12, 0, 0)); // March 3, 2024
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns a Date N days in the past', () => {
      const result = getDaysAgo(5);
      expect(formatDate(result)).toBe('2024-02-27');
    });

    it('handles month boundary', () => {
      const result = getDaysAgo(3);
      expect(formatDate(result)).toBe('2024-02-29'); // 2024 is leap year
    });

    it('handles year boundary', () => {
      vi.setSystemTime(new Date(2024, 0, 3, 12, 0, 0)); // Jan 3
      const result = getDaysAgo(5);
      expect(formatDate(result)).toBe('2023-12-29');
    });
  });

  describe('getFirstDayOfMonth', () => {
    it('returns first day of January 2024', () => {
      const result = getFirstDayOfMonth(2024, 1);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0); // 0-indexed
      expect(result.getDate()).toBe(1);
    });

    it('returns first day of December 2024', () => {
      const result = getFirstDayOfMonth(2024, 12);
      expect(result.getMonth()).toBe(11);
      expect(result.getDate()).toBe(1);
    });
  });

  describe('getLastDayOfMonth', () => {
    it('returns Feb 29 for leap year 2024', () => {
      const result = getLastDayOfMonth(2024, 2);
      expect(result.getDate()).toBe(29);
    });

    it('returns Feb 28 for non-leap year 2023', () => {
      const result = getLastDayOfMonth(2023, 2);
      expect(result.getDate()).toBe(28);
    });

    it('returns Dec 31', () => {
      const result = getLastDayOfMonth(2024, 12);
      expect(result.getDate()).toBe(31);
    });
  });

  describe('getDaysInMonth', () => {
    it('returns 31 for January', () => {
      expect(getDaysInMonth(2024, 1)).toBe(31);
    });

    it('returns 29 for leap year February', () => {
      expect(getDaysInMonth(2024, 2)).toBe(29);
    });

    it('returns 28 for non-leap February', () => {
      expect(getDaysInMonth(2023, 2)).toBe(28);
    });

    it('returns 30 for April', () => {
      expect(getDaysInMonth(2024, 4)).toBe(30);
    });
  });

  describe('getFirstDayOfWeek', () => {
    it('returns correct day-of-week index for Jan 1, 2024 (Monday)', () => {
      expect(getFirstDayOfWeek(2024, 1)).toBe(1); // Monday
    });

    it('returns correct day-of-week index for June 1, 2024 (Saturday)', () => {
      expect(getFirstDayOfWeek(2024, 6)).toBe(6); // Saturday
    });
  });

  describe('getMonthName', () => {
    it('returns "January" for month 1', () => {
      expect(getMonthName(1)).toBe('January');
    });

    it('returns "December" for month 12', () => {
      expect(getMonthName(12)).toBe('December');
    });

    it('returns empty string for out-of-range month 0', () => {
      expect(getMonthName(0)).toBe('');
    });

    it('returns empty string for out-of-range month 13', () => {
      expect(getMonthName(13)).toBe('');
    });
  });

  describe('getShortMonthName', () => {
    it('returns "Jan" for month 1', () => {
      expect(getShortMonthName(1)).toBe('Jan');
    });

    it('returns "Dec" for month 12', () => {
      expect(getShortMonthName(12)).toBe('Dec');
    });

    it('returns empty string for out-of-range values', () => {
      expect(getShortMonthName(0)).toBe('');
    });
  });

  describe('getDayName', () => {
    it('returns "Sunday" for 0', () => {
      expect(getDayName(0)).toBe('Sunday');
    });

    it('returns "Saturday" for 6', () => {
      expect(getDayName(6)).toBe('Saturday');
    });

    it('returns empty string for out-of-range value', () => {
      expect(getDayName(7)).toBe('');
    });
  });

  describe('getShortDayName', () => {
    it('returns "Sun" for 0', () => {
      expect(getShortDayName(0)).toBe('Sun');
    });

    it('returns "Sat" for 6', () => {
      expect(getShortDayName(6)).toBe('Sat');
    });

    it('returns empty string for out-of-range value', () => {
      expect(getShortDayName(-1)).toBe('');
    });
  });

  describe('isSameDay', () => {
    it('returns true for two Dates on the same day with different times', () => {
      // Use midday times to avoid UTC date boundary issues
      const d1 = new Date(2024, 5, 15, 10, 0, 0);
      const d2 = new Date(2024, 5, 15, 14, 30, 0);
      expect(isSameDay(d1, d2)).toBe(true);
    });

    it('returns false for dates one day apart', () => {
      const d1 = new Date(2024, 5, 15, 12, 0, 0);
      const d2 = new Date(2024, 5, 16, 12, 0, 0);
      expect(isSameDay(d1, d2)).toBe(false);
    });
  });

  describe('isToday', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2024, 5, 15, 12, 0, 0));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns true for today as Date object', () => {
      expect(isToday(new Date(2024, 5, 15, 8, 0, 0))).toBe(true);
    });

    it('returns true for today as date string', () => {
      expect(isToday('2024-06-15')).toBe(true);
    });

    it('returns false for yesterday', () => {
      expect(isToday('2024-06-14')).toBe(false);
    });
  });

  describe('parseDate', () => {
    it('parses YYYY-MM-DD string to Date', () => {
      const result = parseDate('2024-01-15');
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0); // January = 0
      expect(result.getDate()).toBe(15);
    });

    it('round-trips with formatDate', () => {
      const original = '2024-06-15';
      expect(formatDate(parseDate(original))).toBe(original);
    });
  });

  describe('getPreviousMonth', () => {
    it('wraps January to December of previous year', () => {
      expect(getPreviousMonth(2024, 1)).toEqual({ year: 2023, month: 12 });
    });

    it('works for mid-year months', () => {
      expect(getPreviousMonth(2024, 6)).toEqual({ year: 2024, month: 5 });
    });
  });

  describe('getNextMonth', () => {
    it('wraps December to January of next year', () => {
      expect(getNextMonth(2024, 12)).toEqual({ year: 2025, month: 1 });
    });

    it('works for mid-year months', () => {
      expect(getNextMonth(2024, 6)).toEqual({ year: 2024, month: 7 });
    });
  });

  describe('getCalendarDates', () => {
    it('returns exactly 42 dates (6 weeks)', () => {
      const dates = getCalendarDates(2024, 6);
      expect(dates).toHaveLength(42);
    });

    it('includes all current month dates in order', () => {
      const dates = getCalendarDates(2024, 6); // June 2024 has 30 days
      const juneDates = dates.filter(
        (d) => d.getMonth() === 5 && d.getFullYear() === 2024
      );
      expect(juneDates).toHaveLength(30);
      expect(juneDates[0].getDate()).toBe(1);
      expect(juneDates[juneDates.length - 1].getDate()).toBe(30);
    });

    it('pads with previous month dates at the beginning', () => {
      // June 1, 2024 is Saturday (day 6), so 6 days of padding from May
      const dates = getCalendarDates(2024, 6);
      const firstDate = dates[0];
      expect(firstDate.getMonth()).toBe(4); // May
    });

    it('pads with next month dates at the end', () => {
      const dates = getCalendarDates(2024, 6);
      const lastDate = dates[41];
      expect(lastDate.getMonth()).toBe(6); // July
    });

    it('handles January (prev month is December of previous year)', () => {
      const dates = getCalendarDates(2024, 1);
      // Jan 1, 2024 is Monday (day 1), so 1 day of padding from Dec 2023
      const firstDate = dates[0];
      expect(firstDate.getMonth()).toBe(11); // December
      expect(firstDate.getFullYear()).toBe(2023);
    });
  });

  describe('formatDisplayDate', () => {
    it('formats Date to display string', () => {
      const date = new Date(2024, 0, 15);
      const result = formatDisplayDate(date);
      expect(result).toContain('Jan');
      expect(result).toContain('15');
      expect(result).toContain('2024');
    });

    it('accepts string input', () => {
      const result = formatDisplayDate('2024-01-15');
      expect(result).toContain('Jan');
      expect(result).toContain('15');
      expect(result).toContain('2024');
    });
  });

  describe('getRelativeDateLabel', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2024, 5, 15, 12, 0, 0));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns "Today" for today', () => {
      expect(getRelativeDateLabel('2024-06-15')).toBe('Today');
    });

    it('returns "Yesterday" for 1 day ago', () => {
      expect(getRelativeDateLabel('2024-06-14')).toBe('Yesterday');
    });

    it('returns "N days ago" for 3 days ago', () => {
      expect(getRelativeDateLabel('2024-06-12')).toBe('3 days ago');
    });

    it('returns weeks for 14 days ago', () => {
      expect(getRelativeDateLabel('2024-06-01')).toBe('2 weeks ago');
    });

    it('returns formatted date for 30+ days ago', () => {
      const result = getRelativeDateLabel('2024-04-15');
      expect(result).toContain('Apr');
      expect(result).toContain('15');
    });
  });

  describe('getGreeting', () => {
    // dayOfYear for Jan 1 = 1 (startOfYear = Jan 0 = Dec 31 of prev year)
    const jan1 = new Date(2024, 0, 1); // day 1 → pool[1 % 8] = pool[1]
    const jan2 = new Date(2024, 0, 2); // day 2 → pool[2 % 8] = pool[2]
    const jan9 = new Date(2024, 0, 9); // day 9 → pool[9 % 8] = pool[1] (wraps)

    it('morning: hour 8 returns a morning greeting', () => {
      const result = getGreeting(8, jan1);
      expect(GREETINGS.morning).toContain(result);
    });

    it('morning: rotates by day — jan2 differs from jan1 at same hour', () => {
      expect(getGreeting(8, jan1)).not.toBe(getGreeting(8, jan2));
    });

    it('afternoon boundary: hour 12 → afternoon pool', () => {
      const result = getGreeting(12, jan1);
      expect(GREETINGS.afternoon).toContain(result);
    });

    it('morning boundary: hour 11 → morning pool', () => {
      const result = getGreeting(11, jan1);
      expect(GREETINGS.morning).toContain(result);
    });

    it('evening boundary: hour 17 → evening pool', () => {
      const result = getGreeting(17, jan1);
      expect(GREETINGS.evening).toContain(result);
    });

    it('afternoon boundary: hour 16 → afternoon pool', () => {
      const result = getGreeting(16, jan1);
      expect(GREETINGS.afternoon).toContain(result);
    });

    it('wrap-around: day 9 gives same greeting as day 1 (9 % 8 === 1 % 8)', () => {
      expect(getGreeting(8, jan9)).toBe(getGreeting(8, jan1));
    });
  });

  describe('getISOWeekStart', () => {
    it('Monday stays on same day', () => {
      const mon = new Date(2024, 0, 1); // Jan 1 2024 = Monday
      const result = getISOWeekStart(mon);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(1);
    });

    it('Wednesday rolls back to Monday', () => {
      const wed = new Date(2024, 0, 3); // Jan 3 2024 = Wednesday
      const result = getISOWeekStart(wed);
      expect(result.getDate()).toBe(1); // Monday Jan 1
    });

    it('Sunday rolls back to Monday of that week', () => {
      const sun = new Date(2024, 0, 7); // Jan 7 2024 = Sunday
      const result = getISOWeekStart(sun);
      expect(result.getDate()).toBe(1); // Monday Jan 1
    });

    it('result time is midnight', () => {
      const wed = new Date(2024, 0, 3, 15, 30, 0);
      const result = getISOWeekStart(wed);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
    });

    it('does not mutate input', () => {
      const d = new Date(2024, 0, 3, 15, 0, 0);
      const original = d.getTime();
      getISOWeekStart(d);
      expect(d.getTime()).toBe(original);
    });
  });

  describe('countEntriesThisWeek', () => {
    it('returns 0 for empty entries', () => {
      expect(countEntriesThisWeek([])).toBe(0);
    });

    it('counts entries within the current ISO week', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2024, 0, 3)); // Wednesday Jan 3 2024
      const entries = [
        { created_at: new Date(2024, 0, 1).toISOString() }, // Monday — in week
        { created_at: new Date(2024, 0, 2).toISOString() }, // Tuesday — in week
        { created_at: new Date(2024, 0, 3).toISOString() }, // Wednesday — in week (today)
        { created_at: new Date(2023, 11, 31).toISOString() }, // Dec 31 2023 — out of week
      ];
      expect(countEntriesThisWeek(entries)).toBe(3);
      vi.useRealTimers();
    });

    it('excludes entries from previous week', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2024, 0, 8)); // Monday Jan 8 2024 (new week)
      const entries = [
        { created_at: new Date(2024, 0, 1).toISOString() }, // previous week
        { created_at: new Date(2024, 0, 8).toISOString() }, // this week
      ];
      expect(countEntriesThisWeek(entries)).toBe(1);
      vi.useRealTimers();
    });
  });
});
