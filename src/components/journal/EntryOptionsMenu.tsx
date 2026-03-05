/**
 * EntryOptionsMenu - Three-dot menu for the Writing View card header
 *
 * Shows word count stats, pin/favourite toggle, copy, export, and delete actions.
 * Portalled to document.body so it escapes card clipping.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { htmlToMarkdown, htmlToPlainText } from '../../lib/markdownUtils';
import { patchEntryPinned } from '../../lib/journalService';
import type { JournalEntry } from '../../types/journal';

interface EntryOptionsMenuProps {
  entry: JournalEntry | null; // null for unsaved new entries
  wordCount: number;
  charCount: number;
  onDelete?: () => void;
  onPinToggle?: (pinned: boolean) => void;
}

function readingMinutes(words: number): string {
  const mins = Math.max(1, Math.round(words / 200));
  return `~${mins} min read`;
}

export function EntryOptionsMenu({
  entry,
  wordCount,
  charCount,
  onDelete,
  onPinToggle,
}: EntryOptionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<'markdown' | 'text' | null>(null);
  const [isPinned, setIsPinned] = useState(entry?.pinned ?? false);
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync pinned state when entry changes
  useEffect(() => {
    setIsPinned(entry?.pinned ?? false);
  }, [entry?.pinned]);

  const openMenu = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen(true);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
      setConfirmingDelete(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) setConfirmingDelete(false);
  }, [open]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) setOpen(false);
    else openMenu();
  }, [open, openMenu]);

  const handleCopyMarkdown = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!entry) return;
    const titleLine = entry.title ? `# ${entry.title}\n\n` : '';
    await navigator.clipboard.writeText(titleLine + htmlToMarkdown(entry.content));
    setCopyFeedback('markdown');
    setTimeout(() => { setCopyFeedback(null); setOpen(false); }, 1500);
  }, [entry]);

  const handleCopyText = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!entry) return;
    const titleLine = entry.title ? `${entry.title}\n\n` : '';
    await navigator.clipboard.writeText(titleLine + htmlToPlainText(entry.content));
    setCopyFeedback('text');
    setTimeout(() => { setCopyFeedback(null); setOpen(false); }, 1500);
  }, [entry]);

  const handlePinToggle = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!entry) return;
    const next = !isPinned;
    setIsPinned(next);
    onPinToggle?.(next);
    try {
      await patchEntryPinned(entry.id, next);
    } catch {
      // Revert on failure
      setIsPinned(!next);
      onPinToggle?.(!next);
    }
    setOpen(false);
  }, [entry, isPinned, onPinToggle]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmingDelete) {
      onDelete?.();
      setOpen(false);
    } else {
      setConfirmingDelete(true);
    }
  }, [confirmingDelete, onDelete]);

  return (
    <div onClick={(e) => e.stopPropagation()}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        title="Entry options"
        className={`flex items-center justify-center w-7 h-7 rounded-md text-sm font-bold tracking-widest transition-all duration-150 ${
          open
            ? 'opacity-100 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800'
            : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
        aria-label="Entry options"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        ···
      </button>

      {/* Dropdown */}
      {open && createPortal(
        <div
          ref={dropdownRef}
          role="menu"
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999 }}
          className="w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 text-sm"
        >
          {/* Word count stats */}
          <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
            <span className="font-medium text-slate-700 dark:text-slate-200">{wordCount.toLocaleString()} words</span>
            {' · '}
            {charCount.toLocaleString()} chars
            {wordCount > 0 && <span>{' · '}{readingMinutes(wordCount)}</span>}
          </div>

          {/* Pin / Favourite */}
          {entry && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={handlePinToggle}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <span className="text-sm flex-shrink-0">{isPinned ? '📌' : '☆'}</span>
                {isPinned ? 'Unpin entry' : 'Pin entry'}
              </button>
              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
            </>
          )}

          {/* Copy as Markdown */}
          {entry && (
            <button
              type="button"
              role="menuitem"
              onClick={handleCopyMarkdown}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copyFeedback === 'markdown' ? '✓ Copied!' : 'Copy as Markdown'}
            </button>
          )}

          {/* Copy plain text */}
          {entry && (
            <button
              type="button"
              role="menuitem"
              onClick={handleCopyText}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {copyFeedback === 'text' ? '✓ Copied!' : 'Copy plain text'}
            </button>
          )}

          {/* Delete (only for saved entries) */}
          {entry && onDelete && (
            <>
              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
              <button
                type="button"
                role="menuitem"
                onClick={handleDeleteClick}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  confirmingDelete
                    ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900 font-medium'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400'
                }`}
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {confirmingDelete ? 'Confirm delete?' : 'Delete entry…'}
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
