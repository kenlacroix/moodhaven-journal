/**
 * MicrophoneBlockedModal — shown when the OS or WebView has denied microphone access.
 *
 * Provides platform-specific instructions for re-enabling the permission
 * and offers a deep-link button to the relevant system settings page.
 *
 * A11y: role="alertdialog" aria-modal, focus on dismiss on open, Escape = Dismiss.
 */

import { useEffect, useRef } from 'react';
import { open } from '@tauri-apps/plugin-shell';

export interface MicrophoneBlockedModalProps {
  isOpen: boolean;
  onDismiss: () => void;
}

type Platform = 'macos' | 'windows' | 'linux';

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  const pl = navigator.platform?.toLowerCase() ?? '';
  if (pl.includes('mac') || ua.includes('mac')) return 'macos';
  if (pl.includes('win') || ua.includes('windows')) return 'windows';
  return 'linux';
}

const PLATFORM_INSTRUCTIONS: Record<Platform, { steps: string[]; settingsUrl: string | null }> = {
  macos: {
    steps: [
      'Open System Settings (Apple menu → System Settings)',
      'Go to Privacy & Security → Microphone',
      'Enable the toggle next to MoodBloom',
    ],
    settingsUrl: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  },
  windows: {
    steps: [
      'Open Windows Settings (Start → Settings)',
      'Go to Privacy & security → Microphone',
      'Turn on "Let apps access your microphone" and enable MoodBloom',
    ],
    settingsUrl: 'ms-settings:privacy-microphone',
  },
  linux: {
    steps: [
      'Open your system settings and search for "Privacy" or "Sound"',
      'Ensure MoodBloom has permission to access the microphone',
      'Some desktop environments require re-launching the app after granting permission',
    ],
    settingsUrl: null,
  },
};

export function MicrophoneBlockedModal({ isOpen, onDismiss }: MicrophoneBlockedModalProps) {
  const dismissRef = useRef<HTMLButtonElement>(null);
  const platform = detectPlatform();
  const { steps, settingsUrl } = PLATFORM_INSTRUCTIONS[platform];

  // Focus dismiss on open
  useEffect(() => {
    if (isOpen) {
      dismissRef.current?.focus();
    }
  }, [isOpen]);

  // Escape = Dismiss
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onDismiss]);

  if (!isOpen) return null;

  const handleOpenSettings = async () => {
    if (settingsUrl) {
      try {
        await open(settingsUrl);
      } catch {
        // If the deep link fails, the instructions are still visible
      }
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onDismiss}
      />

      {/* Modal */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="mic-blocked-title"
        aria-describedby="mic-blocked-body"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full p-6">
          {/* Warning icon */}
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 mx-auto mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-red-600 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>

          {/* Title */}
          <h2
            id="mic-blocked-title"
            className="text-lg font-semibold text-slate-800 dark:text-slate-100 text-center mb-2"
          >
            Microphone access blocked
          </h2>

          {/* Body */}
          <p
            id="mic-blocked-body"
            className="text-sm text-slate-600 dark:text-slate-400 text-center leading-relaxed mb-4"
          >
            MoodBloom doesn't have permission to use your microphone. To enable dictation:
          </p>

          {/* Platform-specific steps */}
          <ol className="space-y-1.5 mb-6">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-medium flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {settingsUrl && (
              <button
                type="button"
                onClick={handleOpenSettings}
                className="w-full px-4 py-2.5 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                Open system settings
              </button>
            )}
            <button
              ref={dismissRef}
              type="button"
              onClick={onDismiss}
              className="w-full px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
