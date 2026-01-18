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
import type { JournalEntry, JournalEntryFormData } from '../types/journal';

export function JournalPage() {
  const { entries, isLoading, addEntry, removeEntry } = useJournal();
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
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </span>
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
  );
}
