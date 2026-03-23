/**
 * PeerSyncBadge — compact peer sync status pill for the sidebar footer area.
 * Shows count of online peers; pulses when syncing (Phase 3+).
 */

import { usePeerSyncStore } from '../../stores/peerSyncStore';

interface PeerSyncBadgeProps {
  collapsed: boolean;
  onOpenDevices: () => void;
}

export function PeerSyncBadge({ collapsed, onOpenDevices }: PeerSyncBadgeProps) {
  const nearbyPeers = usePeerSyncStore((s) => s.nearbyPeers);
  const isDiscovering = usePeerSyncStore((s) => s.isDiscovering);
  const syncStatuses = usePeerSyncStore((s) => s.syncStatuses);
  const pairingRequest = usePeerSyncStore((s) => s.pairingRequest);
  const setPairingRequest = usePeerSyncStore((s) => s.setPairingRequest);

  const count = nearbyPeers.length;
  const syncingStatus = Object.values(syncStatuses).find((s) => s.state === 'syncing');
  const isSyncing = syncingStatus !== undefined;
  const syncingName = syncingStatus?.state === 'syncing' ? syncingStatus.deviceName : '';

  const hasPairingRequest = pairingRequest !== null;

  if (!isDiscovering && count === 0 && !isSyncing && !hasPairingRequest) return null;

  function handleClick() {
    // Clear the pairing request indicator when the user opens Devices.
    if (hasPairingRequest) setPairingRequest(null);
    onOpenDevices();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={
        hasPairingRequest
          ? `${pairingRequest!.deviceName} wants to pair — open Devices settings`
          : isSyncing
            ? `Syncing with ${syncingName} — open Devices settings`
            : count > 0
              ? `${count} device${count !== 1 ? 's' : ''} nearby — open Devices settings`
              : 'Looking for nearby devices'
      }
      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300"
    >
      {/* Icon: spinner during sync, two overlapping circles otherwise */}
      {isSyncing ? (
        <span className="w-3.5 h-3.5 flex-shrink-0 border-2 border-violet-400/40 border-t-violet-400 rounded-full animate-spin" />
      ) : (
        <svg
          className="w-3.5 h-3.5 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <circle cx="9" cy="12" r="4" />
          <circle cx="15" cy="12" r="4" />
        </svg>
      )}

      {!collapsed && (
        <span className="truncate whitespace-nowrap overflow-hidden transition-all duration-300">
          {hasPairingRequest
            ? `${pairingRequest!.deviceName} wants to pair`
            : isSyncing
              ? 'Syncing…'
              : count > 0
                ? `${count} device${count !== 1 ? 's' : ''} nearby`
                : 'Looking for devices'}
        </span>
      )}

      {/* Status dot — amber pulse for pairing request, emerald for peers nearby */}
      {!collapsed && !isSyncing && (
        <>
          {hasPairingRequest && (
            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 animate-pulse" />
          )}
          {!hasPairingRequest && count > 0 && (
            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
          )}
        </>
      )}
    </button>
  );
}
