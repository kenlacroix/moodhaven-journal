import { useState, useEffect, useCallback } from 'react';
import type { TrustedDevice, PairingTokenInfo } from '../../types/peerSync';
import {
  generatePairingToken,
  cancelPairing,
  onPeerPaired,
  onPairingAttemptFailed,
  onPairingLocked,
} from '../../lib/services/peerPairingService';
import { useCountdown, formatCountdown } from './PairingHooks';
import { QRCodeSVG } from 'qrcode.react';
import { PINDisplay, LockedBanner } from './PairingUIComponents';

export function ShowCodeTab({
  onSuccess,
}: {
  onSuccess: (device: TrustedDevice) => void;
}) {
  const [tokenInfo, setTokenInfo] = useState<PairingTokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attemptWarning, setAttemptWarning] = useState<number | null>(null);
  const [lockedOut, setLockedOut] = useState(false);
  const secondsLeft = useCountdown(tokenInfo?.expiresAt ?? null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let unlistenFailed: (() => void) | null = null;
    let unlistenLocked: (() => void) | null = null;
    let cancelled = false;

    async function start() {
      setLoading(true);
      setError('');
      setAttemptWarning(null);
      setLockedOut(false);
      try {
        const info = await generatePairingToken();
        if (!cancelled) setTokenInfo(info);

        unlisten = await onPeerPaired((device) => {
          if (!cancelled) onSuccess(device);
        });

        // Show warning when the other device enters a wrong PIN
        unlistenFailed = await onPairingAttemptFailed(({ remainingAttempts }) => {
          if (!cancelled) setAttemptWarning(remainingAttempts);
        });

        // Switch to locked state after too many failures
        unlistenLocked = await onPairingLocked(() => {
          if (!cancelled) setLockedOut(true);
        });
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    start();

    return () => {
      cancelled = true;
      unlisten?.();
      unlistenFailed?.();
      unlistenLocked?.();
      cancelPairing().catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    setError('');
    setTokenInfo(null);
    setAttemptWarning(null);
    setLockedOut(false);
    try {
      const info = await generatePairingToken();
      setTokenInfo(info);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Starting pairing server…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  const expired = secondsLeft === 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300 text-center">
        On the other device, go to{' '}
        <strong>Settings → Devices → Pair → Enter Their Code</strong> and type:
      </p>

      {tokenInfo && <PINDisplay pin={tokenInfo.pin} />}

      {/* QR code */}
      <div className="flex flex-col items-center gap-2">
        {tokenInfo?.qrPayload ? (
          <div className="w-40 h-40 rounded-xl border-2 border-violet-100 dark:border-violet-900/40 bg-[#faf5ff] flex items-center justify-center p-2">
            <QRCodeSVG
              value={tokenInfo.qrPayload}
              size={144}
              level="M"
              bgColor="#faf5ff"
              fgColor="#4c1d95"
              title="Pairing QR code"
            />
          </div>
        ) : (
          <div className="w-40 h-40 rounded-xl bg-violet-50 dark:bg-violet-900/10 border-2 border-violet-100 dark:border-violet-900/40 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <p className="text-xs text-slate-400 dark:text-slate-500">Or scan this QR code</p>
      </div>

      {/* Countdown / expired / locked */}
      {lockedOut ? (
        <LockedBanner onRefresh={handleRefresh} />
      ) : expired ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-amber-600 dark:text-amber-400">Code expired</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg"
          >
            Generate New Code
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Wrong-PIN warning from the other device */}
          {attemptWarning !== null && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Incorrect PIN entered —{' '}
                <strong>{attemptWarning}</strong>{' '}
                {attemptWarning === 1 ? 'attempt' : 'attempts'} remaining
              </p>
            </div>
          )}

          {/* Waiting indicator */}
          <div
            className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse flex-shrink-0" />
            <span>Waiting for connection…</span>
            <span className="font-mono text-xs text-slate-400 dark:text-slate-500 tabular-nums">
              ({formatCountdown(secondsLeft)})
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
