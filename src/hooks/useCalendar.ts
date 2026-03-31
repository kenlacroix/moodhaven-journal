/**
 * useCalendar Hook
 *
 * React hook for calendar data and navigation.
 */

import { useState, useEffect, useCallback } from 'react';
import { getMonthlyMoodData } from '../lib/services/analyticsService';
import {
  getCalendarDates,
  formatDate,
  getMonthName,
  getPreviousMonth,
  getNextMonth,
} from '../lib/utils/dateUtils';
import type { CalendarDayData } from '../types/analytics';

interface UseCalendarReturn {
  // Current view state
  year: number;
  month: number;
  monthName: string;

  // Calendar dates (42 days grid)
  calendarDates: Date[];

  // Mood data for each date
  moodData: Map<string, CalendarDayData>;

  // Selected date
  selectedDate: string | null;
  setSelectedDate: (date: string | null) => void;

  // Loading state
  isLoading: boolean;
  error: string | null;

  // Navigation
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  goToToday: () => void;
  goToMonth: (year: number, month: number) => void;

  // Refresh
  refresh: () => Promise<void>;
}

export function useCalendar(): UseCalendarReturn {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-12
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [moodData, setMoodData] = useState<Map<string, CalendarDayData>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch mood data for current month
  const fetchMonthData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await getMonthlyMoodData(year, month);
      setMoodData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar data');
    } finally {
      setIsLoading(false);
    }
  }, [year, month]);

  // Fetch data on month change
  useEffect(() => {
    fetchMonthData();
  }, [fetchMonthData]);

  // Navigation functions
  const goToPreviousMonth = useCallback(() => {
    const prev = getPreviousMonth(year, month);
    setYear(prev.year);
    setMonth(prev.month);
    setSelectedDate(null);
  }, [year, month]);

  const goToNextMonth = useCallback(() => {
    const next = getNextMonth(year, month);
    setYear(next.year);
    setMonth(next.month);
    setSelectedDate(null);
  }, [year, month]);

  const goToToday = useCallback(() => {
    const today = new Date();
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
    setSelectedDate(formatDate(today));
  }, []);

  const goToMonth = useCallback((newYear: number, newMonth: number) => {
    setYear(newYear);
    setMonth(newMonth);
    setSelectedDate(null);
  }, []);

  // Get calendar dates grid
  const calendarDates = getCalendarDates(year, month);
  const monthName = getMonthName(month);

  return {
    year,
    month,
    monthName,
    calendarDates,
    moodData,
    selectedDate,
    setSelectedDate,
    isLoading,
    error,
    goToPreviousMonth,
    goToNextMonth,
    goToToday,
    goToMonth,
    refresh: fetchMonthData,
  };
}
