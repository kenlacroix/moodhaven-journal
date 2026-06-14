import { useEffect, useState } from 'react';
import { SettingSection } from '../SettingSection';
import {
  generateRecoveryKey,
  storeRecoveryKey,
  disableRecoveryKey,
  isRecoveryKeyEnabled,
} from '../../../lib/services/recoveryKeyService';

interface PrivacyRecoveryKeyProps {
  sessionPassword: string;
}

/**
 * Settings → Privacy → Recovery Key.
 *
 * Lets the user generate, replace, or remove a recovery key AFTER initial setup — the only place
 * outside the setup wizard to do so. The recovery key escrows the current session password
 * (AES-256-GCM under a key derived from the recovery code), so it can unlock the journal if the
 * password is forgotten. The key is shown once and must be written down.
 */
export function PrivacyRecoveryKey({ sessionPassword }: PrivacyRecoveryKeyProps) {
  const ready = sessionPassword.length > 0;

  const [enabled, setEnabled] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedJustNow, setSavedJustNow] = useState(false);

  useEffect(() => {
    let active = true;
    isRecoveryKeyEnabled().then((v) => {
      if (active) setEnabled(v);
    });
    return () => {
      active = false;
    };
  }, []);

  const startGenerate = () => {
    setError(null);
    setSavedJustNow(false);
    setRevealed(false);
    setConfirmed(false);
    setGeneratedKey(generateRecoveryKey());
  };

  const cancel = () => {
    setGeneratedKey(null);
    setRevealed(false);
    setConfirmed(false);
    setError(null);
  };

  const save = async () => {
    if (!generatedKey || !confirmed || !ready) return;
    setBusy(true);
    setError(null);
    try {
      await storeRecoveryKey(generatedKey, sessionPassword);
      setEnabled(true);
      cancel();
      setSavedJustNow(true);
    } catch {
      setError('Failed to save recovery key.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await disableRecoveryKey();
      setEnabled(false);
      setSavedJustNow(false);
    } catch {
      setError('Failed to remove recovery key.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingSection
      title="Recovery Key"
      description="An optional 24-character code that can unlock your journal if you forget your password."
    >
      {generatedKey ? (
        <div className="space-y-3">
          <p className="text-xs font-medium text-violet-600 dark:text-violet-400">
            Write this down and store it securely — it is shown only once.
          </p>
          <div className="relative">
            <div
              className={`font-mono text-lg text-center py-4 px-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 ${
                revealed ? '' : 'blur-sm select-none'
              }`}
            >
              {generatedKey}
            </div>
            {!revealed && (
              <button
                type="button"
                onClick={() => setRevealed(true)}
                className="absolute inset-0 flex items-center justify-center text-sm text-violet-600 dark:text-violet-400 hover:underline"
              >
                Click to reveal
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(generatedKey)}
            className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
          >
            Copy to clipboard
          </button>
          <label className="flex items-start gap-3 cursor-pointer p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
            />
            <span className="text-xs text-amber-700 dark:text-amber-300">
              I have written down my recovery key and stored it securely. I understand it will not be
              shown again, and that anyone with this key can access my data.
            </span>
          </label>
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!confirmed || busy}
              onClick={save}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400 disabled:cursor-not-allowed"
            >
              {busy ? 'Saving…' : 'Save recovery key'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={cancel}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {savedJustNow && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
              Recovery key saved. Keep it somewhere safe.
            </p>
          )}
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {!ready
                ? 'Lock and re-unlock to manage your recovery key.'
                : enabled
                  ? 'A recovery key is active. Regenerate to replace it (the old one stops working), or remove it.'
                  : 'No recovery key set. If you forget your password, your journal cannot be recovered.'}
            </p>
            <div className="flex gap-2 shrink-0">
              {enabled && (
                <button
                  type="button"
                  disabled={!ready || busy}
                  onClick={remove}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Remove
                </button>
              )}
              <button
                type="button"
                disabled={!ready || busy}
                onClick={startGenerate}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                {enabled ? 'Regenerate' : 'Generate recovery key'}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-rose-500">{error}</p>}
        </div>
      )}
    </SettingSection>
  );
}
