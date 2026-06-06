import { useEffect, useState } from 'react';
import { SettingSection } from '../SettingSection';
import {
  biometricIsAvailable,
  biometricIsEnrolled,
  biometricUnenroll,
  desktopBiometricIsAvailable,
  desktopBiometricStoreSession,
  desktopBiometricClearSession,
} from '../../../lib/services/biometricService';
import { useSettingsStore } from '../../../stores/settingsStore';
import type { AppSettings } from '../../../types/settings';

interface PrivacyBiometricProps {
  isAndroid: boolean;
  isDesktop: boolean;
  settings: AppSettings;
  sessionPassword?: string;
}

export function PrivacyBiometric({
  isAndroid,
  isDesktop,
  settings,
  sessionPassword = '',
}: PrivacyBiometricProps) {
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  // ── Android state ────────────────────────────────────────────────────────────
  const [androidAvailable, setAndroidAvailable] = useState(false);
  const [androidEnrolled, setAndroidEnrolled] = useState(false);
  const [androidDisabling, setAndroidDisabling] = useState(false);

  useEffect(() => {
    if (!isAndroid) return;
    Promise.all([biometricIsAvailable(), biometricIsEnrolled()])
      .then(([available, enrolled]) => {
        setAndroidAvailable(available);
        setAndroidEnrolled(enrolled);
      })
      .catch(() => {});
  }, [isAndroid]);

  // ── Desktop state ────────────────────────────────────────────────────────────
  const [desktopAvailable, setDesktopAvailable] = useState(false);
  const [desktopAvailabilityReason, setDesktopAvailabilityReason] = useState<string | null>(null);
  const [desktopEnabling, setDesktopEnabling] = useState(false);
  const [desktopDisabling, setDesktopDisabling] = useState(false);
  const [desktopError, setDesktopError] = useState<string | null>(null);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');

  const biometricEnabled = settings.privacy.biometricEnabled ?? false;

  useEffect(() => {
    if (!isDesktop) return;
    desktopBiometricIsAvailable().then(({ available, reason }) => {
      setDesktopAvailable(available);
      setDesktopAvailabilityReason(reason);
    });
  }, [isDesktop]);

  // ── Android handlers ─────────────────────────────────────────────────────────
  const handleAndroidDisable = async () => {
    setAndroidDisabling(true);
    await biometricUnenroll();
    setAndroidEnrolled(false);
    setAndroidDisabling(false);
  };

  // ── Desktop handlers ─────────────────────────────────────────────────────────
  const handleDesktopEnable = async () => {
    setDesktopError(null);
    if (sessionPassword) {
      setDesktopEnabling(true);
      try {
        await desktopBiometricStoreSession(sessionPassword);
        updateSettings({ privacy: { ...settings.privacy, biometricEnabled: true } });
      } catch (e) {
        setDesktopError(String(e));
      } finally {
        setDesktopEnabling(false);
      }
    } else {
      setShowPasswordConfirm(true);
    }
  };

  const handleDesktopEnableWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmPassword) return;
    setDesktopEnabling(true);
    setDesktopError(null);
    try {
      await desktopBiometricStoreSession(confirmPassword);
      updateSettings({ privacy: { ...settings.privacy, biometricEnabled: true } });
      setShowPasswordConfirm(false);
      setConfirmPassword('');
    } catch (e) {
      setDesktopError(String(e));
    } finally {
      setDesktopEnabling(false);
    }
  };

  const handleDesktopDisable = async () => {
    setDesktopDisabling(true);
    setDesktopError(null);
    try {
      await desktopBiometricClearSession();
      updateSettings({ privacy: { ...settings.privacy, biometricEnabled: false } });
    } catch (e) {
      setDesktopError(String(e));
    } finally {
      setDesktopDisabling(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  // Android biometric section (fingerprint / face via Kotlin BiometricPlugin)
  if (isAndroid && androidAvailable) {
    return (
      <SettingSection
        title="Biometric Unlock"
        description="Use fingerprint or face to unlock MoodHaven Journal instead of typing your password"
      >
        {androidEnrolled ? (
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Biometric unlock is enabled
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Your password is encrypted with a key only your fingerprint can unlock
              </p>
            </div>
            <button
              type="button"
              disabled={androidDisabling}
              onClick={handleAndroidDisable}
              className="px-3 py-1.5 text-sm font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors disabled:opacity-50"
            >
              {androidDisabling ? 'Disabling…' : 'Disable'}
            </button>
          </div>
        ) : (
          <div className="flex items-start gap-3 py-2">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Biometric unlock is not set up
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                To enable it, lock the app and use your password to unlock — you'll be offered
                fingerprint setup automatically.
              </p>
            </div>
          </div>
        )}
      </SettingSection>
    );
  }

  // Desktop OS-keyring section (Keychain / Credential Manager / libsecret)
  if (isDesktop) {
    if (!desktopAvailable) {
      return (
        <SettingSection
          title="Biometric Unlock"
          description="Skip password entry by storing your password in the OS credential store"
        >
          <p className="text-sm text-slate-500 dark:text-slate-400 py-2">
            {desktopAvailabilityReason ?? 'OS credential store is not available on this system.'}
          </p>
        </SettingSection>
      );
    }

    return (
      <SettingSection
        title="Biometric Unlock"
        description="Store your password in the OS credential store (Keychain / Credential Manager / libsecret) to skip password entry on each unlock"
      >
        {biometricEnabled ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  OS keyring unlock is enabled
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Your password is stored in the system credential store and retrieved on unlock.
                </p>
              </div>
              <button
                type="button"
                disabled={desktopDisabling}
                onClick={handleDesktopDisable}
                className="px-3 py-1.5 text-sm font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors disabled:opacity-50"
              >
                {desktopDisabling ? 'Disabling…' : 'Disable'}
              </button>
            </div>
            {desktopError && (
              <p className="text-xs text-rose-500 dark:text-rose-400">{desktopError}</p>
            )}
          </div>
        ) : showPasswordConfirm ? (
          <form onSubmit={handleDesktopEnableWithPassword} className="space-y-3 py-2">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Enter your current password to store it in the OS credential store:
            </p>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Your password"
              autoFocus
              className="input w-full"
              disabled={desktopEnabling}
            />
            {desktopError && (
              <p className="text-xs text-rose-500 dark:text-rose-400">{desktopError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowPasswordConfirm(false);
                  setConfirmPassword('');
                  setDesktopError(null);
                }}
                className="btn-secondary flex-1 py-2 text-sm"
                disabled={desktopEnabling}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={desktopEnabling || !confirmPassword}
                className="btn-primary flex-1 py-2 text-sm"
              >
                {desktopEnabling ? 'Saving…' : 'Enable'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3 py-2">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  OS keyring unlock is not enabled
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Your password will be stored in the OS secure credential store, protected by your
                  OS login session.
                </p>
              </div>
              <button
                type="button"
                disabled={desktopEnabling}
                onClick={handleDesktopEnable}
                className="px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors disabled:opacity-50 shrink-0"
              >
                {desktopEnabling ? 'Enabling…' : 'Enable'}
              </button>
            </div>
            {desktopError && (
              <p className="text-xs text-rose-500 dark:text-rose-400">{desktopError}</p>
            )}
          </div>
        )}
      </SettingSection>
    );
  }

  return null;
}
