/**
 * DevicesRestoreArm — "Set up a new device" control.
 *
 * Full-DB restore lets a brand-new device pull this device's entire (encrypted)
 * database. Because a previously-paired peer can complete the sync handshake on
 * its own, trust alone is not authorization to hand over the whole DB. The user
 * must explicitly arm restore here, on the source device, for a short window
 * (5 minutes) before the new device can pull. This mirrors the pairing model.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  peerArmRestore,
  peerDisarmRestore,
} from '../../lib/services/peerSyncEngineService';
import { logger } from '../../lib/services/logger';

const ARM_WINDOW_SECS = 300;

export function DevicesRestoreArm() {
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => stopTimer, [stopTimer]);

  const arm = useCallback(async () => {
    setBusy(true);
    try {
      await peerArmRestore();
      setRemaining(ARM_WINDOW_SECS);
      stopTimer();
      timerRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            stopTimer();
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    } catch (e) {
      logger.error('[DevicesRestoreArm] arm failed', { error: String(e) });
    } finally {
      setBusy(false);
    }
  }, [stopTimer]);

  const disarm = useCallback(async () => {
    setBusy(true);
    try {
      await peerDisarmRestore();
    } catch (e) {
      logger.error('[DevicesRestoreArm] disarm failed', { error: String(e) });
    } finally {
      stopTimer();
      setRemaining(0);
      setBusy(false);
    }
  }, [stopTimer]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const armed = remaining > 0;

  return (
    <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Set up a new device</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
          Allow an already-paired device to copy your full journal during its first-time
          setup. For your security this stays open for only 5 minutes, then closes
          automatically. Start the restore on the new device while this is active.
        </p>
      </div>

      {armed ? (
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Restore allowed — {mins}:{secs.toString().padStart(2, '0')} left
          </span>
          <button
            onClick={disarm}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={arm}
          disabled={busy}
          className="text-sm px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium disabled:opacity-50"
        >
          Allow restore for 5 minutes
        </button>
      )}
    </div>
  );
}
