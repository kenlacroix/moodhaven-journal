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

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { saveEntry, getEntryById, patchEntryLocationWeather, deleteEntry, getBookTags } from '../lib/services/journalService';
import { listActivities, syncEntryActivities, getEntryActivities, createActivity, deleteActivity } from '../lib/services/activityService';
import { ActivityPicker } from '../components/journal/ActivityPicker';
import type { Activity } from '../types/activities';
import { captureLocationWeather, getWeatherEmoji, displayTemp } from '../lib/services/locationWeatherService';
import { getGreeting } from '../lib/utils/dateUtils';
import { getReadingTime, didHitMilestone } from '../lib/utils/writingUtils';
import { extractHashtags } from '../lib/utils/markdownUtils';
import { pickAndAttachMedia, listEntryMedia, openMedia, deleteMedia, getMediaThumbnail } from '../lib/services/mediaService';
import { RichTextEditor } from '../components/editor';
import { AppearanceDrawer } from '../components/writing/AppearanceDrawer';
import type { Editor } from '@tiptap/react';
import { PromptDrawer } from '../components/ai/PromptDrawer';
import { EntryOptionsMenu } from '../components/journal/EntryOptionsMenu';
import { MediaAttachmentStrip } from '../components/journal/MediaAttachmentStrip';
import { TagManagerModal } from '../components/journal/TagManagerModal';
import { useJournalPrompts } from '../hooks/useJournalPrompts';
import { useSettingsStore } from '../stores/settingsStore';
import { useAppStore } from '../stores/appStore';
import { useBooksStore } from '../stores/booksStore';
import { scoreContentMood } from '../lib/utils/metadataExtractor';
import { getStreakStats, getOverallStats } from '../lib/services/analyticsService';
import type { JournalEntry, LocationWeather, MoodLevel, PrivacyMode, MediaAttachment } from '../types/journal';
import { MOOD_OPTIONS, PRIVACY_MODE_LABELS, PRIVACY_MODE_DESCRIPTIONS } from '../types/journal';
import type { JournalTemplate } from '../lib/utils/journalTemplates';
import { formatTemplateContent } from '../lib/utils/journalTemplates';
import { usePlatform } from '../hooks/usePlatform';
import { useIsMobile } from '../hooks/useIsMobile';
import { logger } from '../lib/services/logger';
import { useWearVoiceMemos } from '../hooks/useWearVoiceMemos';
import type { VoiceMemo } from '../lib/services/voiceMemoService';
import { deleteVoiceMemo } from '../lib/services/voiceMemoService';
import { useWellbeingContext } from '../hooks/useWellbeingContext';
import { WellbeingCard } from '../components/wellbeing/WellbeingCard';

interface WritingViewProps {
  entryId?: string | null;
  onEntrySaved?: () => void;
  onNewEntry?: () => void;
  onNavigateToSTTSettings?: () => void;
  /** Pre-filled HTML injected once on mount (e.g. StillHaven handoff). */
  initialHtml?: string | null;
  /** Called after initialHtml has been consumed so the parent can clear it. */
  onInitialHtmlConsumed?: () => void;
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

export function WritingView({ entryId, onEntrySaved, onNewEntry: _onNewEntry, onNavigateToSTTSettings, initialHtml, onInitialHtmlConsumed, saveRef }: WritingViewProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contentText, setContentText] = useState('');
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [lastSaveOk, setLastSaveOk] = useState(false);

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
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [pendingInsert, setPendingInsert] = useState<string | null>(null);
  const [pendingInsertHtml, setPendingInsertHtml] = useState<string | null>(null);

