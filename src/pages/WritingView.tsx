/**
 * WritingView - Calm writing space (default view)
 *
 * Per UX spec:
 * - Shows ONLY: Entry title (optional) + Rich text editor
 * - No toolbars visible
 * - No metadata visible
 * - No AI content visible
 * - Large readable body font
 * - Generous line spacing
 * - Centered writing column
 * - Cursor must be clearly visible
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { saveEntry, getEntryById } from '../lib/journalService';
import { ContextButton } from '../components/context/ContextButton';
import { ContextPanel } from '../components/context/ContextPanel';

interface WritingViewProps {
  entryId?: string | null;
  onEntrySaved?: () => void;
}

export function WritingView({ entryId, onEntrySaved }: WritingViewProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showContext, setShowContext] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing entry if editing
  useEffect(() => {
    if (entryId) {
      getEntryById(entryId).then((entry) => {
        if (entry) {
          setTitle(entry.title || '');
          setContent(entry.content);
          setMood(entry.mood);
        }
      });
    } else {
      // New entry - focus on content
      contentRef.current?.focus();
    }
  }, [entryId]);

  // Auto-save after 2 seconds of inactivity
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Only auto-save if there's content
    if (!content.trim()) return;

    autoSaveTimeoutRef.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        await saveEntry({
          id: entryId || undefined,
          title: title || undefined,
          content,
          mood: mood || undefined,
        });
        setLastSaved(new Date());
        onEntrySaved?.();
      } catch (err) {
        console.error('Auto-save failed:', err);
      } finally {
        setIsSaving(false);
      }
    }, 2000);
  }, [content, title, mood, entryId, onEntrySaved]);

  // Trigger auto-save when content changes
  useEffect(() => {
    scheduleAutoSave();
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [content, title, scheduleAutoSave]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC to close context panel
      if (e.key === 'Escape' && showContext) {
        setShowContext(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showContext]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Writing area - centered, generous padding */}
      <div className="flex-1 flex justify-center">
        <div className="w-full max-w-2xl px-8 py-12">
          {/* Title (optional) */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="
              w-full text-2xl font-semibold
              bg-transparent border-none outline-none
              text-slate-800 dark:text-slate-100
              placeholder:text-slate-300 dark:placeholder:text-slate-600
              mb-6
            "
          />

          {/* Main content area */}
          <textarea
            ref={contentRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Start writing..."
            className="
              w-full min-h-[60vh] resize-none
              bg-transparent border-none outline-none
              text-lg leading-relaxed
              text-slate-700 dark:text-slate-200
              placeholder:text-slate-300 dark:placeholder:text-slate-600
            "
          />
        </div>
      </div>

      {/* Context button - subtle, bottom right */}
      <ContextButton
        onClick={() => setShowContext(true)}
        className="fixed bottom-6 right-6"
      />

      {/* Context panel - overlays outside writing column */}
      {showContext && (
        <ContextPanel
          mood={mood}
          onMoodChange={setMood}
          onClose={() => setShowContext(false)}
        />
      )}

      {/* Save status - very subtle */}
      {(isSaving || lastSaved) && (
        <div className="fixed bottom-6 left-72 text-xs text-slate-400 dark:text-slate-500">
          {isSaving ? 'Saving...' : lastSaved ? `Saved ${formatTime(lastSaved)}` : ''}
        </div>
      )}
    </div>
  );
}

function formatTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
