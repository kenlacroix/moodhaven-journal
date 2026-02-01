/**
 * OnThisDayView - Historical entries from past years
 *
 * Per UX spec:
 * - Collapsed by default (no automatic prompts or pop-ups)
 * - Minimal preview list when opened
 * - No emotional language
 * - AI reflection shown only after user reads entry
 */

import { useState, useEffect } from 'react';
import { getEntriesOnThisDay } from '../lib/journalService';
import type { JournalEntry } from '../types/journal';

interface OnThisDayViewProps {
  onSelectEntry: (entryId: string) => void;
}

const MOODS: Record<number, string> = {
  1: '😢',
  2: '😔',
  3: '😐',
  4: '🙂',
  5: '😊',
};

export function OnThisDayView({ onSelectEntry }: OnThisDayViewProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const today = new Date();
  const monthDay = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  useEffect(() => {
    loadEntries();
  }, []);

  const loadEntries = async () => {
    setIsLoading(true);
    try {
      const data = await getEntriesOnThisDay();
      setEntries(data);
    } catch (err) {
      console.error('Failed to load on this day entries:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Group by year
  const entriesByYear = entries.reduce((groups, entry) => {
    const year = new Date(entry.created_at).getFullYear();
    if (!groups[year]) {
      groups[year] = [];
    }
    groups[year].push(entry);
    return groups;
  }, {} as Record<number, JournalEntry[]>);

  const years = Object.keys(entriesByYear).map(Number).sort((a, b) => b - a);

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
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-1">
          On This Day
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          {monthDay}
        </p>
      </div>

      {/* Empty state */}
      {entries.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <p className="text-slate-500 dark:text-slate-400">
            No entries from previous years on {monthDay}
          </p>
        </div>
      )}

      {/* Entries by year */}
      <div className="space-y-8">
        {years.map((year) => (
          <div key={year}>
            <h2 className="text-lg font-medium text-slate-700 dark:text-slate-200 mb-4">
              {year}
              <span className="text-sm font-normal text-slate-400 dark:text-slate-500 ml-2">
                {today.getFullYear() - year} {today.getFullYear() - year === 1 ? 'year' : 'years'} ago
              </span>
            </h2>

            <div className="space-y-2">
              {entriesByYear[year].map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onSelectEntry(entry.id)}
                  className="w-full text-left p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 shadow-sm hover:shadow-md hover:-translate-y-px transition-all duration-200 group"
                >
                  <div className="flex items-start gap-3">
                    {entry.mood && (
                      <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                        <span className="text-lg">{MOODS[entry.mood]}</span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      {entry.title && (
                        <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-1 truncate">
                          {entry.title}
                        </h3>
                      )}

                      <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
                        {entry.content}
                      </p>
                    </div>

                    <svg
                      className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 group-hover:translate-x-0.5 flex-shrink-0 mt-1 transition-all duration-200"
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
