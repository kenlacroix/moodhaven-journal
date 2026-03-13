/**
 * DevicesTab — Settings tab for local peer sync / Devices
 *
 * Shows:
 * - This device (identity card + rename)
 * - Nearby discovered devices (mDNS)
 * - Paired devices placeholder (Phase 2)
 * - Discovery toggle
 */

import { useState, useCallback } from 'react';
import { usePeerSyncStore } from '../../stores/peerSyncStore';
import { renameDevice, startDiscovery, stopDiscovery } from '../../lib/peerDiscoveryService';
import type { DeviceIdentity, DiscoveredPeer } from '../../types/peerSync';

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
        <span
          key={i}
          className="w-1 rounded-sm bg-emerald-400"
          style={{ height: h }}
        />
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

// ── Nearby peer row ───────────────────────────────────────────────────────────

function NearbyPeerRow({ peer }: { peer: DiscoveredPeer }) {
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
          <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0 capitalize">
            {peer.deviceType}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <SignalBars />
          <span className="text-xs text-slate-400 dark:text-slate-500">
            v{peer.version}
          </span>
        </div>
      </div>
      <button
        disabled
        title="Pairing available in the next update"
        className="px-3 py-1.5 text-xs font-medium text-white bg-violet-600 opacity-40 cursor-not-allowed rounded-lg flex-shrink-0"
      >
        Pair
      </button>
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

export function DevicesTab() {
  const { identity, identityLoading, isDiscovering, nearbyPeers, setDiscovering, clearPeers } =
    usePeerSyncStore();

  const [togglingDiscovery, setTogglingDiscovery] = useState(false);

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
      console.error('[DevicesTab] Toggle discovery failed:', e);
    } finally {
      setTogglingDiscovery(false);
    }
  }, [isDiscovering, setDiscovering, clearPeers]);

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
                <NearbyPeerRow key={peer.deviceId} peer={peer} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Paired devices (Phase 2 placeholder) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Paired Devices</h3>
          <span className="text-xs text-slate-400 dark:text-slate-500">Coming in v0.6.1</span>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 border-dashed shadow-sm p-6 text-center">
          <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-2">
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">No paired devices yet</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            QR code pairing will be available in the next release
          </p>
        </div>
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
              Discovery stays on your local network. No data leaves your Wi-Fi.
              Sync only works between devices you explicitly pair.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
