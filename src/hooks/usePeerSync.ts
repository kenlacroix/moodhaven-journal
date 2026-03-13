/**
 * usePeerSync — initializes peer discovery + pairing and wires up event listeners.
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
  } = usePeerSyncStore();

  useEffect(() => {
    let unlistenDiscovered: (() => void) | null = null;
    let unlistenLost: (() => void) | null = null;
    let unlistenPaired: (() => void) | null = null;
    let cancelled = false;

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
        if (!cancelled) addOrUpdatePeer(peer);
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
      // Note: discovery runs for app lifetime — not stopped on unmount
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
