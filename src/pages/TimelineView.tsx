/**
 * TimelineView - Chronological entry list
 *
 * Per UX spec:
 * - List of entries with date, preview snippet
 * - Minimal styling, no charts
 * - Click to open entry in WritingView
 * - Replaces Calendar - no grid view
 */

import { useState, useEffect } from 'react';
import { getAllEntries } from '../lib/journalService';
import type { JournalEntry } from '../types/journal';

interface TimelineViewProps {
  onSelectEntry: (entryId: string) => void;
  onNewEntry: () => void;
}

const MOODS: Record<number, string> = {
  1: '😢',
  2: '😔',
  3: '😐',
  4: '🙂',
  5: '😊',
};

export function TimelineView({ onSelectEntry, onNewEntry }: TimelineViewProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadEntries();
  }, []);

  const loadEntries = async () => {
    setIsLoading(true);
    try {
      const data = await getAllEntries();
      setEntries(data);
    } catch (err) {
      console.error('Failed to load entries:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Group entries by date
  const groupedEntries = entries.reduce((groups, entry) => {
    const date = new Date(entry.created_at).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(entry);
    return groups;
  }, {} as Record<string, JournalEntry[]>);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
          Timeline
        </h1>
        <button
          type="button"
          onClick={onNewEntry}
          className="px-4 py-2 text-sm font-medium text-white bg-violet-500 hover:bg-violet-600 rounded-lg transition-colors"
        >
          New Entry
        </button>
      </div>

      {/* Empty state */}
      {entries.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <p className="text-slate-500 dark:text-slate-400 mb-4">No entries yet</p>
          <button
            type="button"
            onClick={onNewEntry}
            className="text-sm text-violet-500 hover:text-violet-600"
          >
            Write your first entry
          </button>
        </div>
      )}

      {/* Entry list grouped by date */}
      <div className="space-y-8">
        {Object.entries(groupedEntries).map(([date, dateEntries]) => (
          <div key={date}>
            <h2 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3">
              {date}
            </h2>
            <div className="space-y-2">
              {dateEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onSelectEntry(entry.id)}
                  className="w-full text-left p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 shadow-sm hover:shadow-md hover:-translate-y-px transition-all duration-200 group"
                >
                  <div className="flex items-start gap-3">
                    {/* Mood indicator */}
                    {entry.mood && (
                      <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0" title={`Mood: ${entry.mood}`}>
                        <span className="text-lg">{MOODS[entry.mood]}</span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      {/* Title */}
                      {entry.title && (
                        <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-1 truncate">
                          {entry.title}
                        </h3>
                      )}

                      {/* Preview */}
                      <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
                        {entry.content}
                      </p>

                      {/* Time */}
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                        {new Date(entry.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>

                    {/* Arrow */}
                    <svg
                      className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-500 group-hover:translate-x-0.5 flex-shrink-0 mt-1 transition-all duration-200"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
