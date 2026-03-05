/**
 * WritingView - Calm writing space (default view)
 *
 * Polish:
 * 1. Time-aware greeting + human-readable date in heading
 * 2. Mood-reactive card header separator (border color follows mood)
 * 3. Warm ambient gradient background (.writing-bg) / flat .focus-bg in distraction-free
 * 4. Violet focus glow on editor card
 * 5. Focus fade — heading + E2E badge dim at ≥20 words so writing takes focus
 * 6. Streak + entry count line in heading
 * 7. Generous editor typography (handled in RichTextEditor)
 * 8. Distraction-free mode — sidebar + TopBar hidden, card header collapses,
 *    title hides, Cmd/Ctrl+Shift+F to toggle
 *
 * Mood auto-detection:
 * - Pulses the active dot on every auto-mood change (not just first detection)
 * - Shows 🔒 lock icon when user has manually set mood; click to re-enable auto
 * - Shows soft scanning animation while word count is 1–4 (too short to score)
 *
 * Save semantics:
 * - Auto-saves HTML content 2s after the last keystroke (≥5 words for first save)
 * - savedEntryIdRef tracks the created ID so each session saves ONE entry (not duplicates)
 * - Rich text (HTML) is preserved; plain text is derived for mood scoring only
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { saveEntry, getEntryById, patchEntryLocationWeather, deleteEntry } from '../lib/journalService';
import { captureLocationWeather, getWeatherEmoji, displayTemp } from '../lib/locationWeatherService';
import { RichTextEditor } from '../components/editor';
import { PromptDrawer } from '../components/ai/PromptDrawer';
import { EntryOptionsMenu } from '../components/journal/EntryOptionsMenu';
import { useJournalPrompts } from '../hooks/useJournalPrompts';
import { useSettingsStore } from '../stores/settingsStore';
import { useBooksStore } from '../stores/booksStore';
import { scoreContentMood } from '../lib/metadataExtractor';
import { getStreakStats, getOverallStats } from '../lib/analyticsService';
import type { JournalEntry, LocationWeather, MoodLevel, PrivacyMode } from '../types/journal';
import { MOOD_OPTIONS, PRIVACY_MODE_LABELS, PRIVACY_MODE_DESCRIPTIONS } from '../types/journal';
import type { JournalTemplate } from '../lib/journalTemplates';
import { formatTemplateContent } from '../lib/journalTemplates';

interface WritingViewProps {
  entryId?: string | null;
  onEntrySaved?: () => void;
  onNewEntry?: () => void;
  onNavigateToSTTSettings?: () => void;
  /** Optional ref populated with a function that immediately flushes any
   *  pending auto-save. Useful for callers (e.g. breakout window) that need
   *  to save before closing without waiting for the debounce timer. */
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip HTML tags to plain text for mood scoring and word counting */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function getGreeting(hour: number): string {
  if (hour < 12) return 'Good morning.';
  if (hour < 17) return 'Good afternoon.';
  return 'Good evening.';
}

function getFormattedDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Template usage tracking ───────────────────────────────────────────────────

function getTodayKey(): string {
  return `mb_used_templates_${new Date().toISOString().slice(0, 10)}`;
}

function getUsedTemplates(): string[] {
  try { return JSON.parse(localStorage.getItem(getTodayKey()) ?? '[]') as string[]; }
  catch { return []; }
}

function markTemplateUsed(id: string): void {
  const used = getUsedTemplates();
  if (!used.includes(id)) {
    try { localStorage.setItem(getTodayKey(), JSON.stringify([...used, id])); }
    catch { /* ignore */ }
  }
}

// ── Mood dot colours ──────────────────────────────────────────────────────────

const DOT_COLORS: Record<MoodLevel, string> = {
  1: 'bg-rose-500',
  2: 'bg-orange-400',
  3: 'bg-amber-400',
  4: 'bg-lime-400',
  5: 'bg-emerald-500',
};

const RING_COLORS: Record<MoodLevel, string> = {
  1: 'ring-rose-400',
  2: 'ring-orange-300',
  3: 'ring-amber-300',
  4: 'ring-lime-300',
  5: 'ring-emerald-400',
};

