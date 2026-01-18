/**
 * CalendarPage - Calendar view showing mood patterns over time
 */

import { useState } from 'react';
import { useCalendar } from '../hooks/useCalendar';
import { CalendarView, DayModal } from '../components/calendar';

interface CalendarPageProps {
  onNavigateToJournal?: () => void;
}

export function CalendarPage({ onNavigateToJournal }: CalendarPageProps) {
  const calendar = useCalendar();
  const [showModal, setShowModal] = useState(false);

  const handleSelectDate = (dateStr: string) => {
    calendar.setSelectedDate(dateStr);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    calendar.setSelectedDate(null);
  };

  const handleAddEntry = () => {
    handleCloseModal();
    onNavigateToJournal?.();
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Calendar
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          View your mood patterns over time
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

      {/* Day modal */}
      {showModal && calendar.selectedDate && (
        <DayModal
          date={calendar.selectedDate}
          onClose={handleCloseModal}
          onAddEntry={handleAddEntry}
        />
      )}
    </div>
  );
}
