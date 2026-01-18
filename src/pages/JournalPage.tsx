/**
 * JournalPage - Main journal view combining editor and entry list
 *
 * Layout: Split view on desktop, stacked on mobile
 * - Left/Top: New entry editor
 * - Right/Bottom: Entry history
 */

import { useState, useCallback } from 'react';
import { JournalEditor } from '../components/journal/JournalEditor';
import { EntryList } from '../components/journal/EntryList';
import { useJournal } from '../hooks/useJournal';
import { useAppStore } from '../stores/appStore';
import type { JournalEntry, JournalEntryFormData } from '../types/journal';

export function JournalPage() {
  const { entries, isLoading, addEntry, removeEntry } = useJournal();
  const lock = useAppStore((state) => state.lock);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);

  const handleSave = useCallback(
    async (data: JournalEntryFormData) => {
      await addEntry(data);
    },
    [addEntry]
  );

  const handleEntryClick = useCallback((entry: JournalEntry) => {
    setSelectedEntry(entry);
    // In a full implementation, this would open a detail/edit view
    console.log('Selected entry:', entry.id);
  }, []);

  const handleDeleteEntry = useCallback(
    async (id: string) => {
      if (window.confirm('Are you sure you want to delete this entry?')) {
        await removeEntry(id);
        if (selectedEntry?.id === id) {
          setSelectedEntry(null);
        }
      }
    },
    [removeEntry, selectedEntry]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-white/70 dark:bg-slate-900/70 border-b border-slate-200/50 dark:border-slate-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <span className="text-white text-sm">M</span>
              </div>
              <h1 className="text-xl font-semibold text-slate-800 dark:text-white">
                MoodBloom
              </h1>
            </div>

            {/* Stats summary */}
            <div className="hidden sm:flex items-center gap-6 text-sm text-slate-500 dark:text-slate-400">
              <span>{entries.length} entries</span>
              {entries.length > 0 && (
                <span>
                  Streak:{' '}
                  <span className="text-violet-500 font-medium">3 days</span>
                </span>
              )}
            </div>

            {/* Lock button */}
            <button
              type="button"
              onClick={lock}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Lock journal"
              title="Lock journal"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Editor Section */}
          <section>
            <JournalEditor onSave={handleSave} />
          </section>

          {/* History Section */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                Recent Entries
              </h2>

              {entries.length > 0 && (
                <button
                  type="button"
                  className="text-sm text-violet-500 hover:text-violet-600 font-medium"
                >
                  View all
                </button>
              )}
            </div>

            <EntryList
              entries={entries}
              onEntryClick={handleEntryClick}
              onDeleteEntry={handleDeleteEntry}
              isLoading={isLoading}
            />
          </section>
        </div>
      </main>

      {/* Decorative background elements */}
      <div
        className="fixed inset-0 -z-10 overflow-hidden pointer-events-none"
        aria-hidden="true"
      >
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-violet-200/30 dark:bg-violet-900/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-purple-200/30 dark:bg-purple-900/20 blur-3xl" />
      </div>
    </div>
  );
}
