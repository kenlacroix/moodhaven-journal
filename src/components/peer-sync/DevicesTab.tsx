/**
 * DevicesTab — Settings tab for local peer sync
 *
 * Shows:
 * - Discovery toggle (Local Sync on/off)
 * - This device card (identity + rename)
 * - Nearby discovered devices with Pair buttons
 * - Paired (trusted) devices with Remove
 * - Privacy note
 */

import { useState, useCallback } from 'react';
import { usePeerSyncStore } from '../../stores/peerSyncStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { usePlatform } from '../../hooks/usePlatform';
import { renameDevice, startDiscovery, stopDiscovery } from '../../lib/services/peerDiscoveryService';
import { peerSyncNow } from '../../lib/services/peerSyncEngineService';
import { PairingModal } from './PairingModal';
import { TrustedDevicesList } from './TrustedDevicesList';
import type { DeviceIdentity, DiscoveredPeer, SyncStatus } from '../../types/peerSync';
import { logger } from '../../lib/services/logger';

// ── Device type icon ──────────────────────────────────────────────────────────

function DeviceIcon({ type, className = 'w-5 h-5' }: { type: string; className?: string }) {
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

// ── Signal strength indicator ─────────────────────────────────────────────────

function SignalBars({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-end gap-px ${className}`} aria-label="Strong signal" title="Strong signal">
      {[4, 7, 10].map((h, i) => (
        <span key={i} className="w-1 rounded-sm bg-emerald-400" style={{ height: h }} />
      ))}
    </span>
  );
}

// ── Scanning dots ─────────────────────────────────────────────────────────────

function ScanningDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-violet-400 animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: '1s' }}
        />
      ))}
    </span>
  );
}

// ── Rename device inline form ─────────────────────────────────────────────────

function RenameForm({
  currentName,
  onSave,
  onCancel,
}: {
  currentName: string;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed) { setError('Name cannot be empty'); return; }
    if (trimmed.length > 64) { setError('Max 64 characters'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(trimmed);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') onCancel();
          }}
          maxLength={64}
          autoFocus
          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-violet-400 dark:border-violet-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          placeholder="e.g. Ken's MacBook"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ── This device card ──────────────────────────────────────────────────────────

function ThisDeviceCard({ identity }: { identity: DeviceIdentity }) {
  const setIdentity = usePeerSyncStore((s) => s.setIdentity);
  const [renaming, setRenaming] = useState(false);

  const handleRename = useCallback(
    async (name: string) => {
      const updated = await renameDevice(name);
      setIdentity(updated);
      setRenaming(false);
    },
    [setIdentity]
  );

  return (
    <div className="p-4 rounded-xl bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800/40">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
        This Device
      </p>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400 flex-shrink-0">
          <DeviceIcon type={identity.deviceType} className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
              {identity.deviceName}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 capitalize flex-shrink-0">
              {identity.deviceType}
            </span>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">
            ID: {identity.deviceId} · port {42424}
          </p>
          {!renaming && (
            <button
              onClick={() => setRenaming(true)}
              className="mt-2 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-500 underline-offset-2 hover:underline transition-colors"
            >
              Rename
            </button>
          )}
        </div>
      </div>
      {renaming && (
        <RenameForm
          currentName={identity.deviceName}
          onSave={handleRename}
          onCancel={() => setRenaming(false)}
        />
      )}
    </div>
  );
}

// ── Sync status inline badge ──────────────────────────────────────────────────

function SyncStatusInline({ status }: { status: SyncStatus | undefined }) {
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

function NearbyPeerRow({
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

function EmptyNearby({ isDiscovering }: { isDiscovering: boolean }) {
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

// ── Main component ────────────────────────────────────────────────────────────

const INTERVAL_OPTIONS = [
  { label: '10 s', value: 10 },
  { label: '30 s', value: 30 },
  { label: '1 min', value: 60 },
  { label: '5 min', value: 300 },
];

export function DevicesTab() {
  const { isBrowser } = usePlatform();
  const { identity, identityLoading, isDiscovering, nearbyPeers, setDiscovering, clearPeers } =
    usePeerSyncStore();

  const peerSyncLanOnly = useSettingsStore((s) => s.settings.sync.peerSyncLanOnly);
  const peerSyncIntervalSecs = useSettingsStore((s) => s.settings.sync.peerSyncIntervalSecs);
  const setPeerSyncLanOnly = useSettingsStore((s) => s.setPeerSyncLanOnly);
  const setPeerSyncIntervalSecs = useSettingsStore((s) => s.setPeerSyncIntervalSecs);
  const saveSettings = useSettingsStore((s) => s.saveSettings);

  const [togglingDiscovery, setTogglingDiscovery] = useState(false);
  const [pairingPeer, setPairingPeer] = useState<DiscoveredPeer | null>(null);

  const handleToggleDiscovery = useCallback(async () => {
    setTogglingDiscovery(true);
    try {
      if (isDiscovering) {
        await stopDiscovery();
        setDiscovering(false);
        clearPeers();
      } else {
        await startDiscovery();
        setDiscovering(true);
      }
    } catch (e) {
      logger.error('[DevicesTab] Toggle discovery failed:', { error: String(e) });
    } finally {
      setTogglingDiscovery(false);
    }
  }, [isDiscovering, setDiscovering, clearPeers]);

  if (isBrowser) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4 text-center px-4">
        <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <p className="font-medium text-slate-800 dark:text-slate-100">LAN Sync requires the desktop app</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Peer discovery and device pairing use mDNS and native TCP — not available in the browser.
          </p>
        </div>
        <a
          href="https://github.com/kenlacroix/moodhaven-journal/releases/latest"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-violet-600 dark:text-violet-400 underline"
        >
          Download the desktop app
        </a>
      </div>
    );
  }

  if (identityLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading device identity…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Pairing modal (rendered in a portal via fixed positioning) */}
      {pairingPeer && (
        <PairingModal peer={pairingPeer} onClose={() => setPairingPeer(null)} />
      )}

      <div className="space-y-6">
        {/* Local Sync toggle */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Local Sync</p>
                {isDiscovering && (
                  <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Active
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Discover and sync with devices on your local Wi-Fi network.
                Your data is always encrypted end-to-end.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={isDiscovering}
              onClick={handleToggleDiscovery}
              disabled={togglingDiscovery}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                isDiscovering ? 'bg-violet-600' : 'bg-slate-200 dark:bg-slate-700'
              } disabled:opacity-50`}
            >
              <span className="sr-only">Enable local sync</span>
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                  isDiscovering ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Sync options */}
        {isDiscovering && (
          <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Sync Options
            </p>

            {/* LAN-only toggle */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">LAN-only mode</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Only auto-sync when the peer is on your local network (RFC-1918 address).
                  Prevents accidental sync over VPN tunnels.
                </p>
              </div>
              <button
                role="switch"
                aria-checked={peerSyncLanOnly}
                onClick={() => { setPeerSyncLanOnly(!peerSyncLanOnly); saveSettings(); }}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                  peerSyncLanOnly ? 'bg-violet-600' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              >
                <span className="sr-only">LAN-only mode</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                    peerSyncLanOnly ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Auto-sync interval */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Auto-sync interval</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Minimum time between automatic syncs per device.
                </p>
              </div>
              <select
                value={peerSyncIntervalSecs}
                onChange={(e) => { setPeerSyncIntervalSecs(Number(e.target.value)); saveSettings(); }}
                className="text-sm px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              >
                {INTERVAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* This device */}
        {identity ? (
          <ThisDeviceCard identity={identity} />
        ) : (
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400">
            Device identity not available.
          </div>
        )}

        {/* Nearby devices */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nearby Devices</h3>
              {nearbyPeers.length > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  {nearbyPeers.length}
                </span>
              )}
            </div>
            {isDiscovering && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                <ScanningDots />
                <span>Scanning</span>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            {nearbyPeers.length === 0 ? (
              <EmptyNearby isDiscovering={isDiscovering} />
            ) : (
              <div className="px-3">
                {nearbyPeers.map((peer) => (
                  <NearbyPeerRow key={peer.deviceId} peer={peer} onPair={setPairingPeer} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Paired devices */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
            Paired Devices
          </h3>
          <TrustedDevicesList />
        </div>

        {/* Privacy note */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <div className="flex gap-2.5">
            <svg className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-0.5">Privacy guaranteed</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Discovery uses mDNS (LAN multicast) with UDP broadcast fallback for networks that filter multicast.
                No data leaves your local network. Sync only works between devices you explicitly pair.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
