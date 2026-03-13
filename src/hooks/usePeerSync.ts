/**
 * usePeerSync — initializes peer discovery + pairing + sync and wires up event listeners.
 * Mount this once at the App level.
 */

import { useEffect } from 'react';
import { usePeerSyncStore } from '../stores/peerSyncStore';
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

  useEffect(() => {
    let unlistenDiscovered: (() => void) | null = null;
    let unlistenLost: (() => void) | null = null;
    let unlistenPaired: (() => void) | null = null;
    let unlistenSyncStarted: (() => void) | null = null;
    let unlistenSyncComplete: (() => void) | null = null;
    let unlistenSyncError: (() => void) | null = null;
    let cancelled = false;

    // Cooldown map to avoid spamming sync for the same peer (30s per device)
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
          // Auto-trigger sync for trusted peers (with 30s cooldown per device)
          if (peer.isTrusted && peer.isOnline) {
            const now = Date.now();
            const last = syncCooldowns.get(peer.deviceId) ?? 0;
            if (now - last > 30_000) {
              syncCooldowns.set(peer.deviceId, now);
              peerSyncNow(peer.deviceId, peer.host).catch((e) =>
                console.warn('[sync] Auto-sync failed:', e)
              );
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
