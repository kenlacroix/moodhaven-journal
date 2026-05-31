import { useState, useCallback } from 'react';
import { usePeerSyncStore } from '../../stores/peerSyncStore';
import { peerSyncNow } from '../../lib/services/peerSyncEngineService';
import { DeviceIcon, SignalBars, ScanningDots } from './DeviceIconSet';
import { logger } from '../../lib/services/logger';
import type { DiscoveredPeer, SyncStatus } from '../../types/peerSync';

// ── Sync status inline badge ──────────────────────────────────────────────────

export function SyncStatusInline({ status }: { status: SyncStatus | undefined }) {
  if (!status || status.state === 'idle') return null;
  if (status.state === 'syncing')
    return (
      <span className="text-xs text-violet-400 flex items-center gap-1">
        <span className="animate-spin inline-block w-3 h-3 border border-violet-400 border-t-transparent rounded-full" />
        Syncing...
      </span>
    );
  if (status.state === 'success')
    return (
      <span className="text-xs text-emerald-400">
        Synced{status.count > 0 ? ` ${status.count} new` : ''}
      </span>
    );
  if (status.state === 'error')
    return <span className="text-xs text-red-400">Sync error</span>;
  return null;
}

// ── Nearby peer row ───────────────────────────────────────────────────────────

export function NearbyPeerRow({
  peer,
  onPair,
}: {
  peer: DiscoveredPeer;
  onPair: (peer: DiscoveredPeer) => void;
}) {
  const syncStatuses = usePeerSyncStore((s) => s.syncStatuses);
  const syncStatus = syncStatuses[peer.deviceId];
  const [syncing, setSyncing] = useState(false);

  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await peerSyncNow(peer.deviceId, peer.host);
    } catch (e) {
      logger.warn('[DevicesTab] Manual sync failed:', { error: String(e) });
    } finally {
      setSyncing(false);
    }
  }, [peer.deviceId, peer.host]);

  return (
    <div className="flex items-center gap-3 py-3 px-1 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 flex-shrink-0">
        <DeviceIcon type={peer.deviceType} className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
            {peer.deviceName}
          </span>
          {peer.isTrusted && (
            <span className="flex-shrink-0 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.403 12.652a3 3 0 000-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
              Trusted
            </span>
          )}
          <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0 capitalize">
            {peer.deviceType}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <SignalBars />
          <span className="text-xs text-slate-400 dark:text-slate-500">v{peer.version}</span>
          {peer.isTrusted && <SyncStatusInline status={syncStatus} />}
        </div>
      </div>
      {peer.isTrusted ? (
        <button
          onClick={handleSyncNow}
          disabled={syncing || syncStatus?.state === 'syncing'}
          className="px-3 py-1.5 text-xs font-medium rounded-lg flex-shrink-0 transition-colors text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/40 disabled:opacity-50"
        >
          {syncing || syncStatus?.state === 'syncing' ? 'Syncing…' : 'Sync'}
        </button>
      ) : (
        <button
          onClick={() => onPair(peer)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg flex-shrink-0 transition-colors text-white bg-violet-600 hover:bg-violet-500"
        >
          Pair
        </button>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function EmptyNearby({ isDiscovering }: { isDiscovering: boolean }) {
  return (
    <div className="py-6 text-center">
      {isDiscovering ? (
        <>
          <div className="flex justify-center mb-2">
            <ScanningDots />
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Scanning for nearby devices…</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Make sure other devices are on the same network
          </p>
        </>
      ) : (
        <>
          <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-2">
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
            </svg>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Discovery is off</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Enable Local Sync to discover nearby devices
          </p>
        </>
      )}
    </div>
  );
}
