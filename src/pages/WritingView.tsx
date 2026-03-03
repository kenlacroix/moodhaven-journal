/**
 * WritingView - Calm writing space (default view)
 *
 * Layout:
 * - Centered writing column (768px base, scales to 75% on large screens)
 * - Card header: Mood picker (5 dots) + Privacy segmented control (Open/Mindful/Private)
 * - Title field + Rich text body
 * - Blank-page prompts CTA: visible when editor is empty, fades as user writes
 * - Bottom status bar: E2E badge · word count · save indicator (all subtle)
 * - Slide-up PromptDrawer triggered by blank-page CTA (new entries only)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { saveEntry, getEntryById } from '../lib/journalService';
import { RichTextEditor } from '../components/editor';
import { PromptDrawer } from '../components/ai/PromptDrawer';
import { useJournalPrompts } from '../hooks/useJournalPrompts';
import { useSettingsStore } from '../stores/settingsStore';
import { scoreContentMood } from '../lib/metadataExtractor';
import type { MoodLevel, PrivacyMode } from '../types/journal';
import { MOOD_OPTIONS, PRIVACY_MODE_LABELS, PRIVACY_MODE_DESCRIPTIONS } from '../types/journal';

interface WritingViewProps {
  entryId?: string | null;
  onEntrySaved?: () => void;
  onNavigateToSTTSettings?: () => void;
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

export function WritingView({ entryId, onEntrySaved, onNavigateToSTTSettings }: WritingViewProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contentText, setContentText] = useState('');
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [savedAgoText, setSavedAgoText] = useState('');
  const [showCheckmark, setShowCheckmark] = useState(false);
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [pendingInsert, setPendingInsert] = useState<string | null>(null);

  // Mood auto-detection
  const [mood, setMood] = useState<MoodLevel | null>(null);
  const [moodIsAuto, setMoodIsAuto] = useState(true);
  const [moodPulse, setMoodPulse] = useState(false);
  const prevMoodRef = useRef<MoodLevel | null>(null);

  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const moodScoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const setShowPrompts = useSettingsStore((s) => s.setShowPrompts);
  const showPrompts = useSettingsStore((s) => s.settings.journal.showPrompts);

  const isNewEntry = !entryId;
  const isEditorEmpty = !contentText.trim();
  const wordCount = contentText.trim() ? contentText.trim().split(/\s+/).length : 0;

  const {
    forYouPrompts,
    generalPrompts,
    healthPrompts,
    nudge,
    isLoading: promptsLoading,
    isAIEnabled,
    refresh: refreshPrompts,
  } = useJournalPrompts(isNewEntry);

  // Load existing entry if editing
  useEffect(() => {
    if (entryId) {
      getEntryById(entryId).then((entry) => {
        if (entry) {
          setTitle(entry.title || '');
          setContent(entry.content);
          setContentText(entry.content);
          setPrivacyMode(entry.privacyMode ?? 0);
          if (entry.mood) { setMood(entry.mood); setMoodIsAuto(false); }
        }
      });
    }
  }, [entryId]);

  // Reset state when switching to a new entry
  useEffect(() => {
    if (isNewEntry) {
      setNudgeDismissed(false);
      setMood(null);
      setMoodIsAuto(true);
      prevMoodRef.current = null;
    }
  }, [isNewEntry]);

  // Pulse once when mood first auto-detected
  useEffect(() => {
    if (mood !== null && prevMoodRef.current === null && moodIsAuto) {
      setMoodPulse(true);
      const t = setTimeout(() => setMoodPulse(false), 1200);
      prevMoodRef.current = mood;
      return () => clearTimeout(t);
    }
    prevMoodRef.current = mood;
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
    if (!contentText.trim()) return;
    autoSaveTimeoutRef.current = setTimeout(() => {
      setIsSaving(true);
      saveEntry({
        id: entryId || undefined,
        title: title || undefined,
        content: contentText,
        mood: mood ?? undefined,
        privacyMode,
      })
        .then(() => {
          setLastSavedAt(new Date());
          setShowCheckmark(true);
          setTimeout(() => setShowCheckmark(false), 1500);
          onEntrySaved?.();
        })
        .catch((err) => { console.error('Auto-save failed:', err); })
        .finally(() => { setIsSaving(false); });
    }, 2000);
  }, [contentText, title, entryId, privacyMode, onEntrySaved]);

  useEffect(() => { scheduleAutoSave(); }, [contentText, title, privacyMode, scheduleAutoSave]);

  const handleContentChange = useCallback((html: string, text: string) => {
    setContent(html);
    setContentText(text);
  }, []);

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  }, []);

  const handleUsePrompt = useCallback((prompt: { text: string }) => {
    setPendingInsert(prompt.text + '\n\n');
  }, []);

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950">
      <div className="flex-1 flex flex-col min-h-0 px-6 sm:px-12 lg:px-20 py-12">
        <div className="flex-1 flex flex-col max-w-3xl lg:max-w-[75%] w-full mx-auto min-h-0 relative">

          {/* Inviting heading — new entries only */}
          {!entryId && (
            <div className="mb-4">
              <h1 className="text-2xl font-light text-slate-400 dark:text-slate-500 tracking-wide">
                What's on your mind?
              </h1>
            </div>
          )}

          {/* Local pattern nudge — dismissable, new entries only */}
          {isNewEntry && nudge && !nudgeDismissed && (
            <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-violet-50 dark:bg-violet-900/10 border border-violet-100 dark:border-violet-800/50">
              <span className="text-violet-500 text-base flex-shrink-0">✨</span>
              <p className="flex-1 text-sm text-violet-700 dark:text-violet-300">{nudge}</p>
              <button
                type="button"
                onClick={() => setNudgeDismissed(true)}
                aria-label="Dismiss"
                className="p-1 rounded-lg text-violet-400 hover:text-violet-600 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* ── Editor card — lifts on focus ── */}
          <div
            onFocus={() => setIsEditorFocused(true)}
            onBlur={() => setIsEditorFocused(false)}
            className={`flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900 rounded-2xl px-8 pt-5 pb-8 transition-shadow duration-300 relative ${
              isEditorFocused ? 'shadow-md' : 'shadow-sm'
            }`}
          >
            {/* ── Card header: Mood picker + Privacy segmented control ── */}
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">

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
                            ? `w-4 h-4 ${DOT_COLORS[level]} shadow-sm ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 ${RING_COLORS[level]} ${moodPulse ? 'animate-pulse' : ''}`
                            : 'w-2.5 h-2.5 bg-slate-200 dark:bg-slate-700 hover:scale-125'
                        }`}
                      />
                    );
                  })}
                </div>
                {mood !== null && (
                  <span className="flex items-center gap-0.5 text-sm leading-none">
                    {MOOD_OPTIONS[mood - 1].emoji}
                    {moodIsAuto && (
                      <span
                        className="text-[10px] text-violet-400 dark:text-violet-500"
                        title="Auto-detected from your writing"
                      >
                        ✦
                      </span>
                    )}
                  </span>
                )}
              </div>

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
            </div>

            {/* Title input */}
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
                mb-6 flex-shrink-0
              "
            />

            {/* Rich text editor */}
            <RichTextEditor
              value={content}
              onChange={handleContentChange}
              placeholder="Start writing..."
              autoFocus={!entryId}
              className="flex-1 min-h-0"
              onNavigateToSTTSettings={onNavigateToSTTSettings}
              insertText={pendingInsert}
              onInsertTextConsumed={() => setPendingInsert(null)}
            />

            {/* ── Blank-page prompts CTA — fades away as user writes ── */}
            {isNewEntry && showPrompts && (
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

          {/* ── Bottom status bar — subtle, consistent ── */}
          <div className="flex items-center mt-3 px-1 text-xs text-slate-400 dark:text-slate-500">

            {/* Left: E2E badge */}
            <div className="flex-1 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <span>End-to-end encrypted</span>
            </div>

            {/* Center: word count */}
            <div className="flex-1 text-center">
              {wordCount > 0 && (
                <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
              )}
            </div>

            {/* Right: save indicator */}
            <div className="flex-1 flex items-center justify-end gap-1.5">
              {isSaving ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 border-[1.5px] border-slate-300 dark:border-slate-600 border-t-violet-500 rounded-full animate-spin" />
                  Saving...
                </span>
              ) : showCheckmark ? (
                <span className="flex items-center gap-1.5 animate-fade-in">
                  <svg className="w-3.5 h-3.5 text-emerald-500 animate-check-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {savedAgoText}
                </span>
              ) : (
                <span>{savedAgoText}</span>
              )}
            </div>
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
        />
      )}
    </div>
  );
}
