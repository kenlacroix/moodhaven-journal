/**
 * LockScreen - Password entry screen for unlocking the journal
 *
 * Supports two-factor authentication after password verification.
 * Includes exponential-backoff rate limiting on failed attempts.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import { get2FAStatus } from '../lib/twoFactorService';
import { verifyUserPassword } from '../lib/journalService';
import { factoryReset, exitApp } from '../lib/dataManagementService';
import { recoverPassword, isRecoveryKeyEnabled } from '../lib/recoveryKeyService';
import {
  biometricIsAvailable,
  biometricIsEnrolled,
  biometricAuthenticate,
  biometricEnroll,
} from '../lib/biometricService';
import { TwoFactorVerify } from '../components/twoFactor';
import type { TwoFactorStatus } from '../types/twoFactor';
import {
  loadRateLimitState,
  recordFailedAttempt,
  resetRateLimit,
  isLockedOut,
  getRemainingLockoutMs,
  getRemainingFreeAttempts,
  getNextLockoutDuration,
  formatDuration,
  type RateLimitState,
} from '../lib/rateLimitService';

type LockScreenStep = 'password' | '2fa' | 'erase-confirm' | 'recovery-key' | 'biometric-enroll-offer';

/** Format remaining ms as mm:ss for the countdown display. */
function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

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

  // Biometric state
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnrolled, setBiometricEnrolled] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricError, setBiometricError] = useState<string | null>(null);
  // Holds the verified password while offering biometric enrollment
  const pendingPasswordRef = useRef<string | null>(null);

  // Rate limiting state
  const [rateLimitState, setRateLimitState] = useState<RateLimitState>({
    failedAttempts: 0,
    lockoutUntil: null,
    lastFailedAt: null,
  });
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const unlock = useAppStore((state) => state.unlock);

  const lockedOut = lockoutRemaining > 0;

  // Check 2FA status, recovery key status, rate limit, and biometric on mount
  useEffect(() => {
    get2FAStatus().then(setTwoFactorStatus).catch(() => setTwoFactorStatus(null));
    isRecoveryKeyEnabled().then(setHasRecoveryKey).catch(() => setHasRecoveryKey(false));
    loadRateLimitState().then((state) => {
      setRateLimitState(state);
      setLockoutRemaining(getRemainingLockoutMs(state));
    });
    // Check biometric availability
    Promise.all([biometricIsAvailable(), biometricIsEnrolled()]).then(
      ([available, enrolled]) => {
        setBiometricAvailable(available);
        setBiometricEnrolled(enrolled);
      }
    ).catch(() => {});
  }, []);

  // Countdown timer — ticks every second while locked out
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (lockoutRemaining > 0) {
      timerRef.current = setInterval(() => {
        const remaining = getRemainingLockoutMs(rateLimitState);
        setLockoutRemaining(remaining);
        if (remaining <= 0) {
          setError(null);
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [lockoutRemaining > 0, rateLimitState]);

  // Helper: handle a failed auth attempt (shared by password and recovery key)
  const handleFailedAttempt = useCallback(
    async (baseError: string) => {
      const newState = await recordFailedAttempt(rateLimitState);
      setRateLimitState(newState);
      const remaining = getRemainingLockoutMs(newState);
      setLockoutRemaining(remaining);

      if (remaining > 0) {
        setError(`Too many failed attempts. Try again in ${formatDuration(remaining)}.`);
      } else {
        const freeLeft = getRemainingFreeAttempts(newState);
        if (freeLeft > 0) {
          setError(`${baseError} ${freeLeft} ${freeLeft === 1 ? 'attempt' : 'attempts'} remaining before lockout.`);
        } else {
          // Last free attempt was just used — next failure triggers lockout
          const nextDuration = getNextLockoutDuration(newState);
          setError(`${baseError} Next failure will lock for ${formatDuration(nextDuration)}.`);
        }
      }
    },
    [rateLimitState]
  );

  // Handle password form submission
  const handlePasswordSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!password) {
        setError('Please enter your password');
        return;
      }

      // Block if currently locked out
      if (isLockedOut(rateLimitState)) {
        const remaining = getRemainingLockoutMs(rateLimitState);
        setLockoutRemaining(remaining);
        setError(`Account is temporarily locked. Try again in ${formatDuration(remaining)}.`);
        return;
      }

      setError(null);
      setIsLoading(true);

      try {
        // First verify the password
        const isPasswordValid = await verifyUserPassword(password);

        if (!isPasswordValid) {
          setPassword('');
          setIsLoading(false);
          await handleFailedAttempt('Incorrect password.');
          return;
        }

        // Password is valid — reset rate limit
        await resetRateLimit();
        setRateLimitState({ failedAttempts: 0, lockoutUntil: null, lastFailedAt: null });
        setLockoutRemaining(0);

        // Check if 2FA is enabled
        if (twoFactorStatus?.enabled) {
          // Store password for later use after 2FA verification
          setVerifiedPassword(password);
          setStep('2fa');
        } else if (biometricAvailable && !biometricEnrolled) {
          // Offer biometric enrollment before entering the app
          pendingPasswordRef.current = password;
          setStep('biometric-enroll-offer');
        } else {
          // No 2FA, no biometric offer — unlock directly
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
    [password, unlock, twoFactorStatus, rateLimitState, handleFailedAttempt]
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

  // Handle erase and start fresh - no password required, never rate-limited
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

      // Block if currently locked out (shares counter with password)
      if (isLockedOut(rateLimitState)) {
        const remaining = getRemainingLockoutMs(rateLimitState);
        setLockoutRemaining(remaining);
        setError(`Account is temporarily locked. Try again in ${formatDuration(remaining)}.`);
        return;
      }

      setError(null);
      setIsLoading(true);

      try {
        // Attempt to recover the password using the recovery key
        const recoveredPassword = await recoverPassword(recoveryKeyInput);

        if (!recoveredPassword) {
          setRecoveryKeyInput('');
          setIsLoading(false);
          await handleFailedAttempt('Invalid recovery key.');
          return;
        }

        // Recovery key is valid — reset rate limit
        await resetRateLimit();
        setRateLimitState({ failedAttempts: 0, lockoutUntil: null, lastFailedAt: null });
        setLockoutRemaining(0);

        // Check if 2FA is enabled
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
    [recoveryKeyInput, unlock, twoFactorStatus, rateLimitState, handleFailedAttempt]
  );

  // Cancel recovery key flow
  const handleRecoveryKeyCancel = useCallback(() => {
    setStep('password');
    setRecoveryKeyInput('');
    setError(null);
  }, []);

  // Trigger biometric prompt on the lock screen
  const handleBiometricUnlock = useCallback(async () => {
    setBiometricLoading(true);
    setBiometricError(null);
    try {
      const result = await biometricAuthenticate();
      if (!result.ok) {
        if (result.reason === 'invalidated') {
          setBiometricEnrolled(false);
          setBiometricError('Biometric unlock was reset because new fingerprints were added. Use your password.');
        }
        // 'cancelled' — user pressed "Use Password", just do nothing
        return;
      }
      // Biometric succeeded — unlock using the decrypted password
      const success = await unlock(result.password);
      if (!success) {
        setBiometricError('Unlock failed. Please use your password.');
      }
    } catch (e) {
      setBiometricError('Biometric error. Please use your password.');
    } finally {
      setBiometricLoading(false);
    }
  }, [unlock]);

  // After password unlock: offer to enroll biometrics
  const handleBiometricEnrollOffer = useCallback(async (accept: boolean) => {
    const password = pendingPasswordRef.current;
    if (!password) { await unlock(''); return; } // fallback — should not happen

    if (accept) {
      try {
        const enrolled = await biometricEnroll(password);
        if (enrolled) setBiometricEnrolled(true);
      } catch {
        // Enrollment failed — continue to app anyway
      }
    }
    // Proceed to unlock regardless of enrollment outcome
    await unlock(password);
    pendingPasswordRef.current = null;
  }, [unlock]);

  // Derived UI helpers
  const freeAttemptsLeft = getRemainingFreeAttempts(rateLimitState);
  const showAttemptsWarning =
    !lockedOut &&
    rateLimitState.failedAttempts > 0 &&
    rateLimitState.failedAttempts <= 4;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
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

          {/* Lockout Banner — shown on password and recovery-key steps */}
          {lockedOut && (step === 'password' || step === 'recovery-key') && (
            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Account temporarily locked
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    Too many failed attempts. Try again in{' '}
                    <span className="font-mono font-medium">{formatCountdown(lockoutRemaining)}</span>
                  </p>
                </div>
              </div>
            </div>
          )}

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
                  disabled={isLoading || lockedOut}
                  className="input"
                />
              </div>

              {error && (
                <p className="text-sm text-rose-500 dark:text-rose-400">{error}</p>
              )}

              {/* Attempts remaining warning */}
              {showAttemptsWarning && !error && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {freeAttemptsLeft} {freeAttemptsLeft === 1 ? 'attempt' : 'attempts'} remaining before lockout
                </p>
              )}

              <button
                type="submit"
                disabled={isLoading || !password || lockedOut}
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

              {/* Biometric unlock button — shown when enrolled */}
              {biometricAvailable && biometricEnrolled && (
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBiometricUnlock}
                    disabled={biometricLoading || lockedOut}
                    className="w-16 h-16 rounded-full bg-violet-50 dark:bg-violet-900/20 border-2 border-violet-200 dark:border-violet-700 flex items-center justify-center hover:bg-violet-100 dark:hover:bg-violet-900/40 active:scale-95 transition-all disabled:opacity-50"
                    aria-label="Unlock with fingerprint"
                  >
                    {biometricLoading ? (
                      <span className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-8 h-8 text-violet-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33" />
                      </svg>
                    )}
                  </button>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Touch to unlock
                  </p>
                  {biometricError && (
                    <p className="text-xs text-rose-500 dark:text-rose-400 text-center">{biometricError}</p>
                  )}
                </div>
              )}

              {/* 2FA indicator */}
              {twoFactorStatus?.enabled && (
                <p className="text-xs text-center text-slate-400 dark:text-slate-500">
                  Two-factor authentication is enabled
                </p>
              )}

              {/* Forgot password options — never gated by lockout */}
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
                  disabled={isLoading || lockedOut}
                  className="input font-mono text-center tracking-wider"
                />
              </div>

              {error && (
                <p className="text-sm text-rose-500 dark:text-rose-400">{error}</p>
              )}

              {/* Attempts remaining warning */}
              {showAttemptsWarning && !error && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {freeAttemptsLeft} {freeAttemptsLeft === 1 ? 'attempt' : 'attempts'} remaining before lockout
                </p>
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
                  disabled={isLoading || !recoveryKeyInput || lockedOut}
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

          {/* Biometric Enrollment Offer Step */}
          {step === 'biometric-enroll-offer' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-9 h-9 text-violet-600 dark:text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                  Enable Fingerprint Unlock?
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Unlock MoodHaven Journal instantly with your fingerprint — no password needed each time.
                </p>
              </div>

              <div className="p-4 bg-violet-50 dark:bg-violet-900/20 rounded-xl space-y-2">
                <p className="text-xs text-violet-700 dark:text-violet-300 font-medium">How it works</p>
                <ul className="text-xs text-violet-600 dark:text-violet-400 space-y-1">
                  <li>• Your password is encrypted with a key only your fingerprint can unlock</li>
                  <li>• Nothing leaves your device — completely offline and private</li>
                  <li>• You can disable this any time in Settings</li>
                </ul>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleBiometricEnrollOffer(false)}
                  className="btn-secondary flex-1 py-3"
                >
                  Not Now
                </button>
                <button
                  type="button"
                  onClick={() => handleBiometricEnrollOffer(true)}
                  className="btn-primary flex-1 py-3"
                >
                  Enable
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
