/**
 * MicrophonePermissionModal — shown before the OS microphone permission prompt.
 *
 * Explains why the app needs mic access and gives the user a chance to cancel
 * before the system dialog appears. Privacy-aligned: notes all audio stays local.
 *
 * A11y: role="dialog" aria-modal, focus on primary CTA on open, Escape = Cancel.
 */

import { useEffect, useRef } from 'react';

export interface MicrophonePermissionModalProps {
  isOpen: boolean;
  onAllow: () => void;
  onCancel: () => void;
}

export function MicrophonePermissionModal({
  isOpen,
  onAllow,
  onCancel,
}: MicrophonePermissionModalProps) {
  const allowRef = useRef<HTMLButtonElement>(null);

  // Focus primary CTA on open
  useEffect(() => {
    if (isOpen) {
      allowRef.current?.focus();
    }
  }, [isOpen]);

  // Escape = Cancel
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="mic-permission-title"
        aria-describedby="mic-permission-body"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full p-6">
          {/* Mic icon */}
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/30 mx-auto mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-violet-600 dark:text-violet-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
              />
            </svg>
          </div>

          {/* Title */}
          <h2
            id="mic-permission-title"
            className="text-lg font-semibold text-slate-800 dark:text-slate-100 text-center mb-2"
          >
            Microphone access needed
          </h2>

          {/* Body */}
          <p
            id="mic-permission-body"
            className="text-sm text-slate-600 dark:text-slate-400 text-center leading-relaxed mb-6"
          >
            MoodHaven Journal needs microphone access for speech-to-text dictation. All audio is processed
            locally on your device — nothing ever leaves your computer.
          </p>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button
              ref={allowRef}
              type="button"
              onClick={onAllow}
              className="w-full px-4 py-2.5 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              Allow access
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
