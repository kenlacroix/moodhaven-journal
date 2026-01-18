/**
 * LockScreen - Password entry screen for unlocking the journal
 */

import { useState, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';

export function LockScreen() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const unlock = useAppStore((state) => state.unlock);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!password) {
        setError('Please enter your password');
        return;
      }

      setError(null);
      setIsLoading(true);

      try {
        const success = await unlock(password);
        if (!success) {
          setError('Incorrect password. Please try again.');
          setPassword('');
        }
      } catch (err) {
        setError('An error occurred. Please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [password, unlock]
  );

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
              Welcome Back
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Enter your password to unlock
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
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
                  Unlocking...
                </>
              ) : (
                'Unlock Journal'
              )}
            </button>
          </form>

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
