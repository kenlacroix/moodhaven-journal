/**
 * TimelineView - Chronological entry list
 *
 * Per UX spec:
 * - List of entries with date, preview snippet
 * - Minimal styling, no charts
 * - Click to open entry in WritingView
 * - Replaces Calendar - no grid view
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getAllEntries, deleteEntry } from '../lib/journalService';
import { getMoodColor } from '../lib/chartUtils';
import { getRelativeDateLabel, formatDate } from '../lib/dateUtils';
import { getWeatherEmoji } from '../lib/locationWeatherService';
import { EntryActionsMenu } from '../components/journal/EntryActionsMenu';
import type { JournalEntry } from '../types/journal';
import { MOOD_OPTIONS } from '../types/journal';

// Get current date string for change detection
const getCurrentDateStr = () => formatDate(new Date());

interface TimelineViewProps {
  onSelectEntry: (entryId: string) => void;
  onNewEntry: () => void;
}

export function TimelineView({ onSelectEntry, onNewEntry }: TimelineViewProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [moodFilter, setMoodFilter] = useState<number | null>(null);

  // Search (Feature 3)
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  // Date range (Feature 5)
  const [dateRange, setDateRange] = useState<'all' | 'week' | 'month' | '30days'>('all');

  // Tag filter (Feature 7)
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  // Track current date for auto-refresh of relative dates
  const [currentDate, setCurrentDate] = useState(getCurrentDateStr);

  useEffect(() => {
    loadEntries();
  }, []);

  // Auto-refresh relative dates when calendar date changes
  useEffect(() => {
    const checkDateChange = () => {
      const now = getCurrentDateStr();
      if (now !== currentDate) {
        setCurrentDate(now);
      }
    };

    // Check every minute
    const interval = setInterval(checkDateChange, 60_000);
    return () => clearInterval(interval);
  }, [currentDate]);

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

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedQuery(value);
    }, 300);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // 4-stage filter pipeline: date range → mood → tag → search
  const filteredEntries = useMemo(() => {
    let result = entries;

    // Stage 1: Date range
    if (dateRange !== 'all') {
      const now = new Date();
      const cutoff = new Date();
      if (dateRange === 'week') {
        cutoff.setDate(now.getDate() - 7);
      } else if (dateRange === 'month') {
        cutoff.setDate(1);
        cutoff.setHours(0, 0, 0, 0);
      } else if (dateRange === '30days') {
        cutoff.setDate(now.getDate() - 30);
      }
      result = result.filter((e) => new Date(e.created_at) >= cutoff);
    }

    // Stage 2: Mood
    if (moodFilter) {
      result = result.filter((e) => e.mood === moodFilter);
    }

    // Stage 3: Tag
    if (tagFilter) {
      result = result.filter((e) => e.tags.includes(tagFilter));
    }

    // Stage 4: Search
    if (debouncedQuery) {
      const q = debouncedQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.content.toLowerCase().includes(q) ||
          e.title?.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    return result;
  }, [entries, dateRange, moodFilter, tagFilter, debouncedQuery]);

  // Group filtered entries by date
  const groupedEntries = useMemo(
    () =>
      filteredEntries.reduce(
        (groups, entry) => {
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
        },
        {} as Record<string, JournalEntry[]>,
      ),
    [filteredEntries],
  );

  // Mood counts for filter chips
  const moodCounts = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const entry of entries) {
      if (entry.mood && counts[entry.mood] !== undefined) {
        counts[entry.mood]++;
      }
    }
    return counts;
  }, [entries]);

  // All unique tags with counts (from unfiltered entries)
  const allTags = useMemo(() => {
    const tagMap = new Map<string, number>();
    for (const entry of entries) {
      for (const tag of entry.tags) {
        tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(tagMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [entries]);

  const isAnyFilterActive =
    moodFilter !== null || dateRange !== 'all' || tagFilter !== null || debouncedQuery !== '';

  // Handle delete with optimistic removal (called by EntryActionsMenu after confirm)
  const handleDelete = useCallback(async (id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    try {
      await deleteEntry(id);
    } catch (err) {
      console.error('Failed to delete entry:', err);
      loadEntries(); // Re-fetch on failure
    }
  }, []);

  // Build relative date header (recalculates when currentDate changes)
  const getDateHeader = useCallback((dateStr: string, sampleEntry: JournalEntry) => {
    const entryDate = new Date(sampleEntry.created_at);
    const label = getRelativeDateLabel(entryDate);
    // Only prepend if it's genuinely relative (Today, Yesterday, or contains "ago")
    if (label === 'Today' || label === 'Yesterday' || label.includes('ago')) {
      return `${label} — ${dateStr}`;
    }
    return dateStr;
  }, [currentDate]);

  const clearAllFilters = useCallback(() => {
    setMoodFilter(null);
    setDateRange('all');
    setTagFilter(null);
    setSearchQuery('');
    setDebouncedQuery('');
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
  }, []);

  // Feature 4: Skeleton loading
  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Header skeleton */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="h-8 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mt-2" />
          </div>
          <div className="h-9 w-24 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
        </div>
        {/* Filter chips skeleton */}
        <div className="flex gap-2 mb-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-8 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse"
              style={{ width: i === 0 ? 56 : 48, animationDelay: `${i * 75}ms` }}
            />
          ))}
        </div>
        {/* Date header skeleton */}
        <div className="h-3 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-3" />
        {/* Card skeletons */}
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 animate-pulse"
              style={{ animationDelay: `${i * 150}ms` }}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 bg-slate-200 dark:bg-slate-700 rounded" />
                  <div className="h-3 w-full bg-slate-200 dark:bg-slate-700 rounded" />
                  <div className="h-3 w-2/3 bg-slate-200 dark:bg-slate-700 rounded" />
                  <div className="h-2.5 w-16 bg-slate-200 dark:bg-slate-700 rounded mt-2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Header with entry count */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
            Timeline
          </h1>
          {entries.length > 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              {isAnyFilterActive
                ? `${filteredEntries.length} of ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`
                : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onNewEntry}
          className="px-4 py-2 text-sm font-medium text-white bg-violet-500 hover:bg-violet-600 rounded-lg transition-colors"
        >
          New Entry
        </button>
      </div>

      {/* Inline search (Feature 3) */}
      {entries.length > 0 && (
        <div className="relative mb-4">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Filter entries..."
            className="w-full pl-9 pr-9 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setDebouncedQuery('');
                if (searchTimeoutRef.current) {
                  clearTimeout(searchTimeoutRef.current);
                }
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Mood filter chips */}
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {/* All chip */}
          <button
            type="button"
            onClick={() => setMoodFilter(null)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              moodFilter === null
                ? 'bg-violet-500 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            All
            <span
              className={`text-xs ${moodFilter === null ? 'text-violet-200' : 'text-slate-400 dark:text-slate-500'}`}
            >
              {entries.length}
            </span>
          </button>
          {/* Mood chips */}
          {MOOD_OPTIONS.map((option) => {
            const count = moodCounts[option.level] ?? 0;
            const isActive = moodFilter === option.level;
            return (
              <button
                key={option.level}
                type="button"
                onClick={() => setMoodFilter(isActive ? null : option.level)}
                title={option.label}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-violet-500 text-white'
                    : count === 0
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>{option.emoji}</span>
                <span
                  className={`text-xs ${isActive ? 'text-violet-200' : count === 0 ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400 dark:text-slate-500'}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Date range filter chips (Feature 5) */}
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {([
            ['all', 'All time'],
            ['week', 'This week'],
            ['month', 'This month'],
            ['30days', 'Last 30 days'],
          ] as const).map(([value, label]) => {
            const isActive = dateRange === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setDateRange(isActive && value !== 'all' ? 'all' : value)
                }
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-violet-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Tag filter chips (Feature 7) */}
      {allTags.length > 0 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {allTags.map(([tag, count]) => {
            const isActive = tagFilter === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setTagFilter(isActive ? null : tag)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-violet-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {tag}
                <span
                  className={`text-xs ${isActive ? 'text-violet-200' : 'text-slate-400 dark:text-slate-500'}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Empty state - no entries at all */}
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

      {/* Filtered empty state */}
      {entries.length > 0 && filteredEntries.length === 0 && (
        <div className="text-center py-16">
          <p className="text-slate-500 dark:text-slate-400 mb-2">No entries match your filters</p>
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-sm text-violet-500 hover:text-violet-600"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* Entry list grouped by date */}
      <div className="space-y-8">
        {Object.entries(groupedEntries).map(([date, dateEntries]) => (
          <div key={date}>
            <h2 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3">
              {getDateHeader(date, dateEntries[0])}
              <span className="normal-case tracking-normal">
                {' '}
                &middot; {dateEntries.length} {dateEntries.length === 1 ? 'entry' : 'entries'}
              </span>
            </h2>
            <div className="space-y-2">
              {dateEntries.map((entry, i) => {
                const moodColor = getMoodColor(entry.mood ?? 0);
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => onSelectEntry(entry.id)}
                    style={{
                      animationDelay: `${i * 50}ms`,
                      borderLeftColor: moodColor,
                    }}
                    className="relative w-full text-left p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 border-l-4 hover:border-slate-200 dark:hover:border-slate-700 shadow-sm hover:shadow-md hover:-translate-y-px transition-all duration-200 group animate-entry-in"
                  >
                    {/* Actions dropdown (⋯) */}
                    <EntryActionsMenu entry={entry} onDelete={handleDelete} />

                    <div className="flex items-start gap-3">
                      {/* Mood indicator */}
                      {entry.mood && (
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${moodColor}18` }}
                          title={`Mood: ${entry.mood}`}
                        >
                          <span className="text-lg">
                            {MOOD_OPTIONS.find((o) => o.level === entry.mood)?.emoji ?? '😐'}
                          </span>
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

                        {/* Tags (Feature 1) */}
                        {entry.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {entry.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                              >
                                {tag}
                              </span>
                            ))}
                            {entry.tags.length > 3 && (
                              <span className="text-xs text-slate-400">
                                +{entry.tags.length - 3} more
                              </span>
                            )}
                          </div>
                        )}

                        {/* Privacy badge */}
                        {(entry.privacyMode ?? 0) > 0 && (
                          <div className="flex items-center gap-1 mt-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              entry.privacyMode === 1
                                ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                                : 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400'
                            }`}>
                              {entry.privacyMode === 1 ? (
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                                </svg>
                              ) : (
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                </svg>
                              )}
                              {entry.privacyMode === 1 ? 'Mindful' : 'Private'}
                            </span>
                          </div>
                        )}

                        {/* Footer: time + weather chip */}
                        <div className="flex items-center gap-3 mt-2">
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            {new Date(entry.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                          {entry.locationWeather?.city && (
                            <span className="flex items-center gap-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                              <span>{getWeatherEmoji(entry.locationWeather.weatherCode)}</span>
                              <span>{entry.locationWeather.city}</span>
                              {entry.locationWeather.temperature !== undefined && (
                                <span>· {Math.round(entry.locationWeather.temperature)}°</span>
                              )}
                            </span>
                          )}
                        </div>
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
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
