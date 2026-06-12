import { useState, useEffect } from 'react';
import type { TwoFactorStatus } from '../../../types/twoFactor';
import { SettingSection } from '../SettingSection';
import { totpNeedsReencryption } from '../../../lib/services/twoFactorService';

interface PrivacyTwoFactorProps {
  twoFactorStatus: TwoFactorStatus | null;
  backupCodesCount: number;
  canHardwareKey: boolean;
  onSetupTotp: () => void;
  onSetupWebAuthn: () => void;
  onRegenerateBackupCodes: () => void;
  onShowDisableConfirm: () => void;
}

export function PrivacyTwoFactor({
  twoFactorStatus,
  backupCodesCount,
  canHardwareKey,
  onSetupTotp,
  onSetupWebAuthn,
  onRegenerateBackupCodes,
  onShowDisableConfirm,
}: PrivacyTwoFactorProps) {
  const [totpLegacy, setTotpLegacy] = useState(false);

  useEffect(() => {
    if (!twoFactorStatus?.enabled) return;
    totpNeedsReencryption().then(setTotpLegacy).catch(() => {});
  }, [twoFactorStatus?.enabled]);

  return (
    <SettingSection
      title="Two-Factor Authentication"
      description="Add an extra layer of security to your account"
    >
      {twoFactorStatus?.enabled ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-800/50 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-medium text-emerald-800 dark:text-emerald-200">
                2FA Enabled
              </p>
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                {twoFactorStatus.method === 'totp' && 'Using authenticator app'}
                {twoFactorStatus.method === 'webauthn' && 'Using security key'}
                {twoFactorStatus.method === 'both' && 'Using authenticator app & security key'}
              </p>
            </div>
          </div>

          {totpLegacy && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
              Your authenticator secret was set before v1.2.0 and is stored without encryption. Disable and re-enable Authenticator App to encrypt it.
            </div>
          )}

          {/* Backup codes status */}
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Backup Codes
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {backupCodesCount} code{backupCodesCount !== 1 ? 's' : ''} remaining
              </p>
            </div>
            <button
              type="button"
              onClick={onRegenerateBackupCodes}
              className="px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors"
            >
              Regenerate
            </button>
          </div>

          {/* Add another method if only one is enabled */}
          {twoFactorStatus.method !== 'both' && (
            <div className="pt-2">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                Add another method:
              </p>
              <div className="flex gap-2">
                {twoFactorStatus.method !== 'totp' && (
                  <button
                    type="button"
                    onClick={onSetupTotp}
                    className="flex-1 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                  >
                    Add Authenticator App
                  </button>
                )}
                {twoFactorStatus.method !== 'webauthn' && canHardwareKey && (
                  <button
                    type="button"
                    onClick={onSetupWebAuthn}
                    className="flex-1 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                  >
                    Add Security Key
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Disable 2FA */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onShowDisableConfirm}
              className="text-sm text-rose-500 hover:text-rose-600 transition-colors"
            >
              Disable Two-Factor Authentication
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Protect your journal with an extra layer of security. Choose your preferred method:
          </p>

          <div className="grid gap-3">
            <button
              type="button"
              onClick={onSetupTotp}
              className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors text-left"
            >
              <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center">
                <span className="text-xl">&#128241;</span>
              </div>
              <div className="flex-1">
                <p className="font-medium text-slate-800 dark:text-slate-100">
                  Authenticator App
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Use Authy, Google Authenticator, or similar
                </p>
              </div>
              <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {canHardwareKey && (
              <button
                type="button"
                onClick={onSetupWebAuthn}
                className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors text-left"
              >
                <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center">
                  <span className="text-xl">&#128273;</span>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-slate-800 dark:text-slate-100">
                    Hardware Security Key
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Use YubiKey or similar device
                  </p>
                </div>
                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
    </SettingSection>
  );
}
