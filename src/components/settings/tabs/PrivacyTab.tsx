import { useEffect, useState, useCallback } from 'react';
import type { AppSettings } from '../../../types/settings';
import type { TwoFactorStatus, BackupCodes } from '../../../types/twoFactor';
import { SettingSection, SettingToggle, SettingSelect } from '../index';
import { useSettingsStore } from '../../../stores/settingsStore';
import { regenerateBackupCodes, disable2FA } from '../../../lib/services/twoFactorService';
import { biometricIsAvailable, biometricIsEnrolled, biometricUnenroll } from '../../../lib/services/biometricService';
import { factoryReset, exitApp } from '../../../lib/services/dataManagementService';
import { usePlatform } from '../../../hooks/usePlatform';
import { TotpSetup, HardwareKeySetup, BackupCodesDisplay } from '../../two-factor';
import { logger } from '../../../lib/services/logger';

interface PrivacyTabProps {
  settings: AppSettings;
  dataStats: { totalEntries: number; averageMood: number } | null;
  twoFactorStatus: TwoFactorStatus | null;
  backupCodesCount: number;
  refresh2FAStatus: () => Promise<void>;
  isExporting: boolean;
  exportProgress: { done: number; total: number } | null;
  handleExport: () => void;
  setAutoLockTimeout: (v: number) => void;
}

