/**
 * use2FASetup — encapsulates 2FA setup flow state for PrivacyTab.
 * Extracted from PrivacyTab.tsx (SETTINGS-001).
 */

import { useState, useCallback } from 'react';
import type { BackupCodes } from '../types/twoFactor';
import { regenerateBackupCodes, disable2FA } from '../lib/services/twoFactorService';
import { logger } from '../lib/services/logger';

export interface Use2FASetupReturn {
  show2FASetup: 'totp' | 'webauthn' | null;
  setShow2FASetup: (v: 'totp' | 'webauthn' | null) => void;
  showBackupCodes: boolean;
  setShowBackupCodes: (v: boolean) => void;
  backupCodes: BackupCodes | null;
  isDisabling2FA: boolean;
  showDisable2FAConfirm: boolean;
  setShowDisable2FAConfirm: (v: boolean) => void;
  handle2FASetupComplete: () => void;
  handleRegenerateBackupCodes: () => Promise<void>;
  handleDisable2FA: () => Promise<void>;
}

export function use2FASetup(refresh2FAStatus: () => Promise<void>): Use2FASetupReturn {
  const [show2FASetup, setShow2FASetup] = useState<'totp' | 'webauthn' | null>(null);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [backupCodes, setBackupCodes] = useState<BackupCodes | null>(null);
  const [isDisabling2FA, setIsDisabling2FA] = useState(false);
  const [showDisable2FAConfirm, setShowDisable2FAConfirm] = useState(false);

  const handle2FASetupComplete = useCallback(() => {
    setShow2FASetup(null);
    void refresh2FAStatus();
  }, [refresh2FAStatus]);

  const handleRegenerateBackupCodes = useCallback(async () => {
    setBackupCodes(null);
    try {
      const codes = await regenerateBackupCodes();
      setBackupCodes(codes);
      setShowBackupCodes(true);
      void refresh2FAStatus();
    } catch (error) {
      logger.error('Failed to regenerate backup codes:', { error: String(error) });
    }
  }, [refresh2FAStatus]);

  const handleDisable2FA = useCallback(async () => {
    setIsDisabling2FA(true);
    try {
      await disable2FA();
      setShowDisable2FAConfirm(false);
      void refresh2FAStatus();
    } catch (error) {
      logger.error('Failed to disable 2FA:', { error: String(error) });
    } finally {
      setIsDisabling2FA(false);
    }
  }, [refresh2FAStatus]);

  return {
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
  };
}
