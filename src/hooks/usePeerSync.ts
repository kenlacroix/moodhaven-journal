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
import { getTrustedDevices, onPeerPaired, onPairingIncoming } from '../lib/peerPairingService';
import {
  peerSyncNow,
  onSyncStarted,
  onSyncComplete,
  onSyncError,
  onPeerRevokedUs,
  type SyncStartedEvent,
  type SyncCompleteEvent,
  type SyncErrorEvent,
  type PeerRevokedUsEvent,
} from '../lib/peerSyncEngineService';
import { logger } from '../lib/logger';

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
    removeTrusted,
    markPeerTrusted,
    markPeerUntrusted,
    setSyncStatus,
    setPairingRequest,
  } = usePeerSyncStore();

  // Read peer sync settings reactively so the effect can reference latest values
  const peerSyncLanOnly = useSettingsStore((s) => s.settings.sync.peerSyncLanOnly);
  const peerSyncIntervalSecs = useSettingsStore((s) => s.settings.sync.peerSyncIntervalSecs);
  // Use refs so the stable event listener closures always see current values
  const lanOnlyRef = useRef(peerSyncLanOnly);
  const intervalRef = useRef(peerSyncIntervalSecs);
  useEffect(() => { lanOnlyRef.current = peerSyncLanOnly; }, [peerSyncLanOnly]);
  useEffect(() => { intervalRef.current = peerSyncIntervalSecs; }, [peerSyncIntervalSecs]);

  // Cooldown map survives React StrictMode double-mount (plain Map inside useEffect resets on remount)
  const syncCooldownsRef = useRef<Map<string, number>>(new Map());
  // Identity ref for initiator-convention check (populated during init)
  const myDeviceIdRef = useRef<string>('');

  useEffect(() => {
    let unlistenDiscovered: (() => void) | null = null;
    let unlistenLost: (() => void) | null = null;
    let unlistenPaired: (() => void) | null = null;
    let unlistenPairingIncoming: (() => void) | null = null;
    let unlistenSyncStarted: (() => void) | null = null;
    let unlistenSyncComplete: (() => void) | null = null;
    let unlistenSyncError: (() => void) | null = null;
    let unlistenRevokedUs: (() => void) | null = null;
    let cancelled = false;

    // Cooldown map lives in a ref so it survives React StrictMode double-mount.
    // A plain `const` Map inside useEffect is recreated on remount, which resets
    // all cooldown timestamps and allows syncs to fire before the interval expires.

    async function init() {
      // Load device identity
      setIdentityLoading(true);
      try {
        const identity = await getDeviceIdentity();
        if (!cancelled) {
          setIdentity(identity);
          myDeviceIdRef.current = identity.deviceId;
        }
      } catch (e) {
        logger.warn('[peerSync] Failed to load identity:', { error: String(e) });
      } finally {
        if (!cancelled) setIdentityLoading(false);
      }

      // Load trusted devices
      try {
        const trusted = await getTrustedDevices();
        if (!cancelled) setTrustedDevices(trusted);
      } catch (e) {
        logger.warn('[peerSync] Failed to load trusted devices:', { error: String(e) });
      }

      // Wire up event listeners before starting discovery
      unlistenDiscovered = await onPeerDiscovered((peer) => {
        if (!cancelled) {
          addOrUpdatePeer(peer);
          // Auto-trigger sync for trusted peers
          if (peer.isTrusted && peer.isOnline) {
            // LAN-only mode: skip if peer host is not a private (RFC-1918) address
            if (lanOnlyRef.current && !isLanAddress(peer.host)) {
              logger.info('[sync] Skipping auto-sync — LAN-only mode and peer is not on LAN:');
            } else if (peer.deviceId < myDeviceIdRef.current) {
              // Initiator convention: the device with the lower device_id always connects.
              // This prevents both devices from opening sessions to each other simultaneously,
              // which wastes a round-trip and causes DB mutex contention on the same machine.
              logger.info('[sync] Skipping auto-sync — peer has lower device_id, they will initiate');
            } else {
              const now = Date.now();
              const last = syncCooldownsRef.current.get(peer.deviceId) ?? 0;
              const cooldownMs = (intervalRef.current ?? 30) * 1000;
              if (now - last > cooldownMs) {
                syncCooldownsRef.current.set(peer.deviceId, now);
                peerSyncNow(peer.deviceId, peer.host).catch((e) =>
                  logger.warn('[sync] Auto-sync failed:', { error: String(e) })
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
          // Clear any pending pairing request indicator.
          setPairingRequest(null);
          // Auto-sync immediately after pairing — find the peer's host from the
          // current discovery state without needing a separate re-discovery cycle.
          const { nearbyPeers } = usePeerSyncStore.getState();
          const peer = nearbyPeers.find((p) => p.deviceId === device.deviceId);
          if (peer?.host) {
            peerSyncNow(device.deviceId, peer.host).catch((e) =>
              logger.warn('[sync] Post-pairing auto-sync failed:', { error: String(e) })
            );
          }
        }
      });

      unlistenPairingIncoming = await onPairingIncoming((data) => {
        if (!cancelled) {
          // Only surface the notification if we're not already paired with this device.
          const { trustedDevices } = usePeerSyncStore.getState();
          const alreadyTrusted = trustedDevices.some((d) => d.deviceId === data.deviceId);
          if (!alreadyTrusted) {
            setPairingRequest(data);
          }
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

      // The peer has revoked us — Rust already removed them from trusted_devices.json.
      // Remove from the store so the UI reflects the change immediately.
      unlistenRevokedUs = await onPeerRevokedUs((e: PeerRevokedUsEvent) => {
        if (!cancelled) {
          // Rust already removed the device from trusted_devices.json; sync the store.
          removeTrusted(e.deviceId);
          // Flip the nearby peer row to untrusted so the UI shows "Pair" again.
          markPeerUntrusted(e.deviceId);
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
        logger.warn('[peerSync] Failed to start discovery:', { error: String(e) });
      }
    }

    init();

    return () => {
      cancelled = true;
      unlistenDiscovered?.();
      unlistenLost?.();
      unlistenPaired?.();
      unlistenPairingIncoming?.();
      unlistenSyncStarted?.();
      unlistenSyncComplete?.();
      unlistenSyncError?.();
      unlistenRevokedUs?.();
      // Note: discovery runs for app lifetime — not stopped on unmount
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
