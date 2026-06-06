/**
 * TwoFactorVerify - 2FA verification component for lock screen
 *
 * Supports:
 * - TOTP code entry
 * - Hardware security key (native FIDO2, not WebAuthn browser APIs)
 * - Backup code fallback
 */

import { useState, useCallback, useEffect } from 'react';
import {
  verify2FATotp,
  verifyBackupCode,
  getBackupCodesCount,
} from '../../lib/services/twoFactorService';
import {
  verifyHardwareKey,
  getHardwareKeyErrorMessage,
} from '../../lib/services/hardwareKeyService';
import type { TwoFactorMethod, TwoFactorVerifyMode } from '../../types/twoFactor';

interface TwoFactorVerifyProps {
  method: TwoFactorMethod;
  password: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function TwoFactorVerify({ method, password, onSuccess, onCancel }: TwoFactorVerifyProps) {
  const [mode, setMode] = useState<TwoFactorVerifyMode>(
    method === 'webauthn' ? 'webauthn' : 'totp'
  );
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [backupCodesRemaining, setBackupCodesRemaining] = useState<number | null>(null);

  // Check backup codes count
  useEffect(() => {
    getBackupCodesCount().then(setBackupCodesRemaining).catch(() => {});
  }, []);

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // Handle TOTP verification
  const handleTotpVerify = useCallback(async () => {
    if (code.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const valid = await verify2FATotp(code, password);
      if (valid) {
        onSuccess();
      } else {
        setAttempts((a) => a + 1);
        setError('Invalid code. Please try again.');
        setCode('');
        if (attempts >= 2) {
          setCooldown(30);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  }, [code, attempts, onSuccess, password]);

  // Handle hardware key verification (native FIDO2, not WebAuthn)
  const handleHardwareKeyVerify = useCallback(async () => {
    setIsVerifying(true);
    setError(null);

    try {
      // Native FIDO2 verification via Rust
      const secret = await verifyHardwareKey();
      if (secret) {
        // Hardware key verified successfully
        // The secret will be used to combine with password-derived key
        onSuccess();
      } else {
        setError('Verification failed');
      }
    } catch (err) {
      setError(getHardwareKeyErrorMessage(err));
    } finally {
      setIsVerifying(false);
    }
  }, [onSuccess]);

  // Handle backup code verification
  const handleBackupVerify = useCallback(async () => {
    if (!code.trim()) {
      setError('Please enter a backup code');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const valid = await verifyBackupCode(code);
      if (valid) {
        onSuccess();
      } else {
        setAttempts((a) => a + 1);
        setError('Invalid backup code');
        setCode('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  }, [code, onSuccess]);

  // Handle code input
  const handleCodeChange = (value: string) => {
    if (mode === 'backup') {
      // Backup codes: allow letters, numbers, and dashes
      setCode(value.toUpperCase().slice(0, 9));
    } else {
      // TOTP: only digits
      setCode(value.replace(/\D/g, '').slice(0, 6));
    }
    setError(null);
  };

  // Auto-start hardware key verification on mount if that's the only method
  useEffect(() => {
    if (mode === 'webauthn' && method === 'webauthn') {
      handleHardwareKeyVerify();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- intentional mount-only: re-triggering on dep changes would re-initiate HW key verification incorrectly

  // Disabled state
  const isDisabled = cooldown > 0 || isVerifying;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Two-Factor Authentication
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {mode === 'totp' && 'Enter the code from your authenticator app'}
          {mode === 'webauthn' && 'Use your security key to continue'}
          {mode === 'backup' && 'Enter one of your backup codes'}
        </p>
      </div>

      {/* Cooldown Warning */}
      {cooldown > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-center">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Too many attempts. Try again in {cooldown}s
          </p>
        </div>
      )}

      {/* TOTP Mode */}
      {mode === 'totp' && (
        <>
          <div className="flex justify-center">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="000000"
              disabled={isDisabled}
              autoFocus
              className="
                w-48 text-center text-2xl font-mono tracking-widest
                px-4 py-3 rounded-xl
                border border-slate-200 dark:border-slate-700
                bg-white dark:bg-slate-800
                text-slate-800 dark:text-slate-100
                placeholder:text-slate-300 dark:placeholder:text-slate-600
                focus:outline-none focus:ring-2 focus:ring-violet-500
                disabled:opacity-50
              "
            />
          </div>

          {error && (
            <p className="text-sm text-center text-rose-500">{error}</p>
          )}

          <button
            type="button"
            onClick={handleTotpVerify}
            disabled={code.length !== 6 || isDisabled}
            className="
              w-full py-3 px-4 rounded-xl
              text-sm font-medium text-white
              bg-violet-500 hover:bg-violet-600
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors
              flex items-center justify-center gap-2
            "
          >
            {isVerifying ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Verifying...
              </>
            ) : (
              'Verify'
            )}
          </button>
        </>
      )}

      {/* Hardware Key Mode (native FIDO2) */}
      {mode === 'webauthn' && (
        <>
          <div className="text-center py-4">
            {isVerifying ? (
              <>
                <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <span className="text-3xl">🔑</span>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Touch your security key...
                </p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">🔑</span>
                </div>
              </>
            )}
          </div>

          {error && (
            <p className="text-sm text-center text-rose-500">{error}</p>
          )}

          <button
            type="button"
            onClick={handleHardwareKeyVerify}
            disabled={isVerifying}
            className="
              w-full py-3 px-4 rounded-xl
              text-sm font-medium text-white
              bg-violet-500 hover:bg-violet-600
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors
            "
          >
            {isVerifying ? 'Waiting...' : 'Use Security Key'}
          </button>
        </>
      )}

      {/* Backup Code Mode */}
      {mode === 'backup' && (
        <>
          <div className="flex justify-center">
            <input
              type="text"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="XXXX-XXXX"
              disabled={isDisabled}
              autoFocus
              className="
                w-48 text-center text-xl font-mono tracking-wide
                px-4 py-3 rounded-xl
                border border-slate-200 dark:border-slate-700
                bg-white dark:bg-slate-800
                text-slate-800 dark:text-slate-100
                placeholder:text-slate-300 dark:placeholder:text-slate-600
                focus:outline-none focus:ring-2 focus:ring-violet-500
                disabled:opacity-50
              "
            />
          </div>

          {error && (
            <p className="text-sm text-center text-rose-500">{error}</p>
          )}

          {backupCodesRemaining !== null && (
            <p className="text-xs text-center text-slate-400">
              {backupCodesRemaining} backup code{backupCodesRemaining !== 1 ? 's' : ''} remaining
            </p>
          )}

          <button
            type="button"
            onClick={handleBackupVerify}
            disabled={!code.trim() || isDisabled}
            className="
              w-full py-3 px-4 rounded-xl
              text-sm font-medium text-white
              bg-violet-500 hover:bg-violet-600
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors
            "
          >
            {isVerifying ? 'Verifying...' : 'Use Backup Code'}
          </button>
        </>
      )}

      {/* Mode Switchers */}
      <div className="flex flex-col items-center gap-2 pt-2">
        {mode !== 'totp' && (method === 'totp' || method === 'both') && (
          <button
            type="button"
            onClick={() => { setMode('totp'); setError(null); setCode(''); }}
            className="text-sm text-violet-500 hover:text-violet-600 transition-colors"
          >
            Use authenticator app instead
          </button>
        )}
        {mode !== 'webauthn' && (method === 'webauthn' || method === 'both') && (
          <button
            type="button"
            onClick={() => { setMode('webauthn'); setError(null); }}
            className="text-sm text-violet-500 hover:text-violet-600 transition-colors"
          >
            Use security key instead
          </button>
        )}
        {mode !== 'backup' && backupCodesRemaining && backupCodesRemaining > 0 && (
          <button
            type="button"
            onClick={() => { setMode('backup'); setError(null); setCode(''); }}
            className="text-sm text-slate-500 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300 transition-colors"
          >
            Use a backup code
          </button>
        )}
      </div>

      {/* Cancel */}
      <button
        type="button"
        onClick={onCancel}
        className="
          w-full py-2 text-sm text-slate-500 dark:text-slate-400
          hover:text-slate-700 dark:hover:text-slate-200
          transition-colors
        "
      >
        Cancel
      </button>
    </div>
  );
}
