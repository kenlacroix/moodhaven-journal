import { PairingModal } from '../peer-sync/PairingModal';
import { peerSyncNow } from '../../lib/peerSyncEngineService';
import type { DiscoveredPeer, TrustedDevice } from '../../types/peerSync';

interface DevicesStepProps {
  onBack: () => void;
  onNext: () => void;
  nearbyPeers: DiscoveredPeer[];
  trustedDevices: TrustedDevice[];
  isDiscovering: boolean;
  pairingPeer: DiscoveredPeer | null;
  onPairingPeerChange: (peer: DiscoveredPeer | null) => void;
}

export function DevicesStep({
  onBack,
  onNext,
  nearbyPeers,
  trustedDevices,
  isDiscovering,
  pairingPeer,
  onPairingPeerChange,
}: DevicesStepProps) {
  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">
          Connect Your Devices
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {isDiscovering ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-3 border border-violet-400 border-t-violet-600 rounded-full animate-spin" />
              Scanning your network…
            </span>
          ) : (
            'Nearby devices running MoodHaven Journal will appear below'
          )}
        </p>
      </div>

      {/* Nearby peers list */}
      <div className="space-y-2 min-h-[80px]">
        {nearbyPeers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-slate-400 dark:text-slate-500">
            <svg className="w-8 h-8 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            <p className="text-sm">No devices found yet</p>
            <p className="text-xs mt-1">Make sure other devices are open and on the same network</p>
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
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Paired
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onPairingPeerChange(peer)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-500 hover:bg-violet-600 text-white transition-colors"
                  >
                    Pair
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary flex-1 py-3"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="btn-primary flex-1 py-3"
        >
          {trustedDevices.length > 0 ? 'Continue' : 'Skip for now →'}
        </button>
      </div>

      {pairingPeer && (
        <PairingModal
          peer={pairingPeer}
          onClose={async () => {
            const justPaired = trustedDevices.find((d) => d.deviceId === pairingPeer.deviceId);
            if (justPaired) {
              peerSyncNow(pairingPeer.deviceId, pairingPeer.host).catch(() => {});
            }
            onPairingPeerChange(null);
          }}
        />
      )}
    </div>
  );
}
