/**
 * CalendarPage - Calendar view showing mood patterns over time
 *
 * Layout: calendar grid (left ~55%) | DayTimelineView (right ~45%) side by side.
 * Clicking a day slides in the 24-hour entry timeline on the right.
 */

import { useState } from 'react';
import { useCalendar } from '../hooks/useCalendar';
import { CalendarView } from '../components/calendar';
import { DayTimelineView } from '../components/calendar/DayTimelineView';
import { usePlatform } from '../hooks/usePlatform';
import { useIsMobile } from '../hooks/useIsMobile';

interface CalendarPageProps {
  onSelectEntry?: (entryId: string) => void;
}

export function CalendarPage({ onSelectEntry }: CalendarPageProps) {
  const { isAndroid } = usePlatform();
  const isMobileViewport = useIsMobile();
  const isMobile = isAndroid || isMobileViewport;
  const calendar = useCalendar();
  const [timelineVisible, setTimelineVisible] = useState(false);

  const handleSelectDate = (dateStr: string) => {
    calendar.setSelectedDate(dateStr);
    setTimelineVisible(true);
  };

  const handleSelectEntry = (entryId: string) => {
    onSelectEntry?.(entryId);
  };

  const handleBack = () => {
    setTimelineVisible(false);
  };

  // ── Shared calendar grid ─────────────────────────────────────────────────────
  const calendarGrid = (
    <>
      {calendar.error && (
        <div className="mb-4 p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl">
          <p className="text-sm text-rose-600 dark:text-rose-400">{calendar.error}</p>
        </div>
      )}
      <CalendarView
        year={calendar.year}
        month={calendar.month}
        monthName={calendar.monthName}
        calendarDates={calendar.calendarDates}
        moodData={calendar.moodData}
        selectedDate={calendar.selectedDate}
        isLoading={calendar.isLoading}
        onSelectDate={handleSelectDate}
        onPreviousMonth={calendar.goToPreviousMonth}
        onNextMonth={calendar.goToNextMonth}
        onToday={calendar.goToToday}
      />
    </>
  );

  // ── Mobile layout: full-screen grid, day view slides over from right ─────────
  if (isMobile) {
    return (
      <div className="h-full relative overflow-hidden bg-white dark:bg-slate-900">
        {/* Calendar grid — always mounted, hidden behind overlay when day selected */}
        <div className="h-full overflow-auto px-4 py-4">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Calendar</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Tap a day to see its entries</p>
          </div>
          {calendarGrid}
        </div>

        {/* Day timeline — slides in from right as full-screen overlay */}
        <div
          className={`absolute inset-0 bg-white dark:bg-slate-900 transition-transform duration-300 ease-in-out ${
            timelineVisible && calendar.selectedDate ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {calendar.selectedDate && (
            <DayTimelineView
              date={calendar.selectedDate}
              onSelectEntry={handleSelectEntry}
              onBack={handleBack}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Desktop layout: split view ───────────────────────────────────────────────
  return (
    <div className="h-full flex gap-0 overflow-hidden">
      {/* Left: Calendar grid (~55%) */}
      <div className={`flex flex-col transition-all duration-300 ${timelineVisible ? 'w-[55%]' : 'w-full'} min-w-0 overflow-auto p-6`}>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Calendar</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Click a day to see its entries</p>
        </div>
        <div className="flex-1">
          {calendarGrid}
        </div>
      </div>

      {/* Right: Day timeline (~45%) — slides in when a day is selected */}
      <div
        className={`flex-shrink-0 overflow-hidden transition-all duration-200 ${
          timelineVisible && calendar.selectedDate ? 'w-[45%] opacity-100' : 'w-0 opacity-0'
        }`}
      >
        {timelineVisible && calendar.selectedDate && (
          <DayTimelineView
            date={calendar.selectedDate}
            onSelectEntry={handleSelectEntry}
          />
        )}
      </div>
    </div>
  );
}
