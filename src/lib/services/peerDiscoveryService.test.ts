import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  getDeviceIdentity,
  renameDevice,
  startDiscovery,
  stopDiscovery,
  getNearbyPeers,
  isDiscoveryActive,
  onPeerDiscovered,
  onPeerLost,
} from './peerDiscoveryService';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);
const fakeUnlisten = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockListen.mockResolvedValue(fakeUnlisten);
});

function makeIdentity(overrides = {}) {
  return {
    deviceId: 'aabb1122',
    deviceName: 'Test Desktop',
    deviceType: 'desktop' as const,
    publicKey: 'base64key==',
    created: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makePeer(overrides = {}) {
  return {
    deviceId: 'peer-001',
    deviceName: 'Peer Laptop',
    deviceType: 'desktop' as const,
    host: '192.168.1.5',
    port: 44001,
    version: '1.0.0',
    pubkeyHint: 'hint',
    isTrusted: false,
    isOnline: true,
    lastSeen: '2026-06-01T10:00:00Z',
    ...overrides,
  };
}

describe('getDeviceIdentity', () => {
  it('calls peer_get_identity and returns identity', async () => {
    const identity = makeIdentity();
    mockInvoke.mockResolvedValue(identity);

    const result = await getDeviceIdentity();

    expect(mockInvoke).toHaveBeenCalledWith('peer_get_identity');
    expect(result).toEqual(identity);
  });
});

describe('renameDevice', () => {
  it('calls peer_rename_device with name', async () => {
    const updated = makeIdentity({ deviceName: 'New Name' });
    mockInvoke.mockResolvedValue(updated);

    const result = await renameDevice('New Name');

    expect(mockInvoke).toHaveBeenCalledWith('peer_rename_device', { name: 'New Name' });
    expect(result.deviceName).toBe('New Name');
  });
});

describe('startDiscovery', () => {
  it('calls peer_discovery_start', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await startDiscovery();

    expect(mockInvoke).toHaveBeenCalledWith('peer_discovery_start');
  });
});

describe('stopDiscovery', () => {
  it('calls peer_discovery_stop', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await stopDiscovery();

    expect(mockInvoke).toHaveBeenCalledWith('peer_discovery_stop');
  });
});

describe('getNearbyPeers', () => {
  it('calls peer_get_nearby and returns array', async () => {
    const peers = [makePeer({ deviceId: 'p1' }), makePeer({ deviceId: 'p2' })];
    mockInvoke.mockResolvedValue(peers);

    const result = await getNearbyPeers();

    expect(mockInvoke).toHaveBeenCalledWith('peer_get_nearby');
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no peers', async () => {
    mockInvoke.mockResolvedValue([]);

    const result = await getNearbyPeers();

    expect(result).toEqual([]);
  });
});

describe('isDiscoveryActive', () => {
  it('returns true when active', async () => {
    mockInvoke.mockResolvedValue(true);

    const active = await isDiscoveryActive();

    expect(mockInvoke).toHaveBeenCalledWith('peer_discovery_is_active');
    expect(active).toBe(true);
  });

  it('returns false when inactive', async () => {
    mockInvoke.mockResolvedValue(false);

    const active = await isDiscoveryActive();

    expect(active).toBe(false);
  });
});

describe('onPeerDiscovered', () => {
  it('registers listener on peer:discovered event', async () => {
    const cb = vi.fn();
    const unlisten = await onPeerDiscovered(cb);

    expect(mockListen).toHaveBeenCalledWith('peer:discovered', expect.any(Function));
    expect(unlisten).toBe(fakeUnlisten);
  });

  it('fires callback with peer payload', async () => {
    const cb = vi.fn();
    let capturedHandler: (e: unknown) => void = () => {};

    mockListen.mockImplementation(async (_event, handler) => {
      capturedHandler = handler as (e: unknown) => void;
      return fakeUnlisten;
    });

    await onPeerDiscovered(cb);

    const peer = makePeer();
    capturedHandler({ payload: peer });

    expect(cb).toHaveBeenCalledWith(peer);
  });
});

describe('onPeerLost', () => {
  it('registers listener on peer:lost event', async () => {
    const cb = vi.fn();
    await onPeerLost(cb);

    expect(mockListen).toHaveBeenCalledWith('peer:lost', expect.any(Function));
  });

  it('fires callback with just the deviceId string', async () => {
    const cb = vi.fn();
    let capturedHandler: (e: unknown) => void = () => {};

    mockListen.mockImplementation(async (_event, handler) => {
      capturedHandler = handler as (e: unknown) => void;
      return fakeUnlisten;
    });

    await onPeerLost(cb);
    capturedHandler({ payload: { deviceId: 'lost-device-123' } });

    expect(cb).toHaveBeenCalledWith('lost-device-123');
  });
});
