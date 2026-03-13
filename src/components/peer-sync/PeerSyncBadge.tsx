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

  const count = nearbyPeers.length;

  if (!isDiscovering && count === 0) return null;

  return (
    <button
      type="button"
      onClick={onOpenDevices}
      title={
        count > 0
          ? `${count} device${count !== 1 ? 's' : ''} nearby — open Devices settings`
          : 'Scanning for nearby devices'
      }
      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300"
    >
      {/* Icon: two overlapping circles = peer network */}
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

      {!collapsed && (
        <span className="truncate whitespace-nowrap overflow-hidden transition-all duration-300">
          {count > 0
            ? `${count} device${count !== 1 ? 's' : ''} nearby`
            : 'Scanning…'}
        </span>
      )}

      {!collapsed && count > 0 && (
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
      )}
    </button>
  );
}