export function PrivacyTab({
  settings,
  dataStats,
  twoFactorStatus,
  backupCodesCount,
  refresh2FAStatus,
  isExporting,
  exportProgress,
  handleExport,
  setAutoLockTimeout,
}: PrivacyTabProps) {
  const { isAndroid, isBrowser } = usePlatform();

  const [show2FASetup, setShow2FASetup] = useState<'totp' | 'webauthn' | null>(null);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [backupCodes, setBackupCodes] = useState<BackupCodes | null>(null);
  const [isDisabling2FA, setIsDisabling2FA] = useState(false);
  const [showDisable2FAConfirm, setShowDisable2FAConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnrolled, setBiometricEnrolled] = useState(false);
  const [biometricDisabling, setBiometricDisabling] = useState(false);

  useEffect(() => {
    if (!isAndroid) return;
    Promise.all([biometricIsAvailable(), biometricIsEnrolled()]).then(
      ([available, enrolled]) => {
        setBiometricAvailable(available);
        setBiometricEnrolled(enrolled);
      }
    ).catch(() => {});
  }, [isAndroid]);

  const handle2FASetupComplete = useCallback(() => {
    setShow2FASetup(null);
    void refresh2FAStatus();
  }, [refresh2FAStatus]);

  const handleRegenerateBackupCodes = useCallback(async () => {
    try {
      const codes = await regenerateBackupCodes();
      setBackupCodes(codes);
      setShowBackupCodes(true);
      void refresh2FAStatus();
    } catch (error) {
      logger.error('Failed to regenerate backup codes:', { error: String(error) });
    }
  }, [refresh2FAStatus]);

  const handleDisable2FA = useCallback(async () => {
    setIsDisabling2FA(true);
    try {
      await disable2FA();
      setShowDisable2FAConfirm(false);
      void refresh2FAStatus();
    } catch (error) {
      logger.error('Failed to disable 2FA:', { error: String(error) });
    } finally {
      setIsDisabling2FA(false);
    }
  }, [refresh2FAStatus]);

  const handleReset = useCallback(async () => {
    if (resetConfirmText !== 'RESET') return;
    setIsResetting(true);
    try {
      await factoryReset();
      await exitApp();
    } catch (error) {
      logger.error('Reset failed:', { error: String(error) });
      setIsResetting(false);
    }
  }, [resetConfirmText]);

  return (
    <>
      <div id="panel-privacy" role="tabpanel" className="space-y-6">
        <SettingSection
          title="Privacy & Security"
          description="Keep your journal safe"
        >
          <SettingSelect
            label="Auto-lock timeout"
            description="Lock the app after inactivity"
            value={String(settings.privacy.autoLockTimeout)}
            options={[
              { value: '0', label: 'Never' },
              { value: '1', label: '1 minute' },
              { value: '5', label: '5 minutes' },
              { value: '15', label: '15 minutes' },
              { value: '30', label: '30 minutes' },
            ]}
            onChange={(v) => setAutoLockTimeout(Number(v))}
          />

          <SettingToggle
            label="Clear clipboard on lock"
            description="Remove copied content when the app locks"
            checked={settings.privacy.clearClipboardOnLock}
            onChange={(v) => useSettingsStore.setState((s) => ({
              settings: { ...s.settings, privacy: { ...s.settings.privacy, clearClipboardOnLock: v } },
              hasUnsavedChanges: true,
            }))}
          />
        </SettingSection>

        {/* Biometric Unlock — Android only */}
        {isAndroid && biometricAvailable && (
          <SettingSection
            title="Biometric Unlock"
            description="Use fingerprint or face to unlock MoodHaven Journal instead of typing your password"
          >
            {biometricEnrolled ? (
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Biometric unlock is enabled
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Your password is encrypted with a key only your fingerprint can unlock
                  </p>
                </div>
                <button
                  type="button"
                  disabled={biometricDisabling}
                  onClick={async () => {
                    setBiometricDisabling(true);
                    await biometricUnenroll();
                    setBiometricEnrolled(false);
                    setBiometricDisabling(false);
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors disabled:opacity-50"
                >
                  {biometricDisabling ? 'Disabling…' : 'Disable'}
                </button>
              </div>
            ) : (
              <div className="flex items-start gap-3 py-2">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Biometric unlock is not set up
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    To enable it, lock the app and use your password to unlock — you'll be offered fingerprint setup automatically.
                  </p>
                </div>
              </div>
            )}
          </SettingSection>
        )}

        {/* Two-Factor Authentication Section */}
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
                  onClick={handleRegenerateBackupCodes}
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
                        onClick={() => setShow2FASetup('totp')}
                        className="flex-1 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                      >
                        Add Authenticator App
                      </button>
                    )}
                    {twoFactorStatus.method !== 'webauthn' && !isBrowser && (
                      <button
                        type="button"
                        onClick={() => setShow2FASetup('webauthn')}
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
                  onClick={() => setShowDisable2FAConfirm(true)}
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
                  onClick={() => setShow2FASetup('totp')}
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

                {!isBrowser && (
                <button
                  type="button"
                  onClick={() => setShow2FASetup('webauthn')}
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

        <SettingSection
          title="Data Management"
          description="Control your personal data"
        >
          {dataStats && (
            <div className="flex gap-4 mb-4">
              <div className="flex-1 p-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl text-center">
                <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">
                  {dataStats.totalEntries}
                </div>
                <div className="text-xs text-violet-600/70 dark:text-violet-400/70">
                  Total Entries
                </div>
              </div>
              <div className="flex-1 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-center">
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {dataStats.averageMood.toFixed(1)}
                </div>
                <div className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                  Avg Mood
                </div>
              </div>
            </div>
          )}

          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
              Your journal entries are encrypted using AES-256-GCM encryption with PBKDF2 key derivation (600,000 iterations).
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isExporting}
                className="px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors disabled:opacity-50"
                onClick={handleExport}
              >
                {isExporting
                  ? exportProgress
                    ? `Packing media ${exportProgress.done}/${exportProgress.total}…`
                    : 'Exporting…'
                  : 'Export Data'}
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-sm font-medium text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/30 rounded-lg hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors"
                onClick={() => setShowResetConfirm(true)}
              >
                Reset App
              </button>
            </div>
          </div>
        </SettingSection>
      </div>

      {/* Reset confirmation dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                  Factory Reset
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  This action cannot be undone
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              This will permanently delete all your journal entries, settings, and encryption keys.
              You will need to set up the app again.
            </p>

            <div className="mb-4">
              <label htmlFor="resetConfirm" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                Type <span className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded">RESET</span> to confirm
              </label>
              <input
                id="resetConfirm"
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="RESET"
                className="input"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                onClick={() => {
                  setShowResetConfirm(false);
                  setResetConfirmText('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetConfirmText !== 'RESET' || isResetting}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleReset}
              >
                {isResetting ? 'Resetting...' : 'Delete Everything'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2FA Setup Modal - TOTP */}
      {show2FASetup === 'totp' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 max-w-md mx-4 w-full">
            <TotpSetup
              onComplete={handle2FASetupComplete}
              onCancel={() => setShow2FASetup(null)}
            />
          </div>
        </div>
      )}

      {/* 2FA Setup Modal - Hardware Key */}
      {show2FASetup === 'webauthn' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 max-w-md mx-4 w-full">
            <HardwareKeySetup
              onComplete={handle2FASetupComplete}
              onCancel={() => setShow2FASetup(null)}
            />
          </div>
        </div>
      )}

      {/* Backup Codes Modal */}
      {showBackupCodes && backupCodes && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 max-w-md mx-4 w-full">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
              New Backup Codes
            </h3>
            <BackupCodesDisplay
              codes={backupCodes.codes}
              onDone={() => {
                setShowBackupCodes(false);
                setBackupCodes(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Disable 2FA Confirmation */}
      {showDisable2FAConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                  Disable 2FA
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  This will reduce your account security
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              Are you sure you want to disable two-factor authentication?
              Your journal will only be protected by your password.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                onClick={() => setShowDisable2FAConfirm(false)}
              >
                Keep Enabled
              </button>
              <button
                type="button"
                disabled={isDisabling2FA}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50"
                onClick={handleDisable2FA}
              >
                {isDisabling2FA ? 'Disabling...' : 'Disable 2FA'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

