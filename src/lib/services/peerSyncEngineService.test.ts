import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  startSyncServer,
  peerSyncNow,
  getPeerSyncStates,
  onSyncStarted,
  onSyncComplete,
  onSyncError,
  onPeerRevokedUs,
  onSyncUnknownPeer,
  peerFullRestore,
  peerApplyAndRestart,
  onRestoreProgress,
  onRestoreReady,
  onRestoreError,
} from './peerSyncEngineService';

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

describe('startSyncServer', () => {
  it('calls peer_start_sync_server', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await startSyncServer();

    expect(mockInvoke).toHaveBeenCalledWith('peer_start_sync_server');
  });

  it('propagates errors', async () => {
    mockInvoke.mockRejectedValue(new Error('Port in use'));

    await expect(startSyncServer()).rejects.toThrow('Port in use');
  });
});

describe('peerSyncNow', () => {
  it('calls peer_sync_now with deviceId and host', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await peerSyncNow('device-abc', '192.168.1.5');

    expect(mockInvoke).toHaveBeenCalledWith('peer_sync_now', {
      deviceId: 'device-abc',
      host: '192.168.1.5',
    });
  });

  it('propagates sync errors', async () => {
    mockInvoke.mockRejectedValue(new Error('Connection refused'));

    await expect(peerSyncNow('dev', '10.0.0.1')).rejects.toThrow('Connection refused');
  });
});

describe('getPeerSyncStates', () => {
  it('calls peer_get_sync_states and returns records', async () => {
    const states = [
      { peerDeviceId: 'dev-1', lastSyncAt: '2026-06-01T10:00:00Z' },
      { peerDeviceId: 'dev-2', lastSyncAt: '2026-06-01T11:00:00Z' },
    ];
    mockInvoke.mockResolvedValue(states);

    const result = await getPeerSyncStates();

    expect(mockInvoke).toHaveBeenCalledWith('peer_get_sync_states');
    expect(result).toHaveLength(2);
    expect(result[0].peerDeviceId).toBe('dev-1');
  });

  it('returns empty array when no sync history', async () => {
    mockInvoke.mockResolvedValue([]);

    const result = await getPeerSyncStates();

    expect(result).toEqual([]);
  });
});

describe('event listeners', () => {
  it('onSyncStarted registers listener for peer:sync_started', async () => {
    const cb = vi.fn();
    const unlisten = await onSyncStarted(cb);

    expect(mockListen).toHaveBeenCalledWith('peer:sync_started', expect.any(Function));
    expect(unlisten).toBe(fakeUnlisten);
  });

  it('onSyncStarted fires callback with event payload', async () => {
    const cb = vi.fn();
    let capturedHandler: (e: unknown) => void = () => {};

    mockListen.mockImplementation(async (_event, handler) => {
      capturedHandler = handler as (e: unknown) => void;
      return fakeUnlisten;
    });

    await onSyncStarted(cb);

    const payload = { deviceId: 'dev-1', deviceName: 'Dev One' };
    capturedHandler({ payload });

    expect(cb).toHaveBeenCalledWith(payload);
  });

  it('onSyncComplete registers listener for peer:sync_complete', async () => {
    const cb = vi.fn();
    await onSyncComplete(cb);

    expect(mockListen).toHaveBeenCalledWith('peer:sync_complete', expect.any(Function));
  });

  it('onSyncComplete fires callback with complete event data', async () => {
    const cb = vi.fn();
    let capturedHandler: (e: unknown) => void = () => {};

    mockListen.mockImplementation(async (_event, handler) => {
      capturedHandler = handler as (e: unknown) => void;
      return fakeUnlisten;
    });

    await onSyncComplete(cb);

    const payload = {
      deviceId: 'dev-2',
      deviceName: 'Dev Two',
      sent: 3,
      received: 2,
      sentEntries: 3,
      receivedEntries: 2,
      sentBooks: 0,
      receivedBooks: 0,
      sentSignals: 0,
      receivedSignals: 0,
      sentSettings: 0,
      receivedSettings: 0,
      at: '2026-06-01T10:00:00Z',
    };
    capturedHandler({ payload });

    expect(cb).toHaveBeenCalledWith(payload);
  });

  it('onSyncError registers listener for peer:sync_error', async () => {
    const cb = vi.fn();
    await onSyncError(cb);

    expect(mockListen).toHaveBeenCalledWith('peer:sync_error', expect.any(Function));
  });

  it('onPeerRevokedUs registers listener for peer:peer_revoked_us', async () => {
    const cb = vi.fn();
    await onPeerRevokedUs(cb);

    expect(mockListen).toHaveBeenCalledWith('peer:peer_revoked_us', expect.any(Function));
  });

  it('onSyncUnknownPeer registers listener for peer:sync_unknown_peer', async () => {
    const cb = vi.fn();
    await onSyncUnknownPeer(cb);

    expect(mockListen).toHaveBeenCalledWith('peer:sync_unknown_peer', expect.any(Function));
  });
});

describe('peerFullRestore', () => {
  it('calls peer_full_restore with deviceId and host', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await peerFullRestore('device-id', '192.168.1.100');

    expect(mockInvoke).toHaveBeenCalledWith('peer_full_restore', {
      deviceId: 'device-id',
      host: '192.168.1.100',
    });
  });

  it('propagates errors', async () => {
    mockInvoke.mockRejectedValue(new Error('Restore failed'));

    await expect(peerFullRestore('dev', '10.0.0.1')).rejects.toThrow('Restore failed');
  });
});

describe('peerApplyAndRestart', () => {
  it('calls peer_apply_and_restart', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await peerApplyAndRestart();

    expect(mockInvoke).toHaveBeenCalledWith('peer_apply_and_restart');
  });
});

describe('restore event listeners', () => {
  it('onRestoreProgress registers listener for peer:restore_progress', async () => {
    const cb = vi.fn();
    await onRestoreProgress(cb);

    expect(mockListen).toHaveBeenCalledWith('peer:restore_progress', expect.any(Function));
  });

  it('onRestoreReady registers listener for peer:restore_ready', async () => {
    const cb = vi.fn();
    await onRestoreReady(cb);

    expect(mockListen).toHaveBeenCalledWith('peer:restore_ready', expect.any(Function));
  });

  it('onRestoreError registers listener for peer:restore_error', async () => {
    const cb = vi.fn();
    await onRestoreError(cb);

    expect(mockListen).toHaveBeenCalledWith('peer:restore_error', expect.any(Function));
  });

  it('onRestoreProgress fires callback with progress payload', async () => {
    const cb = vi.fn();
    let capturedHandler: (e: unknown) => void = () => {};

    mockListen.mockImplementation(async (_event, handler) => {
      capturedHandler = handler as (e: unknown) => void;
      return fakeUnlisten;
    });

    await onRestoreProgress(cb);

    const payload = {
      bytesReceived: 1024,
      totalBytes: 4096,
      percentage: 25,
      chunksReceived: 1,
      totalChunks: 4,
      deviceName: 'Source Device',
    };
    capturedHandler({ payload });

    expect(cb).toHaveBeenCalledWith(payload);
  });
});