  // Seed from StillHaven handoff (fires once on mount when initialHtml is provided)
  useEffect(() => {
    if (initialHtml) {
      setPendingInsertHtml(initialHtml);
      onInitialHtmlConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const moodScoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Imperative save: always-fresh function re-assigned each render so it closes
  // over the latest state. saveRef.current (stable wrapper) delegates to this.
  const saveNowRef = useRef<(() => Promise<void>) | null>(null);
  /** Root div ref for Android — height is driven by visualViewport to stay above keyboard */
  const containerRef = useRef<HTMLDivElement>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  /** Ref to TipTap editor instance, populated via onEditorReady — used by Android formatting bar */
  const editorInstanceRef = useRef<Editor | null>(null);
  /** Whether the full mood picker is expanded (true) or collapsed to a badge (false) */
  const [moodPickerOpen, setMoodPickerOpen] = useState(!entryId);
  /** F5: keyboard shortcut cheatsheet modal */
  const [showShortcutCheatsheet, setShowShortcutCheatsheet] = useState(false);
  /** Streak badge animation flag — fires once on mount when streak >= 3 */
  const [streakAnimated, setStreakAnimated] = useState(false);
  /** Word-count milestone flash (Android) / glow (desktop) */
  const [wcFlash, setWcFlash] = useState(false);
  const [wcGlow, setWcGlow] = useState(false);
  const prevWcRef = useRef(0);

  /** Save micro-animation — fires when isSaving flips true→false */
  const [saveJustCompleted, setSaveJustCompleted] = useState(false);
  const prevIsSavingRef = useRef(false);

  /** Focus exit hint — shown for 3s when distraction-free mode activates */
  const [showFocusHint, setShowFocusHint] = useState(false);

  const [savedEntry, setSavedEntry] = useState<JournalEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [appearanceDrawerOpen, setAppearanceDrawerOpen] = useState(false);
  const appearanceToggleRef = useRef<HTMLButtonElement | null>(null);
  const [pulseAppearanceHint, setPulseAppearanceHint] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [usedTemplateIds, setUsedTemplateIds] = useState<string[]>(() => getUsedTemplates());
  const setShowPrompts = useSettingsStore((s) => s.setShowPrompts);
  const showPrompts = useSettingsStore((s) => s.settings.journal.showPrompts);
  const distractionFree = useSettingsStore((s) => s.distractionFree);
  const writingAppearance = useSettingsStore((s) => s.settings.appearance.writing);
  const { isAndroid, isBrowser } = usePlatform();
  const isMobileViewport = useIsMobile();
  const isMobile = isAndroid || isMobileViewport;
  const setDistractionFree = useSettingsStore((s) => s.setDistractionFree);
  const hasSeenWritingDrawerHint = useSettingsStore((s) => s.settings.tutorial.hasSeenWritingDrawerHint);
  const setHasSeenWritingDrawerHint = useSettingsStore((s) => s.setHasSeenWritingDrawerHint);
  const sttModel = useSettingsStore((s) => s.settings.speechToText.model);
  const sttEnabled = useSettingsStore((s) => s.settings.speechToText.enabled);

  const wellbeing = useWellbeingContext();

  // D-003: voice memos from watch companion (desktop only)
  const { memos: watchMemos, transcribing: memoTranscribing } = useWearVoiceMemos({
    model: sttModel,
    enabled: !isBrowser && !isAndroid && sttEnabled,
  });
  const autoLocationWeather = useSettingsStore((s) => s.settings.journal.autoLocationWeather);
  const autoTitle = useSettingsStore((s) => s.settings.journal.autoTitle ?? false);
  const temperatureUnit = useSettingsStore((s) => s.settings.journal.temperatureUnit ?? 'C');
  /** Whether the user has typed a title themselves (disables auto-title for this entry) */
  const userTypedTitleRef = useRef(false);

  const sessionPassword = useAppStore((s) => s.sessionPassword);

  // Media attachments
  const [attachments, setAttachments] = useState<MediaAttachment[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [isAttaching, setIsAttaching] = useState(false);

  const activeBookId = useBooksStore((s) => s.activeBookId);
  const books = useBooksStore((s) => s.books);
  const activeBook = books.find((b) => b.id === (activeBookId ?? 'default')) ?? books[0];

  // Previously-used tags for this book (for the tag suggestion strip)
  const [bookTags, setBookTags] = useState<string[]>([]);
  useEffect(() => {
    getBookTags(activeBookId ?? 'default').then(setBookTags).catch(() => {});
  }, [activeBookId]);

  // Activities
  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
  useEffect(() => {
    listActivities().then((acts) => setAllActivities(acts ?? [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (entryId) {
      getEntryActivities(entryId).then((acts) => setSelectedActivityIds(acts.map((a) => a.id))).catch(() => {});
    } else {
      setSelectedActivityIds([]);
    }
  }, [entryId]);

  // Weather / location context captured in background on mount
  const locationWeatherRef = useRef<LocationWeather | null>(null);
  const [locationWeather, setLocationWeather] = useState<LocationWeather | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  const isNewEntry = !entryId;
  const isEditorEmpty = !contentText.trim();
  const wordCount = contentText.trim() ? contentText.trim().split(/\s+/).length : 0;
  const charCount = contentText.length;
  /** Reading time shown at ≥200 words; null below that threshold */
  const readingTime = getReadingTime(wordCount);
  /** Heading + subtle UI dims once user is in writing flow */
  const inFlow = wordCount >= 20;
  /** Scanning state: user has started writing but not enough words for mood detection */
  const isScanning = moodIsAuto && mood === null && wordCount > 0 && wordCount < 5;
  /** Inline tag chips — memoized to avoid re-running 6 regexes on every keystroke */
  const entryTags = useMemo(() => extractHashtags(content), [content]);

  const greeting = getGreeting(now.getHours(), now);
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
          logger.error('Failed to patch location weather:', { error: String(err) });
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

  // Keyboard shortcuts (F5):
  //   Ctrl/Cmd+Shift+F — toggle distraction-free mode
  //   Ctrl/Cmd+,       — open writing appearance drawer
  //   1–5              — set mood (only when editor is not focused)
  //   ?                — open shortcut cheatsheet (only when editor is not focused)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setDistractionFree(!distractionFree);
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === ',') {
        e.preventDefault();
        setAppearanceDrawerOpen((v) => !v);
      }
      if (e.key === 'Escape' && distractionFree) {
        e.preventDefault();
        setDistractionFree(false);
      }
      // Don't intercept 1–5 or ? when the user is typing in the editor or any input
      const target = e.target as HTMLElement;
      const isTyping = target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      if (!isTyping && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === '?' || e.key === '/') {
          e.preventDefault();
          setShowShortcutCheatsheet((v) => !v);
        }
        if (['1', '2', '3', '4', '5'].includes(e.key)) {
          e.preventDefault();
          const level = parseInt(e.key, 10) as MoodLevel;
          setMood(level);
          setMoodIsAuto(false);
          setMoodPulse(true);
          setTimeout(() => setMoodPulse(false), 900);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [distractionFree, setDistractionFree]);

  // First-visit discoverability pulse for the appearance toggle.
  // Writes the flag immediately (optimistic) so the pulse never re-fires
  // if the user closes the app mid-animation. Reset via Factory Reset.
  useEffect(() => {
    if (hasSeenWritingDrawerHint) return;
    setPulseAppearanceHint(true);
    setHasSeenWritingDrawerHint(true);
    const t = setTimeout(() => setPulseAppearanceHint(false), 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only — intentional

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

  // Load media attachments for existing entries
  useEffect(() => {
    if (entryId) {
      listEntryMedia(entryId).then(setAttachments).catch(() => {});
    }
  }, [entryId]);

  // Fetch image thumbnails whenever attachments list changes
  useEffect(() => {
    if (!sessionPassword || attachments.length === 0) return;
    for (const a of attachments) {
      if (a.mimeType.startsWith('image/') && !thumbnails[a.id]) {
        getMediaThumbnail(a.id, sessionPassword).then((url) => {
          if (url) setThumbnails((prev) => ({ ...prev, [a.id]: url }));
        }).catch(() => {});
      }
    }
  // thumbnails intentionally excluded — we only want to run when attachments list changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments, sessionPassword]);

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
      setAttachments([]);
      setThumbnails({});
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
          savedEntryIdRef.current = saved.id;
          setSavedEntry(saved);
          setLastSavedAt(new Date());
          setLastSaveOk(true);
          onEntrySaved?.();
        })
        .catch((err) => {
          logger.error('Auto-save failed:', { error: String(err) });
          setLastSaveOk(false);
        })
        .finally(() => { setIsSaving(false); });
    }, 2000);
  // `mood` and `content` are intentionally included: a mood auto-detection or
  // format change after the last keystroke should still be reflected in the save.
  }, [content, contentText, wordCount, title, mood, privacyMode, autoTitle, activeBookId, onEntrySaved]);

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
    setPendingInsertHtml(formatTemplateContent(template));
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

  // Media attachment handlers
  const handleAttach = useCallback(async () => {
    if (!savedEntryIdRef.current || !sessionPassword) return;
    setIsAttaching(true);
    try {
      const { attached, skipped } = await pickAndAttachMedia(savedEntryIdRef.current, sessionPassword);
      if (attached.length > 0) setAttachments((prev) => [...prev, ...attached]);
      if (skipped.length > 0) logger.warn('Skipped attachments', { count: skipped.length });
    } catch (err) {
      logger.error('Attach failed:', { error: String(err) });
    } finally {
      setIsAttaching(false);
    }
  }, [sessionPassword]);

  const handleOpenMedia = useCallback(async (mediaId: string) => {
    if (!sessionPassword) return;
    try {
      await openMedia(mediaId, sessionPassword);
    } catch (err) {
      logger.error('Open media failed:', { error: String(err) });
    }
  }, [sessionPassword]);

  const handleDeleteMedia = useCallback(async (mediaId: string) => {
    try {
      await deleteMedia(mediaId);
      setAttachments((prev) => prev.filter((a) => a.id !== mediaId));
      setThumbnails((prev) => {
        const next = { ...prev };
        delete next[mediaId];
        return next;
      });
    } catch (err) {
      logger.error('Delete media failed:', { error: String(err) });
    }
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
      syncEntryActivities(saved.id, selectedActivityIds).catch(() => {});
    } finally {
      setIsSaving(false);
    }
  };

  // Wire the stable external ref to the always-fresh saveNowRef (runs once on mount).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (saveRef) saveRef.current = () => saveNowRef.current!();
  }, [saveRef]);

  // ── Android: track visualViewport height to keep layout above soft keyboard ──
  // visualViewport.height excludes the on-screen keyboard; window.innerHeight does not.
  // We set the container's height explicitly so the flexbox always fills exactly the
  // visible area, meaning the editor stays just above the toolbar/keyboard.
  useEffect(() => {
    if (!isAndroid) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const vh = Math.round(vv.height);
      if (containerRef.current) containerRef.current.style.height = `${vh}px`;
      // Keyboard is considered visible when it reduces the viewport by >150px
      setKeyboardVisible(window.innerHeight - vh > 150);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [isAndroid]);

  // ── Android: mood picker auto-collapse ──────────────────────────────────────
  useEffect(() => {
    if (mood !== null) setMoodPickerOpen(false);
  }, [mood]);

  // ── Android: streak badge animation on mount ─────────────────────────────────
  useEffect(() => {
    if (!isAndroid || currentStreak < 3) return;
    const t = setTimeout(() => setStreakAnimated(true), 400);
    return () => clearTimeout(t);
  }, [isAndroid, currentStreak]);

  // Collapse wellbeing card when user starts writing (5-word threshold)
  useEffect(() => {
    wellbeing.onWordsWritten(wordCount);
  }, [wordCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Word count milestone — flash (Android) / violet glow (desktop) ──────────
  useEffect(() => {
    const hit = didHitMilestone(prevWcRef.current, wordCount);
    prevWcRef.current = wordCount;
    if (!hit) return;
    if (isAndroid) {
      setWcFlash(true);
      try { navigator.vibrate?.(30); } catch { /* ignore */ }
      const t = setTimeout(() => setWcFlash(false), 800);
      return () => clearTimeout(t);
    } else {
      setWcGlow(true);
      const t = setTimeout(() => setWcGlow(false), 900);
      return () => clearTimeout(t);
    }
  }, [wordCount, isAndroid]);

  // ── Save micro-animation — fires when isSaving flips true → false ────────────
  useEffect(() => {
    if (prevIsSavingRef.current && !isSaving && lastSavedAt && lastSaveOk) {
      setSaveJustCompleted(true);
      const t = setTimeout(() => setSaveJustCompleted(false), 400);
      prevIsSavingRef.current = isSaving;
      return () => clearTimeout(t);
    }
    prevIsSavingRef.current = isSaving;
  }, [isSaving, lastSavedAt, lastSaveOk]);

  // ── Focus mode exit hint — shown 3s when distraction-free activates ──────────
  useEffect(() => {
    if (!distractionFree) {
      setShowFocusHint(false);
      return;
    }
    setShowFocusHint(true);
    const t = setTimeout(() => setShowFocusHint(false), 3000);
    return () => clearTimeout(t);
  }, [distractionFree]);

  // ── Android: haptic feedback helper ─────────────────────────────────────────
  const haptic = useCallback((ms: number) => {
    try { if ('vibrate' in navigator) navigator.vibrate(ms); } catch { /* ignore */ }
  }, []);

  // ── Android: Done — flush pending auto-save then navigate away ───────────────
  const handleDone = useCallback(async () => {
    haptic(15);
    await saveNowRef.current?.();
    onEntrySaved?.();
  }, [haptic, onEntrySaved]);

  // ── Android: mood-aware editor placeholder ───────────────────────────────────
  const MOOD_PLACEHOLDERS: Record<MoodLevel, string> = {
    1: "How are you really feeling? It's okay to let it out…",
    2: "What's weighing on you? You don't have to carry it alone…",
    3: "What's on your mind today?",
    4: "What are you grateful for today?",
    5: "What made today special? Capture this moment…",
  };
  const editorPlaceholder = mood
    ? MOOD_PLACEHOLDERS[mood]
    : "How was your day? What's on your mind?";

  // ── Android: background class changes with selected mood ─────────────────────
  const moodBgClass = mood ? `android-mood-bg-${mood}` : 'android-mood-bg';

  // ── Mobile (Android) layout ──────────────────────────────────────────────────
  // Layout: collapsible metadata (top) → title (pinned) → editor (flex-1) → toolbar (bottom)
  // When the soft keyboard opens, visualViewport shrinks the container height and
  // keyboardVisible=true collapses the metadata section, so the editor stays visible
  // just above the keyboard.
  if (isMobile) {
    const promptText = forYouPrompts[0]?.text ?? generalPrompts[0]?.text ?? null;
    return (
      <div
        ref={containerRef}
        data-writing-prefs
        data-writing-reduced-motion={writingAppearance.reducedMotion === 'on' ? 'true' : 'false'}
        className={`flex flex-col transition-colors duration-500 ${moodBgClass}`}
        style={{ height: '100%' }}
      >

        {/* ── Header bar ─────────────────────────────────────────────────────────
             Back arrow · streak counter · privacy icon · entry options         */}
        <div className="flex-shrink-0 flex items-center justify-between px-3 pt-3 pb-1">
          {/* Back / done */}
          <button
            onClick={handleDone}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 active:bg-black/5 dark:active:bg-white/10 active:scale-95 transition-all"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m7-7l-7 7 7 7" />
            </svg>
          </button>

          {/* Right controls */}
          <div className="flex items-center gap-1.5">
            {/* Streak badge */}
            {currentStreak >= 1 && (
              <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-orange-100/80 dark:bg-orange-900/30 ${streakAnimated ? 'streak-glow' : ''}`}>
                <span className="text-sm">🔥</span>
                <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{currentStreak}</span>
              </div>
            )}

            {/* Privacy icon — tapping cycles Open → Mindful → Private */}
            <button
              onClick={() => { setPrivacyMode(((privacyMode + 1) % 3) as PrivacyMode); haptic(8); }}
              title={PRIVACY_MODE_DESCRIPTIONS[privacyMode]}
              className={`w-9 h-9 flex items-center justify-center rounded-xl active:bg-black/5 dark:active:bg-white/10 active:scale-95 transition-all ${PRIVACY_ACTIVE_COLORS[privacyMode]}`}
            >
              {PRIVACY_ICONS[privacyMode]}
            </button>

            {/* Entry options (existing entries only) */}
            {!isNewEntry && savedEntry && (
              <EntryOptionsMenu
                entry={savedEntry}
                wordCount={wordCount}
                charCount={charCount}
                onDelete={async () => {
                  await deleteEntry(savedEntry.id);
                  _onNewEntry?.();
                }}
              />
            )}
          </div>
        </div>

        {/* ── Collapsible metadata ────────────────────────────────────────────────
             Slides up when keyboard opens. Contains greeting/date and mood.    */}
        <div className={`flex-shrink-0 overflow-hidden transition-all duration-250 ease-in-out ${
          keyboardVisible ? 'max-h-0' : 'max-h-[340px]'
        }`}>
          {/* Greeting + date + weather */}
          <div className="px-5 pt-2 pb-3">
            {isNewEntry ? (
              <>
                <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 tracking-tight">
                  {greeting}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {formattedDate}
                </p>
                {locationWeather && (
                  <p className="flex items-center gap-1.5 mt-1 text-xs text-slate-400 dark:text-slate-500">
                    <span>{getWeatherEmoji(locationWeather.weatherCode)}</span>
                    {locationWeather.temperature !== undefined && (
                      <span>{displayTemp(locationWeather.temperature, temperatureUnit)}</span>
                    )}
                    {locationWeather.city && <span className="opacity-70">· {locationWeather.city}</span>}
                  </p>
                )}
                {books.length > 1 && activeBook && (
                  <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                    {activeBook.emoji} {activeBook.name}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Editing entry
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{formattedDate}</p>
              </>
            )}
          </div>

          {/* Mood — full picker or collapsed badge */}
          <div className="px-5 pb-4">
            {moodPickerOpen ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                  How are you feeling?
                </p>
                <div className="flex items-end justify-between">
                  {([1, 2, 3, 4, 5] as MoodLevel[]).map((level) => {
                    const opt = MOOD_OPTIONS[level - 1];
                    return (
                      <button
                        key={level}
                        onClick={() => {
                          setMood(level);
                          setMoodIsAuto(false);
                          setMoodPickerOpen(false);
                          haptic(10);
                        }}
                        className="flex flex-col items-center gap-1.5 active:scale-90 transition-transform duration-150"
                      >
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl bg-white/60 dark:bg-white/10 shadow-sm">
                          {opt.emoji}
                        </div>
                        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Collapsed mood badge — tap to re-open picker */
              <button
                onClick={() => { setMoodPickerOpen(true); haptic(8); }}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/60 dark:bg-white/10 shadow-sm active:scale-95 transition-all duration-150"
              >
                <span className="text-xl">{mood !== null ? MOOD_OPTIONS[mood - 1].emoji : '○'}</span>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {mood !== null ? MOOD_OPTIONS[mood - 1].label : 'Set mood'}
                </span>
                {moodIsAuto && mood !== null && (
                  <span className="text-[10px] text-violet-400 dark:text-violet-500">✦</span>
                )}
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* ── Writing area ────────────────────────────────────────────────────────
             Title pinned above editor. Editor is flex-1 with a minimum height
             so it always shows above the keyboard/toolbar.                     */}
        <div className="flex-1 flex flex-col min-h-0 border-t border-black/5 dark:border-white/5">
          {/* Title */}
          <div className="flex-shrink-0 px-5 pt-3 pb-1">
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              placeholder="Title (optional)"
              className="w-full text-xl font-semibold bg-transparent text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-600 outline-none border-none"
            />
          </div>

          {/* Recent tag chips — quick insert, hidden while keyboard is open */}
          {bookTags.length > 0 && !keyboardVisible && (
            <div className="flex-shrink-0 overflow-x-auto scrollbar-hide px-5 pb-2">
              <div className="flex items-center gap-1.5 flex-nowrap">
                {bookTags.slice(0, 10).map((tag) => (
                  <button
                    key={tag}
                    onClick={() => { setPendingInsert(` #${tag}`); haptic(8); }}
                    className="flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100/70 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 active:scale-95 transition-transform"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Editor — serif, mood-aware placeholder */}
          <div
            className="flex-1 min-h-0 px-5 pb-2 overflow-auto android-writing"
            style={{ minHeight: '180px' }}
          >
            <RichTextEditor
              value={content}
              onChange={handleContentChange}
              insertText={pendingInsert}
              insertHtml={pendingInsertHtml}
              onInsertTextConsumed={() => { setPendingInsert(null); setPendingInsertHtml(null); }}
              placeholder={editorPlaceholder}
              autoFocus={!entryId}
              className="min-h-full"
              onNavigateToSTTSettings={onNavigateToSTTSettings}
              onEditorReady={(ed) => { editorInstanceRef.current = ed; }}
            />
          </div>
        </div>

        {/* Media strip */}
        {attachments.length > 0 && (
          <div className="flex-shrink-0 px-5">
            <MediaAttachmentStrip
              attachments={attachments}
              thumbnails={thumbnails}
              onOpen={handleOpenMedia}
              onDelete={handleDeleteMedia}
            />
          </div>
        )}

        {/* ── Action bar ──────────────────────────────────────────────────────────
             Keyboard open  → formatting tools (B / I / list) + Done
             Keyboard closed → attach + tags + prompts + word count + Done      */}
        <div
          className="flex-shrink-0 border-t border-black/5 dark:border-white/5 bg-white/50 dark:bg-black/20 backdrop-blur-sm"
          style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center gap-1 px-3 py-2">
            {keyboardVisible ? (
              /* Formatting mini-toolbar when keyboard is open */
              <>
                <button
                  onMouseDown={(e) => { e.preventDefault(); editorInstanceRef.current?.chain().focus().toggleBold().run(); }}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 font-bold text-sm active:bg-black/8 active:scale-95 transition-all"
                  title="Bold"
                >B</button>
                <button
                  onMouseDown={(e) => { e.preventDefault(); editorInstanceRef.current?.chain().focus().toggleItalic().run(); }}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 italic text-sm active:bg-black/8 active:scale-95 transition-all"
                  title="Italic"
                >I</button>
                <button
                  onMouseDown={(e) => { e.preventDefault(); editorInstanceRef.current?.chain().focus().toggleBulletList().run(); }}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 active:bg-black/8 active:scale-95 transition-all"
                  title="Bullet list"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                  </svg>
                </button>
                <div className="flex-1" />
                {wordCount > 0 && (
                  <span className={`text-xs mr-2 transition-colors duration-300 ${
                    wcFlash ? 'wc-flash text-emerald-500 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                  }`}>
                    {wordCount}w
                  </span>
                )}
                <button
                  onClick={handleDone}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 text-white text-sm font-semibold shadow-sm active:scale-95 active:opacity-90 transition-all duration-150"
                >
                  Done
                </button>
              </>
            ) : (
              /* Default toolbar when keyboard is dismissed */
              <>
                <button
                  onClick={handleAttach}
                  disabled={!savedEntryIdRef.current || !sessionPassword}
                  title="Attach"
                  className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 disabled:opacity-30 active:bg-black/5 active:scale-95 transition-all"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                  </svg>
                </button>

                <button
                  onClick={() => { setTagManagerOpen(true); haptic(8); }}
                  title="Tags"
                  className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 active:bg-black/5 active:scale-95 transition-all"
                >
                  <span className="text-base font-bold">#</span>
                </button>

                {isNewEntry && showPrompts && (
                  <button
                    onClick={() => { setDrawerOpen(true); haptic(8); }}
                    title="Writing prompts"
                    className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 active:bg-black/5 active:scale-95 transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1M6.343 6.343l-.707-.707M3 12H2m19 0h-1M6.343 17.657l-.707.707M17.657 6.343l.707-.707M16.5 12a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                    </svg>
                  </button>
                )}

                <div className="flex-1" />

                {/* Save status + word count combined */}
                {wordCount > 0 && (
                  <span className={`text-xs mr-2 transition-colors duration-300 ${
                    wcFlash
                      ? 'text-emerald-500 dark:text-emerald-400'
                      : isSaving
                        ? 'text-violet-400 dark:text-violet-500'
                        : lastSavedAt
                          ? 'text-emerald-500 dark:text-emerald-400'
                          : 'text-slate-400 dark:text-slate-500'
                  }`}>
                    {wcFlash
                      ? `${wordCount}w ✦`
                      : isSaving
                        ? 'Saving…'
                        : lastSavedAt
                          ? `${wordCount}w · ✓`
                          : `${wordCount}w`}
                  </span>
                )}

                <button
                  onClick={handleDone}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 text-white text-sm font-semibold shadow-sm active:scale-95 active:opacity-90 transition-all duration-150"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Prompt card ─────────────────────────────────────────────────────────
             Shown below the action bar when entry is empty and keyboard is
             dismissed. Gives new writers a starting nudge.                     */}
        {isNewEntry && isEditorEmpty && !keyboardVisible && promptText && (
          <div className="flex-shrink-0 px-4 pb-4">
            <div className="rounded-2xl bg-white/60 dark:bg-white/5 border border-black/5 dark:border-white/10 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-500 dark:text-violet-400 mb-1">
                    ✦ Today's prompt
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                    {promptText}
                  </p>
                </div>
                <button
                  onClick={() => {
                    const p = forYouPrompts[0] ?? generalPrompts[0];
                    if (p) { handleUsePrompt(p); haptic(10); }
                  }}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 text-xs font-semibold active:scale-95 transition-transform"
                >
                  Use
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modals */}
        {tagManagerOpen && (
          <TagManagerModal
            content={content}
            bookTags={bookTags}
            onInsertTag={(tag) => { setPendingInsert(` #${tag}`); haptic(8); }}
            onClose={() => setTagManagerOpen(false)}
          />
        )}
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

  // ── Desktop layout ────────────────────────────────────────────────────────────
  return (
    <div
      data-writing-prefs
      data-writing-font={writingAppearance.fontFamily}
      data-writing-size={writingAppearance.fontSize}
      data-writing-line-height={writingAppearance.lineHeight}
      data-writing-paragraph-spacing={writingAppearance.paragraphSpacing}
      data-writing-tint={writingAppearance.backgroundTint}
      data-writing-width={writingAppearance.writingWidth}
      data-writing-focus-mode={writingAppearance.focusMode ? 'true' : 'false'}
      data-writing-high-contrast={writingAppearance.highContrast ? 'true' : 'false'}
      data-writing-dyslexia={writingAppearance.dyslexiaProfile ? 'true' : 'false'}
      data-writing-reduced-motion={writingAppearance.reducedMotion === 'on' ? 'true' : 'false'}
      style={{ ['--mh-writing-text-scale' as string]: String(writingAppearance.textScale) }}
      className={`h-full flex flex-col transition-all duration-500 ${distractionFree ? 'focus-bg' : 'writing-bg'}`}
    >
      {/* Writing appearance drawer (Cmd/Ctrl+,) */}
      <button
        ref={appearanceToggleRef}
        type="button"
        onClick={() => setAppearanceDrawerOpen((v) => !v)}
        aria-label="Writing appearance"
        aria-expanded={appearanceDrawerOpen}
        aria-keyshortcuts="Meta+, Control+,"
        title="Writing appearance (⌘,)"
        className={`fixed top-3 right-3 z-30 p-2 rounded-lg bg-white/70 dark:bg-slate-900/70 backdrop-blur text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-white dark:hover:bg-slate-900 shadow-sm ring-1 ring-neutral-200 dark:ring-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${pulseAppearanceHint ? 'drawer-hint-pulse' : ''} ${distractionFree ? 'opacity-30 hover:opacity-100' : ''}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
        </svg>
      </button>
      <AppearanceDrawer
        open={appearanceDrawerOpen}
        onClose={() => setAppearanceDrawerOpen(false)}
        returnFocusTo={appearanceToggleRef.current}
      />

      <div className="flex-1 flex flex-col min-h-0 px-4 sm:px-8 lg:px-12 py-4 sm:py-7 lg:py-10">
        <div className="flex-1 flex flex-col w-full min-h-0 relative">

          {/* ── Heading block: greeting + date + streak (new entries only) ── */}
          {!entryId && (
            <div
              className={`mb-3 sm:mb-5 lg:mb-6 transition-all duration-700 ${
                inFlow ? 'opacity-25 pointer-events-none' : 'opacity-100'
              } ${distractionFree ? 'max-h-0 overflow-hidden opacity-0 mb-0 pointer-events-none' : ''}`}
            >
              {/* Time-aware greeting */}
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-light text-slate-700 dark:text-slate-300 tracking-tight mb-1">
                {greeting}
              </h1>

              {/* Date */}
              <p className="text-sm text-slate-400 dark:text-slate-500">
                {formattedDate}
              </p>

              {/* Weather + location chip — shimmer while loading */}
              {locationLoading && !locationWeather && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="weather-shimmer h-3 w-32 rounded-full" />
                </div>
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

          {/* ── Wellbeing context card — shown once per day, collapses on first write ── */}
          {wellbeing.isVisible && wellbeing.context && (
            <WellbeingCard context={wellbeing.context} />
          )}

          {/* ── Editor card — violet glow on focus ── */}
          <div
            onFocus={() => setIsEditorFocused(true)}
            onBlur={() => setIsEditorFocused(false)}
            className={`editor-surface flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900 rounded-2xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-5 pb-4 sm:pb-7 transition-all duration-300 relative ${
              isEditorFocused
                ? 'shadow-lg shadow-violet-500/10 ring-1 ring-violet-500/10'
                : 'shadow-sm'
            } ${distractionFree ? 'rounded-none shadow-none ring-0 sm:px-10 lg:px-14 pt-8 sm:pt-10' : ''}`}
          >
            {/* ── Card header: Mood picker + Privacy segmented control ── */}
            {/* Collapses in distraction-free mode */}
            <div
              className={`transition-all duration-500 overflow-hidden flex-shrink-0 ${
                distractionFree ? 'max-h-0 opacity-0 mb-0' : 'max-h-24 opacity-100'
              }`}
            >
              <div
                className={`flex items-center justify-between mb-3 sm:mb-5 pb-3 sm:pb-4 border-b transition-colors duration-500 ${headerBorderColor}`}
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

                {/* Right cluster: attach + tags + privacy + options menu */}
                <div className="flex items-center gap-1.5">
                  {/* Attach media button — disabled until entry is saved */}
                  <button
                    type="button"
                    onClick={handleAttach}
                    disabled={!savedEntryIdRef.current || !sessionPassword}
                    title={!savedEntryIdRef.current ? 'Write a few words first to enable attachments' : 'Attach files'}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400 dark:disabled:hover:text-slate-500"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                    </svg>
                    <span className="hidden sm:inline text-[11px]">Attach</span>
                  </button>

                  {/* Tag manager button */}
                  <button
                    type="button"
                    onClick={() => setTagManagerOpen(true)}
                    title="Manage tags"
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <span className="text-[11px] font-bold">#</span>
                    <span className="hidden sm:inline text-[11px]">Tags</span>
                  </button>

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
              {/* Inline tag chips — shown when entry has tags or after first save */}
              {(entryTags.length > 0 || !isNewEntry) && !distractionFree && (
                <div className="flex items-center flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 max-h-[52px] overflow-hidden">
                  {entryTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400"
                    >
                      #{tag}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setTagManagerOpen(true)}
                    className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 hover:text-violet-500 hover:border-violet-400 dark:hover:text-violet-400 dark:hover:border-violet-600 transition-colors"
                  >
                    + tag
                  </button>
                </div>
              )}
              {/* Activity picker — shown below tags once entry exists */}
              {!isNewEntry && !distractionFree && allActivities.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <ActivityPicker
                    activities={allActivities}
                    selectedIds={selectedActivityIds}
                    onToggle={(id) => {
                      const next = selectedActivityIds.includes(id)
                        ? selectedActivityIds.filter((x) => x !== id)
                        : [...selectedActivityIds, id];
                      setSelectedActivityIds(next);
                      if (savedEntryIdRef.current) {
                        syncEntryActivities(savedEntryIdRef.current, next).catch(() => {});
                      }
                    }}
                    onCreateCustom={async (name, emoji) => {
                      const act = await createActivity(name, emoji);
                      setAllActivities((prev) => [...prev, act].sort((a, b) => a.sortOrder - b.sortOrder));
                    }}
                    onDeleteCustom={async (id) => {
                      await deleteActivity(id);
                      setAllActivities((prev) => prev.filter((a) => a.id !== id));
                      setSelectedActivityIds((prev) => prev.filter((x) => x !== id));
                    }}
                  />
                </div>
              )}
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
                  w-full text-xl sm:text-2xl font-medium
                  bg-transparent border-none outline-none
                  focus-visible:ring-0 focus-visible:ring-offset-0
                  text-slate-600 dark:text-slate-300
                  placeholder:text-slate-300 dark:placeholder:text-slate-600
                  mb-1
                "
              />
              {/* Weather chip for existing entries — new entries show chip in heading block above */}
              {entryId && locationWeather ? (
                <p className="flex items-center gap-1 mb-3 sm:mb-5 text-xs text-slate-400 dark:text-slate-500">
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
                <div className="mb-3 sm:mb-5" />
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
              insertHtml={pendingInsertHtml}
              onInsertTextConsumed={() => { setPendingInsert(null); setPendingInsertHtml(null); }}
              distractionFree={distractionFree}
            />

            {/* Media attachment strip */}
            {!distractionFree && (
              <MediaAttachmentStrip
                attachments={attachments}
                thumbnails={thumbnails}
                onOpen={handleOpenMedia}
                onDelete={handleDeleteMedia}
                isAttaching={isAttaching}
              />
            )}

            {/* ── Prompts CTA — flow element below editor, fades when user writes ── */}
            {isNewEntry && showPrompts && !distractionFree && (
              <div
                className={`flex-shrink-0 transition-opacity duration-300 pt-3 pb-1 border-t border-slate-100 dark:border-slate-800 ${
                  isEditorEmpty ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-violet-500 dark:text-slate-500 dark:hover:text-violet-400 transition-colors"
                >
                  <span>💡</span>
                  <span>Not sure what to write?</span>
                  <span className="opacity-60">Browse writing prompts →</span>
                </button>
              </div>
            )}
          </div>

          {/* Tag manager modal */}
          {tagManagerOpen && (
            <TagManagerModal
              content={content}
              bookTags={bookTags}
              onInsertTag={(tag) => setPendingInsert(` #${tag}`)}
              onClose={() => setTagManagerOpen(false)}
            />
          )}

          {/* ── Bottom status bar: word count · reading time · E2E badge · save ── */}
          <div
            className={`flex items-center mt-2 sm:mt-3 px-1 text-xs text-slate-400 dark:text-slate-500 transition-all duration-700 ${
              distractionFree ? 'opacity-0 pointer-events-none' : inFlow ? 'opacity-25' : 'opacity-100'
            }`}
          >
            {/* Left: word count + reading time */}
            <div className="flex items-center gap-1.5 flex-1">
              {wordCount > 0 && (
                <>
                  <span className={`inline-block${wcGlow ? ' animate-wc-glow' : ''}`}>
                    {wordCount} {wordCount === 1 ? 'word' : 'words'}
                  </span>
                  {readingTime && (
                    <>
                      <span className="opacity-40">·</span>
                      <span>{readingTime}</span>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Center: E2E badge */}
            <div className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <span>🔒 End-to-End Encrypted</span>
            </div>

            {/* Right: save status */}
            <div className="flex items-center justify-end flex-1">
              {isSaving && (
                <span className="text-violet-400 dark:text-violet-500">Saving…</span>
              )}
              {!isSaving && lastSavedAt && lastSaveOk && (
                <span
                  className={`inline-block text-emerald-500 dark:text-emerald-400${saveJustCompleted ? ' animate-save-bloom' : ''}`}
                >
                  ✓ Saved
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Focus mode exit hint — fades in for 3s then disappears */}
      {distractionFree && (
        <div
          className={`fixed bottom-4 right-4 z-50 transition-opacity duration-500 ${
            showFocusHint ? 'opacity-60' : 'opacity-0 pointer-events-none'
          }`}
        >
          <span className="text-[11px] text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-slate-200/50 dark:border-slate-700/50">
            Press <kbd className="focus-hint-kbd">Esc</kbd> to exit focus
          </span>
        </div>
      )}

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

      {/* D-003: Watch voice memos panel — desktop only */}
      {!isBrowser && !isAndroid && (
        <WearVoiceMemoPanel
          memos={watchMemos}
          transcribing={memoTranscribing}
          onCreateEntry={(memo) => {
            if (memo.transcription) handleUsePrompt({ text: memo.transcription });
          }}
          onDelete={async (id) => {
            try { await deleteVoiceMemo(id); }
            catch (e) { logger.error('[WritingView] Failed to delete voice memo', { error: String(e) }); }
          }}
        />
      )}

      {/* F5: Keyboard shortcut cheatsheet */}
      {showShortcutCheatsheet && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setShowShortcutCheatsheet(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-5 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Keyboard Shortcuts</h3>
              <button
                type="button"
                onClick={() => setShowShortcutCheatsheet(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-2">
              {([
                ['1–5', 'Set mood level (when not typing)'],
                ['Ctrl+Shift+F', 'Toggle focus / distraction-free mode'],
                ['?', 'Show this cheatsheet'],
                ['Escape', 'Exit focus mode'],
              ] as [string, string][]).map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500 dark:text-slate-400">{desc}</span>
                  <kbd className="flex-shrink-0 px-2 py-0.5 text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-700">
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── D-003: Watch voice memos panel ────────────────────────────────────────────

function WearVoiceMemoPanel({
  memos,
  transcribing,
  onCreateEntry,
  onDelete,
}: {
  memos: VoiceMemo[];
  transcribing: Set<string>;
  onCreateEntry: (memo: VoiceMemo) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Only show when there are memos, or always show empty state as onboarding guide
  const hasMemos = memos.length > 0;

  // If no memos and collapsed, show a minimal hint (not the full panel)
  if (!hasMemos && collapsed) {
    return (
      <div className="px-4 sm:px-8 lg:px-12 pb-2">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
          Watch memos
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-8 lg:px-12 pb-4">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 overflow-hidden">
        {/* Panel header */}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Watch Memos</span>
            {hasMemos && (
              <span className="px-1.5 py-0.5 text-xs rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                {memos.length}
              </span>
            )}
          </div>
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Panel body */}
        {!collapsed && (
          <div className="border-t border-slate-100 dark:border-slate-700">
            {!hasMemos ? (
              /* Empty state — D-003 */
              <div className="px-4 py-6 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">No voice memos yet</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                  Record a memo on your Wear OS watch. It will appear here ready to transcribe and turn into a journal entry.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {memos.map((memo) => {
                  const isTranscribing = transcribing.has(memo.id);
                  const durationSec = Math.round(memo.duration_ms / 1000);
                  const mm = String(Math.floor(durationSec / 60)).padStart(2, '0');
                  const ss = String(durationSec % 60).padStart(2, '0');
                  return (
                    <div key={memo.id} className="px-4 py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {new Date(memo.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">{mm}:{ss}</span>
                        </div>
                        {isTranscribing ? (
                          <p className="text-xs text-violet-500 dark:text-violet-400 animate-pulse">Transcribing…</p>
                        ) : memo.transcription ? (
                          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{memo.transcription}</p>
                        ) : (
                          <p className="text-xs text-slate-400 dark:text-slate-500 italic">Awaiting transcription…</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {memo.transcription && !isTranscribing && (
                          <button
                            type="button"
                            onClick={() => onCreateEntry(memo)}
                            className="px-2 py-1 text-xs font-medium bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
                          >
                            Use
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            setDeleting(memo.id);
                            await onDelete(memo.id);
                            setDeleting(null);
                          }}
                          disabled={deleting === memo.id}
                          className="p-1 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors disabled:opacity-40"
                          aria-label="Delete memo"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
