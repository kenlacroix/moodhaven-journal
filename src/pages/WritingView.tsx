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
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { saveEntry, getEntryById } from '../lib/journalService';
import { RichTextEditor } from '../components/editor';

interface WritingViewProps {
  entryId?: string | null;
  onEntrySaved?: () => void;
}

export function WritingView({ entryId, onEntrySaved }: WritingViewProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contentText, setContentText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [savedAgoText, setSavedAgoText] = useState('');
  const [showCheckmark, setShowCheckmark] = useState(false);
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load existing entry if editing
  useEffect(() => {
    if (entryId) {
      getEntryById(entryId).then((entry) => {
        if (entry) {
          setTitle(entry.title || '');
          setContent(entry.content);
          setContentText(entry.content);
        }
      });
    }
  }, [entryId]);

  // Cleanup timeouts and intervals
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
      if (agoIntervalRef.current) clearInterval(agoIntervalRef.current);
    };
  }, []);

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
  }, [contentText, title, entryId, onEntrySaved]);

  // Trigger auto-save when content changes
  useEffect(() => {
    scheduleAutoSave();
  }, [contentText, title, scheduleAutoSave]);

  // Handle content change from rich text editor
  const handleContentChange = useCallback((html: string, text: string) => {
    setContent(html);
    setContentText(text);
  }, []);

  // Handle title change
  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  }, []);

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Main writing area - centered column */}
      <div className="flex-1 flex flex-col min-h-0 px-6 sm:px-12 lg:px-20 py-12">
        {/* Centered content container with soft background */}
        <div className="flex-1 flex flex-col max-w-3xl lg:max-w-[75%] w-full mx-auto min-h-0 relative">
          {/* Inviting heading - only for new entries */}
          {!entryId && (
            <div className="mb-6">
              <h1 className="text-2xl font-light text-slate-400 dark:text-slate-500 tracking-wide">
                What's on your mind?
              </h1>
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
            />
          </div>

          {/* Bottom status bar - encryption badge + word count + save indicator */}
          <div className="flex items-center justify-between mt-3 px-1">
            {/* Encryption reassurance */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <span>End-to-end encrypted</span>
            </div>

            {/* Word count */}
            {contentText.trim() && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {contentText.trim().split(/\s+/).length} {contentText.trim().split(/\s+/).length === 1 ? 'word' : 'words'}
              </span>
            )}

            {/* Save indicator with micro-animation */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
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
    </div>
  );
}

