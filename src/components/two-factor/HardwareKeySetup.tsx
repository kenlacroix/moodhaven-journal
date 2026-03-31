/**
 * HardwareKeySetup - Component for setting up hardware security key
 *
 * Uses native Rust FIDO2/CTAP2 libraries via Tauri commands,
 * NOT browser WebAuthn APIs (which fail in Tauri WebView).
 *
 * Security Note:
 * The hardware key acts as a local unlock factor, NOT password recovery.
 * If the password is lost, data is unrecoverable. There are no backdoors.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  detectHardwareKeys,
  registerHardwareKey,
  getHardwareKeyErrorMessage,
  getHardwareKeyFeatureInfo,
  isFeatureNotAvailableError,
  type HardwareKeyDevice,
  type HardwareKeyFeatureInfo,
} from '../../lib/services/hardwareKeyService';

interface HardwareKeySetupProps {
  onComplete: () => void;
  onCancel: () => void;
}

type SetupStep = 'checking' | 'not-available' | 'detecting' | 'intro' | 'registering' | 'success' | 'error' | 'no-device';

export function HardwareKeySetup({ onComplete, onCancel }: HardwareKeySetupProps) {
  const [step, setStep] = useState<SetupStep>('checking');
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<HardwareKeyDevice[]>([]);
  const [deviceName, setDeviceName] = useState<string>('');
  const [featureInfo, setFeatureInfo] = useState<HardwareKeyFeatureInfo | null>(null);

  // Check feature availability and detect devices on mount
  useEffect(() => {
    async function initialize() {
      try {
        // First check if feature is available
        const info = await getHardwareKeyFeatureInfo();
        setFeatureInfo(info);

        if (!info.available) {
          setStep('not-available');
          return;
        }

        // Feature is available, detect devices
        const foundDevices = await detectHardwareKeys();
        setDevices(foundDevices);
        if (foundDevices.length > 0) {
          setStep('intro');
        } else {
          setStep('no-device');
        }
      } catch (err) {
        if (isFeatureNotAvailableError(err)) {
          setStep('not-available');
        } else {
          setError(getHardwareKeyErrorMessage(err));
          setStep('no-device');
        }
      }
    }

    initialize();
  }, []);

  // Handle registration
  const handleRegister = useCallback(async () => {
    setStep('registering');
    setError(null);

    try {
      const result = await registerHardwareKey();
      setDeviceName(result.device_name);
      setStep('success');
    } catch (err) {
      setError(getHardwareKeyErrorMessage(err));
      setStep('error');
    }
  }, []);

  // Retry detection
  const handleRetryDetection = useCallback(async () => {
    setStep('detecting');
    setError(null);

    try {
      const foundDevices = await detectHardwareKeys();
      setDevices(foundDevices);
      if (foundDevices.length > 0) {
        setStep('intro');
      } else {
        setStep('no-device');
      }
    } catch (err) {
      if (isFeatureNotAvailableError(err)) {
        setStep('not-available');
      } else {
        setError(getHardwareKeyErrorMessage(err));
        setStep('no-device');
      }
    }
  }, []);

  // Checking feature availability
  if (step === 'checking') {
    return (
      <div className="space-y-6 py-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🔑</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Checking Hardware Key Support...
          </h3>
        </div>
        <div className="flex justify-center">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Feature not available - show install instructions
  if (step === 'not-available') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">🔧</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Hardware Key Support Not Enabled
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            This build does not include hardware key support.
          </p>
        </div>

        {featureInfo?.install_instructions && (
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-3">
              To enable hardware key support:
            </p>
            <pre className="text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono">
              {featureInfo.install_instructions}
            </pre>
          </div>
        )}

        <button
          type="button"
          onClick={onCancel}
          className="w-full py-3 px-4 rounded-xl text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }

  // Detecting step
  if (step === 'detecting') {
    return (
      <div className="space-y-6 py-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🔑</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Detecting Hardware Keys...
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Looking for connected FIDO2 devices
          </p>
        </div>
        <div className="flex justify-center">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // No device found
  if (step === 'no-device') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">⚠️</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            No Hardware Key Detected
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Please insert your FIDO2 security key (YubiKey, etc.) and try again.
          </p>
        </div>

        {error && (
          <p className="text-sm text-rose-500 text-center">{error}</p>
        )}

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleRetryDetection}
            className="w-full py-3 px-4 rounded-xl text-sm font-medium text-white bg-violet-500 hover:bg-violet-600 transition-colors"
          >
            Retry Detection
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-3 px-4 rounded-xl text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Success step
  if (step === 'success') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">✓</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Hardware Key Registered
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            {deviceName || 'Your security key'} is now required to unlock.
          </p>
        </div>

        {/* Security notice */}
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-700 dark:text-amber-300 font-medium mb-2">
            Important Security Notice
          </p>
          <ul className="text-xs text-amber-600 dark:text-amber-400 space-y-1 list-disc list-inside">
            <li>Your hardware key is now required to unlock</li>
            <li>Both password AND key are needed</li>
            <li>This key does NOT recover forgotten passwords</li>
            <li>If you lose the key, you can disable it with password</li>
          </ul>
        </div>

        <button
          type="button"
          onClick={onComplete}
          className="w-full py-3 px-4 rounded-xl text-sm font-medium text-white bg-violet-500 hover:bg-violet-600 transition-colors"
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
            <span className="text-2xl">✕</span>
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
            className="flex-1 py-3 px-4 rounded-xl text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setStep('intro')}
            className="flex-1 py-3 px-4 rounded-xl text-sm font-medium text-white bg-violet-500 hover:bg-violet-600 transition-colors"
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
            <span className="text-3xl">🔑</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Touch Your Security Key
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Touch the key when it flashes (twice to confirm)
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
          <span className="text-2xl">🔑</span>
        </div>
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Register Hardware Key
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          Add a hardware security key as a second factor
        </p>
      </div>

      {/* Detected devices */}
      {devices.length > 0 && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Detected: {devices.map((d) => d.name).join(', ')}
          </p>
        </div>
      )}

      {/* Security notice */}
      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-2">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          How it works:
        </p>
        <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1 list-disc list-inside">
          <li>Your key will be bound to this app</li>
          <li>You'll need BOTH password AND key to unlock</li>
          <li>The key does NOT replace your password</li>
          <li>If you lose the key, password alone can disable it</li>
        </ul>
      </div>

      {/* Register Button */}
      <button
        type="button"
        onClick={handleRegister}
        className="w-full py-3 px-4 rounded-xl text-sm font-medium text-white bg-violet-500 hover:bg-violet-600 transition-colors"
      >
        Register Key
      </button>

      {/* Cancel Button */}
      <button
        type="button"
        onClick={onCancel}
        className="w-full py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
