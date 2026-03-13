/**
 * Peer Sync Store
 *
 * Manages discovered peers, device identity, discovery state, and trusted devices.
 * Uses Zustand. Event listeners are wired in the usePeerSync hook.
 */

import { create } from 'zustand';
import type { DeviceIdentity, DiscoveredPeer, TrustedDevice } from '../types/peerSync';

interface PeerSyncState {
  // This device
  identity: DeviceIdentity | null;
  identityLoading: boolean;

  // Discovery
  isDiscovering: boolean;
  nearbyPeers: DiscoveredPeer[];

  // Trusted / paired devices
  trustedDevices: TrustedDevice[];

  // Actions
  setIdentity: (identity: DeviceIdentity) => void;
  setIdentityLoading: (loading: boolean) => void;
  setDiscovering: (active: boolean) => void;
  addOrUpdatePeer: (peer: DiscoveredPeer) => void;
  removePeer: (deviceId: string) => void;
  clearPeers: () => void;
  setNearbyPeers: (peers: DiscoveredPeer[]) => void;
  setTrustedDevices: (devices: TrustedDevice[]) => void;
  addOrUpdateTrusted: (device: TrustedDevice) => void;
  removeTrusted: (deviceId: string) => void;
  /** Mark a nearby peer as trusted without a full re-fetch */
  markPeerTrusted: (deviceId: string) => void;
}

export const usePeerSyncStore = create<PeerSyncState>((set) => ({
  identity: null,
  identityLoading: false,
  isDiscovering: false,
  nearbyPeers: [],
  trustedDevices: [],

  setIdentity: (identity) => set({ identity }),
  setIdentityLoading: (identityLoading) => set({ identityLoading }),
  setDiscovering: (isDiscovering) => set({ isDiscovering }),

  addOrUpdatePeer: (peer) =>
    set((state) => ({
      nearbyPeers: state.nearbyPeers.some((p) => p.deviceId === peer.deviceId)
        ? state.nearbyPeers.map((p) => (p.deviceId === peer.deviceId ? peer : p))
        : [...state.nearbyPeers, peer],
    })),

  removePeer: (deviceId) =>
    set((state) => ({
      nearbyPeers: state.nearbyPeers.filter((p) => p.deviceId !== deviceId),
    })),

  clearPeers: () => set({ nearbyPeers: [] }),
  setNearbyPeers: (nearbyPeers) => set({ nearbyPeers }),

  setTrustedDevices: (trustedDevices) => set({ trustedDevices }),

  addOrUpdateTrusted: (device) =>
    set((state) => ({
      trustedDevices: state.trustedDevices.some((d) => d.deviceId === device.deviceId)
        ? state.trustedDevices.map((d) => (d.deviceId === device.deviceId ? device : d))
        : [...state.trustedDevices, device],
    })),

  removeTrusted: (deviceId) =>
    set((state) => ({
      trustedDevices: state.trustedDevices.filter((d) => d.deviceId !== deviceId),
    })),

  markPeerTrusted: (deviceId) =>
    set((state) => ({
      nearbyPeers: state.nearbyPeers.map((p) =>
        p.deviceId === deviceId ? { ...p, isTrusted: true } : p
      ),
    })),
}));
