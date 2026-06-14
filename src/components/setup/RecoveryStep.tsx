import { generateRecoveryKey, storeRecoveryKey } from '../../lib/services/recoveryKeyService';
import { exportRecoveryPdf } from '../../lib/services/recoveryPdfService';

interface RecoveryStepProps {
  onBack: () => void;
  onNext: () => void;
  password: string;
  recoveryKey: string | null;
  onRecoveryKeyGenerated: (key: string) => void;
  onRecoveryKeyClear: () => void;
  recoveryKeyConfirmed: boolean;
  onRecoveryKeyConfirmedChange: (val: boolean) => void;
  showRecoveryKey: boolean;
  onShowRecoveryKey: () => void;
  onError: (msg: string) => void;
}

export function RecoveryStep({
  onBack,
  onNext,
  password,
  recoveryKey,
  onRecoveryKeyGenerated,
  onRecoveryKeyClear,
  recoveryKeyConfirmed,
  onRecoveryKeyConfirmedChange,
  showRecoveryKey,
  onShowRecoveryKey,
  onError,
}: RecoveryStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">
          Recovery Key (Optional)
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Generate a backup key in case you forget your password
        </p>
      </div>

      {!recoveryKey ? (
        <>
          <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              A recovery key is a 24-character code that can unlock your journal if you forget your password.
            </p>
            <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1 list-disc list-inside">
              <li>Write it down and store it securely</li>
              <li>It will only be shown once</li>
              <li>Anyone with this key can access your data</li>
            </ul>
          </div>

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
              onClick={() => {
                const key = generateRecoveryKey();
                onRecoveryKeyGenerated(key);
              }}
              className="btn-primary flex-1 py-3"
            >
              Generate Key
            </button>
          </div>

          <button
            type="button"
            onClick={onNext}
            className="w-full text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 py-2"
          >
            Skip - I understand my password cannot be recovered
          </button>
        </>
      ) : (
        <>
          <div className="p-4 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-200 dark:border-violet-800">
            <p className="text-xs text-violet-600 dark:text-violet-400 mb-3 font-medium">
              Write this down and store it securely:
            </p>
            <div className="relative">
              <div className={`
                font-mono text-lg text-center py-4 px-2 bg-white dark:bg-slate-800 rounded-lg
                ${showRecoveryKey ? '' : 'blur-sm select-none'}
              `}>
                {recoveryKey}
              </div>
              {!showRecoveryKey && (
                <button
                  type="button"
                  onClick={onShowRecoveryKey}
                  className="absolute inset-0 flex items-center justify-center text-sm text-violet-600 dark:text-violet-400 hover:underline"
                >
                  Click to reveal
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(recoveryKey); }}
              className="w-full mt-3 text-xs text-violet-600 dark:text-violet-400 hover:underline"
            >
              Copy to clipboard
            </button>
          </div>

          <button
            type="button"
            onClick={async () => {
              try {
                await exportRecoveryPdf(recoveryKey);
              } catch {
                onError('Failed to save recovery PDF');
              }
            }}
            className="btn-secondary w-full py-3 flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download printable PDF
          </button>

          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={recoveryKeyConfirmed}
                onChange={(e) => onRecoveryKeyConfirmedChange(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              <span className="text-xs text-amber-700 dark:text-amber-300">
                I have written down my recovery key and stored it securely. I understand this key will not be shown again.
              </span>
            </label>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onRecoveryKeyClear}
              className="btn-secondary flex-1 py-3"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                if (recoveryKey && recoveryKeyConfirmed && password) {
                  try {
                    await storeRecoveryKey(recoveryKey, password);
                    onNext();
                  } catch {
                    onError('Failed to save recovery key');
                  }
                }
              }}
              disabled={!recoveryKeyConfirmed}
              className="btn-primary flex-1 py-3"
            >
              Save & Continue
            </button>
          </div>
        </>
      )}
    </div>
  );
}
