/**
 * SearchView - Search entries
 *
 * Per UX spec:
 * - Search input at top
 * - Results as entry list
 * - No filters visible by default
 */

import { useState, useCallback } from 'react';
import { searchEntries } from '../lib/journalService';
import type { JournalEntry } from '../types/journal';

interface SearchViewProps {
  onSelectEntry: (entryId: string) => void;
}

const MOODS: Record<number, string> = {
  1: '😢',
  2: '😔',
  3: '😐',
  4: '🙂',
  5: '😊',
};

export function SearchView({ onSelectEntry }: SearchViewProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<JournalEntry[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async (searchQuery: string) => {
    setQuery(searchQuery);

    if (!searchQuery.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    try {
      const data = await searchEntries(searchQuery);
      setResults(data);
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search
  const handleInputChange = useCallback((value: string) => {
    setQuery(value);
    const timeoutId = setTimeout(() => handleSearch(value), 300);
    return () => clearTimeout(timeoutId);
  }, [handleSearch]);

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Search input */}
      <div className="relative mb-8">
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="Search your entries..."
          autoFocus
          className="
            w-full pl-12 pr-4 py-3
            text-lg
            bg-white dark:bg-slate-900
            border border-slate-200 dark:border-slate-700
            rounded-xl
            text-slate-800 dark:text-slate-100
            placeholder:text-slate-400
            focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
          "
        />
        {isSearching && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Results */}
      {hasSearched && !isSearching && (
        <>
          {results.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500 dark:text-slate-400">
                No entries found for "{query}"
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                {results.length} {results.length === 1 ? 'result' : 'results'}
              </p>

              {results.map((entry, i) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onSelectEntry(entry.id)}
                  style={{ animationDelay: `${i * 50}ms` }}
                  className="w-full text-left p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 shadow-sm hover:shadow-md hover:-translate-y-px transition-all duration-200 group animate-entry-in"
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

                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                        {new Date(entry.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
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
          )}
        </>
      )}

      {/* Empty state before search */}
      {!hasSearched && (
        <div className="text-center py-12">
          <p className="text-slate-400 dark:text-slate-500">
            Start typing to search your journal
          </p>
        </div>
      )}
    </div>
  );
}
