/**
 * DayTimelineView - 24-hour entry timeline for a selected calendar day
 *
 * Shows all entries for a given day positioned on an hourly timeline.
 * Click an entry to open it.
 *
 * Changes:
 * - Hour labels display in 12-hour AM/PM format
 * - Auto-scrolls to current hour when viewing today; to most recent entry otherwise
 * - Uses parseEntryTimestamp for correct UTC → local conversion
 */

import { useState, useEffect, useRef } from 'react';
import { getEntriesByDateRange } from '../../lib/journalService';
import { parseDate, formatDate, parseEntryTimestamp } from '../../lib/dateUtils';
import { getMoodColor } from '../../lib/chartUtils';
import { MOOD_OPTIONS } from '../../types/journal';
import type { JournalEntry } from '../../types/journal';

interface DayTimelineViewProps {
  date: string; // YYYY-MM-DD
  onSelectEntry: (entryId: string) => void;
  onNewEntry: () => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

/** Convert 0–23 to 12-hour AM/PM label */
function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

/** Entry time formatted as 12-hour clock */
function formatTime(dateStr: string): string {
  return parseEntryTimestamp(dateStr).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** Get the local hour (0–23) for an entry */
function getEntryHour(entry: JournalEntry): number {
  return parseEntryTimestamp(entry.created_at).getHours();
}

export function DayTimelineView({ date, onSelectEntry, onNewEntry }: DayTimelineViewProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    const dateObj = parseDate(date);
    getEntriesByDateRange(dateObj, dateObj)
      .then((data) => {
        if (!cancelled) {
          setEntries(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [date]);

  // Scroll to current time for today; most recent entry hour for past days
  useEffect(() => {
    if (isLoading || !containerRef.current) return;
    const isToday = date === formatDate(new Date());
    let targetHour: number;
    if (isToday) {
      targetHour = new Date().getHours();
    } else if (entries.length > 0) {
      // entries[0] is most recent (ORDER BY created_at DESC)
      targetHour = getEntryHour(entries[0]);
    } else {
      targetHour = 8;
    }
    // Each hour row is ~40px; scroll so the target is near the top with some context
    const scrollY = Math.max(0, targetHour * 40 - 80);
    containerRef.current.scrollTop = scrollY;
  }, [isLoading, entries, date]);

  const dateObj = parseDate(date);
  const dayLabel = dateObj.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const entriesByHour = new Map<number, JournalEntry[]>();
  for (const entry of entries) {
    const h = getEntryHour(entry);
    const list = entriesByHour.get(h) ?? [];
    list.push(entry);
    entriesByHour.set(h, list);
  }

  // Current hour marker (only for today)
  const isToday = date === formatDate(new Date());
  const currentHour = isToday ? new Date().getHours() : -1;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-l border-slate-100 dark:border-slate-800 transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
          {dayLabel}
        </span>
        <button
          type="button"
          onClick={onNewEntry}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-violet-500 hover:bg-violet-600 text-white transition-colors flex-shrink-0 ml-2"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New entry
        </button>
      </div>

      {/* Timeline body */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <div className="text-3xl">📭</div>
          <p className="text-sm text-slate-500 dark:text-slate-400">No entries for this day</p>
          <button
            type="button"
            onClick={onNewEntry}
            className="text-sm text-violet-500 hover:text-violet-600 font-medium transition-colors"
          >
            Write for this day ↗
          </button>
        </div>
      ) : (
        <div ref={containerRef} className="flex-1 overflow-y-auto">
          <div className="relative">
            {HOURS.map((hour) => {
              const hourEntries = entriesByHour.get(hour) ?? [];
              const hasEntries = hourEntries.length > 0;
              const isCurrent = hour === currentHour;

              return (
                <div
                  key={hour}
                  className={`flex items-start min-h-[40px] ${hasEntries ? 'bg-violet-50/30 dark:bg-violet-900/5' : ''}`}
                >
                  {/* Hour label */}
                  <div className={`w-14 flex-shrink-0 px-1.5 pt-2 text-[10px] text-right font-medium transition-colors leading-tight ${
                    isCurrent
                      ? 'text-violet-500 dark:text-violet-400 font-semibold'
                      : hasEntries
                        ? 'text-violet-500 dark:text-violet-400'
                        : 'text-slate-300 dark:text-slate-600'
                  }`}>
                    {formatHour(hour)}
                  </div>

                  {/* Divider line — current hour is violet */}
                  <div className={`w-px self-stretch flex-shrink-0 mt-2 ${
                    isCurrent
                      ? 'bg-violet-400 dark:bg-violet-500'
                      : hasEntries
                        ? 'bg-violet-200 dark:bg-violet-700'
                        : 'bg-slate-100 dark:bg-slate-800'
                  }`} />

                  {/* Entries at this hour */}
                  <div className="flex-1 px-2 py-1">
                    {hasEntries ? (
                      <div className="space-y-1">
                        {hourEntries.map((entry) => {
                          const hasMood = entry.mood !== null && entry.mood > 0;
                          const moodColor = hasMood ? getMoodColor(entry.mood!) : '#94a3b8';
                          const moodEmoji = MOOD_OPTIONS.find((o) => o.level === entry.mood)?.emoji;
                          const preview = entry.title || entry.content.slice(0, 40) || 'Untitled entry';

                          return (
                            <button
                              key={entry.id}
                              type="button"
                              onClick={() => onSelectEntry(entry.id)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-white dark:hover:bg-slate-800 transition-colors group"
                            >
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: moodColor }}
                              />
                              <span className="flex-1 text-xs text-slate-700 dark:text-slate-200 truncate font-medium group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                                {preview}
                              </span>
                              {moodEmoji && (
                                <span className="text-xs flex-shrink-0">{moodEmoji}</span>
                              )}
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">
                                {formatTime(entry.created_at)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      /* Current hour gets a subtle pulse dot */
                      isCurrent
                        ? <div className="h-2 my-2 flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-violet-400 dark:bg-violet-500 animate-pulse" /></div>
                        : <div className="h-px my-2 bg-slate-50 dark:bg-slate-800/50" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
