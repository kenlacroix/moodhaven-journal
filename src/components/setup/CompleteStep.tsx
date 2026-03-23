interface CompleteStepProps {
  enableLanSync: boolean;
}

export function CompleteStep({ enableLanSync }: CompleteStepProps) {
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
