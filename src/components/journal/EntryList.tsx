/**
 * EntryList - Journal entry history with calm visual design
 *
 * Design principles:
 * - Scannable cards with mood indicators
 * - Grouped by date for context
 * - Smooth expand/collapse animations
 * - Empty state encouragement
 */

import { useMemo, useState } from 'react';
import { MOOD_OPTIONS, type JournalEntry, type MoodLevel } from '../../types/journal';
import { stillGetSessionBrief, type StillSessionBrief } from '../../lib/stillService';

interface EntryListProps {
  entries: JournalEntry[];
  onEntryClick: (entry: JournalEntry) => void;
  onDeleteEntry?: (id: string) => void;
  isLoading?: boolean;
}

// Group entries by date
function groupEntriesByDate(entries: JournalEntry[]): Map<string, JournalEntry[]> {
  const groups = new Map<string, JournalEntry[]>();

  entries.forEach((entry) => {
    const dateKey = new Date(entry.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const group = groups.get(dateKey) || [];
    group.push(entry);
    groups.set(dateKey, group);
  });

  return groups;
}

// Get relative date label
function getRelativeDateLabel(dateStr: string): string {
  const today = new Date();
  const entryDate = new Date(dateStr);

  const diffDays = Math.floor(
    (today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return dateStr;
}

function getMoodOption(level: MoodLevel) {
  return MOOD_OPTIONS.find((o) => o.level === level) || MOOD_OPTIONS[2];
}

function EntryCard({
  entry,
  onClick,
  onDelete,
}: {
  entry: JournalEntry;
  onClick: () => void;
  onDelete?: () => void;
}) {
  const mood = entry.mood ? getMoodOption(entry.mood) : null;
  const [sessionBrief, setSessionBrief] = useState<StillSessionBrief | null | 'loading'>(null);

  function handleBadgeHover() {
    if (sessionBrief !== null || !entry.sessionId) return;
    setSessionBrief('loading');
    stillGetSessionBrief(entry.sessionId)
      .then((brief) => setSessionBrief(brief))
      .catch(() => setSessionBrief(null));
  }
  const preview =
    entry.content.length > 150
      ? entry.content.substring(0, 150) + '...'
      : entry.content;

  const time = new Date(entry.created_at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <article
      className="
        group relative
        bg-white dark:bg-slate-800
        rounded-2xl
        border border-slate-100 dark:border-slate-700
        p-4 sm:p-5
        cursor-pointer
        transition-all duration-200
        hover:shadow-md hover:border-slate-200 dark:hover:border-slate-600
        hover:-translate-y-0.5
        focus-within:ring-2 focus-within:ring-violet-500 focus-within:ring-offset-2
      "
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      tabIndex={0}
      role="button"
      aria-label={`Journal entry from ${time}${mood ? `, mood: ${mood.label}` : ''}`}
    >
      {/* Mood indicator stripe */}
      {mood && (
        <div
          className={`
            absolute left-0 top-4 bottom-4 w-1 rounded-full
            ${mood.color}
          `}
        />
      )}

      <div className="pl-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {mood && (
              <>
                <span className="text-lg" role="img" aria-label={mood.label}>
                  {mood.emoji}
                </span>
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {mood.label}
                </span>
              </>
            )}
          </div>
          <time className="text-xs text-slate-400 dark:text-slate-500">
            {time}
          </time>
        </div>

        {/* Content preview */}
        <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed line-clamp-3">
          {preview}
        </p>

        {/* Tags */}
        {entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {entry.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="
                  px-2 py-0.5 rounded-full
                  text-xs font-medium
                  bg-slate-100 dark:bg-slate-700
                  text-slate-500 dark:text-slate-400
                "
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
        {/* Word count */}
        {entry.wordCount != null && entry.wordCount > 0 && (
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            {entry.wordCount.toLocaleString()} {entry.wordCount === 1 ? 'word' : 'words'}
          </p>
        )}

        {/* StillHaven session badge — lazy-loads activation delta on hover */}
        {entry.sessionId && (
          <div className="mt-2 flex">
            <span
              className="
                inline-flex items-center gap-1
                px-2 py-0.5 rounded-full
                text-xs font-medium
                bg-violet-50 dark:bg-violet-900/30
                text-violet-600 dark:text-violet-400
                border border-violet-200 dark:border-violet-700
                cursor-default select-none
              "
              onMouseEnter={handleBadgeHover}
              title="Written after a StillHaven grounding session"
            >
              <span aria-hidden="true">~</span>
              {sessionBrief === 'loading' && (
                <span className="opacity-60">…</span>
              )}
              {sessionBrief !== null && sessionBrief !== 'loading' && sessionBrief.pre_activation !== null && sessionBrief.post_activation !== null ? (
                <span>{sessionBrief.pre_activation}→{sessionBrief.post_activation}</span>
              ) : (
                sessionBrief === null && <span>grounding</span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Delete button - appears on hover */}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="
            absolute top-3 right-3
            p-1.5 rounded-lg
            opacity-0 group-hover:opacity-100
            text-slate-400 hover:text-rose-500
            hover:bg-rose-50 dark:hover:bg-rose-900/20
            transition-all duration-200
          "
          aria-label="Delete entry"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      )}
    </article>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 px-4">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-violet-50 dark:bg-violet-900/20 mb-4">
        <svg
          className="w-8 h-8 text-violet-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-slate-700 dark:text-slate-200 mb-2">
        Your journal awaits
      </h3>
      <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
        Start your first entry above. Your thoughts are safely encrypted and
        stored only on your device.
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-white dark:bg-slate-800 rounded-2xl p-5 animate-pulse"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700" />
            <div className="w-16 h-4 rounded bg-slate-200 dark:bg-slate-700" />
          </div>
          <div className="space-y-2">
            <div className="w-full h-4 rounded bg-slate-100 dark:bg-slate-700" />
            <div className="w-3/4 h-4 rounded bg-slate-100 dark:bg-slate-700" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EntryList({
  entries,
  onEntryClick,
  onDeleteEntry,
  isLoading = false,
}: EntryListProps) {
  const groupedEntries = useMemo(() => groupEntriesByDate(entries), [entries]);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (entries.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-8">
      {Array.from(groupedEntries.entries()).map(([dateStr, dateEntries]) => (
        <section key={dateStr}>
          {/* Date header */}
          <h3 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 px-1">
            {getRelativeDateLabel(dateStr)}
          </h3>

          {/* Entries for this date */}
          <div className="space-y-3">
            {dateEntries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                onClick={() => onEntryClick(entry)}
                onDelete={onDeleteEntry ? () => onDeleteEntry(entry.id) : undefined}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
