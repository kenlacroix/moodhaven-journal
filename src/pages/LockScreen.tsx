/**
 * LockScreen - Password entry screen for unlocking the journal
 *
 * Supports two-factor authentication after password verification.
 */

import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { get2FAStatus } from '../lib/twoFactorService';
import { verifyUserPassword } from '../lib/journalService';
import { TwoFactorVerify } from '../components/twoFactor';
import type { TwoFactorStatus } from '../types/twoFactor';

type LockScreenStep = 'password' | '2fa';

export function LockScreen() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<LockScreenStep>('password');
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus | null>(null);
  const [verifiedPassword, setVerifiedPassword] = useState<string | null>(null);

  const unlock = useAppStore((state) => state.unlock);

  // Check 2FA status on mount
  useEffect(() => {
    get2FAStatus().then(setTwoFactorStatus).catch(() => setTwoFactorStatus(null));
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
