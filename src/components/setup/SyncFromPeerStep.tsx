import { PairingModal } from '../peer-sync/PairingModal';
import { peerFullRestore, peerApplyAndRestart } from '../../lib/services/peerSyncEngineService';
import type { DiscoveredPeer, TrustedDevice } from '../../types/peerSync';
import type { RestoreProgressEvent } from '../../lib/services/peerSyncEngineService';

interface SyncFromPeerStepProps {
  onBack: () => void;
  onSkip: () => void;
  restoreProgress: RestoreProgressEvent | null;
  restoreReady: boolean;
  restoreError: string | null;
  onRestoreErrorChange: (err: string) => void;
  nearbyPeers: DiscoveredPeer[];
  trustedDevices: TrustedDevice[];
  isDiscovering: boolean;
  pairingPeer: DiscoveredPeer | null;
  onPairingPeerChange: (peer: DiscoveredPeer | null) => void;
  isLoading: boolean;
}

export function SyncFromPeerStep({
  onBack,
  onSkip,
  restoreProgress,
  restoreReady,
  restoreError,
  onRestoreErrorChange,
  nearbyPeers,
  trustedDevices,
  isDiscovering,
  pairingPeer,
  onPairingPeerChange,
  isLoading,
}: SyncFromPeerStepProps) {
  const isTransferring = restoreProgress !== null && !restoreReady;
  const pct = restoreProgress?.percentage ?? 0;
  const mbReceived = ((restoreProgress?.bytesReceived ?? 0) / 1_048_576).toFixed(1);
  const mbTotal = ((restoreProgress?.totalBytes ?? 0) / 1_048_576).toFixed(1);

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
          {restoreReady ? (
            <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : isTransferring ? (
            <span className="w-6 h-6 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />
          ) : (
            <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
            </svg>
          )}
        </div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">
          {restoreReady ? 'Transfer Complete!' : isTransferring ? 'Transferring…' : 'Connect to Your Device'}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {restoreReady
            ? `All data received from ${restoreProgress?.deviceName ?? 'your device'}. The app will close — reopen it to continue.`
            : isTransferring
              ? `${mbReceived} MB / ${mbTotal} MB`
              : isDiscovering
                ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-3 border border-emerald-400 border-t-emerald-600 rounded-full animate-spin" />
                    Scanning your network…
                  </span>
                )
                : 'Open MoodHaven Journal on your other device — it must be on the same network.'}
        </p>
      </div>

      {/* Transfer progress bar */}
      {isTransferring && (
        <div className="space-y-1.5">
          <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
              style={{ width: `${pct.toFixed(1)}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 text-right">
            {pct.toFixed(0)}%
          </p>
        </div>
      )}

      {/* Password note — only shown before transfer starts */}
      {!isTransferring && !restoreReady && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
          <strong>Important:</strong> The password you just entered must match the one on your source device. Both devices use the same password to encrypt data.
        </div>
      )}

      {/* Peer list — hidden while transferring or done */}
      {!isTransferring && !restoreReady && (
        <div className="space-y-2 min-h-[80px]">
          {nearbyPeers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-slate-400 dark:text-slate-500">
              <svg className="w-8 h-8 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              <p className="text-sm">No devices found yet</p>
              <p className="text-xs mt-1">Make sure your other device is open and on the same Wi-Fi</p>
            </div>
          ) : (
            nearbyPeers.map((peer) => {
              const isTrusted = trustedDevices.some((d) => d.deviceId === peer.deviceId);
              return (
                <div key={peer.deviceId} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <rect x="2" y="3" width="20" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M12 17v4" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{peer.deviceName}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{peer.host}</p>
                  </div>
                  {isTrusted ? (
                    <button
                      type="button"
                      onClick={() => peerFullRestore(peer.deviceId, peer.host).catch((e: unknown) => onRestoreErrorChange(String(e)))}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onPairingPeerChange(peer)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                    >
                      Pair & Restore
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {restoreError && (
        <p className="text-sm text-rose-500 dark:text-rose-400">{restoreError}</p>
      )}

      <div className="flex gap-3">
        {!isTransferring && !restoreReady && (
          <button
            type="button"
            onClick={onBack}
            className="btn-secondary flex-1 py-3"
          >
            Back
          </button>
        )}
        {restoreReady && (
          <button
            type="button"
            onClick={() => peerApplyAndRestart().catch((e: unknown) => onRestoreErrorChange(String(e)))}
            className="btn-primary flex-1 py-3"
          >
            Apply & Restart
          </button>
        )}
        {!isTransferring && !restoreReady && (
          <button
            type="button"
            onClick={onSkip}
            disabled={isLoading}
            className="btn-secondary flex-1 py-3"
          >
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-500 rounded-full animate-spin" />
                Setting up…
              </span>
            ) : 'Skip for now'}
          </button>
        )}
      </div>

      {pairingPeer && (
        <PairingModal
          peer={pairingPeer}
          onClose={async () => {
            const justPaired = trustedDevices.find((d) => d.deviceId === pairingPeer.deviceId);
            if (justPaired) {
              peerFullRestore(pairingPeer.deviceId, pairingPeer.host).catch((e: unknown) => onRestoreErrorChange(String(e)));
            }
            onPairingPeerChange(null);
          }}
        />
      )}
    </div>
  );
}
