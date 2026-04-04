import { TotpSetup, HardwareKeySetup } from '../two-factor';
import { usePlatform } from '../../hooks/usePlatform';

interface SecurityStepProps {
  onBack: () => void;
  onNext: () => void;
  twoFactorSetupMode: 'none' | 'totp' | 'hardwarekey';
  onSetupModeChange: (mode: 'none' | 'totp' | 'hardwarekey') => void;
  twoFactorComplete: boolean;
  onTwoFactorComplete: (complete: boolean) => void;
}

export function SecurityStep({
  onBack,
  onNext,
  twoFactorSetupMode,
  onSetupModeChange,
  twoFactorComplete,
  onTwoFactorComplete,
}: SecurityStepProps) {
  const { isBrowser } = usePlatform();
  return (
    <div className="space-y-6">
      {twoFactorSetupMode === 'totp' && (
        <TotpSetup
          onComplete={() => {
            onTwoFactorComplete(true);
            onSetupModeChange('none');
          }}
          onCancel={() => onSetupModeChange('none')}
        />
      )}
      {twoFactorSetupMode === 'hardwarekey' && (
        <HardwareKeySetup
          onComplete={() => {
            onTwoFactorComplete(true);
            onSetupModeChange('none');
          }}
          onCancel={() => onSetupModeChange('none')}
        />
      )}

      {twoFactorSetupMode === 'none' && (
        <>
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">
              {twoFactorComplete ? 'Two-Factor Authentication Enabled' : 'Enhanced Security'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {twoFactorComplete
                ? 'Your account is now protected with 2FA'
                : 'Add an extra layer of protection with two-factor authentication'}
            </p>
          </div>

          {twoFactorComplete ? (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-2">
                <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                2FA is configured. You can manage it later in Settings.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => onSetupModeChange('totp')}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-600 text-left transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-700 dark:text-slate-200">Authenticator App</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Use Authy, Google Authenticator, or a password manager
                    </p>
                  </div>
                </button>

                {!isBrowser && (
                  <button
                    type="button"
                    onClick={() => onSetupModeChange('hardwarekey')}
                    className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-600 text-left transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-xl">🔑</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-slate-700 dark:text-slate-200">Hardware Security Key</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Use a YubiKey or similar FIDO2 device (native)
                      </p>
                    </div>
                  </button>
                )}
              </div>

              <p className="text-xs text-center text-slate-400 dark:text-slate-500">
                You can also set this up later in Settings
              </p>
            </>
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
              onClick={onNext}
              className="btn-primary flex-1 py-3"
            >
              {twoFactorComplete ? 'Continue' : 'Skip for Now'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
