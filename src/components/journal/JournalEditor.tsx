/**
 * JournalEditor - Main writing area with calm, distraction-free design
 *
 * Design principles:
 * - Generous whitespace for focus
 * - Subtle placeholder prompts
 * - Character count without pressure
 * - Smooth auto-save indicator
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { MoodSelector } from './MoodSelector';
import type { MoodLevel, JournalEntryFormData } from '../../types/journal';

interface JournalEditorProps {
  initialData?: Partial<JournalEntryFormData>;
  initialContent?: string; // For pre-filling from prompts
  onSave: (data: JournalEntryFormData) => Promise<void>;
  onCancel?: () => void;
  isEditing?: boolean;
}

const PROMPTS = [
  "What's on your mind today?",
  'How are you feeling right now?',
  'What made you smile today?',
  "What's one thing you're grateful for?",
  'Describe your day in a few words...',
];

export function JournalEditor({
  initialData,
  initialContent,
  onSave,
  onCancel,
  isEditing = false,
}: JournalEditorProps) {
  const [content, setContent] = useState(initialData?.content ?? '');
  const [mood, setMood] = useState<MoodLevel | null>(initialData?.mood ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Random prompt for placeholder
  const [prompt] = useState(
    () => PROMPTS[Math.floor(Math.random() * PROMPTS.length)]
  );

  // Handle initialContent changes (from AI prompts)
  useEffect(() => {
    if (initialContent && initialContent.trim()) {
      setContent(initialContent);
      // Focus and scroll to end
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(
          initialContent.length,
          initialContent.length
        );
      }
    }
  }, [initialContent]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(200, textarea.scrollHeight)}px`;
    }
  }, [content]);

  // Focus textarea on mount
  useEffect(() => {
    if (textareaRef.current && !isEditing) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = useCallback(async () => {
    if (!content.trim()) {
      setError('Please write something before saving');
      return;
    }

    if (!mood) {
      setError('Please select how you are feeling');
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      await onSave({
        content: content.trim(),
        mood,
        tags: [], // Tags can be added in a future iteration
      });

      // Clear form after successful save (only for new entries)
      if (!isEditing) {
        setContent('');
        setMood(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save entry');
    } finally {
      setIsSaving(false);
    }
  }, [content, mood, onSave, isEditing]);

  // Keyboard shortcut: Ctrl/Cmd + Enter to save
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave]
  );

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        className="
          bg-white dark:bg-slate-900
          rounded-3xl shadow-sm
          border border-slate-100 dark:border-slate-800
          overflow-hidden
          transition-shadow duration-300
          hover:shadow-md
        "
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {isEditing ? 'Edit Entry' : 'New Entry'}
            </h2>
            <time className="text-sm text-slate-400 dark:text-slate-500">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
            </time>
          </div>
        </div>

        {/* Mood Selector */}
        <div className="px-6 py-5 bg-slate-50/50 dark:bg-slate-800/30">
          <MoodSelector value={mood} onChange={setMood} disabled={isSaving} />
        </div>

        {/* Writing Area */}
        <div className="p-6">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={prompt}
            disabled={isSaving}
            rows={8}
            className="
              w-full min-h-[200px] p-4
              text-slate-700 dark:text-slate-200
              placeholder:text-slate-300 dark:placeholder:text-slate-600
              bg-transparent
              border-0
              resize-none
              focus:outline-none focus:ring-0
              text-lg leading-relaxed
              disabled:opacity-50
            "
          />

          {/* Character count - subtle, non-pressuring */}
          <div className="flex items-center justify-between mt-2 text-xs text-slate-400 dark:text-slate-500">
            <span>{content.length > 0 ? `${content.length} characters` : ''}</span>
            <span className="text-slate-300 dark:text-slate-600">
              Ctrl+Enter to save
            </span>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="px-6 pb-4">
            <p className="text-sm text-rose-500 dark:text-rose-400">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-end gap-3">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={isSaving}
                className="
                  px-4 py-2 rounded-xl
                  text-sm font-medium text-slate-600 dark:text-slate-300
                  hover:bg-slate-100 dark:hover:bg-slate-700
                  transition-colors duration-200
                  disabled:opacity-50
                "
              >
                Cancel
              </button>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !content.trim() || !mood}
              className="
                px-6 py-2.5 rounded-xl
                text-sm font-medium text-white
                bg-violet-500 hover:bg-violet-600
                shadow-sm hover:shadow
                transition-all duration-200
                disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center gap-2
              "
            >
              {isSaving ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>{isEditing ? 'Update' : 'Save Entry'}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
