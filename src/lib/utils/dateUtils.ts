/**
 * Date utility functions for calendar and analytics
 */

/**
 * Format date as YYYY-MM-DD using LOCAL calendar date (not UTC).
 * Using toISOString() would return the UTC date, which is wrong for users
 * in UTC- timezones when their local time is past midnight but UTC hasn't rolled.
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse a timestamp string returned by the database to a proper Date.
 *
 * SQLite datetime('now') returns UTC time WITHOUT a timezone indicator, e.g.
 * '2026-03-06 14:00:00' (space-separated).  JavaScript's Date constructor
 * would interpret that string as LOCAL time, shifting the displayed hour
 * forward or backward by the user's UTC offset.
 *
 * New entries (after the fix) are stored as ISO-format local time, e.g.
 * '2026-03-06T14:00:00' (T-separator, no Z), which JS correctly treats as local.
 *
 * Detection rule:
 *   - Space separator   → old entry, UTC → append 'Z' so JS parses as UTC
 *   - 'T' separator     → new entry, local → parse as-is
 */
export function parseEntryTimestamp(ts: string): Date {
  if (!ts) return new Date();
  if (ts.includes(' ') && !ts.includes('Z') && !ts.includes('+')) {
    // Old format: '2026-03-06 14:00:00' (UTC, space-separated)
    return new Date(ts.replace(' ', 'T') + 'Z');
  }
  return new Date(ts);
}

/**
 * Get today's date as YYYY-MM-DD
 */
export function getToday(): string {
  return formatDate(new Date());
}

/**
 * Get date N days ago
 */
export function getDaysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/**
 * Get the first day of a month
 */
export function getFirstDayOfMonth(year: number, month: number): Date {
  return new Date(year, month - 1, 1);
}

/**
 * Get the last day of a month
 */
export function getLastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0);
}

/**
 * Get number of days in a month
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Get the day of week for the first day of month (0 = Sunday)
 */
export function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

/**
 * Get month name
 */
export function getMonthName(month: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[month - 1] || '';
}

/**
 * Get short month name
 */
export function getShortMonthName(month: number): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[month - 1] || '';
}

/**
 * Get day name
 */
export function getDayName(dayOfWeek: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek] || '';
}

/**
 * Get short day name
 */
export function getShortDayName(dayOfWeek: number): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[dayOfWeek] || '';
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return formatDate(date1) === formatDate(date2);
}

/**
 * Check if a date is today
 */
export function isToday(date: Date | string): boolean {
  const dateStr = typeof date === 'string' ? date : formatDate(date);
  return dateStr === getToday();
}

/**
 * Parse YYYY-MM-DD string to Date
 */
export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Get previous month
 */
export function getPreviousMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }
  return { year, month: month - 1 };
}

/**
 * Get next month
 */
export function getNextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) {
    return { year: year + 1, month: 1 };
  }
  return { year, month: month + 1 };
}

/**
 * Get array of dates for a calendar month grid (including padding from prev/next months)
 */
export function getCalendarDates(year: number, month: number): Date[] {
  const dates: Date[] = [];
  const firstDay = getFirstDayOfWeek(year, month);
  const daysInMonth = getDaysInMonth(year, month);
  const daysInPrevMonth = getDaysInMonth(year, month === 1 ? 12 : month - 1);

  // Previous month padding
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  for (let i = firstDay - 1; i >= 0; i--) {
    dates.push(new Date(prevYear, prevMonth - 1, daysInPrevMonth - i));
  }

  // Current month
  for (let i = 1; i <= daysInMonth; i++) {
    dates.push(new Date(year, month - 1, i));
  }

  // Next month padding (fill to 42 days = 6 rows)
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const remaining = 42 - dates.length;
  for (let i = 1; i <= remaining; i++) {
    dates.push(new Date(nextYear, nextMonth - 1, i));
  }

  return dates;
}

/**
 * Format date for display (e.g., "Jan 15, 2024")
 */
export function formatDisplayDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseDate(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Greeting pools ────────────────────────────────────────────────────────────

export const GREETINGS = {
  morning: [
    'Good morning.',
    'How are you feeling today?',
    "What's on your mind?",
    'Ready to reflect?',
    'A new day, a new page.',
    'Take a breath. Begin.',
    'What will today hold?',
    'Morning. Start here.',
  ],
  afternoon: [
    'Good afternoon.',
    'How has your day been?',
    'A quiet moment for you.',
    'A moment for yourself.',
    'How are you holding up?',
    'Pause. What\'s on your mind?',
    'What needs to be said?',
    'Afternoon. How are you?',
  ],
  evening: [
    'Good evening.',
    'How was today?',
    'Time to decompress.',
    'End the day with honesty.',
    'What stood out today?',
    'Evening. Let it out.',
    'Reflect before you rest.',
    'How are you feeling now?',
  ],
} as const;

/**
 * Returns a time-of-day greeting that:
 * - Stays the same all day (stable for a given date)
 * - Rotates across days via day-of-year index
 * - Formula: pool[dayOfYear % pool.length]
 */
export function getGreeting(hour: number, date: Date = new Date()): string {
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86_400_000);
  const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const pool = GREETINGS[period];
  // Safety guard — pools are statically non-empty but keeps TS happy on edge cases
  if (!pool) return 'Hello.';
  return pool[dayOfYear % pool.length];
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get relative date label (Today, Yesterday, X days ago)
 * Compares calendar days, not timestamps (so 11pm yesterday is still "Yesterday" at 1am today)
 */
export function getRelativeDateLabel(date: Date | string): string {
  const d = typeof date === 'string' ? parseDate(date) : date;

  // Normalize both dates to midnight for calendar-day comparison
  const entryDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = new Date();
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const diffTime = todayDay.getTime() - entryDay.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return formatDisplayDate(d);
}
