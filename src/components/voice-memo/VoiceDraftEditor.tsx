/**
 * VoiceDraftEditor — full-screen overlay for reviewing and publishing a
 * voice memo draft.
 *
 * Layout:
 *   Header: close button · title · Publish button
 *   Context bar (timestamp + health context, read-only)
 *   Mood selector (adjustable, defaults to inferred_mood)
 *   Hashtag suggestion pills (from transcript)
 *   TipTap editor (initial content = transcription)
 */

import { useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { MoodSelector } from '../journal/MoodSelector';
import { suggestHashtags } from '../../lib/services/voiceMemoService';
import type { VoiceMemo } from '../../lib/services/voiceMemoService';
import type { MoodLevel } from '../../types/journal';

interface VoiceDraftEditorProps {
  memo: VoiceMemo;
  onPublish: (
    id: string,
    content: string,
    mood: number,
    bookId: string,
    privacyMode: number,
  ) => Promise<void>;
  onClose: () => void;
  activeBookId?: string;
}

export function VoiceDraftEditor({ memo, onPublish, onClose, activeBookId }: VoiceDraftEditorProps) {
  const [mood, setMood] = useState<MoodLevel>((memo.inferred_mood as MoodLevel) ?? 3);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialContent = memo.transcription
    ? `<p>${memo.transcription.replace(/\n/g, '</p><p>')}</p>`
    : '<p></p>';

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Edit your transcript before publishing…' }),
    ],
    content: initialContent,
    autofocus: true,
  });

  const hashtags = suggestHashtags(memo.transcription ?? '');

  const handleInsertHashtag = useCallback(
    (tag: string) => {
      editor?.commands.insertContent(` ${tag} `);
      editor?.commands.focus();
    },
    [editor],
  );

  const handlePublish = useCallback(async () => {
    if (!editor) return;
    setIsPublishing(true);
    setError(null);
    try {
      const content = editor.getHTML();
      await onPublish(memo.id, content, mood, activeBookId ?? memo.book_id ?? 'default', 0);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setIsPublishing(false);
    }
  }, [editor, memo.id, memo.book_id, mood, activeBookId, onPublish, onClose]);

  const timeLabel = new Date(memo.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    /* Overlay backdrop */
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex flex-col w-full max-w-2xl bg-white dark:bg-slate-900 shadow-xl overflow-hidden sm:my-4 sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-150"
            aria-label="Close editor"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <h2 className="flex-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Voice Memo Draft
          </h2>
          <button
            type="button"
            onClick={handlePublish}
            disabled={isPublishing || !editor}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
          >
            {isPublishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>

        {/* Context bar */}
        <div className="px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          <p className="text-xs text-slate-400 dark:text-slate-500 line-clamp-1">
            {timeLabel}
            {memo.context ? ` · ${memo.context}` : ''}
          </p>
        </div>

        {/* Mood selector */}
        <div className="px-5 pt-4 pb-2 flex-shrink-0">
          <MoodSelector value={mood} onChange={(m) => setMood(m)} />
        </div>

        {/* Hashtag pills */}
        {hashtags.length > 0 && (
          <div className="px-5 pb-3 flex flex-wrap gap-2 flex-shrink-0">
            {hashtags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleInsertHashtag(tag)}
                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors duration-150"
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mx-5 mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm flex-shrink-0">
            {error}
          </div>
        )}

        {/* TipTap editor */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <EditorContent
            editor={editor}
            className="prose prose-slate dark:prose-invert prose-sm max-w-none min-h-[200px] focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
