import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { AppSettings } from '../../../types/settings';
import type { TwoFactorStatus } from '../../../types/twoFactor';
import { usePlatform } from '../../../hooks/usePlatform';
import { TotpSetup, HardwareKeySetup, BackupCodesDisplay } from '../../two-factor';
import { use2FASetup } from '../../../hooks/use2FASetup';
import { PrivacyAutoLock } from './PrivacyAutoLock';
import { PrivacyBiometric } from './PrivacyBiometric';
import { PrivacyPinUnlock } from './PrivacyPinUnlock';
import { PrivacyChangePassword } from './PrivacyChangePassword';
import { PrivacyTwoFactor } from './PrivacyTwoFactor';
import { PrivacyDataManagement } from './PrivacyDataManagement';
import { TransparencySection } from './PrivacyTransparency';

interface PrivacyTabProps {
  settings: AppSettings;
  dataStats: { totalEntries: number; averageMood: number } | null;
  twoFactorStatus: TwoFactorStatus | null;
  backupCodesCount: number;
  refresh2FAStatus: () => Promise<void>;
  isExporting: boolean;
  exportProgress: { done: number; total: number } | null;
  handleExport: () => void;
  setAutoLockTimeout: (v: number) => void;
  sessionPassword?: string;
  transparencyRef?: RefObject<HTMLDivElement>;
}

export function PrivacyTab({
  settings,
  dataStats,
  twoFactorStatus,
  backupCodesCount,
  refresh2FAStatus,
  isExporting,
  exportProgress,
  handleExport,
  setAutoLockTimeout,
  sessionPassword = '',
  transparencyRef,
}: PrivacyTabProps) {
  const { isAndroid, isBrowser, isDesktop, canHardwareKey } = usePlatform();

  const savedFocusRef = useRef<Element | null>(null);
  const totpDialogRef = useRef<HTMLDivElement>(null);
  const webauthnDialogRef = useRef<HTMLDivElement>(null);
  const backupCodesDialogRef = useRef<HTMLDivElement>(null);
  const disable2FADialogRef = useRef<HTMLDivElement>(null);

  const {
    show2FASetup,
    setShow2FASetup,
    showBackupCodes,
    setShowBackupCodes,
    backupCodes,
    isDisabling2FA,
    showDisable2FAConfirm,
    setShowDisable2FAConfirm,
    handle2FASetupComplete,
    handleRegenerateBackupCodes,
    handleDisable2FA,
  } = use2FASetup(refresh2FAStatus);

  // Focus management: move focus into the open dialog, restore on close
  useEffect(() => {
    const dialogRef =
      show2FASetup === 'totp' ? totpDialogRef
      : show2FASetup === 'webauthn' ? webauthnDialogRef
      : showBackupCodes ? backupCodesDialogRef
      : showDisable2FAConfirm ? disable2FADialogRef
      : null;

    if (!dialogRef) return;

    savedFocusRef.current = document.activeElement;
    const rafId = requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')
        ?.focus();
    });

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (show2FASetup) setShow2FASetup(null);
      else if (showBackupCodes) setShowBackupCodes(false);
      else if (showDisable2FAConfirm) setShowDisable2FAConfirm(false);
    };
    document.addEventListener('keydown', handleEsc);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('keydown', handleEsc);
      (savedFocusRef.current as HTMLElement | null)?.focus?.();
    };
  }, [show2FASetup, showBackupCodes, showDisable2FAConfirm]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div id="panel-privacy" role="tabpanel" aria-labelledby="tab-privacy" className="space-y-6">
        <PrivacyAutoLock
          settings={settings}
          setAutoLockTimeout={setAutoLockTimeout}
        />

        <PrivacyBiometric
          isAndroid={isAndroid}
          isDesktop={isDesktop}
          settings={settings}
          sessionPassword={sessionPassword}
        />

        <PrivacyPinUnlock sessionPassword={sessionPassword} />

        <PrivacyChangePassword sessionPassword={sessionPassword} />

        <PrivacyTwoFactor
          twoFactorStatus={twoFactorStatus}
          backupCodesCount={backupCodesCount}
          canHardwareKey={canHardwareKey}
          onSetupTotp={() => setShow2FASetup('totp')}
          onSetupWebAuthn={() => setShow2FASetup('webauthn')}
          onRegenerateBackupCodes={handleRegenerateBackupCodes}
          onShowDisableConfirm={() => setShowDisable2FAConfirm(true)}
        />

        <PrivacyDataManagement
          dataStats={dataStats}
          isExporting={isExporting}
          exportProgress={exportProgress}
          handleExport={handleExport}
        />

        <TransparencySection settings={settings} isBrowser={isBrowser} sectionRef={transparencyRef} />
      </div>

      {/* 2FA Setup Modal - TOTP */}
      {show2FASetup === 'totp' && (
        <div
          ref={totpDialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Set up authenticator app"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 max-w-md mx-4 w-full">
            <TotpSetup
              password={sessionPassword}
              onComplete={handle2FASetupComplete}
              onCancel={() => setShow2FASetup(null)}
            />
          </div>
        </div>
      )}

      {/* 2FA Setup Modal - Hardware Key */}
      {show2FASetup === 'webauthn' && (
        <div
          ref={webauthnDialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Set up hardware key"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 max-w-md mx-4 w-full">
            <HardwareKeySetup
              onComplete={handle2FASetupComplete}
              onCancel={() => setShow2FASetup(null)}
            />
          </div>
        </div>
      )}

      {/* Backup Codes Modal */}
      {showBackupCodes && backupCodes && (
        <div
          ref={backupCodesDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="backup-codes-modal-title"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 max-w-md mx-4 w-full">
            <h3 id="backup-codes-modal-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
              New Backup Codes
            </h3>
            <BackupCodesDisplay
              codes={backupCodes.codes}
              onDone={() => setShowBackupCodes(false)}
            />
          </div>
        </div>
      )}

      {/* Disable 2FA Confirmation */}
      {showDisable2FAConfirm && (
        <div
          ref={disable2FADialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="disable-2fa-modal-title"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 id="disable-2fa-modal-title" className="text-lg font-semibold text-slate-800 dark:text-white">
                  Disable 2FA
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  This will reduce your account security
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              Are you sure you want to disable two-factor authentication?
              Your journal will only be protected by your password.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                onClick={() => setShowDisable2FAConfirm(false)}
              >
                Keep Enabled
              </button>
              <button
                type="button"
                disabled={isDisabling2FA}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50"
                onClick={handleDisable2FA}
              >
                {isDisabling2FA ? 'Disabling...' : 'Disable 2FA'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
