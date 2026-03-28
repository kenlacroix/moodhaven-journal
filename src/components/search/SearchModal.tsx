/**
 * SearchModal — global search overlay
 *
 * DayOne-inspired: search icon in TopBar → modal with filters.
 * - Autofocused text input
 * - Mood filter chips
 * - Date range filter
 * - Results list (decrypted entries searched client-side)
 * - Keyboard: Escape close, ↑↓ navigate, Enter open
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getAllEntries } from '../../lib/journalService';
import { getMoodColor } from '../../lib/chartUtils';
import { MOOD_OPTIONS } from '../../types/journal';
import type { JournalEntry } from '../../types/journal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function excerpt(text: string, query: string, maxLen = 120): string {
  const plain = stripHtml(text);
  if (!query) return plain.slice(0, maxLen);
  const idx = plain.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return plain.slice(0, maxLen);
  const start = Math.max(0, idx - 30);
  const snip = (start > 0 ? '…' : '') + plain.slice(start, start + maxLen);
  return snip.length < plain.length ? snip + '…' : snip;
}

type DateRange = 'all' | 'week' | 'month' | '30days';

// ─── Result card ─────────────────────────────────────────────────────────────

function ResultCard({
  entry,
  query,
  isSelected,
  onClick,
}: {
  entry: JournalEntry;
  query: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const moodColor = getMoodColor(entry.mood ?? 0);
  const moodEmoji = MOOD_OPTIONS.find((o) => o.level === entry.mood)?.emoji;
  const preview = excerpt(entry.content, query);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ borderLeftColor: moodColor }}
      className={`w-full text-left px-3 py-2.5 rounded-lg border-l-2 transition-colors ${
        isSelected
          ? 'bg-violet-50 dark:bg-violet-900/20'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-0.5">
        <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
          {entry.title || '(Untitled)'}
          {moodEmoji && <span className="ml-1.5 text-base">{moodEmoji}</span>}
        </span>
        <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">
          {new Date(entry.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
        {preview}
      </p>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface SearchModalProps {
  onClose: () => void;
  onSelectEntry: (id: string) => void;
}

export function SearchModal({ onClose, onSelectEntry }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [moodFilter, setMoodFilter] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load all entries once on open
  useEffect(() => {
    getAllEntries()
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setIsLoading(false));
  }, []);

  // Autofocus
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounce query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Reset selected index on results change
  useEffect(() => {
    setSelectedIdx(0);
  }, [debouncedQuery, moodFilter, dateRange]);

  // Filter entries
  const results = useMemo(() => {
    let r = entries;

    // Date range
    if (dateRange !== 'all') {
      const now = new Date();
      const cutoff = new Date();
      if (dateRange === 'week') cutoff.setDate(now.getDate() - 7);
      else if (dateRange === 'month') { cutoff.setDate(1); cutoff.setHours(0, 0, 0, 0); }
      else cutoff.setDate(now.getDate() - 30);
      r = r.filter((e) => new Date(e.created_at) >= cutoff);
    }

    // Mood
    if (moodFilter !== null) {
      r = r.filter((e) => e.mood === moodFilter);
    }

    // Text search (title + plain text content)
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase();
      r = r.filter(
        (e) =>
          stripHtml(e.content).toLowerCase().includes(q) ||
          (e.title?.toLowerCase().includes(q)),
      );
    }

    return r;
  }, [entries, dateRange, moodFilter, debouncedQuery]);

  const handleSelect = useCallback((id: string) => {
    onSelectEntry(id);
    onClose();
  }, [onSelectEntry, onClose]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && results.length > 0) {
        e.preventDefault();
        handleSelect(results[selectedIdx]?.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, results, selectedIdx, handleSelect]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal card */}
      <div
        className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 pointer-events-none"
        role="dialog"
        aria-label="Search entries"
        aria-modal="true"
      >
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col pointer-events-auto overflow-hidden animate-slide-up"
          style={{ maxHeight: '70vh' }}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-slate-800">
            <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search entries…"
              className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            <kbd className="hidden sm:inline text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
              Esc
            </kbd>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-2 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
            {/* Mood chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide w-10">Mood</span>
              <button
                type="button"
                onClick={() => setMoodFilter(null)}
                className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                  moodFilter === null
                    ? 'bg-violet-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                All
              </button>
              {MOOD_OPTIONS.map((opt) => (
                <button
                  key={opt.level}
                  type="button"
                  onClick={() => setMoodFilter(moodFilter === opt.level ? null : opt.level)}
                  title={opt.label}
                  className={`px-2 py-0.5 rounded-full text-sm transition-colors ${
                    moodFilter === opt.level
                      ? 'bg-violet-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {opt.emoji}
                </button>
              ))}
            </div>

            {/* Date range chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide w-10">When</span>
              {([
                ['all', 'All time'],
                ['week', 'This week'],
                ['month', 'This month'],
                ['30days', 'Last 30 days'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDateRange(value)}
                  className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                    dateRange === value
                      ? 'bg-violet-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Results */}
          <div ref={listRef} className="flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <div className="py-8 text-center text-sm text-slate-400 dark:text-slate-500 animate-pulse">
                Loading entries…
              </div>
            ) : results.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                {debouncedQuery || moodFilter !== null || dateRange !== 'all'
                  ? 'No entries match your search'
                  : 'Start typing to search'}
              </div>
            ) : (
              <div className="space-y-0.5">
                {results.map((entry, i) => (
                  <ResultCard
                    key={entry.id}
                    entry={entry}
                    query={debouncedQuery}
                    isSelected={i === selectedIdx}
                    onClick={() => handleSelect(entry.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer hint */}
          {results.length > 0 && (
            <div className="flex-shrink-0 border-t border-slate-100 dark:border-slate-800 px-4 py-2 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                {results.length} {results.length === 1 ? 'result' : 'results'}
              </span>
              <span className="hidden sm:flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
                <span>↑↓ navigate</span>
                <span>·</span>
                <span>↵ open</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
