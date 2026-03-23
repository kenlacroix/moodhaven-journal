/**
 * TranscriptPreviewOverlay — bottom-sheet overlay showing formatted transcript
 * before inserting into the editor.
 *
 * The user can choose to:
 *   - "Use this"    — insert the formatted text
 *   - "Edit first"  — insert formatted text and move cursor to start of insertion
 *   - "Use raw text" — insert the unformatted whisper output
 *
 * A11y:
 *   - role="dialog" aria-modal="true" on the sheet
 *   - Focus trap cycling through the 3 action buttons
 *   - Escape key calls onUseRaw
 *   - The backdrop does NOT dismiss on click (per design decision)
 */

import { useEffect, useRef } from 'react';

export interface TranscriptPreviewOverlayProps {
  isOpen: boolean;
  formattedText: string;
  rawText: string;
  source: 'ollama' | 'openai' | null;
  onUseFormatted: () => void;
  onEditFirst: () => void;
  onUseRaw: () => void;
}

const SOURCE_PILL: Record<'ollama' | 'openai', { label: string; className: string }> = {
  ollama: {
    label: 'Ollama',
    className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  },
  openai: {
    label: 'OpenAI',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  },
};

export function TranscriptPreviewOverlay({
  isOpen,
  formattedText,
  rawText,
  source,
  onUseFormatted,
  onEditFirst,
  onUseRaw,
}: TranscriptPreviewOverlayProps) {
  const useFormattedRef = useRef<HTMLButtonElement>(null);
  const editFirstRef = useRef<HTMLButtonElement>(null);
  const useRawRef = useRef<HTMLButtonElement>(null);

  // Focus the primary CTA on open
  useEffect(() => {
    if (isOpen) {
      useFormattedRef.current?.focus();
    }
  }, [isOpen]);

  // Escape key → use raw
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onUseRaw();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onUseRaw]);

  // Focus trap: Tab cycles through 3 buttons
  const handleKeyDownSheet = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const focusable = [useFormattedRef.current, editFirstRef.current, useRawRef.current].filter(
      (el): el is HTMLButtonElement => el !== null
    );
    if (focusable.length === 0) return;
    const activeIndex = focusable.indexOf(document.activeElement as HTMLButtonElement);
    if (e.shiftKey) {
      e.preventDefault();
      const prev = (activeIndex - 1 + focusable.length) % focusable.length;
      focusable[prev].focus();
    } else {
      e.preventDefault();
      const next = (activeIndex + 1) % focusable.length;
      focusable[next].focus();
    }
  };

  const sourcePill = source ? SOURCE_PILL[source] : null;

  return (
    <>
      {/* Backdrop — intentionally no onClick handler (outside tap does nothing) */}
      <div
        aria-hidden="true"
        className={[
          'fixed inset-0 bg-black/30 z-40 transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      />

      {/* Bottom sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Transcript preview"
        onKeyDown={handleKeyDownSheet}
        className={[
          'fixed bottom-0 left-0 right-0 z-50',
          'bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl p-6',
          'transition-transform duration-300',
          isOpen ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Formatted transcript
          </p>
          {sourcePill && (
            <span
              className={[
                'text-xs font-medium px-2 py-0.5 rounded-full',
                sourcePill.className,
              ].join(' ')}
            >
              {sourcePill.label}
            </span>
          )}
        </div>

        {/* Formatted text preview */}
        <div className="max-h-48 overflow-y-auto rounded-lg bg-slate-50 dark:bg-slate-800 p-3 mb-4">
          {formattedText ? (
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
              {formattedText}
            </p>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">
              Formatting returned an empty result — use raw text below.
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            ref={useFormattedRef}
            type="button"
            onClick={onUseFormatted}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            Use this
          </button>

          <button
            ref={editFirstRef}
            type="button"
            onClick={onEditFirst}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            Edit first
          </button>

          <button
            ref={useRawRef}
            type="button"
            onClick={onUseRaw}
            className="px-4 py-2 text-sm font-medium rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            Use raw text
          </button>
        </div>
      </div>
    </>
  );
}
