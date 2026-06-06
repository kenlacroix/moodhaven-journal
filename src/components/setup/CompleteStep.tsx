interface CompleteStepProps {
  enableLanSync: boolean;
  isAdvanced?: boolean;
}

const BASIC_NUDGES = [
  {
    icon: (
      <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    label: 'Add two-factor authentication',
    hint: 'Settings → Privacy',
    bg: 'bg-violet-50 dark:bg-violet-900/20',
    iconBg: 'bg-violet-100 dark:bg-violet-900/40',
  },
  {
    icon: (
      <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    ),
    label: 'Create a recovery key',
    hint: 'Settings → Privacy',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    iconBg: 'bg-amber-100 dark:bg-amber-900/40',
  },
  {
    icon: (
      <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
      </svg>
    ),
    label: 'Connect another device',
    hint: 'Settings → Devices',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
  },
  {
    icon: (
      <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
    ),
    label: 'Import a backup',
    hint: 'Settings → Data',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    iconBg: 'bg-blue-100 dark:bg-blue-900/40',
  },
];

export function CompleteStep({ enableLanSync, isAdvanced = true }: CompleteStepProps) {
  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
        <svg className="w-10 h-10 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
          You're All Set!
        </h2>
        <p className="text-slate-500 dark:text-slate-400">
          Your secure journal is ready. Start tracking your mood and thoughts.
        </p>
        {enableLanSync && (
          <p className="text-xs text-violet-600 dark:text-violet-400 mt-2">
            Your devices will automatically sync when on the same network.
          </p>
        )}
      </div>

      {!isAdvanced && (
        <div className="text-left space-y-2">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-center mb-3">
            Explore when you're ready
          </p>
          {BASIC_NUDGES.map((nudge) => (
            <div
              key={nudge.label}
              className={`flex items-center gap-3 p-3 ${nudge.bg} rounded-xl`}
            >
              <div className={`w-8 h-8 rounded-lg ${nudge.iconBg} flex items-center justify-center flex-shrink-0`}>
                {nudge.icon}
              </div>
              <div className="text-left min-w-0">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-tight">
                  {nudge.label}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{nudge.hint}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {isAdvanced && (
        <div className="grid grid-cols-3 gap-4 py-4">
          <div className="text-center">
            <div className="text-2xl mb-1">5</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Mood Levels</div>
          </div>
          <div className="text-center">
            <div className="text-2xl mb-1">AES-256</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Encryption</div>
          </div>
          <div className="text-center">
            <div className="text-2xl mb-1">100%</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Private</div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="btn-primary w-full py-3"
      >
        Start Journaling
      </button>
    </div>
  );
}
