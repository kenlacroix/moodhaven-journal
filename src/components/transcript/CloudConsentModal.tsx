/**
 * CloudConsentModal — shown once before enabling cloud (OpenAI) transcript
 * formatting. The user must explicitly consent; cancelling reverts the
 * settings selection to the previous layer.
 *
 * A11y: role="alertdialog" aria-modal, focus on primary CTA on open,
 *       Escape = Cancel.
 */

import { useEffect, useRef } from 'react';

export interface CloudConsentModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CloudConsentModal({ isOpen, onConfirm, onCancel }: CloudConsentModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus primary CTA on open
  useEffect(() => {
    if (isOpen) {
      confirmRef.current?.focus();
    }
  }, [isOpen]);

  // Escape = Cancel
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onCancel}
      />

      {/* Modal */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cloud-consent-title"
        aria-describedby="cloud-consent-body"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6">
          {/* Warning icon */}
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 mx-auto mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-amber-600 dark:text-amber-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
          </div>

          {/* Title */}
          <h2
            id="cloud-consent-title"
            className="text-lg font-semibold text-slate-800 dark:text-slate-100 text-center mb-2"
          >
            Enable cloud formatting?
          </h2>

          {/* Body */}
          <p
            id="cloud-consent-body"
            className="text-sm text-slate-600 dark:text-slate-400 text-center leading-relaxed mb-6"
          >
            Cloud formatting sends your spoken words to OpenAI. This is separate from the AI
            insights feature, which only uses metadata.
          </p>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button
              ref={confirmRef}
              type="button"
              onClick={onConfirm}
              className="w-full px-4 py-2.5 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              I understand — enable cloud formatting
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="w-full px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
