import { useState } from 'react';

interface WelcomeStepProps {
  onNext: (advanced: boolean) => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  const [advanced, setAdvanced] = useState(false);

  return (
    <div className="text-center space-y-6">
      {/* Bloom icon */}
      <div className="flex justify-center">
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <ellipse cx="36" cy="21" rx="8" ry="14" fill="#ddd6fe" transform="rotate(0 36 36)" />
          <ellipse cx="36" cy="21" rx="8" ry="14" fill="#c4b5fd" transform="rotate(60 36 36)" />
          <ellipse cx="36" cy="21" rx="8" ry="14" fill="#ddd6fe" transform="rotate(120 36 36)" />
          <ellipse cx="36" cy="21" rx="8" ry="14" fill="#c4b5fd" transform="rotate(180 36 36)" />
          <ellipse cx="36" cy="21" rx="8" ry="14" fill="#ddd6fe" transform="rotate(240 36 36)" />
          <ellipse cx="36" cy="21" rx="8" ry="14" fill="#c4b5fd" transform="rotate(300 36 36)" />
          <circle cx="36" cy="36" r="11" fill="#8b5cf6" />
          <circle cx="36" cy="36" r="6" fill="#7c3aed" />
        </svg>
      </div>
      <div>
        <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">
          Welcome to MoodHaven Journal
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          Your private, secure mood tracking and journaling companion.
        </p>
      </div>
      <div className="flex items-center justify-center flex-wrap gap-x-4 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          End-to-end encrypted
        </span>
        <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
        <span className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Stays on your device
        </span>
        <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
        <span className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          Optional AI insights
        </span>
      </div>
      {/* PRIV-004: Privacy-by-design callout */}
      <div className="text-left p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-2">
          Private by design
        </p>
        <ul className="space-y-1">
          {[
            'Journal text never leaves your device',
            'No accounts, no cloud profile, no telemetry',
            'AES-256-GCM encryption — only you hold the key',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-emerald-800 dark:text-emerald-300">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Advanced setup toggle */}
      <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/40 rounded-xl text-left">
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Advanced setup</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Configure 2FA, sync, cloud backup and more
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={advanced}
          onClick={() => setAdvanced((v) => !v)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${advanced ? 'bg-violet-500' : 'bg-slate-200 dark:bg-slate-600'}`}
        >
          <span className="sr-only">Enable advanced setup</span>
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${advanced ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
      </div>

      <button
        type="button"
        onClick={() => onNext(advanced)}
        className="btn-primary w-full py-3"
      >
        Create My Journal
      </button>
    </div>
  );
}
