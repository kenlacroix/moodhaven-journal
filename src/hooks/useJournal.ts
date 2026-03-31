/**
 * useJournal Hook
 *
 * React hook for managing journal entries with encryption.
 * Handles loading states, errors, and automatic re-fetching.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getAllEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  isUnlocked,
} from '../lib/services/journalService';
import type { JournalEntry, JournalEntryFormData } from '../types/journal';

interface UseJournalReturn {
  entries: JournalEntry[];
  isLoading: boolean;
  error: string | null;
  addEntry: (data: JournalEntryFormData) => Promise<JournalEntry>;
  editEntry: (id: string, data: JournalEntryFormData) => Promise<JournalEntry>;
  removeEntry: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useJournal(limit?: number): UseJournalReturn {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all entries
  const fetchEntries = useCallback(async () => {
    if (!isUnlocked()) {
      setError('Journal is locked');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await getAllEntries(limit);
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entries');
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  // Initial fetch
  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Add new entry
  const addEntry = useCallback(
    async (data: JournalEntryFormData): Promise<JournalEntry> => {
      const newEntry = await createEntry(data);

      // Optimistically add to list
      setEntries((prev) => [newEntry, ...prev]);

      return newEntry;
    },
    []
  );

  // Edit existing entry
  const editEntry = useCallback(
    async (id: string, data: JournalEntryFormData): Promise<JournalEntry> => {
      const updated = await updateEntry(id, data);

      // Update in list
      setEntries((prev) =>
        prev.map((entry) => (entry.id === id ? updated : entry))
      );

      return updated;
    },
    []
  );

  // Remove entry
  const removeEntry = useCallback(async (id: string): Promise<void> => {
    await deleteEntry(id);

    // Remove from list
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  return {
    entries,
    isLoading,
    error,
    addEntry,
    editEntry,
    removeEntry,
    refresh: fetchEntries,
  };
}
