/**
 * DayModal - Modal showing entries for a selected day
 */

import { useState, useEffect } from 'react';
import { getEntriesByDateRange } from '../../lib/services/journalService';
import { parseDate, formatDisplayDate } from '../../lib/utils/dateUtils';
import { MOOD_OPTIONS } from '../../types/journal';
import type { JournalEntry } from '../../types/journal';

interface DayModalProps {
  date: string; // YYYY-MM-DD
  onClose: () => void;
  onAddEntry?: () => void;
}

export function DayModal({ date, onClose, onAddEntry }: DayModalProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEntries = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const dateObj = parseDate(date);
        const entriesData = await getEntriesByDateRange(dateObj, dateObj);
        setEntries(entriesData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load entries');
      } finally {
        setIsLoading(false);
      }
    };

    fetchEntries();
  }, [date]);

  const displayDate = formatDisplayDate(date);
  const dateObj = parseDate(date);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="
          w-full max-w-lg max-h-[80vh] overflow-hidden
          bg-white dark:bg-slate-900 rounded-2xl shadow-2xl
          animate-slide-up
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {displayDate}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {dateObj.toLocaleDateString('en-US', { weekday: 'long' })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="
              p-2 rounded-lg
              text-slate-500 dark:text-slate-400
              hover:bg-slate-100 dark:hover:bg-slate-800
              transition-colors duration-200
            "
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-rose-500">{error}</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500 dark:text-slate-400 mb-4">
                No entries for this day
              </p>
              {onAddEntry && (
                <button
                  type="button"
                  onClick={onAddEntry}
                  className="btn btn-primary"
                >
                  Add Entry
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => {
                const moodOption = MOOD_OPTIONS.find((o) => o.level === entry.mood);

                return (
                  <div
                    key={entry.id}
                    className="
                      relative p-4 rounded-xl
                      bg-slate-50 dark:bg-slate-800/50
                      border border-slate-200 dark:border-slate-700
                    "
                  >
                    {/* Mood indicator stripe */}
                    <div
                      className={`
                        absolute left-0 top-0 bottom-0 w-1 rounded-l-xl
                        ${moodOption?.color || 'bg-slate-300'}
                      `}
                    />

                    {/* Entry content */}
                    <div className="pl-2">
                      {/* Mood and time */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg" role="img" aria-label={moodOption?.label}>
                            {moodOption?.emoji}
                          </span>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            {moodOption?.label}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(entry.created_at).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      {/* Content preview */}
                      <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-3">
                        {entry.content}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {entries.length > 0 && onAddEntry && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onAddEntry}
              className="w-full btn btn-secondary"
            >
              Add Another Entry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
