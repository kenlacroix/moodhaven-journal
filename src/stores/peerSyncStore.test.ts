import { usePeerSyncStore } from './peerSyncStore';

// Inline fixture factories — no import from types/peerSync

function makeIdentity(overrides = {}) {
  return {
    deviceId: 'aabbccdd11223344',
    deviceName: 'Test Desktop',
    deviceType: 'desktop' as const,
    publicKey: 'base64pubkey==',
    created: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makePeer(overrides = {}) {
  return {
    deviceId: 'peer-device-id-001',
    deviceName: 'Peer Laptop',
    deviceType: 'desktop' as const,
    host: '192.168.1.10',
    port: 44001,
    version: '1.0.0',
    pubkeyHint: 'hint123',
    isTrusted: false,
    isOnline: true,
    lastSeen: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeTrustedDevice(overrides = {}) {
  return {
    deviceId: 'trusted-device-id-001',
    deviceName: 'Trusted Phone',
    deviceType: 'phone' as const,
    publicKey: 'trustedpubkey==',
    pairedAt: '2026-01-01T00:00:00Z',
    lastSeen: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makePairingRequest(overrides = {}) {
  return {
    deviceId: 'pairing-device-id',
    deviceName: 'New Device',
    deviceType: 'phone',
    ...overrides,
  };
}

const initialState = {
  identity: null,
  identityLoading: false,
  isDiscovering: false,
  nearbyPeers: [],
  trustedDevices: [],
  syncStatuses: {},
  pairingRequest: null,
};

beforeEach(() => {
  usePeerSyncStore.setState(initialState);
  vi.clearAllMocks();
});

// ── Initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('identity is null', () => {
    expect(usePeerSyncStore.getState().identity).toBeNull();
  });

  it('identityLoading is false', () => {
    expect(usePeerSyncStore.getState().identityLoading).toBe(false);
  });

  it('isDiscovering is false', () => {
    expect(usePeerSyncStore.getState().isDiscovering).toBe(false);
  });

  it('nearbyPeers is an empty array', () => {
    expect(usePeerSyncStore.getState().nearbyPeers).toEqual([]);
  });

  it('trustedDevices is an empty array', () => {
    expect(usePeerSyncStore.getState().trustedDevices).toEqual([]);
  });

  it('syncStatuses is an empty object', () => {
    expect(usePeerSyncStore.getState().syncStatuses).toEqual({});
  });

  it('pairingRequest is null', () => {
    expect(usePeerSyncStore.getState().pairingRequest).toBeNull();
  });
});

// ── setIdentity ───────────────────────────────────────────────────────────────

describe('setIdentity', () => {
  it('sets the identity', () => {
    const identity = makeIdentity();
    usePeerSyncStore.getState().setIdentity(identity);
    expect(usePeerSyncStore.getState().identity).toEqual(identity);
  });

  it('overwrites a previously set identity', () => {
    usePeerSyncStore.getState().setIdentity(makeIdentity({ deviceName: 'Old Name' }));
    const updated = makeIdentity({ deviceName: 'New Name' });
    usePeerSyncStore.getState().setIdentity(updated);
    expect(usePeerSyncStore.getState().identity?.deviceName).toBe('New Name');
  });
});

// ── setIdentityLoading ────────────────────────────────────────────────────────

describe('setIdentityLoading', () => {
  it('sets identityLoading to true', () => {
    usePeerSyncStore.getState().setIdentityLoading(true);
    expect(usePeerSyncStore.getState().identityLoading).toBe(true);
  });

  it('sets identityLoading back to false', () => {
    usePeerSyncStore.getState().setIdentityLoading(true);
    usePeerSyncStore.getState().setIdentityLoading(false);
    expect(usePeerSyncStore.getState().identityLoading).toBe(false);
  });
});

// ── setDiscovering ────────────────────────────────────────────────────────────

describe('setDiscovering', () => {
  it('sets isDiscovering to true', () => {
    usePeerSyncStore.getState().setDiscovering(true);
    expect(usePeerSyncStore.getState().isDiscovering).toBe(true);
  });

  it('sets isDiscovering back to false', () => {
    usePeerSyncStore.getState().setDiscovering(true);
    usePeerSyncStore.getState().setDiscovering(false);
    expect(usePeerSyncStore.getState().isDiscovering).toBe(false);
  });
});

// ── addOrUpdatePeer ───────────────────────────────────────────────────────────

describe('addOrUpdatePeer', () => {
  it('adds a new peer when none exist', () => {
    const peer = makePeer();
    usePeerSyncStore.getState().addOrUpdatePeer(peer);
    expect(usePeerSyncStore.getState().nearbyPeers).toHaveLength(1);
    expect(usePeerSyncStore.getState().nearbyPeers[0]).toEqual(peer);
  });

  it('appends a peer with a different deviceId', () => {
    usePeerSyncStore.getState().addOrUpdatePeer(makePeer({ deviceId: 'id-001' }));
    usePeerSyncStore.getState().addOrUpdatePeer(makePeer({ deviceId: 'id-002' }));
    expect(usePeerSyncStore.getState().nearbyPeers).toHaveLength(2);
  });

  it('updates an existing peer instead of duplicating', () => {
    const peer = makePeer({ deviceId: 'id-001', deviceName: 'Old' });
    usePeerSyncStore.getState().addOrUpdatePeer(peer);
    const updated = makePeer({ deviceId: 'id-001', deviceName: 'Updated' });
    usePeerSyncStore.getState().addOrUpdatePeer(updated);
    const peers = usePeerSyncStore.getState().nearbyPeers;
    expect(peers).toHaveLength(1);
    expect(peers[0].deviceName).toBe('Updated');
  });
});

// ── removePeer ────────────────────────────────────────────────────────────────

describe('removePeer', () => {
  it('removes the peer with the matching deviceId', () => {
    usePeerSyncStore.getState().addOrUpdatePeer(makePeer({ deviceId: 'id-001' }));
    usePeerSyncStore.getState().addOrUpdatePeer(makePeer({ deviceId: 'id-002' }));
    usePeerSyncStore.getState().removePeer('id-001');
    const peers = usePeerSyncStore.getState().nearbyPeers;
    expect(peers).toHaveLength(1);
    expect(peers[0].deviceId).toBe('id-002');
  });

  it('is a no-op when the deviceId does not exist', () => {
    usePeerSyncStore.getState().addOrUpdatePeer(makePeer({ deviceId: 'id-001' }));
    usePeerSyncStore.getState().removePeer('nonexistent');
    expect(usePeerSyncStore.getState().nearbyPeers).toHaveLength(1);
  });
});

// ── clearPeers ────────────────────────────────────────────────────────────────

describe('clearPeers', () => {
  it('empties nearbyPeers', () => {
    usePeerSyncStore.getState().addOrUpdatePeer(makePeer({ deviceId: 'id-001' }));
    usePeerSyncStore.getState().addOrUpdatePeer(makePeer({ deviceId: 'id-002' }));
    usePeerSyncStore.getState().clearPeers();
    expect(usePeerSyncStore.getState().nearbyPeers).toEqual([]);
  });

  it('is safe when already empty', () => {
    usePeerSyncStore.getState().clearPeers();
    expect(usePeerSyncStore.getState().nearbyPeers).toEqual([]);
  });
});

// ── setNearbyPeers ────────────────────────────────────────────────────────────

describe('setNearbyPeers', () => {
  it('replaces the entire nearbyPeers array', () => {
    usePeerSyncStore.getState().addOrUpdatePeer(makePeer({ deviceId: 'old-id' }));
    const newPeers = [makePeer({ deviceId: 'new-id-1' }), makePeer({ deviceId: 'new-id-2' })];
    usePeerSyncStore.getState().setNearbyPeers(newPeers);
    expect(usePeerSyncStore.getState().nearbyPeers).toEqual(newPeers);
  });

  it('sets nearbyPeers to an empty array', () => {
    usePeerSyncStore.getState().addOrUpdatePeer(makePeer());
    usePeerSyncStore.getState().setNearbyPeers([]);
    expect(usePeerSyncStore.getState().nearbyPeers).toEqual([]);
  });
});

// ── setTrustedDevices ─────────────────────────────────────────────────────────

describe('setTrustedDevices', () => {
  it('replaces the trustedDevices array', () => {
    const devices = [makeTrustedDevice({ deviceId: 'td-1' }), makeTrustedDevice({ deviceId: 'td-2' })];
    usePeerSyncStore.getState().setTrustedDevices(devices);
    expect(usePeerSyncStore.getState().trustedDevices).toEqual(devices);
  });

  it('clears trusted devices when passed an empty array', () => {
    usePeerSyncStore.getState().setTrustedDevices([makeTrustedDevice()]);
    usePeerSyncStore.getState().setTrustedDevices([]);
    expect(usePeerSyncStore.getState().trustedDevices).toEqual([]);
  });
});

// ── addOrUpdateTrusted ────────────────────────────────────────────────────────

describe('addOrUpdateTrusted', () => {
  it('adds a new trusted device', () => {
    const device = makeTrustedDevice();
    usePeerSyncStore.getState().addOrUpdateTrusted(device);
    expect(usePeerSyncStore.getState().trustedDevices).toHaveLength(1);
    expect(usePeerSyncStore.getState().trustedDevices[0]).toEqual(device);
  });

  it('upserts an existing trusted device without duplicating', () => {
    const device = makeTrustedDevice({ deviceId: 'td-1', deviceName: 'Old Name' });
    usePeerSyncStore.getState().addOrUpdateTrusted(device);
    const updated = makeTrustedDevice({ deviceId: 'td-1', deviceName: 'New Name' });
    usePeerSyncStore.getState().addOrUpdateTrusted(updated);
    const devices = usePeerSyncStore.getState().trustedDevices;
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceName).toBe('New Name');
  });

  it('appends when deviceId is different', () => {
    usePeerSyncStore.getState().addOrUpdateTrusted(makeTrustedDevice({ deviceId: 'td-1' }));
    usePeerSyncStore.getState().addOrUpdateTrusted(makeTrustedDevice({ deviceId: 'td-2' }));
    expect(usePeerSyncStore.getState().trustedDevices).toHaveLength(2);
  });
});

// ── removeTrusted ─────────────────────────────────────────────────────────────

describe('removeTrusted', () => {
  it('removes the trusted device with the matching deviceId', () => {
    usePeerSyncStore.getState().addOrUpdateTrusted(makeTrustedDevice({ deviceId: 'td-1' }));
    usePeerSyncStore.getState().addOrUpdateTrusted(makeTrustedDevice({ deviceId: 'td-2' }));
    usePeerSyncStore.getState().removeTrusted('td-1');
    const devices = usePeerSyncStore.getState().trustedDevices;
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceId).toBe('td-2');
  });

  it('is a no-op when the deviceId is not present', () => {
    usePeerSyncStore.getState().addOrUpdateTrusted(makeTrustedDevice({ deviceId: 'td-1' }));
    usePeerSyncStore.getState().removeTrusted('nonexistent');
    expect(usePeerSyncStore.getState().trustedDevices).toHaveLength(1);
  });
});

