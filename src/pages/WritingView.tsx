/**
 * WritingView - Calm writing space (default view)
 *
 * Per spec:
 * - Centered writing column (768px base, scales to 75% on large screens)
 * - Vertically padded, soft background
 * - Title field: placeholder "Title (optional)", lighter color
 * - Body editor: auto-focus, large readable font, no toolbar by default
 * - Auto-save on debounce (async, no blocking)
 * - "Saved X ago" indicator
 * - Privacy mode toggle (Open / Mindful / Private)
 * - Local pattern nudge (dismissable, new entries only)
 * - AI writing prompts (new entries only, uses fallback if AI disabled)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { saveEntry, getEntryById } from '../lib/journalService';
import { RichTextEditor } from '../components/editor';
import { MoodDotPicker } from '../components/editor/MoodDotPicker';
import { PromptDrawer } from '../components/ai/PromptDrawer';
import { useJournalPrompts } from '../hooks/useJournalPrompts';
import { useSettingsStore } from '../stores/settingsStore';
import { useOuraContext } from '../hooks/useOuraContext';
import { HealthContextBadge } from '../components/oura/HealthContextBadge';
import { scoreContentMood } from '../lib/metadataExtractor';
import type { MoodLevel, PrivacyMode } from '../types/journal';
import { PRIVACY_MODE_LABELS, PRIVACY_MODE_DESCRIPTIONS } from '../types/journal';

interface WritingViewProps {
  entryId?: string | null;
  onEntrySaved?: () => void;
  onNavigateToSTTSettings?: () => void;
}

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

const PRIVACY_COLORS: Record<PrivacyMode, string> = {
  0: 'text-slate-400 dark:text-slate-500',
  1: 'text-amber-500 dark:text-amber-400',
  2: 'text-violet-600 dark:text-violet-400',
};

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
  const [moodIsAuto, setMoodIsAuto] = useState(true); // false = user manually set
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const moodScoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const setShowPrompts = useSettingsStore((s) => s.setShowPrompts);
  const showPrompts = useSettingsStore((s) => s.settings.journal.showPrompts);

  const isNewEntry = !entryId;
  const {
    forYouPrompts,
    generalPrompts,
    healthPrompts,
    nudge,
    isLoading: promptsLoading,
    isAIEnabled,
    hasNewPrompts,
    refresh: refreshPrompts,
  } = useJournalPrompts(isNewEntry);
  const { summary: healthSummary, isSyncing: healthSyncing, isEnabled: ouraEnabled, refresh: refreshHealth } = useOuraContext();

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

  // Reset nudge dismissal and mood when switching to a new entry
  useEffect(() => {
    if (isNewEntry) {
      setNudgeDismissed(false);
      setMood(null);
      setMoodIsAuto(true);
    }
  }, [isNewEntry]);

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
    if (!moodIsAuto) return; // Don't override user's choice
    if (moodScoreTimeoutRef.current) clearTimeout(moodScoreTimeoutRef.current);
    moodScoreTimeoutRef.current = setTimeout(() => {
      const scored = scoreContentMood(contentText);
      if (scored !== null) setMood(scored);
    }, 1500); // 1.5s after typing stops
  }, [contentText, moodIsAuto]);

  // Update "saved X ago" text every 10 seconds
  useEffect(() => {
    if (!lastSavedAt) return;

    const updateAgoText = () => {
      const seconds = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000);
      if (seconds < 5) {
        setSavedAgoText('Saved just now');
      } else if (seconds < 60) {
        setSavedAgoText(`Saved ${seconds}s ago`);
      } else {
        const minutes = Math.floor(seconds / 60);
        setSavedAgoText(`Saved ${minutes}m ago`);
      }
    };

    updateAgoText();
    agoIntervalRef.current = setInterval(updateAgoText, 10000);

    return () => {
      if (agoIntervalRef.current) clearInterval(agoIntervalRef.current);
    };
  }, [lastSavedAt]);

  // Auto-save after 2 seconds of inactivity (async, non-blocking)
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Only auto-save if there's content
    if (!contentText.trim()) return;

    autoSaveTimeoutRef.current = setTimeout(() => {
      // Fire and forget - don't block UI
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
        .catch((err) => {
          console.error('Auto-save failed:', err);
        })
        .finally(() => {
          setIsSaving(false);
        });
    }, 2000);
  }, [contentText, title, entryId, privacyMode, onEntrySaved]);

  // Trigger auto-save when content or privacy mode changes
  useEffect(() => {
    scheduleAutoSave();
  }, [contentText, title, privacyMode, scheduleAutoSave]);

  // Handle content change from rich text editor
  const handleContentChange = useCallback((html: string, text: string) => {
    setContent(html);
    setContentText(text);
  }, []);

  // Handle title change
  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  }, []);

  // Cycle through privacy modes: Open → Mindful → Private → Open
  const handlePrivacyToggle = useCallback(() => {
    setPrivacyMode((prev) => ((prev + 1) % 3) as PrivacyMode);
  }, []);

  // Insert a prompt into the editor
  const handleUsePrompt = useCallback((prompt: { text: string }) => {
    setPendingInsert(prompt.text + '\n\n');
  }, []);

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Main writing area - centered column */}
      <div className="flex-1 flex flex-col min-h-0 px-6 sm:px-12 lg:px-20 py-12">
        {/* Centered content container with soft background */}
        <div className="flex-1 flex flex-col max-w-3xl lg:max-w-[75%] w-full mx-auto min-h-0 relative">
          {/* Inviting heading - only for new entries */}
          {!entryId && (
            <div className="mb-4">
              <h1 className="text-2xl font-light text-slate-400 dark:text-slate-500 tracking-wide">
                What's on your mind?
              </h1>
            </div>
          )}

          {/* Local pattern nudge - dismissable, new entries only */}
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

          {/* Oura health context badge - new entries only, when connected */}
          {isNewEntry && ouraEnabled && healthSummary && (
            <div className="mb-3">
              <HealthContextBadge
                summary={healthSummary}
                onRefresh={refreshHealth}
                isSyncing={healthSyncing}
              />
            </div>
          )}

          {/* Editor surface with subtle contrast - lifts on focus */}
          <div
            onFocus={() => setIsEditorFocused(true)}
            onBlur={() => setIsEditorFocused(false)}
            className={`flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900 rounded-2xl px-8 py-10 transition-shadow duration-300 ${isEditorFocused ? 'shadow-md' : 'shadow-sm'}`}
          >
            {/* Title input - lighter weight */}
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

            {/* Rich text editor - expands to fill space */}
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
          </div>

          {/* Bottom status bar - encryption badge + privacy mode + word count + save indicator */}
          <div className="flex items-center mt-3 px-1">
            {/* Encryption + Privacy mode + Mood picker - pinned left */}
            <div className="flex-1 flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <span>End-to-end encrypted</span>
              </div>

              {/* Privacy mode toggle */}
              <button
                type="button"
                onClick={handlePrivacyToggle}
                title={PRIVACY_MODE_DESCRIPTIONS[privacyMode]}
                className={`flex items-center gap-1.5 text-xs transition-colors hover:opacity-80 ${PRIVACY_COLORS[privacyMode]}`}
              >
                {PRIVACY_ICONS[privacyMode]}
                <span>{PRIVACY_MODE_LABELS[privacyMode]}</span>
              </button>

              {/* Mood dot picker — auto-scored, single-click to override */}
              <MoodDotPicker
                mood={mood}
                isAutoDetected={moodIsAuto}
                wordCount={contentText.trim().split(/\s+/).filter(Boolean).length}
                onChange={(m) => { setMood(m); setMoodIsAuto(false); }}
              />

              {/* Prompt drawer trigger — only for new entries when prompts enabled */}
              {isNewEntry && showPrompts && (
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  title="Writing prompts"
                  className="relative text-slate-400 dark:text-slate-500 hover:text-violet-500 dark:hover:text-violet-400 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                  </svg>
                  {/* Badge dot: visible when new prompts loaded and drawer is closed */}
                  {hasNewPrompts && !drawerOpen && (
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-violet-500" />
                  )}
                </button>
              )}
            </div>

            {/* Word count - pinned center */}
            <div className="flex-1 text-center text-xs text-slate-400 dark:text-slate-500">
              {contentText.trim() && (
                <span>
                  {contentText.trim().split(/\s+/).length} {contentText.trim().split(/\s+/).length === 1 ? 'word' : 'words'}
                </span>
              )}
            </div>

            {/* Save indicator with micro-animation - pinned right */}
            <div className="flex-1 flex items-center justify-end gap-1.5 text-xs text-slate-400 dark:text-slate-500">
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
                <span className="transition-opacity duration-300">
                  {savedAgoText}
                </span>
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
