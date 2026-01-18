/**
 * SetupScreen - First-time password setup
 */

import { useState, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';

export function SetupScreen() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const initialize = useAppStore((state) => state.initialize);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Validation
      if (!password) {
        setError('Please enter a password');
        return;
      }

      if (password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }

      setError(null);
      setIsLoading(true);

      try {
        const success = await initialize(password);
        if (!success) {
          setError('Failed to set up. Please try again.');
        }
      } catch (err) {
        setError('An error occurred. Please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [password, confirmPassword, initialize]
  );

  // Password strength indicator
  const getPasswordStrength = () => {
    if (!password) return { label: '', color: '' };
    if (password.length < 8) return { label: 'Too short', color: 'bg-rose-500' };
    if (password.length < 12) return { label: 'Fair', color: 'bg-amber-500' };
    if (password.length < 16) return { label: 'Good', color: 'bg-lime-500' };
    return { label: 'Strong', color: 'bg-emerald-500' };
  };

  const strength = getPasswordStrength();

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
              Welcome to MoodBloom
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1 text-center">
              Create a password to protect your journal
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a strong password"
                autoFocus
                disabled={isLoading}
                className="input"
              />
              {/* Strength indicator */}
              {password && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${strength.color} transition-all duration-300`}
                      style={{
                        width:
                          password.length < 8
                            ? '25%'
                            : password.length < 12
                            ? '50%'
                            : password.length < 16
                            ? '75%'
                            : '100%',
                      }}
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
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                disabled={isLoading}
                className="input"
              />
            </div>

            {error && (
              <p className="text-sm text-rose-500 dark:text-rose-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={isLoading || !password || !confirmPassword}
              className="btn-primary w-full py-3"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Setting up...
                </>
              ) : (
                'Create Journal'
              )}
            </button>
          </form>

          {/* Info */}
          <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Important
            </h3>
            <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <li>• Your password encrypts all your journal entries</li>
              <li>• We cannot recover your password if you forget it</li>
              <li>• All data stays on your device</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
