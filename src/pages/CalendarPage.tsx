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

interface CalendarPageProps {
  onSelectEntry?: (entryId: string) => void;
}

export function CalendarPage({ onSelectEntry }: CalendarPageProps) {
  const calendar = useCalendar();
  const [timelineVisible, setTimelineVisible] = useState(false);

  const handleSelectDate = (dateStr: string) => {
    calendar.setSelectedDate(dateStr);
    setTimelineVisible(true);
  };

  const handleSelectEntry = (entryId: string) => {
    onSelectEntry?.(entryId);
  };

  return (
    <div className="h-full flex gap-0 overflow-hidden">
      {/* Left: Calendar grid (~55%) */}
      <div className={`flex flex-col transition-all duration-300 ${timelineVisible ? 'w-[55%]' : 'w-full'} min-w-0 overflow-auto p-6`}>
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            Calendar
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Click a day to see its entries
          </p>
        </div>

        {/* Error message */}
        {calendar.error && (
          <div className="mb-4 p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl">
            <p className="text-sm text-rose-600 dark:text-rose-400">{calendar.error}</p>
          </div>
        )}

        {/* Calendar */}
        <div className="flex-1">
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
        </div>
      </div>

      {/* Right: Day timeline (~45%) — slides in when a day is selected */}
      <div
        className={`flex-shrink-0 overflow-hidden transition-all duration-200 ${
          timelineVisible && calendar.selectedDate
            ? 'w-[45%] opacity-100'
            : 'w-0 opacity-0'
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