// ── markPeerTrusted ───────────────────────────────────────────────────────────

describe('markPeerTrusted', () => {
  it('sets isTrusted to true on the matching peer', () => {
    usePeerSyncStore.getState().addOrUpdatePeer(makePeer({ deviceId: 'id-001', isTrusted: false }));
    usePeerSyncStore.getState().markPeerTrusted('id-001');
    expect(usePeerSyncStore.getState().nearbyPeers[0].isTrusted).toBe(true);
  });

  it('does not mutate other peers', () => {
    usePeerSyncStore.getState().addOrUpdatePeer(makePeer({ deviceId: 'id-001', isTrusted: false }));
    usePeerSyncStore.getState().addOrUpdatePeer(makePeer({ deviceId: 'id-002', isTrusted: false }));
    usePeerSyncStore.getState().markPeerTrusted('id-001');
    expect(usePeerSyncStore.getState().nearbyPeers[1].isTrusted).toBe(false);
  });

  it('is a no-op when deviceId not in nearbyPeers', () => {
    usePeerSyncStore.getState().addOrUpdatePeer(makePeer({ deviceId: 'id-001', isTrusted: false }));
    usePeerSyncStore.getState().markPeerTrusted('nonexistent');
    expect(usePeerSyncStore.getState().nearbyPeers[0].isTrusted).toBe(false);
  });
});

