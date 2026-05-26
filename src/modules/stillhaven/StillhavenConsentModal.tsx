import React from 'react';

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
}

export function StillhavenConsentModal({ onConfirm, onCancel }: Props): React.JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stillhaven-consent-title"
    >
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6 space-y-5">
        <div className="space-y-1">
          <h2 id="stillhaven-consent-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            About StillHaven
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Read before enabling</p>
        </div>

        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          <p>
            StillHaven uses bilateral audio stimulation — alternating left-right tones — as a general wellness
            practice. Many people find it helps their nervous system settle after stress, persistent mental
            noise, or times when the body feels tense but the mind can&apos;t explain why.
          </p>
          <p>
            It is not a licensed tool and is not a substitute for working with a mental health professional.
            It uses the same kind of left-right rhythm found in some professional approaches, but without the
            structured guidance those approaches provide.
          </p>
          <p className="font-medium text-amber-700 dark:text-amber-400">
            It may not be appropriate if you are currently experiencing dissociation, flashbacks, or acute
            crisis. If you are unsure, please consult a qualified professional before using it.
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            I understand, enable StillHaven
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
