import { useEffect, useState } from 'react';
import { SettingSection } from '../SettingSection';
import { biometricIsAvailable, biometricIsEnrolled, biometricUnenroll } from '../../../lib/services/biometricService';

interface PrivacyBiometricProps {
  isAndroid: boolean;
}

export function PrivacyBiometric({ isAndroid }: PrivacyBiometricProps) {
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnrolled, setBiometricEnrolled] = useState(false);
  const [biometricDisabling, setBiometricDisabling] = useState(false);

  useEffect(() => {
    if (!isAndroid) return;
    Promise.all([biometricIsAvailable(), biometricIsEnrolled()]).then(
      ([available, enrolled]) => {
        setBiometricAvailable(available);
        setBiometricEnrolled(enrolled);
      }
    ).catch(() => {});
  }, [isAndroid]);

  if (!isAndroid || !biometricAvailable) return null;

  return (
    <SettingSection
      title="Biometric Unlock"
      description="Use fingerprint or face to unlock MoodHaven Journal instead of typing your password"
    >
      {biometricEnrolled ? (
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
            disabled={biometricDisabling}
            onClick={async () => {
              setBiometricDisabling(true);
              await biometricUnenroll();
              setBiometricEnrolled(false);
              setBiometricDisabling(false);
            }}
            className="px-3 py-1.5 text-sm font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors disabled:opacity-50"
          >
            {biometricDisabling ? 'Disabling…' : 'Disable'}
          </button>
        </div>
      ) : (
        <div className="flex items-start gap-3 py-2">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Biometric unlock is not set up
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              To enable it, lock the app and use your password to unlock — you'll be offered fingerprint setup automatically.
            </p>
          </div>
        </div>
      )}
    </SettingSection>
  );
}
