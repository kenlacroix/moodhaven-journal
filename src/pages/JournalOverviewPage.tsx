/**
 * JournalOverviewPage — Stats + settings for a single book (journal).
 *
 * Clicking a book in the sidebar navigates here. Shows entry stats, inline-editable
 * name/description, and per-journal settings toggles.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useBooksStore } from '../stores/booksStore';
import { getAllEntries } from '../lib/services/journalService';
import type { BookSettings, JournalEntry } from '../types/journal';
import { MOOD_OPTIONS } from '../types/journal';

interface JournalOverviewPageProps {
  bookId: string;
  onViewEntries: () => void;
  onBack: () => void;
}

interface BookStats {
  entryCount: number;
  avgMood: number | null;
  streak: number;
}

function computeStats(entries: JournalEntry[], bookId: string): BookStats {
  const bookEntries = entries.filter((e) => e.book_id === bookId);
  const entryCount = bookEntries.length;

  if (entryCount === 0) return { entryCount: 0, avgMood: null, streak: 0 };

  // Average mood (only non-null mood values)
  const moodEntries = bookEntries.filter((e) => e.mood !== null && e.mood > 0);
  const avgMood =
    moodEntries.length > 0
      ? moodEntries.reduce((sum, e) => sum + (e.mood as number), 0) / moodEntries.length
      : null;

  // Current streak: consecutive calendar days with entries ending today
  const dateset = new Set(bookEntries.map((e) => e.created_at.slice(0, 10)));
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (dateset.has(key)) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }

  return { entryCount, avgMood, streak };
}

function moodLabel(avg: number): string {
  const level = Math.round(avg) as 1 | 2 | 3 | 4 | 5;
  return MOOD_OPTIONS.find((m) => m.level === level)?.label ?? '';
}

function Toggle({
  checked,
  onChange,
  label,
  description,
  info,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  info?: string;
}) {
  const [showInfo, setShowInfo] = useState(false);
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div className="flex-1 mr-4">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-slate-700 dark:text-slate-200">{label}</span>
          {info && (
            <button
              type="button"
              onClick={() => setShowInfo((v) => !v)}
              className="text-slate-400 hover:text-slate-500 text-xs"
              aria-label="More info"
            >
              ⓘ
            </button>
          )}
        </div>
        {description && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{description}</p>
        )}
        {showInfo && info && (
          <p className="text-xs text-violet-600 dark:text-violet-400 mt-1 bg-violet-50 dark:bg-violet-900/20 rounded-md px-2 py-1.5">
            {info}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
          checked ? 'bg-violet-500' : 'bg-slate-200 dark:bg-slate-700'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export function JournalOverviewPage({ bookId, onViewEntries, onBack }: JournalOverviewPageProps) {
  const { books, editBook, patchBookSettings, removeBook, setActiveBook } = useBooksStore();
  const book = books.find((b) => b.id === bookId);

  const [stats, setStats] = useState<BookStats>({ entryCount: 0, avgMood: null, streak: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(book?.name ?? '');
  const nameRef = useRef<HTMLInputElement>(null);

  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState(book?.description ?? '');
  const descRef = useRef<HTMLTextAreaElement>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const settings = useMemo<BookSettings>(() => book?.settings ?? {}, [book]);

  // Load stats on mount
  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    getAllEntries()
      .then((entries) => {
        if (!cancelled) {
          setStats(computeStats(entries, bookId));
          setStatsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => { cancelled = true; };
  }, [bookId]);

  // Sync local state when book changes
  useEffect(() => {
    if (book) {
      setNameValue(book.name);
      setDescValue(book.description ?? '');
    }
  }, [book]);

  // Focus inputs when editing starts
  useEffect(() => {
    if (editingName) nameRef.current?.select();
  }, [editingName]);

  useEffect(() => {
    if (editingDesc) descRef.current?.focus();
  }, [editingDesc]);

  const saveName = useCallback(async () => {
    if (!book) return;
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === book.name) { setEditingName(false); return; }
    await editBook(book.id, trimmed, book.emoji, book.color, book.description, book.settings);
    setEditingName(false);
  }, [book, nameValue, editBook]);

  const saveDesc = useCallback(async () => {
    if (!book) return;
    const trimmed = descValue.trim();
    if (trimmed === (book.description ?? '')) { setEditingDesc(false); return; }
    await editBook(book.id, book.name, book.emoji, book.color, trimmed || undefined, book.settings);
    setEditingDesc(false);
  }, [book, descValue, editBook]);

  const patchSetting = useCallback(async (patch: Partial<BookSettings>) => {
    if (!book) return;
    await patchBookSettings(book.id, { ...settings, ...patch });
  }, [book, settings, patchBookSettings]);

  const handleDelete = useCallback(async () => {
    if (!book) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      await removeBook(book.id);
      setActiveBook(null);
      onBack();
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [book, confirmDelete, removeBook, setActiveBook, onBack]);

  if (!book) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 dark:text-slate-400">
        Journal not found.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

        {/* Back button */}
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        {/* Book identity */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              {/* Emoji */}
              <div className="text-4xl flex-shrink-0">{book.emoji}</div>

              {/* Name + description */}
              <div className="flex-1 min-w-0">
                {editingName ? (
                  <input
                    ref={nameRef}
                    type="text"
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    onBlur={saveName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveName();
                      if (e.key === 'Escape') setEditingName(false);
                    }}
                    className="w-full text-xl font-bold bg-transparent border-b-2 border-violet-400 text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingName(true)}
                    className="text-xl font-bold text-slate-900 dark:text-slate-100 hover:text-violet-600 dark:hover:text-violet-400 transition-colors text-left w-full truncate"
                    title="Click to rename"
                  >
                    {book.name}
                  </button>
                )}

                {editingDesc ? (
                  <textarea
                    ref={descRef}
                    value={descValue}
                    onChange={(e) => setDescValue(e.target.value)}
                    onBlur={saveDesc}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setEditingDesc(false);
                    }}
                    rows={2}
                    placeholder="Add a description…"
                    className="mt-1 w-full text-sm text-slate-600 dark:text-slate-400 bg-transparent border-b border-slate-300 dark:border-slate-600 focus:outline-none resize-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingDesc(true)}
                    className="mt-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors text-left w-full"
                    title="Click to add description"
                  >
                    {book.description || <span className="italic opacity-60">Add a description…</span>}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          {/* Entry count */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-4 text-center">
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {statsLoading ? '–' : stats.entryCount.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">entries</div>
          </div>

          {/* Avg mood */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-4 text-center">
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {statsLoading ? '–' : stats.avgMood !== null ? `${stats.avgMood.toFixed(1)} ★` : '–'}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {stats.avgMood !== null ? moodLabel(stats.avgMood) : 'avg mood'}
            </div>
          </div>

          {/* Streak */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-4 text-center">
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {statsLoading ? '–' : `🔥 ${stats.streak}`}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">day streak</div>
          </div>
        </div>

        {/* View all entries CTA */}
        <button
          type="button"
          onClick={() => { setActiveBook(bookId); onViewEntries(); }}
          className="w-full flex items-center justify-between px-4 py-3 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 rounded-xl hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
        >
          <span className="text-sm font-medium">View All Entries</span>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Journal Settings */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm px-6 py-2">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider pt-4 pb-2">
            Journal Settings
          </h2>
          <Toggle
            label="Auto location & weather"
            description="Capture city and weather conditions when writing"
            checked={settings.autoLocationWeather ?? false}
            onChange={(v) => patchSetting({ autoLocationWeather: v })}
          />
          <Toggle
            label="Include in Insights"
            description="Use entries from this journal in analytics and stats"
            checked={settings.includeInOnThisDay !== false}
            onChange={(v) => patchSetting({ includeInOnThisDay: v })}
          />
          <Toggle
            label="Include in On This Day"
            description="Resurface memories from this journal on their anniversary"
            checked={settings.includeInOnThisDay !== false}
            onChange={(v) => patchSetting({ includeInOnThisDay: v })}
          />
          <Toggle
            label="Conceal entry previews"
            description="Blur entry content in the timeline list"
            checked={settings.concealContent ?? false}
            onChange={(v) => patchSetting({ concealContent: v })}
          />
          <Toggle
            label="Exclude from AI insights"
            description="Entries will not contribute to AI-generated suggestions"
            info="Only aggregated mood metadata (not your journal text) is ever used for AI insights. Enabling this excludes even that metadata from this journal."
            checked={settings.aiOptOut ?? false}
            onChange={(v) => patchSetting({ aiOptOut: v })}
          />
        </div>

        {/* Danger Zone */}
        {bookId !== 'default' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm px-6 py-4">
            <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">
              Danger Zone
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Deleting this journal moves all its entries to your default journal.
            </p>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                confirmDelete
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950'
              }`}
            >
              {deleting ? 'Deleting…' : confirmDelete ? 'Confirm delete?' : 'Delete this journal…'}
            </button>
            {confirmDelete && !deleting && (
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="ml-2 px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
