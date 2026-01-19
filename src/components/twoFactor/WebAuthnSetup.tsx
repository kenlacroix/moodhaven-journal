/**
 * WebAuthnSetup - Component for setting up hardware security key
 *
 * Uses Web Authentication API for YubiKey and similar devices.
 */

import { useState, useCallback } from 'react';
import { registerWebAuthnCredential } from '../../lib/twoFactorService';
import { BackupCodesDisplay } from './BackupCodesDisplay';
import type { BackupCodes } from '../../types/twoFactor';

interface WebAuthnSetupProps {
  onComplete: () => void;
  onCancel: () => void;
}

type SetupStep = 'intro' | 'registering' | 'backup' | 'error';

export function WebAuthnSetup({ onComplete, onCancel }: WebAuthnSetupProps) {
  const [step, setStep] = useState<SetupStep>('intro');
  const [error, setError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<BackupCodes | null>(null);

  // Check WebAuthn support
  const isSupported = typeof window !== 'undefined' && !!window.PublicKeyCredential;

  // Handle registration
  const handleRegister = useCallback(async () => {
    setStep('registering');
    setError(null);

    try {
      const codes = await registerWebAuthnCredential();
      setBackupCodes(codes);
      setStep('backup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
      setStep('error');
    }
  }, []);

  // Not supported message
  if (!isSupported) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">&#9888;</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Not Supported
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Your browser doesn't support security keys. Try using a modern browser
            like Chrome, Firefox, or Edge.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="
            w-full py-3 px-4 rounded-xl
            text-sm font-medium
            bg-slate-100 dark:bg-slate-700
            text-slate-700 dark:text-slate-200
            hover:bg-slate-200 dark:hover:bg-slate-600
            transition-colors
          "
        >
          Go Back
        </button>
      </div>
    );
  }

  // Backup codes step
  if (step === 'backup' && backupCodes && backupCodes.codes.length > 0) {
    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">&#10003;</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Security Key Registered
          </h3>
        </div>
        <BackupCodesDisplay codes={backupCodes.codes} onDone={onComplete} />
      </div>
    );
  }

  // Success with no new codes (already had backup codes)
  if (step === 'backup') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">&#10003;</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Security Key Registered
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Your hardware security key has been added successfully.
          </p>
        </div>
        <button
          type="button"
          onClick={onComplete}
          className="
            w-full py-3 px-4 rounded-xl
            text-sm font-medium text-white
            bg-violet-500 hover:bg-violet-600
            transition-colors
          "
        >
          Done
        </button>
      </div>
    );
  }

  // Error step
  if (step === 'error') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">&#10060;</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Registration Failed
          </h3>
          <p className="text-sm text-rose-500 mt-2">{error}</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="
              flex-1 py-3 px-4 rounded-xl
              text-sm font-medium
              bg-slate-100 dark:bg-slate-700
              text-slate-700 dark:text-slate-200
              hover:bg-slate-200 dark:hover:bg-slate-600
              transition-colors
            "
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setStep('intro')}
            className="
              flex-1 py-3 px-4 rounded-xl
              text-sm font-medium text-white
              bg-violet-500 hover:bg-violet-600
              transition-colors
            "
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Registering step
  if (step === 'registering') {
    return (
      <div className="space-y-6 py-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <span className="text-3xl">&#128273;</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Touch Your Security Key
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Insert your security key and touch it when it flashes
          </p>
        </div>
        <div className="flex justify-center">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Intro step
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="w-12 h-12 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-2xl">&#128273;</span>
        </div>
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Register Security Key
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          Use a hardware security key like YubiKey for strong authentication
        </p>
      </div>

      {/* Instructions */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <span className="text-violet-500 font-medium">1.</span>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Have your security key ready (YubiKey, etc.)
          </p>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-violet-500 font-medium">2.</span>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Click "Register Key" below
          </p>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-violet-500 font-medium">3.</span>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Insert your key and touch it when prompted
          </p>
        </div>
      </div>

      {/* Register Button */}
      <button
        type="button"
        onClick={handleRegister}
        className="
          w-full py-3 px-4 rounded-xl
          text-sm font-medium text-white
          bg-violet-500 hover:bg-violet-600
          transition-colors
        "
      >
        Register Key
      </button>

      {/* Cancel Button */}
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
