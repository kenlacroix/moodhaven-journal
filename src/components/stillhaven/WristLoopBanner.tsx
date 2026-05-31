/**
 * WristLoopBanner — v1.5.0
 *
 * Fixed bottom-right toast that appears when the Wear OS watch sends a
 * 'still_trigger' signal requesting a StillHaven session on desktop.
 * Renders only when pendingTrigger is non-null (managed by useWristLoop).
 */

import type { WristLoopTrigger } from '../../hooks/useWristLoop';

const PROTOCOL_LABELS: Record<string, string> = {
  general_activation: 'General Activation',
  fake_danger: 'Fake Danger',
};

interface WristLoopBannerProps {
  trigger: WristLoopTrigger;
  onAccept: () => void;
  onDismiss: () => void;
}

export function WristLoopBanner({ trigger, onAccept, onDismiss }: WristLoopBannerProps) {
  const protocolLabel = trigger.protocol
    ? PROTOCOL_LABELS[trigger.protocol] ?? trigger.protocol
    : 'General Activation';

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 w-80 rounded-2xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden animate-entry-in"
    >
      {/* Accent bar */}
      <div className="h-1 bg-gradient-to-r from-violet-500 to-indigo-500" />

      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center text-lg flex-shrink-0">
            ⌚
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Watch wants to start StillHaven
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Protocol: {protocolLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="ml-auto flex-shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 px-3 py-2 text-xs font-semibold bg-violet-500 hover:bg-violet-600 text-white rounded-xl transition-colors"
          >
            Start StillHaven
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
