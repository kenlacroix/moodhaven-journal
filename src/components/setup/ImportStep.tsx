interface ImportStepProps {
  onBack: () => void;
  onSubmit: () => void;
  importFile: File | null;
  onImportFileChange: (file: File | null) => void;
  error: string | null;
  isLoading: boolean;
}

export function ImportStep({
  onBack,
  onSubmit,
  importFile,
  onImportFileChange,
  error,
  isLoading,
}: ImportStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">
          Import Existing Data
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Have a backup? Import it now or skip this step
        </p>
      </div>

      <div
        className={`
          border-2 border-dashed rounded-xl p-8 text-center transition-colors
          ${importFile
            ? 'border-violet-300 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/20'
            : 'border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-600'
          }
        `}
      >
        {importFile ? (
          <div className="space-y-2">
            <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-medium text-slate-700 dark:text-slate-200">{importFile.name}</p>
            <button
              type="button"
              onClick={() => onImportFileChange(null)}
              className="text-sm text-rose-500 hover:text-rose-600"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <label htmlFor="importFile" className="cursor-pointer">
                <span className="text-violet-600 dark:text-violet-400 font-medium hover:underline">
                  Choose file
                </span>
                <span className="text-slate-500 dark:text-slate-400"> or drag and drop</span>
              </label>
              <input
                id="importFile"
                type="file"
                accept=".moodbloom,.json"
                onChange={(e) => onImportFileChange(e.target.files?.[0] || null)}
                className="sr-only"
              />
            </div>
            <p className="text-xs text-slate-400">.moodbloom or .json backup files</p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-rose-500 dark:text-rose-400">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary flex-1 py-3"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isLoading}
          className="btn-primary flex-1 py-3"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Setting up...
            </>
          ) : importFile ? (
            'Import & Continue'
          ) : (
            'Skip & Continue'
          )}
        </button>
      </div>
    </div>
  );
}
