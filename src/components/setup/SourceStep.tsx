interface SourceStepProps {
  onBack: () => void;
  onChooseFresh: () => void;
  onChooseSync: () => void;
}

export function SourceStep({ onBack, onChooseFresh, onChooseSync }: SourceStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">
          How would you like to start?
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Start fresh or restore your data from another device on your network.
        </p>
      </div>

      <div className="space-y-3">
        {/* Start fresh */}
        <button
          type="button"
          onClick={onChooseFresh}
          className="w-full text-left p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/10 transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 group"
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0 group-hover:bg-violet-200 dark:group-hover:bg-violet-800/40 transition-colors">
              <svg className="w-5 h-5 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-white">Start fresh</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                New to MoodHaven Journal — create a new journal from scratch.
              </p>
            </div>
            <svg className="w-5 h-5 text-slate-300 dark:text-slate-600 ml-auto flex-shrink-0 self-center group-hover:text-violet-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

        {/* Sync from another device */}
        <button
          type="button"
          onClick={onChooseSync}
          className="w-full text-left p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 group"
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-800/40 transition-colors">
              <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-white">Restore from another device</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Pull your journals, settings and data from a device already running MoodHaven Journal on this network.
              </p>
            </div>
            <svg className="w-5 h-5 text-slate-300 dark:text-slate-600 ml-auto flex-shrink-0 self-center group-hover:text-emerald-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="btn-secondary w-full py-3"
      >
        Back
      </button>
    </div>
  );
}