// ── markPeerUntrusted ─────────────────────────────────────────────────────────

describe('markPeerUntrusted', () => {
  it('sets isTrusted to false on the matching peer', () => {
    usePeerSyncStore.getState().addOrUpdatePeer(makePeer({ deviceId: 'id-001', isTrusted: true }));
    usePeerSyncStore.getState().markPeerUntrusted('id-001');
    expect(usePeerSyncStore.getState().nearbyPeers[0].isTrusted).toBe(false);
  });

  it('does not mutate other peers', () => {
    usePeerSyncStore.getState().addOrUpdatePeer(makePeer({ deviceId: 'id-001', isTrusted: true }));
    usePeerSyncStore.getState().addOrUpdatePeer(makePeer({ deviceId: 'id-002', isTrusted: true }));
    usePeerSyncStore.getState().markPeerUntrusted('id-001');
    expect(usePeerSyncStore.getState().nearbyPeers[1].isTrusted).toBe(true);
  });
});

// ── setSyncStatus ─────────────────────────────────────────────────────────────

describe('setSyncStatus', () => {
  it('adds a sync status for a deviceId', () => {
    const status = { state: 'syncing' as const, deviceName: 'Peer' };
    usePeerSyncStore.getState().setSyncStatus('id-001', status);
    expect(usePeerSyncStore.getState().syncStatuses['id-001']).toEqual(status);
  });

  it('overwrites an existing sync status for the same deviceId', () => {
    usePeerSyncStore.getState().setSyncStatus('id-001', { state: 'syncing', deviceName: 'Peer' });
    const done = { state: 'success' as const, deviceName: 'Peer', count: 3, at: '2026-01-01T00:00:00Z' };
    usePeerSyncStore.getState().setSyncStatus('id-001', done);
    expect(usePeerSyncStore.getState().syncStatuses['id-001']).toEqual(done);
  });

  it('can hold statuses for multiple devices independently', () => {
    usePeerSyncStore.getState().setSyncStatus('id-001', { state: 'idle' });
    usePeerSyncStore.getState().setSyncStatus('id-002', { state: 'syncing', deviceName: 'B' });
    expect(usePeerSyncStore.getState().syncStatuses['id-001']).toEqual({ state: 'idle' });
    expect(usePeerSyncStore.getState().syncStatuses['id-002']).toEqual({ state: 'syncing', deviceName: 'B' });
  });
});

