/**
 * TrustedDevicesList — Shows all paired devices with revoke option.
 */

import { useState, useCallback } from 'react';
import type { TrustedDevice } from '../../types/peerSync';
import { revokeDevice } from '../../lib/peerPairingService';
import { usePeerSyncStore } from '../../stores/peerSyncStore';
import { logger } from '../../lib/logger';

function DeviceIcon({ type, className = 'w-4 h-4' }: { type: string; className?: string }) {
  if (type === 'phone')
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <rect x="5" y="2" width="14" height="20" rx="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  if (type === 'tablet')
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <rect x="4" y="2" width="16" height="20" rx="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  if (type === 'watch')
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <rect x="7" y="6" width="10" height="12" rx="3" strokeLinecap="round" strokeLinejoin="round" />
        <path strokeLinecap="round" d="M9 6V4h6v2M9 18v2h6v-2" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    );
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="2" y="3" width="20" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M12 17v4" />
    </svg>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function TrustedDeviceRow({ device }: { device: TrustedDevice }) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const removeTrusted = usePeerSyncStore((s) => s.removeTrusted);
  const markPeerUntrusted = usePeerSyncStore((s) => s.markPeerUntrusted);

  const handleRevoke = useCallback(async () => {
    if (!confirming) { setConfirming(true); return; }
    setRemoving(true);
    try {
      await revokeDevice(device.deviceId);
      removeTrusted(device.deviceId);
      markPeerUntrusted(device.deviceId);
    } catch (e) {
      logger.error('[TrustedDevicesList] Revoke failed:', { error: String(e) });
    } finally {
      setRemoving(false);
      setConfirming(false);
    }
  }, [confirming, device.deviceId, removeTrusted, markPeerUntrusted]);

  return (
    <div className="flex items-center gap-3 py-3 px-1 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
        <DeviceIcon type={device.deviceType} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
            {device.deviceName}
          </span>
          <span className="flex-shrink-0 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.403 12.652a3 3 0 000-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            Trusted
          </span>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 capitalize">
          {device.deviceType} · Paired {formatDate(device.pairedAt)}
        </p>
      </div>
      <button
        onClick={confirming ? handleRevoke : () => setConfirming(true)}
        disabled={removing}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg flex-shrink-0 transition-colors disabled:opacity-40 ${
          confirming
            ? 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/40'
            : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
        }`}
        title={confirming ? 'Click again to confirm removal' : 'Remove paired device'}
      >
        {removing ? '…' : confirming ? 'Confirm' : 'Remove'}
      </button>
      {confirming && !removing && (
        <button
          onClick={() => setConfirming(false)}
          className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

export function TrustedDevicesList() {
  const trustedDevices = usePeerSyncStore((s) => s.trustedDevices);

  if (trustedDevices.length === 0) {
    return (
      <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 border-dashed shadow-sm p-6 text-center">
        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-2">
          <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">No paired devices yet</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
          Click <strong>Pair</strong> next to a nearby device to pair with it
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="px-3">
        {trustedDevices.map((device) => (
          <TrustedDeviceRow key={device.deviceId} device={device} />
        ))}
      </div>
    </div>
  );
}
