import { useState } from 'react';
import { SettingSection } from '../SettingSection';
import { useAppStore } from '../../../stores/appStore';
import {
  runChangePassword,
  type ChangeProgress,
  type ChangeSummary,
} from '../../../lib/services/changePasswordService';

interface PrivacyChangePasswordProps {
  sessionPassword: string;
}

function strengthOf(pw: string) {
  if (!pw) return { label: '', color: '', width: '0%' };
  if (pw.length < 8) return { label: 'Too short', color: 'bg-rose-500', width: '25%' };
  if (pw.length < 12) return { label: 'Fair', color: 'bg-amber-500', width: '50%' };
  if (pw.length < 16) return { label: 'Good', color: 'bg-lime-500', width: '75%' };
  return { label: 'Strong', color: 'bg-emerald-500', width: '100%' };
}

/**
 * Settings → Privacy → Change Password (active-plans/change-password.md §6).
 *
 * Collects current / new / confirm, re-encrypts every entry + signal under the new password in
 * the frontend, then invokes the backend to atomically re-encrypt media + TOTP and rekey the
 * outer SQLCipher layer. Hard-locks the UI during the operation (the marker protects against a
 * crash, but we should not invite one) and, on success, shows the re-setup checklist and forces
 * a re-unlock so the new key is derived fresh.
 */
export function PrivacyChangePassword({ sessionPassword }: PrivacyChangePasswordProps) {
  const lock = useAppStore((s) => s.lock);
  const ready = sessionPassword.length > 0;

  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ChangeProgress | null>(null);
  const [summary, setSummary] = useState<ChangeSummary | null>(null);

  const strength = strengthOf(next);
  const canSubmit =
    !busy &&
    current.length > 0 &&
    next.length >= 8 &&
    next === confirm &&
    next !== current;

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
    setProgress(null);
  };

  const handleSubmit = async () => {
    if (current !== sessionPassword) {
      setError('Current password is incorrect.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await runChangePassword(current, next, setProgress);
      setSummary(result);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to change password.');
    } finally {
      setBusy(false);
    }
  };

  if (summary) {
    return (
      <SettingSection
        title="Change Password"
        description="Your password was changed and your journal re-encrypted."
      >
        <div className="space-y-3 text-sm">
          <p className="text-emerald-600 dark:text-emerald-400 font-medium">
            Done — {summary.entriesReencrypted} entries, {summary.signalsReencrypted} signals, and{' '}
            {summary.mediaReencrypted} media files re-encrypted under your new password.
          </p>
          <ul className="list-disc pl-5 text-slate-600 dark:text-slate-300 space-y-1">
            {summary.pinDisabled && <li>PIN unlock was disabled — set it up again in PIN Unlock.</li>}
            {summary.biometricCleared && (
              <li>Biometric unlock was cleared — re-enable it in Biometric Unlock.</li>
            )}
            {!summary.recoveryKeyRegenerated && (
              <li>Your recovery key is no longer valid — generate a new one in Privacy.</li>
            )}
          </ul>
          <p className="text-slate-500 dark:text-slate-400">
            You&apos;ll be locked out now; unlock again with your <strong>new</strong> password.
          </p>
          <button
            type="button"
            onClick={() => lock()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700"
          >
            Lock &amp; finish
          </button>
        </div>
      </SettingSection>
    );
  }

  return (
    <SettingSection
      title="Change Password"
      description="Re-encrypts your journal under a new password. Requires your current password."
    >
      {!open ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {ready
              ? 'Changing your password re-encrypts every entry and attachment.'
              : 'Lock and re-unlock to enable changing your password.'}
          </p>
          <button
            type="button"
            disabled={!ready}
            onClick={() => setOpen(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            Change Password
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Current password"
            value={current}
            disabled={busy}
            onChange={(e) => setCurrent(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="New password"
            value={next}
            disabled={busy}
            onChange={(e) => setNext(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
          />
          {next && (
            <div>
              <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className={`h-full ${strength.color} transition-all duration-300`}
                  style={{ width: strength.width }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{strength.label}</p>
            </div>
          )}
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Confirm new password"
            value={confirm}
            disabled={busy}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
          />
          {next && confirm && next !== confirm && (
            <p className="text-xs text-rose-500">Passwords don&apos;t match.</p>
          )}
          {next && next === current && (
            <p className="text-xs text-rose-500">New password must differ from the current one.</p>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            This re-encrypts your whole journal — keep the app open until it finishes. It&apos;s safe
            to interrupt; an interrupted change rolls back cleanly.
          </p>
          {error && <p className="text-sm text-rose-500">{error}</p>}
          {busy && progress && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Re-encrypting {progress.phase}… {progress.done}/{progress.total}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400 disabled:cursor-not-allowed"
            >
              {busy ? 'Re-encrypting…' : 'Change Password'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                reset();
                setOpen(false);
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </SettingSection>
  );
}