/** Card header border transitions to the mood colour */
const MOOD_BORDER: Record<MoodLevel, string> = {
  1: 'border-rose-200 dark:border-rose-900/50',
  2: 'border-orange-200 dark:border-orange-900/50',
  3: 'border-amber-200 dark:border-amber-900/50',
  4: 'border-lime-200 dark:border-lime-900/50',
  5: 'border-emerald-200 dark:border-emerald-900/50',
};

// ── Privacy segmented control ─────────────────────────────────────────────────

const PRIVACY_ICONS: Record<PrivacyMode, React.ReactNode> = {
  0: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  ),
  1: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  ),
  2: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  ),
};

const PRIVACY_ACTIVE_COLORS: Record<PrivacyMode, string> = {
  0: 'text-slate-600 dark:text-slate-200',
  1: 'text-amber-600 dark:text-amber-400',
  2: 'text-violet-600 dark:text-violet-400',
};

// ─────────────────────────────────────────────────────────────────────────────

export function WritingView({ entryId, onEntrySaved, onNewEntry: _onNewEntry, onNavigateToSTTSettings, saveRef }: WritingViewProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contentText, setContentText] = useState('');
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Mirror local save state into global store so Sidebar can show the indicator
  useEffect(() => {
    const { setSavingState, setLastAutoSaved } = useSettingsStore.getState();
    if (isSaving) {
      setSavingState('saving');
    } else if (lastSavedAt) {
      setSavingState('saved');
      setLastAutoSaved(lastSavedAt.toISOString());
      const t = setTimeout(() => useSettingsStore.getState().setSavingState('idle'), 3500);
      return () => clearTimeout(t);
    }
  }, [isSaving, lastSavedAt]);
  const [savedAgoText, setSavedAgoText] = useState('');
  const [showCheckmark, setShowCheckmark] = useState(false);
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [pendingInsert, setPendingInsert] = useState<string | null>(null);

  /**
   * Tracks the DB entry ID created by the first auto-save.
   * Subsequent saves update the same row instead of creating duplicates.
   * A ref (not state) so reads are always current inside setTimeout closures
   * without triggering extra renders.
   */
  const savedEntryIdRef = useRef<string | null>(entryId || null);

  // Mood auto-detection
  const [mood, setMood] = useState<MoodLevel | null>(null);
  const [moodIsAuto, setMoodIsAuto] = useState(true);
  const [moodPulse, setMoodPulse] = useState(false);
  const prevAutoMoodRef = useRef<MoodLevel | null>(null);

  // Clock for time-aware greeting
  const [now, setNow] = useState(() => new Date());

  // Streak + total entries
  const [currentStreak, setCurrentStreak] = useState(0);
  const [totalEntries, setTotalEntries] = useState(0);

  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const moodScoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Imperative save: always-fresh function re-assigned each render so it closes
  // over the latest state. saveRef.current (stable wrapper) delegates to this.
  const saveNowRef = useRef<(() => Promise<void>) | null>(null);

  const [savedEntry, setSavedEntry] = useState<JournalEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [usedTemplateIds, setUsedTemplateIds] = useState<string[]>(() => getUsedTemplates());
  const setShowPrompts = useSettingsStore((s) => s.setShowPrompts);
  const showPrompts = useSettingsStore((s) => s.settings.journal.showPrompts);
  const distractionFree = useSettingsStore((s) => s.distractionFree);
  const setDistractionFree = useSettingsStore((s) => s.setDistractionFree);
  const autoLocationWeather = useSettingsStore((s) => s.settings.journal.autoLocationWeather);
  const autoTitle = useSettingsStore((s) => s.settings.journal.autoTitle ?? false);
  const temperatureUnit = useSettingsStore((s) => s.settings.journal.temperatureUnit ?? 'C');
  /** Whether the user has typed a title themselves (disables auto-title for this entry) */
  const userTypedTitleRef = useRef(false);

  const activeBookId = useBooksStore((s) => s.activeBookId);
  const books = useBooksStore((s) => s.books);
  const activeBook = books.find((b) => b.id === (activeBookId ?? 'default')) ?? books[0];

  // Weather / location context captured in background on mount
  const locationWeatherRef = useRef<LocationWeather | null>(null);
  const [locationWeather, setLocationWeather] = useState<LocationWeather | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  const isNewEntry = !entryId;
  const isEditorEmpty = !contentText.trim();
  const wordCount = contentText.trim() ? contentText.trim().split(/\s+/).length : 0;
  const charCount = contentText.length;
  /** Heading + subtle UI dims once user is in writing flow */
  const inFlow = wordCount >= 20;
  /** Scanning state: user has started writing but not enough words for mood detection */
  const isScanning = moodIsAuto && mood === null && wordCount > 0 && wordCount < 5;

  const greeting = getGreeting(now.getHours());
  const formattedDate = getFormattedDate(now);
  const headerBorderColor = mood ? MOOD_BORDER[mood] : 'border-slate-100 dark:border-slate-800';

  const {
    forYouPrompts,
    generalPrompts,
    healthPrompts,
    isLoading: promptsLoading,
    isAIEnabled,
    refresh: refreshPrompts,
  } = useJournalPrompts(isNewEntry);

  // Tick clock every minute so greeting stays accurate across day transitions
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Capture weather + location in background when starting a new entry.
  // If geolocation resolves after the first auto-save has already created the row,
  // we patch the weather onto the existing entry via a targeted SQL update.
  useEffect(() => {
    if (!autoLocationWeather || !isNewEntry) return;
    let cancelled = false;
    setLocationLoading(true);
    captureLocationWeather().then((w) => {
      if (cancelled) return;
      setLocationLoading(false);
      if (!w) return;
      locationWeatherRef.current = w;
      setLocationWeather(w);
      // If entry was already saved before weather resolved, patch it now
      if (savedEntryIdRef.current) {
        patchEntryLocationWeather(savedEntryIdRef.current, w).catch((err) => {
          console.error('Failed to patch location weather:', err);
        });
      }
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLocationWeather]); // only re-run if setting changes; isNewEntry intentionally omitted

  // Load streak + entry count once on mount
  useEffect(() => {
    Promise.all([getStreakStats(), getOverallStats()])
      .then(([streakStats, overallStats]) => {
        setCurrentStreak(streakStats.currentStreak);
        setTotalEntries(overallStats.totalEntries);
      })
      .catch(() => { /* silent — non-critical */ });
  }, []);

  // Cmd/Ctrl+Shift+F to toggle distraction-free mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setDistractionFree(!distractionFree);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [distractionFree, setDistractionFree]);

  // Load existing entry if editing
  useEffect(() => {
    if (entryId) {
      getEntryById(entryId).then((entry) => {
        if (entry) {
          setTitle(entry.title || '');
          setContent(entry.content);
          // Derive plain text from stored HTML for word count / mood scoring
          setContentText(stripHtml(entry.content));
          setPrivacyMode(entry.privacyMode ?? 0);
          if (entry.mood) { setMood(entry.mood); setMoodIsAuto(false); }
          // Restore stored weather chip for existing entries
          if (entry.locationWeather) setLocationWeather(entry.locationWeather);
        }
      });
    }
  }, [entryId]);

  // Sync savedEntryIdRef when entryId prop changes (e.g. navigating to an existing entry)
  useEffect(() => {
    savedEntryIdRef.current = entryId || null;
  }, [entryId]);

  // Reset all editor state when switching to a fresh new entry
  useEffect(() => {
    if (isNewEntry) {
      setTitle('');
      setContent('');
      setContentText('');
      setPrivacyMode(0);
      setMood(null);
      setMoodIsAuto(true);
      setLastSavedAt(null);
      setSavedAgoText('');
      setShowCheckmark(false);
      savedEntryIdRef.current = null;
      prevAutoMoodRef.current = null;
    }
  }, [isNewEntry]);

  // Pulse the active mood dot on every auto-mood change (not just first detection)
  useEffect(() => {
    if (!moodIsAuto || mood === null) return;
    if (mood !== prevAutoMoodRef.current) {
      setMoodPulse(true);
      const t = setTimeout(() => setMoodPulse(false), 900);
      prevAutoMoodRef.current = mood;
      return () => clearTimeout(t);
    }
  }, [mood, moodIsAuto]);

  // Cleanup timeouts and intervals
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
      if (agoIntervalRef.current) clearInterval(agoIntervalRef.current);
      if (moodScoreTimeoutRef.current) clearTimeout(moodScoreTimeoutRef.current);
    };
  }, []);

  // Auto-score mood from content (only when user hasn't manually set it)
  useEffect(() => {
    if (!moodIsAuto) return;
    if (moodScoreTimeoutRef.current) clearTimeout(moodScoreTimeoutRef.current);
    moodScoreTimeoutRef.current = setTimeout(() => {
      const scored = scoreContentMood(contentText);
      if (scored !== null) setMood(scored);
    }, 1500);
  }, [contentText, moodIsAuto]);

  // Update "saved X ago" text every 10 seconds
  useEffect(() => {
    if (!lastSavedAt) return;
    const updateAgoText = () => {
      const seconds = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000);
      if (seconds < 5) setSavedAgoText('Saved just now');
      else if (seconds < 60) setSavedAgoText(`Saved ${seconds}s ago`);
      else setSavedAgoText(`Saved ${Math.floor(seconds / 60)}m ago`);
    };
    updateAgoText();
    agoIntervalRef.current = setInterval(updateAgoText, 10000);
    return () => { if (agoIntervalRef.current) clearInterval(agoIntervalRef.current); };
  }, [lastSavedAt]);

  // Auto-save after 2 seconds of inactivity
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);

    // Don't save empty content.
    // For brand-new entries (nothing saved yet) require ≥5 words to avoid
    // accidentally persisting a stray keystroke.
    if (!contentText.trim()) return;
    if (!savedEntryIdRef.current && wordCount < 5) return;

    autoSaveTimeoutRef.current = setTimeout(() => {
      // Auto-title: generate from first sentence when no title has been typed
      let effectiveTitle = title;
      if (autoTitle && !userTypedTitleRef.current && !effectiveTitle && contentText.trim()) {
        const firstSentence = contentText.trim().split(/[.!?]/)[0].slice(0, 60).trim();
        if (firstSentence) effectiveTitle = firstSentence;
      }

      setIsSaving(true);
      saveEntry({
        // Use the ref so subsequent saves update the same row (no duplicates)
        id: savedEntryIdRef.current || undefined,
        title: effectiveTitle || undefined,
        // Save the rich-text HTML so formatting survives reload
        content,
        mood: mood ?? undefined,
        privacyMode,
        // Include location/weather and bookId only on the initial create (not updates)
        locationWeather: !savedEntryIdRef.current ? locationWeatherRef.current ?? undefined : undefined,
        bookId: !savedEntryIdRef.current ? (activeBookId ?? undefined) : undefined,
      })
        .then((saved) => {
          // Capture the created ID so the next auto-save updates instead of inserts
          savedEntryIdRef.current = saved.id;
          setSavedEntry(saved);
          setLastSavedAt(new Date());
          setShowCheckmark(true);
          setTimeout(() => setShowCheckmark(false), 1500);
          onEntrySaved?.();
        })
        .catch((err) => { console.error('Auto-save failed:', err); })
        .finally(() => { setIsSaving(false); });
    }, 2000);
  // `mood` and `content` are intentionally included: a mood auto-detection or
  // format change after the last keystroke should still be reflected in the save.
  }, [content, contentText, wordCount, title, mood, privacyMode, autoTitle, onEntrySaved]);

  useEffect(() => { scheduleAutoSave(); }, [contentText, title, privacyMode, scheduleAutoSave]);

  const handleContentChange = useCallback((html: string, text: string) => {
    setContent(html);
    // Tiptap's getText() gives us clean plain text — use it for word count and
    // mood scoring. (The HTML itself is saved for rich-text persistence.)
    setContentText(text);
  }, []);

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    userTypedTitleRef.current = true;
    setTitle(e.target.value);
  }, []);

  const handleUsePrompt = useCallback((prompt: { text: string }) => {
    setPendingInsert(prompt.text + '\n\n');
  }, []);

  const handleUseTemplate = useCallback((template: JournalTemplate) => {
    setPendingInsert(formatTemplateContent(template));
    markTemplateUsed(template.id);
    setUsedTemplateIds(getUsedTemplates());
    // Close drawer immediately after template insertion
    setDrawerOpen(false);
  }, []);

  // Reset mood to auto mode
  const handleResetMoodToAuto = useCallback(() => {
    setMoodIsAuto(true);
    setMood(null);
    prevAutoMoodRef.current = null;
  }, []);

  // Re-assigned every render so it always has the latest state — no stale closure.
  // No word-count guard here: this is the explicit "save now" path used by the
  // breakout writer Return button. Save anything that has content.
  saveNowRef.current = async () => {
    if (!contentText.trim()) return;
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    setIsSaving(true);
    try {
      const saved = await saveEntry({
        id: savedEntryIdRef.current || undefined,
        title: title || undefined,
        content,
        mood: mood ?? undefined,
        privacyMode,
        locationWeather: !savedEntryIdRef.current ? locationWeatherRef.current ?? undefined : undefined,
        bookId: !savedEntryIdRef.current ? (activeBookId ?? undefined) : undefined,
      });
      savedEntryIdRef.current = saved.id;
      setLastSavedAt(new Date());
      onEntrySaved?.();
    } finally {
      setIsSaving(false);
    }
  };

  // Wire the stable external ref to the always-fresh saveNowRef (runs once on mount).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (saveRef) saveRef.current = () => saveNowRef.current!();
  }, [saveRef]);

  return (
    <div className={`h-full flex flex-col transition-all duration-500 ${distractionFree ? 'focus-bg' : 'writing-bg'}`}>
      <div className="flex-1 flex flex-col min-h-0 px-6 sm:px-12 lg:px-20 py-12">
        <div className="flex-1 flex flex-col max-w-3xl lg:max-w-[75%] w-full mx-auto min-h-0 relative">

          {/* ── Heading block: greeting + date + streak (new entries only) ── */}
          {!entryId && (
            <div
              className={`mb-6 transition-all duration-700 ${
                inFlow ? 'opacity-25 pointer-events-none' : 'opacity-100'
              } ${distractionFree ? 'max-h-0 overflow-hidden opacity-0 mb-0 pointer-events-none' : ''}`}
            >
              {/* Time-aware greeting */}
              <h1 className="text-3xl font-light text-slate-700 dark:text-slate-300 tracking-tight mb-1">
                {greeting}
              </h1>

              {/* Date */}
              <p className="text-sm text-slate-400 dark:text-slate-500">
                {formattedDate}
              </p>

              {/* Weather + location chip */}
              {locationLoading && !locationWeather && (
                <p className="flex items-center gap-1 mt-0.5 text-xs text-slate-400 dark:text-slate-500 animate-pulse">
                  <span className="w-2.5 h-2.5 border border-slate-300 dark:border-slate-600 border-t-slate-400 rounded-full animate-spin" />
                  <span>Getting location…</span>
                </p>
              )}
              {locationWeather && (
                <p className="flex items-center gap-1 mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  <span>{getWeatherEmoji(locationWeather.weatherCode)}</span>
                  {locationWeather.temperature !== undefined && (
                    <span>{displayTemp(locationWeather.temperature, temperatureUnit)}</span>
                  )}
                  {locationWeather.condition && (
                    <span className="opacity-75">· {locationWeather.condition}</span>
                  )}
                  {locationWeather.city && (
                    <span className="opacity-75">
                      · {locationWeather.city}{locationWeather.region ? `, ${locationWeather.region}` : ''}
                    </span>
                  )}
                </p>
              )}

              {/* Streak + entry count — shown once there are entries */}
              {totalEntries > 0 && (
                <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                  <span>Entry #{totalEntries + 1}</span>
                  {currentStreak >= 2 && (
                    <>
                      <span className="opacity-40">·</span>
                      <span>🔥 {currentStreak}-day streak</span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Editor card — violet glow on focus ── */}
          <div
            onFocus={() => setIsEditorFocused(true)}
            onBlur={() => setIsEditorFocused(false)}
            className={`flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900 rounded-2xl px-8 pt-5 pb-8 transition-all duration-300 relative ${
              isEditorFocused
                ? 'shadow-lg shadow-violet-500/10 ring-1 ring-violet-500/10'
                : 'shadow-sm'
            } ${distractionFree ? 'rounded-none shadow-none ring-0 px-12 pt-10' : ''}`}
          >
            {/* ── Card header: Mood picker + Privacy segmented control ── */}
            {/* Collapses in distraction-free mode */}
            <div
              className={`transition-all duration-500 overflow-hidden flex-shrink-0 ${
                distractionFree ? 'max-h-0 opacity-0 mb-0' : 'max-h-24 opacity-100'
              }`}
            >
              <div
                className={`flex items-center justify-between mb-5 pb-4 border-b transition-colors duration-500 ${headerBorderColor}`}
              >
                {/* Mood picker */}
                <div className="flex items-center gap-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
                    Mood
                  </span>
                  <div className="flex items-center gap-2">
                    {([1, 2, 3, 4, 5] as MoodLevel[]).map((level) => {
                      const isActive = level === mood;
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => { setMood(level); setMoodIsAuto(false); }}
                          title={`${MOOD_OPTIONS[level - 1].emoji} ${MOOD_OPTIONS[level - 1].label}`}
                          className={`rounded-full transition-all duration-300 flex-shrink-0 ${
                            isActive
                              ? `w-4 h-4 ${DOT_COLORS[level]} shadow-sm ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 ${RING_COLORS[level]} ${moodPulse ? 'animate-mood-pop' : ''}`
                              : isScanning
                                ? 'w-2.5 h-2.5 bg-slate-200 dark:bg-slate-700 animate-pulse-soft'
                                : 'w-2.5 h-2.5 bg-slate-200 dark:bg-slate-700 hover:scale-125'
                          }`}
                        />
                      );
                    })}
                  </div>

                  {/* Auto-detected emoji + indicator */}
                  {mood !== null && (
                    <button
                      type="button"
                      title={moodIsAuto ? 'Auto-detected from your writing' : 'Mood set manually — click to re-enable auto'}
                      onClick={() => { if (!moodIsAuto) handleResetMoodToAuto(); }}
                      className={`flex items-center gap-0.5 text-sm leading-none ${moodIsAuto ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      {MOOD_OPTIONS[mood - 1].emoji}
                      {moodIsAuto ? (
                        <span className="text-[10px] text-violet-400 dark:text-violet-500">✦</span>
                      ) : (
                        <span className="text-[10px] text-slate-300 dark:text-slate-600 hover:text-violet-400 dark:hover:text-violet-500 transition-colors">🔒</span>
                      )}
                    </button>
                  )}

                  {/* Scanning indicator */}
                  {isScanning && (
                    <span className="text-[10px] text-slate-300 dark:text-slate-600 animate-pulse-soft select-none">
                      scanning…
                    </span>
                  )}
                </div>

                {/* Book indicator (only shown for new entries when multiple books exist) */}
                {isNewEntry && activeBook && books.length > 1 && (
                  <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                    <span>{activeBook.emoji}</span>
                    <span className="hidden sm:inline">{activeBook.name}</span>
                  </span>
                )}

                {/* Right cluster: privacy + save indicator + options menu */}
                <div className="flex items-center gap-1.5">
                  {/* Save indicator — inline with header */}
                  <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 min-w-[60px] justify-end">
                    {isSaving ? (
                      <>
                        <span className="w-2.5 h-2.5 border-[1.5px] border-slate-300 dark:border-slate-600 border-t-violet-500 rounded-full animate-spin" />
                        <span>Saving…</span>
                      </>
                    ) : showCheckmark ? (
                      <span className="flex items-center gap-1 animate-fade-in">
                        <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <span>Saved</span>
                      </span>
                    ) : savedAgoText ? (
                      <span className="hidden sm:inline">{savedAgoText}</span>
                    ) : null}
                  </span>

                  {/* Privacy segmented control */}
                  <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                    {([0, 1, 2] as PrivacyMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPrivacyMode(mode)}
                        title={PRIVACY_MODE_DESCRIPTIONS[mode]}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                          privacyMode === mode
                            ? `bg-white dark:bg-slate-700 shadow-sm ${PRIVACY_ACTIVE_COLORS[mode]}`
                            : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                        }`}
                      >
                        {PRIVACY_ICONS[mode]}
                        <span>{PRIVACY_MODE_LABELS[mode]}</span>
                      </button>
                    ))}
                  </div>

                  {/* Three-dot entry options menu */}
                  <EntryOptionsMenu
                    entry={savedEntry}
                    wordCount={wordCount}
                    charCount={charCount}
                    onDelete={savedEntry ? async () => {
                      await deleteEntry(savedEntry.id);
                      onEntrySaved?.();
                    } : undefined}
                    onPinToggle={(pinned) => {
                      if (savedEntry) setSavedEntry({ ...savedEntry, pinned });
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Title input — collapses in distraction-free mode */}
            <div
              className={`transition-all duration-500 overflow-hidden flex-shrink-0 ${
                distractionFree ? 'max-h-0 opacity-0' : 'max-h-24 opacity-100'
              }`}
            >
              <input
                type="text"
                value={title}
                onChange={handleTitleChange}
                placeholder="Title (optional)"
                className="
                  w-full text-2xl font-medium
                  bg-transparent border-none outline-none
                  focus-visible:ring-0 focus-visible:ring-offset-0
                  text-slate-600 dark:text-slate-300
                  placeholder:text-slate-300 dark:placeholder:text-slate-600
                  mb-1
                "
              />
              {/* Weather chip for existing entries — new entries show chip in heading block above */}
              {entryId && locationWeather ? (
                <p className="flex items-center gap-1 mb-5 text-xs text-slate-400 dark:text-slate-500">
                  <span>{getWeatherEmoji(locationWeather.weatherCode)}</span>
                  {locationWeather.temperature !== undefined && (
                    <span>{displayTemp(locationWeather.temperature, temperatureUnit)}</span>
                  )}
                  {locationWeather.condition && (
                    <span className="opacity-75">· {locationWeather.condition}</span>
                  )}
                  {locationWeather.city && (
                    <span className="opacity-75">
                      · {locationWeather.city}{locationWeather.region ? `, ${locationWeather.region}` : ''}
                    </span>
                  )}
                </p>
              ) : (
                <div className="mb-5" />
              )}
            </div>

            {/* Rich text editor */}
            <RichTextEditor
              value={content}
              onChange={handleContentChange}
              autoFocus={!entryId}
              className="flex-1 min-h-0"
              onNavigateToSTTSettings={onNavigateToSTTSettings}
              insertText={pendingInsert}
              onInsertTextConsumed={() => setPendingInsert(null)}
              distractionFree={distractionFree}
            />

            {/* ── Blank-page prompts CTA — fades away as user writes ── */}
            {isNewEntry && showPrompts && !distractionFree && (
              <div
                className={`absolute inset-0 flex items-end justify-center pb-16 rounded-2xl transition-all duration-500 pointer-events-none ${
                  isEditorEmpty ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <div className="pointer-events-auto flex flex-col items-center gap-3 text-center">
                  <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center text-violet-400 dark:text-violet-500">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400 dark:text-slate-500">Not sure what to write?</p>
                    <button
                      type="button"
                      onClick={() => setDrawerOpen(true)}
                      className="mt-1 text-sm font-medium text-violet-500 dark:text-violet-400 hover:text-violet-600 dark:hover:text-violet-300 transition-colors"
                    >
                      Browse writing prompts →
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Bottom status bar — centered E2E badge only ── */}
          <div
            className={`flex items-center justify-center mt-3 px-1 text-xs text-slate-400 dark:text-slate-500 transition-all duration-700 ${
              distractionFree ? 'opacity-0 pointer-events-none' : inFlow ? 'opacity-25' : 'opacity-100'
            }`}
          >
            <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            <span>🔒 End-to-End Encrypted</span>
          </div>
        </div>
      </div>

      {/* Prompt drawer — slide-up panel, only for new entries */}
      {isNewEntry && showPrompts && (
        <PromptDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          forYouPrompts={forYouPrompts}
          generalPrompts={generalPrompts}
          healthPrompts={healthPrompts}
          isLoading={promptsLoading}
          isAIEnabled={isAIEnabled}
          onUsePrompt={handleUsePrompt}
          onRefresh={refreshPrompts}
          onDisablePrompts={() => setShowPrompts(false)}
          onUseTemplate={handleUseTemplate}
          usedTemplateIds={usedTemplateIds}
        />
      )}
    </div>
  );
}
