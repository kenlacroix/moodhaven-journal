/**
 * usePeerSync — initializes peer discovery + pairing + sync and wires up event listeners.
 * Mount this once at the App level.
 */

import { useEffect, useRef } from 'react';
import { usePeerSyncStore } from '../stores/peerSyncStore';
import { useSettingsStore } from '../stores/settingsStore';
import {
  getDeviceIdentity,
  startDiscovery,
  getNearbyPeers,
  onPeerDiscovered,
  onPeerLost,
} from '../lib/peerDiscoveryService';
import { getTrustedDevices, onPeerPaired } from '../lib/peerPairingService';
import {
  peerSyncNow,
  onSyncStarted,
  onSyncComplete,
  onSyncError,
  type SyncStartedEvent,
  type SyncCompleteEvent,
  type SyncErrorEvent,
} from '../lib/peerSyncEngineService';

/** Returns true if host is an RFC-1918 private address (LAN-local). */
function isLanAddress(host: string): boolean {
  return (
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^192\.168\./.test(host) ||
    host === '127.0.0.1' ||
    host === 'localhost'
  );
}

export function usePeerSync() {
  const {
    setIdentity,
    setIdentityLoading,
    setDiscovering,
    addOrUpdatePeer,
    removePeer,
    setNearbyPeers,
    setTrustedDevices,
    addOrUpdateTrusted,
    markPeerTrusted,
    setSyncStatus,
  } = usePeerSyncStore();

  // Read peer sync settings reactively so the effect can reference latest values
  const peerSyncLanOnly = useSettingsStore((s) => s.settings.sync.peerSyncLanOnly);
  const peerSyncIntervalSecs = useSettingsStore((s) => s.settings.sync.peerSyncIntervalSecs);
  // Use refs so the stable event listener closures always see current values
  const lanOnlyRef = useRef(peerSyncLanOnly);
  const intervalRef = useRef(peerSyncIntervalSecs);
  useEffect(() => { lanOnlyRef.current = peerSyncLanOnly; }, [peerSyncLanOnly]);
  useEffect(() => { intervalRef.current = peerSyncIntervalSecs; }, [peerSyncIntervalSecs]);

  useEffect(() => {
    let unlistenDiscovered: (() => void) | null = null;
    let unlistenLost: (() => void) | null = null;
    let unlistenPaired: (() => void) | null = null;
    let unlistenSyncStarted: (() => void) | null = null;
    let unlistenSyncComplete: (() => void) | null = null;
    let unlistenSyncError: (() => void) | null = null;
    let cancelled = false;

    // Cooldown map — keyed by deviceId, value is the timestamp of last sync trigger
    const syncCooldowns = new Map<string, number>();

    async function init() {
      // Load device identity
      setIdentityLoading(true);
      try {
        const identity = await getDeviceIdentity();
        if (!cancelled) setIdentity(identity);
      } catch (e) {
        console.warn('[peerSync] Failed to load identity:', e);
      } finally {
        if (!cancelled) setIdentityLoading(false);
      }

      // Load trusted devices
      try {
        const trusted = await getTrustedDevices();
        if (!cancelled) setTrustedDevices(trusted);
      } catch (e) {
        console.warn('[peerSync] Failed to load trusted devices:', e);
      }

      // Wire up event listeners before starting discovery
      unlistenDiscovered = await onPeerDiscovered((peer) => {
        if (!cancelled) {
          addOrUpdatePeer(peer);
          // Auto-trigger sync for trusted peers
          if (peer.isTrusted && peer.isOnline) {
            // LAN-only mode: skip if peer host is not a private (RFC-1918) address
            if (lanOnlyRef.current && !isLanAddress(peer.host)) {
              console.info('[sync] Skipping auto-sync — LAN-only mode and peer is not on LAN:', peer.host);
            } else {
              const now = Date.now();
              const last = syncCooldowns.get(peer.deviceId) ?? 0;
              const cooldownMs = (intervalRef.current ?? 30) * 1000;
              if (now - last > cooldownMs) {
                syncCooldowns.set(peer.deviceId, now);
                peerSyncNow(peer.deviceId, peer.host).catch((e) =>
                  console.warn('[sync] Auto-sync failed:', e)
                );
              }
            }
          }
        }
      });

      unlistenLost = await onPeerLost((deviceId) => {
        if (!cancelled) removePeer(deviceId);
      });

      unlistenPaired = await onPeerPaired((device) => {
        if (!cancelled) {
          addOrUpdateTrusted(device);
          markPeerTrusted(device.deviceId);
        }
      });

      // Wire up sync engine event listeners
      unlistenSyncStarted = await onSyncStarted((e: SyncStartedEvent) => {
        if (!cancelled) {
          setSyncStatus(e.deviceId, { state: 'syncing', deviceName: e.deviceName });
        }
      });

      unlistenSyncComplete = await onSyncComplete((e: SyncCompleteEvent) => {
        if (!cancelled) {
          setSyncStatus(e.deviceId, {
            state: 'success',
            deviceName: e.deviceName,
            count: e.received,
            at: e.at,
          });
        }
      });

      unlistenSyncError = await onSyncError((e: SyncErrorEvent) => {
        if (!cancelled) {
          setSyncStatus(e.deviceId, {
            state: 'error',
            deviceName: '',
            message: e.message,
          });
        }
      });

      // Start discovery
      try {
        await startDiscovery();
        if (!cancelled) setDiscovering(true);

        // Load initial snapshot (peers found before listeners attached)
        const peers = await getNearbyPeers();
        if (!cancelled) setNearbyPeers(peers);
      } catch (e) {
        console.warn('[peerSync] Failed to start discovery:', e);
      }
    }

    init();

    return () => {
      cancelled = true;
      unlistenDiscovered?.();
      unlistenLost?.();
      unlistenPaired?.();
      unlistenSyncStarted?.();
      unlistenSyncComplete?.();
      unlistenSyncError?.();
      // Note: discovery runs for app lifetime — not stopped on unmount
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
