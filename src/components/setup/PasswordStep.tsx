interface PasswordStepProps {
  onBack: () => void;
  onSubmit: () => void;
  password: string;
  confirmPassword: string;
  onPasswordChange: (val: string) => void;
  onConfirmPasswordChange: (val: string) => void;
  error: string | null;
  setupMode: 'fresh' | 'sync';
  isLoading?: boolean;
}

function getPasswordStrength(password: string) {
  if (!password) return { label: '', color: '', width: '0%' };
  if (password.length < 8) return { label: 'Too short', color: 'bg-rose-500', width: '25%' };
  if (password.length < 12) return { label: 'Fair', color: 'bg-amber-500', width: '50%' };
  if (password.length < 16) return { label: 'Good', color: 'bg-lime-500', width: '75%' };
  return { label: 'Strong', color: 'bg-emerald-500', width: '100%' };
}

export function PasswordStep({
  onBack,
  onSubmit,
  password,
  confirmPassword,
  onPasswordChange,
  onConfirmPasswordChange,
  error,
  setupMode,
  isLoading = false,
}: PasswordStepProps) {
  const strength = getPasswordStrength(password);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">
          {setupMode === 'sync' ? 'Enter Your Password' : 'Create Your Password'}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {setupMode === 'sync'
            ? 'Enter the same password used on your other device — data is encrypted with it.'
            : 'This password encrypts all your journal entries'}
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="Create a strong password"
            autoFocus
            className="input"
          />
          {password && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full ${strength.color} transition-all duration-300`}
                  style={{ width: strength.width }}
                />
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 w-16">
                {strength.label}
              </span>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="confirmPassword" className="label">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => onConfirmPasswordChange(e.target.value)}
            placeholder="Confirm your password"
            className="input"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-rose-500 dark:text-rose-400">{error}</p>
      )}

      <div className="p-4 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-800">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
              Zero-Knowledge Security
            </p>
            <p className="text-xs text-rose-600 dark:text-rose-400">
              Your password encrypts all data locally. We never see or store your password.
              <strong className="block mt-1">
                If you forget your password, your data cannot be recovered.
              </strong>
            </p>
          </div>
        </div>
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
          onClick={onSubmit}
          disabled={!password || !confirmPassword || isLoading}
          className="btn-primary flex-1 py-3"
        >
          {isLoading ? 'Setting up…' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
