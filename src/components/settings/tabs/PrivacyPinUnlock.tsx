import { useEffect, useRef, useState } from 'react';
import { SettingSection } from '../SettingSection';
import { pinIsEnabled, pinSetup, pinDisable } from '../../../lib/services/pinUnlockService';

interface PrivacyPinUnlockProps {
  sessionPassword: string;
}

type PinSetupStep = 'idle' | 'enter' | 'confirm';

export function PrivacyPinUnlock({ sessionPassword }: PrivacyPinUnlockProps) {
  const [enabled, setEnabled] = useState(false);
  const [setupStep, setSetupStep] = useState<PinSetupStep>('idle');
  const [pinInput, setPinInput] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    pinIsEnabled().then(setEnabled).catch(() => {});
  }, []);

  useEffect(() => {
    if (setupStep === 'enter') pinRef.current?.focus();
    if (setupStep === 'confirm') confirmRef.current?.focus();
  }, [setupStep]);

  function validatePin(value: string): string | null {
    if (value.length < 4) return 'PIN must be at least 4 digits';
    if (value.length > 6) return 'PIN must be at most 6 digits';
    if (!/^\d+$/.test(value)) return 'PIN must contain digits only';
    return null;
  }

  function handleStartSetup() {
    if (!sessionPassword) {
      setError('Session password unavailable — lock and re-unlock to set up PIN.');
      return;
    }
    setError(null);
    setPinInput('');
    setConfirmInput('');
    setSetupStep('enter');
  }

  function handleCancelSetup() {
    setSetupStep('idle');
    setPinInput('');
    setConfirmInput('');
    setError(null);
  }

  function handlePinNext(e: React.FormEvent) {
    e.preventDefault();
    const err = validatePin(pinInput);
    if (err) { setError(err); return; }
    setError(null);
    setSetupStep('confirm');
  }

  async function handleConfirmSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pinInput !== confirmInput) {
      setError('PINs do not match');
      setConfirmInput('');
      confirmRef.current?.focus();
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await pinSetup(sessionPassword, pinInput);
      setEnabled(true);
      setSetupStep('idle');
      setPinInput('');
      setConfirmInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDisable() {
    setIsDisabling(true);
    setError(null);
    try {
      await pinDisable();
      setEnabled(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDisabling(false);
    }
  }

  return (
    <SettingSection
      title="PIN Unlock"
      description="Use a short numeric PIN to unlock MoodHaven Journal instead of typing your full password each time"
    >
      {enabled && setupStep === 'idle' ? (
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              PIN unlock is enabled
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              4–6 digit PIN wraps your password using AES-256-GCM
            </p>
          </div>
          <button
            type="button"
            disabled={isDisabling}
            onClick={handleDisable}
            className="px-3 py-1.5 text-sm font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors disabled:opacity-50"
          >
            {isDisabling ? 'Disabling…' : 'Disable'}
          </button>
        </div>
      ) : setupStep === 'idle' ? (
        <div className="flex items-start gap-3 py-2">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              PIN unlock is not set up
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Set a 4–6 digit numeric PIN for quicker access
            </p>
          </div>
          <button
            type="button"
            onClick={handleStartSetup}
            className="px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
          >
            Set up
          </button>
        </div>
      ) : setupStep === 'enter' ? (
        <form onSubmit={handlePinNext} className="space-y-4 pt-2">
          <div>
            <label htmlFor="pin-new" className="label">
              Choose a PIN (4–6 digits)
            </label>
            <input
              ref={pinRef}
              id="pin-new"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="input font-mono text-center tracking-[0.5em]"
            />
          </div>
          {error && (
            <p className="text-sm text-rose-500 dark:text-rose-400">{error}</p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleCancelSetup}
              className="btn-secondary flex-1 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pinInput.length < 4}
              className="btn-primary flex-1 py-2"
            >
              Next
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleConfirmSubmit} className="space-y-4 pt-2">
          <div>
            <label htmlFor="pin-confirm" className="label">
              Confirm PIN
            </label>
            <input
              ref={confirmRef}
              id="pin-confirm"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="input font-mono text-center tracking-[0.5em]"
            />
          </div>
          {error && (
            <p className="text-sm text-rose-500 dark:text-rose-400">{error}</p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setSetupStep('enter'); setConfirmInput(''); setError(null); }}
              disabled={isSaving}
              className="btn-secondary flex-1 py-2"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isSaving || confirmInput.length < 4}
              className="btn-primary flex-1 py-2"
            >
              {isSaving ? 'Saving…' : 'Save PIN'}
            </button>
          </div>
        </form>
      )}
    </SettingSection>
  );
}
