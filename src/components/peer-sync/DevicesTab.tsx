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
import { startDiscovery, stopDiscovery } from '../../lib/services/peerDiscoveryService';
import { PairingModal } from './PairingModal';
import { TrustedDevicesList } from './TrustedDevicesList';
import { ThisDeviceCard } from './DevicesThisDevice';
import { NearbyPeerRow, EmptyNearby } from './DevicesNearby';
import { ScanningDots } from './DeviceIconSet';
import { DevicesSyncOptions } from './DevicesSyncOptions';
import type { DiscoveredPeer } from '../../types/peerSync';
import { logger } from '../../lib/services/logger';

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
          <DevicesSyncOptions
            peerSyncLanOnly={peerSyncLanOnly}
            peerSyncIntervalSecs={peerSyncIntervalSecs}
            onToggleLanOnly={() => { setPeerSyncLanOnly(!peerSyncLanOnly); saveSettings(); }}
            onChangeInterval={(secs) => { setPeerSyncIntervalSecs(secs); saveSettings(); }}
          />
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