// ── clearSyncStatus ───────────────────────────────────────────────────────────

describe('clearSyncStatus', () => {
  it('removes the sync status for the specified deviceId', () => {
    usePeerSyncStore.getState().setSyncStatus('id-001', { state: 'idle' });
    usePeerSyncStore.getState().clearSyncStatus('id-001');
    expect(usePeerSyncStore.getState().syncStatuses).not.toHaveProperty('id-001');
  });

  it('does not remove statuses for other devices', () => {
    usePeerSyncStore.getState().setSyncStatus('id-001', { state: 'idle' });
    usePeerSyncStore.getState().setSyncStatus('id-002', { state: 'idle' });
    usePeerSyncStore.getState().clearSyncStatus('id-001');
    expect(usePeerSyncStore.getState().syncStatuses).toHaveProperty('id-002');
    expect(Object.keys(usePeerSyncStore.getState().syncStatuses)).toHaveLength(1);
  });

  it('is a no-op when the deviceId is not present', () => {
    usePeerSyncStore.getState().setSyncStatus('id-001', { state: 'idle' });
    usePeerSyncStore.getState().clearSyncStatus('nonexistent');
    expect(usePeerSyncStore.getState().syncStatuses).toHaveProperty('id-001');
  });
});

// ── setPairingRequest ─────────────────────────────────────────────────────────

describe('setPairingRequest', () => {
  it('sets a pairing request', () => {
    const req = makePairingRequest();
    usePeerSyncStore.getState().setPairingRequest(req);
    expect(usePeerSyncStore.getState().pairingRequest).toEqual(req);
  });

  it('clears the pairing request when passed null', () => {
    usePeerSyncStore.getState().setPairingRequest(makePairingRequest());
    usePeerSyncStore.getState().setPairingRequest(null);
    expect(usePeerSyncStore.getState().pairingRequest).toBeNull();
  });

  it('overwrites an existing pairing request', () => {
    usePeerSyncStore.getState().setPairingRequest(makePairingRequest({ deviceName: 'First' }));
    usePeerSyncStore.getState().setPairingRequest(makePairingRequest({ deviceName: 'Second' }));
    expect(usePeerSyncStore.getState().pairingRequest?.deviceName).toBe('Second');
  });
});
