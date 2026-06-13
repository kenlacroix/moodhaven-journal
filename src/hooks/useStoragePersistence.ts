/**
 * useStoragePersistence — fires once per unlock session in the browser/PWA build to
 * request durable IndexedDB storage (see `storagePersistence.ts`). If the browser
 * denies persistence, the journal can be evicted under storage pressure, so the hook
 * surfaces a one-time "back up your journal" nudge.
 *
 * Browser-only: gated on `usePlatform().isBrowser`, so it is inert in the desktop and
 * native mobile builds (real filesystem, no eviction risk).
 */

import { useEffect, useState } from 'react';
import { usePlatform } from './usePlatform';
import { ensurePersistentStorage } from '../lib/services/storagePersistence';
import { logger } from '../lib/services/logger';

const SESSION_KEY = 'mb_storage_persist_checked';

export interface StoragePersistenceState {
  /** True only in the browser build when the browser denied durable storage. */
  showBackupNudge: boolean;
  dismissBackupNudge: () => void;
}

export function useStoragePersistence(enabled: boolean): StoragePersistenceState {
  const { isBrowser } = usePlatform();
  const [showBackupNudge, setShowBackupNudge] = useState(false);

  useEffect(() => {
    if (!enabled || !isBrowser) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    let cancelled = false;
    ensurePersistentStorage()
      .then((state) => {
        if (cancelled) return;
        // Checked once per session regardless of outcome — no point re-prompting.
        sessionStorage.setItem(SESSION_KEY, '1');
        if (state === 'denied') setShowBackupNudge(true);
      })
      .catch((error) => {
        logger.warn('[useStoragePersistence] persist check failed', { error: String(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, isBrowser]);

  return {
    showBackupNudge,
    dismissBackupNudge: () => setShowBackupNudge(false),
  };
}
