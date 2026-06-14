/**
 * useAutoLock - Enforces the auto-lock and clear-clipboard privacy settings.
 *
 * Active only while the journal is unlocked and `autoLockTimeout > 0`:
 * - An inactivity timer (reset on pointer/key/touch/scroll) locks the app after
 *   `autoLockTimeout` minutes.
 * - When the app is backgrounded (tab hidden / window blur), the countdown
 *   restarts rather than firing instantly, so backgrounding locks after the
 *   timeout — matching the inactivity semantics the setting implies.
 * - On lock, the system clipboard is cleared when `clearClipboardOnLock` is set.
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import { useSettingsStore } from '../stores/settingsStore';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'mousemove'] as const;

export function useAutoLock() {
  const isUnlocked = useAppStore((s) => s.isUnlocked);
  const lock = useAppStore((s) => s.lock);
  const autoLockTimeout = useSettingsStore((s) => s.settings.privacy?.autoLockTimeout ?? 0);
  const clearClipboardOnLock = useSettingsStore((s) => s.settings.privacy?.clearClipboardOnLock ?? false);

  // Keep clipboard preference in a ref so the lock callback need not be a dependency.
  const clearClipboardRef = useRef(clearClipboardOnLock);
  clearClipboardRef.current = clearClipboardOnLock;

  useEffect(() => {
    if (!isUnlocked || autoLockTimeout <= 0) return;

    const timeoutMs = autoLockTimeout * 60_000;
    let timer: number | null = null;

    const doLock = () => {
      if (clearClipboardRef.current) {
        // Optional chaining covers a missing Clipboard API; .catch() covers a denied write.
        void navigator.clipboard?.writeText('').catch(() => {/* unavailable or denied — ignore */});
      }
      lock();
    };

    const resetTimer = () => {
      if (timer !== null) clearTimeout(timer);
      timer = window.setTimeout(doLock, timeoutMs);
    };

    // Backgrounding (tab hidden) restarts the countdown so it locks after the timeout.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') resetTimer();
    };

    resetTimer();

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, resetTimer, { passive: true });
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', resetTimer);

    return () => {
      if (timer !== null) clearTimeout(timer);
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, resetTimer);
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', resetTimer);
    };
  }, [isUnlocked, autoLockTimeout, lock]);
}
