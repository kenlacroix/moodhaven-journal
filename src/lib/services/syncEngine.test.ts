// @vitest-environment node
/**
 * Tests for syncEngine.ts
 *
 * Focus: manifest diff logic (pull/push decisions), tombstone application,
 * error containment, and progress reporting. Does NOT test actual WebDAV I/O
 * or Tauri Rust commands — all external calls are mocked.
 */

import { invoke } from '@tauri-apps/api/core';
import { syncWithWebDAV, recordTombstone } from './syncEngine';
import type { SyncProgress } from './syncEngine';
import type { WebDAVConfig } from '../../types/settings';

vi.mock('./webdavService', () => ({
  testConnection: vi.fn(),
  ensureSyncDirectories: vi.fn(),
  uploadFile: vi.fn(),
  downloadFile: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock('./crypto', () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}));

vi.mock('./deviceIdentity', () => ({
  getDeviceId: vi.fn().mockResolvedValue('test-device-id'),
}));

vi.mock('./syncManifest', () => ({
  createEmptyManifest: vi.fn(),
  encryptManifest: vi.fn(),
  decryptManifest: vi.fn(),
}));

vi.mock('./logger', () => ({
  forModule: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  testConnection,
  ensureSyncDirectories,
  uploadFile,
  downloadFile,
  deleteFile,
} from './webdavService';

import { encrypt, decrypt } from './crypto';
import { createEmptyManifest, encryptManifest, decryptManifest } from './syncManifest';

const mockInvoke = vi.mocked(invoke);
const mockTestConnection = vi.mocked(testConnection);
const mockEnsureSyncDirectories = vi.mocked(ensureSyncDirectories);
const mockUploadFile = vi.mocked(uploadFile);
const mockDownloadFile = vi.mocked(downloadFile);
const mockDeleteFile = vi.mocked(deleteFile);
const mockEncrypt = vi.mocked(encrypt);
const mockDecrypt = vi.mocked(decrypt);
const mockCreateEmptyManifest = vi.mocked(createEmptyManifest);
const mockEncryptManifest = vi.mocked(encryptManifest);
const mockDecryptManifest = vi.mocked(decryptManifest);

const config: WebDAVConfig = { url: 'https://dav.example.com/', username: 'u', password: 'p' };
const password = 'user-password';

const baseManifest = {
  schemaVersion: 1 as const,
  generatedAt: '2026-06-01T00:00:00Z',
  deviceId: 'remote-device',
  entries: {} as Record<string, { updatedAt: string; deviceId: string }>,
  books: {} as Record<string, { updatedAt: string; deviceId: string }>,
  media: {} as Record<string, { entryId: string; createdAt: string; deviceId: string }>,
  tombstones: [] as Array<{ id: string; type: 'entry' | 'book' | 'media'; deletedAt: string; deviceId: string }>,
};

function setupHappyPath(manifest = baseManifest) {
  mockTestConnection.mockResolvedValue({ success: true });
  mockEnsureSyncDirectories.mockResolvedValue(undefined);
  // Manifest download
  mockDownloadFile.mockResolvedValueOnce({ success: true, data: '{"encrypted":"manifest"}' });
  mockDecryptManifest.mockResolvedValue({ ...manifest });
  // Entry timestamps
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'get_entry_timestamps') return Promise.resolve([]);
    if (cmd === 'list_books') return Promise.resolve([]);
    if (cmd === 'list_all_media') return Promise.resolve([]);
    return Promise.resolve(undefined);
  });
  mockEncryptManifest.mockResolvedValue('{"enc":"manifest"}');
  mockUploadFile.mockResolvedValue({ success: true });
  // localStorage mock (for book tombstones)
  vi.stubGlobal('localStorage', {
    getItem: vi.fn().mockReturnValue('[]'),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('syncWithWebDAV — connection failure', () => {
  it('returns failure when testConnection fails', async () => {
    mockTestConnection.mockResolvedValue({ success: false, error: 'Timeout' });

    const result = await syncWithWebDAV(config, password);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Timeout');
    expect(result.pulled).toBe(0);
    expect(result.pushed).toBe(0);
  });

  it('returns failure when testConnection throws', async () => {
    mockTestConnection.mockRejectedValue(new Error('Network unreachable'));

    const result = await syncWithWebDAV(config, password);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Network unreachable');
  });
});

describe('syncWithWebDAV — first sync (no manifest)', () => {
  it('creates empty manifest when remote 404', async () => {
    mockTestConnection.mockResolvedValue({ success: true });
    mockEnsureSyncDirectories.mockResolvedValue(undefined);
    // No manifest on server
    mockDownloadFile.mockResolvedValue({ success: false, data: undefined });
    mockCreateEmptyManifest.mockReturnValue({ ...baseManifest });
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_entry_timestamps') return Promise.resolve([]);
      if (cmd === 'list_books') return Promise.resolve([]);
      if (cmd === 'list_all_media') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
    mockEncryptManifest.mockResolvedValue('{"enc":"manifest"}');
    mockUploadFile.mockResolvedValue({ success: true });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue('[]'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    const result = await syncWithWebDAV(config, password);

    expect(mockCreateEmptyManifest).toHaveBeenCalledWith('test-device-id');
    expect(result.success).toBe(true);
    expect(result.pulled).toBe(0);
    expect(result.pushed).toBe(0);
  });
});

describe('syncWithWebDAV — manifest diff logic', () => {
  it('identifies entries to pull (remote has entry, local does not)', async () => {
    const manifest = {
      ...baseManifest,
      entries: {
        'remote-only-entry': { updatedAt: '2026-06-01T10:00:00Z', deviceId: 'remote' },
      },
    };
    mockTestConnection.mockResolvedValue({ success: true });
    mockEnsureSyncDirectories.mockResolvedValue(undefined);
    mockDownloadFile
      .mockResolvedValueOnce({ success: true, data: '{"encrypted":"manifest"}' }) // manifest
      .mockResolvedValueOnce({ success: true, data: '{"encrypted":"entry"}' }); // entry pull
    mockDecryptManifest.mockResolvedValue({ ...manifest });

    const fakeEntry = { id: 'remote-only-entry', updated_at: '2026-06-01T10:00:00Z' };
    mockDecrypt.mockResolvedValue({ success: true, data: JSON.stringify(fakeEntry) });

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_entry_timestamps') return Promise.resolve([]); // local has nothing
      if (cmd === 'upsert_entry_from_sync') return Promise.resolve(undefined);
      if (cmd === 'list_books') return Promise.resolve([]);
      if (cmd === 'list_all_media') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
    mockEncryptManifest.mockResolvedValue('enc');
    mockUploadFile.mockResolvedValue({ success: true });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue('[]'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    const result = await syncWithWebDAV(config, password);

    expect(result.success).toBe(true);
    expect(result.pulled).toBe(1);
    expect(result.pushed).toBe(0);
  });

  it('identifies entries to push (local has entry, remote does not)', async () => {
    const localEntry = { id: 'local-only', updated_at: '2026-06-01T09:00:00Z' };
    setupHappyPath({ ...baseManifest, entries: {} }); // remote has no entries

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_entry_timestamps') {
        return Promise.resolve([{ id: 'local-only', updated_at: '2026-06-01T09:00:00Z' }]);
      }
      if (cmd === 'get_journal_entry') return Promise.resolve(localEntry);
      if (cmd === 'list_books') return Promise.resolve([]);
      if (cmd === 'list_all_media') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
    mockEncrypt.mockResolvedValue({ success: true, data: { iv: 'iv', data: 'data', salt: 'salt' } });
    mockUploadFile.mockResolvedValue({ success: true });

    const result = await syncWithWebDAV(config, password);

    expect(result.success).toBe(true);
    expect(result.pushed).toBe(1);
    expect(result.pulled).toBe(0);
  });

  it('detects conflict (both have entry, local is newer)', async () => {
    const manifest = {
      ...baseManifest,
      entries: {
        'shared-entry': { updatedAt: '2026-06-01T08:00:00Z', deviceId: 'remote' }, // older
      },
    };
    mockTestConnection.mockResolvedValue({ success: true });
    mockEnsureSyncDirectories.mockResolvedValue(undefined);
    mockDownloadFile.mockResolvedValueOnce({ success: true, data: '{"enc":"manifest"}' });
    mockDecryptManifest.mockResolvedValue({ ...manifest });

    const localEntry = { id: 'shared-entry', updated_at: '2026-06-01T10:00:00Z' }; // newer
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_entry_timestamps') {
        return Promise.resolve([{ id: 'shared-entry', updated_at: '2026-06-01T10:00:00Z' }]);
      }
      if (cmd === 'get_journal_entry') return Promise.resolve(localEntry);
      if (cmd === 'list_books') return Promise.resolve([]);
      if (cmd === 'list_all_media') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
    mockEncrypt.mockResolvedValue({ success: true, data: { iv: 'iv', data: 'data', salt: 'salt' } });
    mockUploadFile.mockResolvedValue({ success: true });
    mockEncryptManifest.mockResolvedValue('enc');
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue('[]'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    const result = await syncWithWebDAV(config, password);

    expect(result.success).toBe(true);
    expect(result.conflicts).toBe(1); // local newer → push, count as conflict
    expect(result.pushed).toBe(1);
    expect(result.pulled).toBe(0);
  });

  it('skips entry if both timestamps are equal', async () => {
    const ts = '2026-06-01T10:00:00Z';
    const manifest = {
      ...baseManifest,
      entries: { 'same-entry': { updatedAt: ts, deviceId: 'remote' } },
    };
    setupHappyPath(manifest);

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_entry_timestamps') {
        return Promise.resolve([{ id: 'same-entry', updated_at: ts }]);
      }
      if (cmd === 'list_books') return Promise.resolve([]);
      if (cmd === 'list_all_media') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    const result = await syncWithWebDAV(config, password);

    expect(result.success).toBe(true);
    expect(result.pulled).toBe(0);
    expect(result.pushed).toBe(0);
    expect(result.conflicts).toBe(0);
  });
});

describe('syncWithWebDAV — tombstones', () => {
  it('deletes local entry when remote tombstone exists', async () => {
    const manifest = {
      ...baseManifest,
      tombstones: [
        { id: 'deleted-on-remote', type: 'entry' as const, deletedAt: '2026-06-01T00:00:00Z', deviceId: 'remote' },
      ],
    };
    mockTestConnection.mockResolvedValue({ success: true });
    mockEnsureSyncDirectories.mockResolvedValue(undefined);
    mockDownloadFile.mockResolvedValueOnce({ success: true, data: '{"enc":"manifest"}' });
    mockDecryptManifest.mockResolvedValue({ ...manifest });

    const deletedEntry = vi.fn().mockResolvedValue(undefined);
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_entry_timestamps') {
        return Promise.resolve([{ id: 'deleted-on-remote', updated_at: '2026-06-01T00:00:00Z' }]);
      }
      if (cmd === 'delete_journal_entry') return deletedEntry();
      if (cmd === 'list_books') return Promise.resolve([]);
      if (cmd === 'list_all_media') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
    mockEncryptManifest.mockResolvedValue('enc');
    mockUploadFile.mockResolvedValue({ success: true });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue('[]'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    const result = await syncWithWebDAV(config, password);

    expect(result.success).toBe(true);
    expect(deletedEntry).toHaveBeenCalled();
  });

  it('does not delete local entry when no tombstone', async () => {
    setupHappyPath();

    const deleteCount = { calls: 0 };
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_entry_timestamps') return Promise.resolve([{ id: 'safe-entry', updated_at: '2026-06-01' }]);
      if (cmd === 'delete_journal_entry') { deleteCount.calls++; return Promise.resolve(undefined); }
      if (cmd === 'list_books') return Promise.resolve([]);
      if (cmd === 'list_all_media') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    await syncWithWebDAV(config, password);

    // No tombstones → no deletions
    expect(deleteCount.calls).toBe(0);
  });
});

describe('syncWithWebDAV — progress reporting', () => {
  it('calls onProgress callback throughout sync phases', async () => {
    setupHappyPath();

    const progressEvents: SyncProgress[] = [];
    await syncWithWebDAV(config, password, (p) => progressEvents.push(p));

    const phases = progressEvents.map((p) => p.phase);
    expect(phases).toContain('connecting');
    expect(phases).toContain('manifest');
    expect(phases).toContain('finalizing');
  });

  it('does not throw when no progress callback provided', async () => {
    setupHappyPath();

    const result = await syncWithWebDAV(config, password);

    expect(result.success).toBe(true);
  });
});

describe('syncWithWebDAV — result shape', () => {
  it('result includes syncedAt timestamp', async () => {
    setupHappyPath();

    const result = await syncWithWebDAV(config, password);

    expect(result.syncedAt).toBeTruthy();
    expect(new Date(result.syncedAt).getTime()).toBeGreaterThan(0);
  });

  it('success result has success:true and no error field', async () => {
    setupHappyPath();

    const result = await syncWithWebDAV(config, password);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('failure result has success:false and error string', async () => {
    mockTestConnection.mockRejectedValue(new Error('Network error'));

    const result = await syncWithWebDAV(config, password);

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('recordTombstone', () => {
  it('adds tombstone to manifest and uploads', async () => {
    const manifest = { ...baseManifest, entries: { 'entry-to-delete': { updatedAt: '2026-06-01', deviceId: 'dev' } } };
    mockDownloadFile.mockResolvedValue({ success: true, data: '{"enc":"manifest"}' });
    mockDecryptManifest.mockResolvedValue({ ...manifest });
    mockDeleteFile.mockResolvedValue({ success: true });
    mockEncryptManifest.mockResolvedValue('{"enc":"updated-manifest"}');
    mockUploadFile.mockResolvedValue({ success: true });

    await recordTombstone('entry-to-delete', config, password);

    expect(mockUploadFile).toHaveBeenCalledWith(
      config,
      'sync/manifest.enc',
      '{"enc":"updated-manifest"}',
    );
    // Verify delete file was called for the entry
    expect(mockDeleteFile).toHaveBeenCalledWith(config, expect.stringContaining('entry-to-delete'));
  });

  it('silently skips when manifest download fails', async () => {
    mockDownloadFile.mockResolvedValue({ success: false, data: undefined });

    // Should not throw
    await expect(recordTombstone('e1', config, password)).resolves.toBeUndefined();
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  it('silently handles decryption failure', async () => {
    mockDownloadFile.mockResolvedValue({ success: true, data: '{"enc":"bad"}' });
    mockDecryptManifest.mockRejectedValue(new Error('Wrong password'));

    await expect(recordTombstone('e1', config, password)).resolves.toBeUndefined();
  });
});
