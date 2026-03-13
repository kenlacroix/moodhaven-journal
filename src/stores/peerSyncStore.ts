/**
 * Peer Sync Store
 *
 * Manages discovered peers, device identity, and discovery state.
 * Uses Zustand. Event listeners wired in usePeerSync hook.
 */

import { create } from 'zustand';
import type { DeviceIdentity, DiscoveredPeer } from '../types/peerSync';

interface PeerSyncState {
  // This device
  identity: DeviceIdentity | null;
  identityLoading: boolean;

  // Discovery
  isDiscovering: boolean;
  nearbyPeers: DiscoveredPeer[];

  // Actions
  setIdentity: (identity: DeviceIdentity) => void;
  setIdentityLoading: (loading: boolean) => void;
  setDiscovering: (active: boolean) => void;
  addOrUpdatePeer: (peer: DiscoveredPeer) => void;
  removePeer: (deviceId: string) => void;
  clearPeers: () => void;
  setNearbyPeers: (peers: DiscoveredPeer[]) => void;
}

export const usePeerSyncStore = create<PeerSyncState>((set) => ({
  identity: null,
  identityLoading: false,
  isDiscovering: false,
  nearbyPeers: [],

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
}));
