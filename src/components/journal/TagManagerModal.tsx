/**
 * TagManagerModal - Manage entry tags
 *
 * Shows two sections:
 * 1. Tags in this entry (extracted hashtags from content)
 * 2. Previously used tags in this journal (from entry_tags table)
 *
 * Clicking a previously-used tag calls onInsertTag so the parent can
 * insert it at the editor cursor via the pendingInsert mechanism.
 */

import { useMemo } from 'react';
import { extractHashtags } from '../../lib/utils/markdownUtils';

interface TagManagerModalProps {
  content: string;          // Current HTML content (for extracting existing tags)
  bookTags: string[];       // All tags used in this journal
  onInsertTag: (tag: string) => void;
  onClose: () => void;
}

export function TagManagerModal({ content, bookTags, onInsertTag, onClose }: TagManagerModalProps) {
  const entryTags = useMemo(() => extractHashtags(content), [content]);

  // Previously used tags not already in this entry
  const suggestedTags = bookTags.filter((t) => !entryTags.includes(t));

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 max-h-[70vh] bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Tags</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4">
          {/* Tags in this entry */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
              In this entry
            </p>
            {entryTags.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                Type #hashtag in your entry to add tags
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {entryTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
                  >
                    <span className="opacity-60">#</span>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-slate-100 dark:bg-slate-800" />

          {/* Previously used tags */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
              Used in this journal
            </p>
            {bookTags.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                No tags yet — start adding hashtags to your entries
              </p>
            ) : suggestedTags.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                All your journal tags are already in this entry
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {suggestedTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      onInsertTag(tag);
                      onClose();
                    }}
                    className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                  >
                    <span className="opacity-60">#</span>
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Helper tip */}
          <p className="text-[10px] text-slate-400 dark:text-slate-500 pt-1">
            Tap a previously-used tag to insert it at the cursor.
          </p>
        </div>
      </div>
    </>
  );
}
