/**
 * LockScreen - Password entry screen for unlocking the journal
 *
 * Supports two-factor authentication after password verification.
 */

import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { get2FAStatus } from '../lib/twoFactorService';
import { verifyUserPassword } from '../lib/journalService';
import { factoryReset, exitApp } from '../lib/dataManagementService';
import { recoverPassword, isRecoveryKeyEnabled } from '../lib/recoveryKeyService';
import { TwoFactorVerify } from '../components/twoFactor';
import type { TwoFactorStatus } from '../types/twoFactor';

type LockScreenStep = 'password' | '2fa' | 'erase-confirm' | 'recovery-key';

export function LockScreen() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<LockScreenStep>('password');
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus | null>(null);
  const [verifiedPassword, setVerifiedPassword] = useState<string | null>(null);
  const [eraseConfirmText, setEraseConfirmText] = useState('');
  const [isErasing, setIsErasing] = useState(false);
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [hasRecoveryKey, setHasRecoveryKey] = useState(false);

  const unlock = useAppStore((state) => state.unlock);

  // Check 2FA status and recovery key status on mount
  useEffect(() => {
    get2FAStatus().then(setTwoFactorStatus).catch(() => setTwoFactorStatus(null));
    isRecoveryKeyEnabled().then(setHasRecoveryKey).catch(() => setHasRecoveryKey(false));
  }, []);

  // Handle password form submission
  const handlePasswordSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!password) {
        setError('Please enter your password');
        return;
      }

      setError(null);
      setIsLoading(true);

      try {
        // First verify the password
        const isPasswordValid = await verifyUserPassword(password);

        if (!isPasswordValid) {
          setError('Incorrect password. Please try again.');
          setPassword('');
          setIsLoading(false);
          return;
        }

        // Password is valid - check if 2FA is enabled
        if (twoFactorStatus?.enabled) {
          // Store password for later use after 2FA verification
          setVerifiedPassword(password);
          setStep('2fa');
        } else {
          // No 2FA, unlock directly
          const success = await unlock(password);
          if (!success) {
            setError('Failed to unlock. Please try again.');
            setPassword('');
          }
        }
      } catch (err) {
        setError('An error occurred. Please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [password, unlock, twoFactorStatus]
  );

  // Handle successful 2FA verification
  const handle2FASuccess = useCallback(async () => {
    if (!verifiedPassword) {
      setStep('password');
      return;
    }

    setIsLoading(true);
    try {
      const success = await unlock(verifiedPassword);
      if (!success) {
        setError('Failed to unlock. Please try again.');
        setStep('password');
        setVerifiedPassword(null);
        setPassword('');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      setStep('password');
      setVerifiedPassword(null);
    } finally {
      setIsLoading(false);
    }
  }, [verifiedPassword, unlock]);

  // Handle 2FA cancellation - go back to password entry
  const handle2FACancel = useCallback(() => {
    setStep('password');
    setVerifiedPassword(null);
    setPassword('');
  }, []);

  // Handle erase and start fresh - no password required
  const handleEraseAndReset = useCallback(async () => {
    if (eraseConfirmText !== 'ERASE') {
      setError('Please type ERASE to confirm');
      return;
    }

    setIsErasing(true);
    setError(null);

    try {
      await factoryReset();
      await exitApp();
    } catch (err) {
      setError('Failed to reset. Please try again.');
      setIsErasing(false);
    }
  }, [eraseConfirmText]);

  // Cancel erase flow
  const handleEraseCancel = useCallback(() => {
    setStep('password');
    setEraseConfirmText('');
    setError(null);
  }, []);

  // Handle recovery key unlock
  const handleRecoveryKeySubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!recoveryKeyInput) {
        setError('Please enter your recovery key');
        return;
      }

      setError(null);
      setIsLoading(true);

      try {
        // Attempt to recover the password using the recovery key
        const recoveredPassword = await recoverPassword(recoveryKeyInput);

        if (!recoveredPassword) {
          setError('Invalid recovery key. Please check and try again.');
          setRecoveryKeyInput('');
          setIsLoading(false);
          return;
        }

        // Recovery key is valid - check if 2FA is enabled
        if (twoFactorStatus?.enabled) {
          // Store the recovered password for use after 2FA verification
          setVerifiedPassword(recoveredPassword);
          setStep('2fa');
        } else {
          // No 2FA, unlock directly using the recovered password
          const success = await unlock(recoveredPassword);
          if (!success) {
            setError('Failed to unlock. Please try again.');
            setRecoveryKeyInput('');
          }
        }
      } catch (err) {
        setError('An error occurred. Please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [recoveryKeyInput, unlock, twoFactorStatus]
  );

  // Cancel recovery key flow
  const handleRecoveryKeyCancel = useCallback(() => {
    setStep('password');
    setRecoveryKeyInput('');
    setError(null);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      {/* Decorative background */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-violet-200/30 dark:bg-violet-900/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-purple-200/30 dark:bg-purple-900/20 blur-3xl" />
      </div>

      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl p-8 sm:p-10">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg">
              <span className="text-white text-2xl font-bold">M</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
              {step === 'password' ? 'Welcome Back' : 'Verify Identity'}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              {step === 'password'
                ? 'Enter your password to unlock'
                : 'Complete two-factor authentication'}
            </p>
          </div>

          {/* Password Step */}
          {step === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-6">
              <div>
                <label htmlFor="password" className="label">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoFocus
                  disabled={isLoading}
                  className="input"
                />
              </div>

              {error && (
                <p className="text-sm text-rose-500 dark:text-rose-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={isLoading || !password}
                className="btn-primary w-full py-3"
              >
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Continue'
                )}
              </button>

              {/* 2FA indicator */}
              {twoFactorStatus?.enabled && (
                <p className="text-xs text-center text-slate-400 dark:text-slate-500">
                  Two-factor authentication is enabled
                </p>
              )}

              {/* Forgot password options */}
              <div className="text-center pt-2 space-y-2">
                {hasRecoveryKey && (
                  <button
                    type="button"
                    onClick={() => setStep('recovery-key')}
                    className="text-sm text-violet-500 dark:text-violet-400 hover:text-violet-600 dark:hover:text-violet-300 transition-colors block w-full"
                  >
                    Use recovery key
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setStep('erase-confirm')}
                  className="text-sm text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            </form>
          )}

          {/* 2FA Step */}
          {step === '2fa' && twoFactorStatus && (
            <TwoFactorVerify
              method={twoFactorStatus.method}
              onSuccess={handle2FASuccess}
              onCancel={handle2FACancel}
            />
          )}

          {/* Recovery Key Step */}
          {step === 'recovery-key' && (
            <form onSubmit={handleRecoveryKeySubmit} className="space-y-6">
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">
                  Enter Recovery Key
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Use your recovery key to access your journal
                </p>
              </div>

              <div>
                <label htmlFor="recoveryKey" className="label">
                  Recovery Key
                </label>
                <input
                  id="recoveryKey"
                  type="text"
                  value={recoveryKeyInput}
                  onChange={(e) => setRecoveryKeyInput(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                  autoFocus
                  disabled={isLoading}
                  className="input font-mono text-center tracking-wider"
                />
              </div>

              {error && (
                <p className="text-sm text-rose-500 dark:text-rose-400">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleRecoveryKeyCancel}
                  disabled={isLoading}
                  className="btn-secondary flex-1 py-3"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !recoveryKeyInput}
                  className="btn-primary flex-1 py-3"
                >
                  {isLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Unlock'
                  )}
                </button>
              </div>

              <p className="text-xs text-center text-slate-400 dark:text-slate-500">
                Enter the recovery key you saved during setup
              </p>
            </form>
          )}

          {/* Erase Confirmation Step */}
          {step === 'erase-confirm' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                  Erase All Data?
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  This is a zero-knowledge app. Your password cannot be recovered because we never store it.
                </p>
              </div>

              <div className="p-4 bg-rose-50 dark:bg-rose-900/20 rounded-xl space-y-3">
                <p className="text-sm text-rose-700 dark:text-rose-300 font-medium">
                  This action will permanently delete:
                </p>
                <ul className="text-sm text-rose-600 dark:text-rose-400 space-y-1 list-disc list-inside">
                  <li>All journal entries</li>
                  <li>All settings and preferences</li>
                  <li>Two-factor authentication setup</li>
                  <li>Recovery keys (if generated)</li>
                </ul>
                <p className="text-xs text-rose-500 dark:text-rose-400 font-medium pt-2">
                  This cannot be undone. There is no way to recover your data without your password.
                </p>
              </div>

              <div>
                <label htmlFor="eraseConfirm" className="label text-rose-600 dark:text-rose-400">
                  Type ERASE to confirm
                </label>
                <input
                  id="eraseConfirm"
                  type="text"
                  value={eraseConfirmText}
                  onChange={(e) => setEraseConfirmText(e.target.value.toUpperCase())}
                  placeholder="ERASE"
                  autoFocus
                  disabled={isErasing}
                  className="input border-rose-200 dark:border-rose-800 focus:border-rose-500 focus:ring-rose-500"
                />
              </div>

              {error && (
                <p className="text-sm text-rose-500 dark:text-rose-400">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleEraseCancel}
                  disabled={isErasing}
                  className="btn-secondary flex-1 py-3"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEraseAndReset}
                  disabled={isErasing || eraseConfirmText !== 'ERASE'}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 dark:disabled:bg-rose-800 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {isErasing ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Erasing...
                    </>
                  ) : (
                    'Erase & Start Fresh'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Security note */}
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-6">
            Your journal is encrypted locally. We never see your password or
            data.
          </p>
        </div>
      </div>
    </div>
  );
}
