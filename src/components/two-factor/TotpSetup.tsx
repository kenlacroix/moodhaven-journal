/**
 * TotpSetup - Component for setting up TOTP authentication
 *
 * Steps:
 * 1. Show QR code + manual secret
 * 2. Enter verification code
 * 3. Show backup codes
 */

import { useState, useCallback, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { generateTotpSecret, enableTotp } from '../../lib/services/twoFactorService';
import { BackupCodesDisplay } from './BackupCodesDisplay';
import type { TotpSetupData, BackupCodes } from '../../types/twoFactor';

interface TotpSetupProps {
  password: string;
  onComplete: () => void;
  onCancel: () => void;
}

type SetupStep = 'loading' | 'scan' | 'verify' | 'backup';

export function TotpSetup({ password, onComplete, onCancel }: TotpSetupProps) {
  const [step, setStep] = useState<SetupStep>('loading');
  const [setupData, setSetupData] = useState<TotpSetupData | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [backupCodes, setBackupCodes] = useState<BackupCodes | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);

  // Initialize TOTP setup
  const initSetup = useCallback(async () => {
    try {
      setError(null);
      const data = await generateTotpSecret(password);
      setSetupData(data);
      setStep('scan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate secret');
    }
  }, []);

  // Start setup on mount
  useEffect(() => {
    initSetup();
  }, [initSetup]);

  // Handle verification
  const handleVerify = async () => {
    if (verificationCode.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const codes = await enableTotp(verificationCode, password);
      setBackupCodes(codes);
      setStep('backup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle code input (auto-verify on 6 digits)
  const handleCodeChange = (value: string) => {
    // Only allow digits
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setVerificationCode(digits);
    setError(null);
  };

  // Render based on step
  if (step === 'loading') {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (step === 'backup' && backupCodes) {
    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">&#10003;</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            2FA Enabled Successfully
          </h3>
        </div>
        <BackupCodesDisplay codes={backupCodes.codes} onDone={onComplete} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          {step === 'scan' ? 'Scan QR Code' : 'Enter Verification Code'}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {step === 'scan'
            ? 'Use your authenticator app to scan this code'
            : 'Enter the 6-digit code from your authenticator app'}
        </p>
      </div>

      {step === 'scan' && setupData && (
        <>
          {/* QR Code */}
          <div className="flex justify-center">
            <div className="bg-white p-4 rounded-xl">
              <QRCodeSVG
                value={setupData.qr_code_url}
                size={200}
                level="M"
                includeMargin
              />
            </div>
          </div>

          {/* Manual Entry Toggle */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowManualEntry(!showManualEntry)}
              className="text-sm text-violet-500 hover:text-violet-600 transition-colors"
            >
              {showManualEntry ? 'Hide manual entry' : "Can't scan? Enter manually"}
            </button>
          </div>

          {/* Manual Entry */}
          {showManualEntry && (
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                Enter this code in your authenticator app:
              </p>
              <code className="block font-mono text-sm bg-white dark:bg-slate-700 px-3 py-2 rounded-lg break-all text-slate-700 dark:text-slate-200">
                {setupData.secret}
              </code>
            </div>
          )}

          {/* Continue Button */}
          <button
            type="button"
            onClick={() => setStep('verify')}
            className="
              w-full py-3 px-4 rounded-xl
              text-sm font-medium text-white
              bg-violet-500 hover:bg-violet-600
              transition-colors
            "
          >
            Continue
          </button>
        </>
      )}

      {step === 'verify' && (
        <>
          {/* Code Input */}
          <div className="flex justify-center">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={verificationCode}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="000000"
              autoFocus
              className="
                w-48 text-center text-2xl font-mono tracking-widest
                px-4 py-3 rounded-xl
                border border-slate-200 dark:border-slate-700
                bg-white dark:bg-slate-800
                text-slate-800 dark:text-slate-100
                placeholder:text-slate-300 dark:placeholder:text-slate-600
                focus:outline-none focus:ring-2 focus:ring-violet-500
              "
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-center text-rose-500">{error}</p>
          )}

          {/* Verify Button */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep('scan')}
              className="
                flex-1 py-3 px-4 rounded-xl
                text-sm font-medium
                bg-slate-100 dark:bg-slate-700
                text-slate-700 dark:text-slate-200
                hover:bg-slate-200 dark:hover:bg-slate-600
                transition-colors
              "
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleVerify}
              disabled={verificationCode.length !== 6 || isVerifying}
              className="
                flex-1 py-3 px-4 rounded-xl
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
                'Verify & Enable'
              )}
            </button>
          </div>
        </>
      )}

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
