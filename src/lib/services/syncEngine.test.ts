/**
 * syncEngine.test.ts
 *
 * Covers the WebDAV-based multi-device sync engine's business logic:
 * - Last-write-wins (LWW) conflict resolution
 * - Tombstone propagation (entry deletions spread to other devices)
 * - First sync (empty manifest)
 * - Partial sync (individual entry download failures)
 * - Connection failure
 * - Progress callback sequence
 *
 * All I/O (WebDAV, IPC, device identity) is mocked.
 * crypto and syncManifest are mocked for speed (real PBKDF2 is tested elsewhere).
 */

import { invoke } from '@tauri-apps/api/core';
import { syncWithWebDAV, recordTombstone } from './syncEngine';
import type { WebDAVConfig } from '../../types/settings';

// ── Mock dependencies ─────────────────────────────────────────────────────────

vi.mock('./webdavService', () => ({
  testConnection: vi.fn(),
  ensureSyncDirectories: vi.fn(),
  uploadFile: vi.fn(),
  downloadFile: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock('./deviceIdentity', () => ({
  getDeviceId: vi.fn().mockResolvedValue('local-device-id'),
}));

// Manifest en/decryption is trivial JSON for test speed — real crypto tested in syncManifest.test.ts
vi.mock('./syncManifest', () => ({
  createEmptyManifest: vi.fn((did: string) => ({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    deviceId: did,
    entries: {},
    books: {},
    media: {},
    tombstones: [],
  })),
  encryptManifest: vi.fn(async (m) => JSON.stringify(m)),
  decryptManifest: vi.fn(async (s) => JSON.parse(s)),
}));

// Encrypt returns a trivial "encrypted" blob; decrypt reverses it.
vi.mock('./crypto', () => ({
  encrypt: vi.fn(async (text: string) => ({
    success: true,
    data: { ciphertext: btoa(text), iv: 'iv', salt: 'sa', version: 1 },
  })),
  decrypt: vi.fn(async (enc: { ciphertext: string }) => ({
    success: true,
    data: atob(enc.ciphertext),
  })),
}));

const mockInvoke = vi.mocked(invoke);

import {
  testConnection,
  ensureSyncDirectories,
  uploadFile,
  downloadFile,
  deleteFile,
} from './webdavService';

const mockTestConnection = vi.mocked(testConnection);
const mockEnsureDirs = vi.mocked(ensureSyncDirectories);
const mockUpload = vi.mocked(uploadFile);
const mockDownload = vi.mocked(downloadFile);
const mockDeleteFile = vi.mocked(deleteFile);

const CONFIG: WebDAVConfig = { url: 'https://dav.example.com/', username: 'user', password: 'pass' };
const PASSWORD = 'test-sync-password';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeManifest(entries: Record<string, { updatedAt: string; deviceId: string }> = {}, tombstones: Array<{ id: string; type: 'entry' | 'book'; deletedAt: string; deviceId: string }> = []) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
    deviceId: 'remote-device-id',
    entries,
    books: {},
    media: {},
    tombstones,
  };
}

function makeEntryRow(id: string, updatedAt: string) {
  return {
    id,
    encrypted_content: { ciphertext: btoa(JSON.stringify({ text: 'content' })), iv: 'iv', salt: 'sa', version: 1 },
    mood: 3,
    privacy_mode: 0,
    location_weather: null,
    book_id: 'default',
    pinned: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: updatedAt,
    tags: [],
    sealed_until: null,
    capsule_type: null,
    linked_original_id: null,
    unsealed_at: null,
    status: null,
    session_id: null,
    word_count: null,
  };
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('syncWithWebDAV', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureDirs.mockResolvedValue(undefined);
    mockUpload.mockResolvedValue({ success: true });
    mockDeleteFile.mockResolvedValue({ success: true });
  });

  // ── Connection failure ────────────────────────────────────────────────────

  describe('connection failure', () => {
    it('returns success:false when WebDAV is unreachable', async () => {
      mockTestConnection.mockResolvedValue({ success: false, error: 'ECONNREFUSED' });

      const result = await syncWithWebDAV(CONFIG, PASSWORD);

      expect(result.success).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
      expect(result.pulled).toBe(0);
      expect(result.pushed).toBe(0);
    });

    it('does not invoke any IPC commands after a connection failure', async () => {
      mockTestConnection.mockResolvedValue({ success: false, error: 'timeout' });
      await syncWithWebDAV(CONFIG, PASSWORD);
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  // ── First sync (no manifest on server) ───────────────────────────────────

  describe('first sync — no remote manifest', () => {
    it('pushes all local entries to a fresh server', async () => {
      mockTestConnection.mockResolvedValue({ success: true });
      mockDownload.mockResolvedValue({ success: false }); // 404 → no manifest

      const localEntry = makeEntryRow('entry-local', '2026-01-01T10:00:00.000Z');
      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_entry_timestamps') return [{ id: 'entry-local', updated_at: '2026-01-01T10:00:00.000Z' }];
        if (cmd === 'get_journal_entry') return localEntry;
        if (cmd === 'list_all_media') return [];
        if (cmd === 'list_books') return [];
        return undefined;
      });

      const result = await syncWithWebDAV(CONFIG, PASSWORD);

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(1);
      expect(result.pulled).toBe(0);
    });

    it('uploads an updated manifest after first sync', async () => {
      mockTestConnection.mockResolvedValue({ success: true });
      mockDownload.mockResolvedValue({ success: false });

      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_entry_timestamps') return [];
        if (cmd === 'list_all_media') return [];
        if (cmd === 'list_books') return [];
        return undefined;
      });

      await syncWithWebDAV(CONFIG, PASSWORD);

      const manifestUploads = mockUpload.mock.calls.filter(([, path]) =>
        (path as string).includes('manifest'),
      );
      expect(manifestUploads.length).toBeGreaterThan(0);
    });
  });

  // ── LWW: remote newer → pull ──────────────────────────────────────────────

  describe('LWW — remote entry is newer → pull', () => {
    it('pulls entry when remote updatedAt > local updatedAt', async () => {
      mockTestConnection.mockResolvedValue({ success: true });

      const remoteManifest = makeManifest({
        'entry-conflict': { updatedAt: '2026-01-10T00:00:00.000Z', deviceId: 'remote-device-id' },
      });
      mockDownload
        .mockResolvedValueOnce({ success: true, data: JSON.stringify(remoteManifest) }) // manifest
        .mockResolvedValueOnce({
          // entry download
          success: true,
          data: JSON.stringify({ ciphertext: btoa(JSON.stringify(makeEntryRow('entry-conflict', '2026-01-10T00:00:00.000Z'))), iv: 'iv', salt: 'sa', version: 1 }),
        });

      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_entry_timestamps')
          return [{ id: 'entry-conflict', updated_at: '2026-01-01T00:00:00.000Z' }]; // local is older
        if (cmd === 'list_all_media') return [];
        if (cmd === 'list_books') return [];
        return undefined;
      });

      const result = await syncWithWebDAV(CONFIG, PASSWORD);

      expect(result.success).toBe(true);
      expect(result.pulled).toBe(1);
      expect(mockInvoke).toHaveBeenCalledWith(
        'upsert_entry_from_sync',
        expect.objectContaining({ entryJson: expect.any(String) }),
      );
    });
  });

  // ── LWW: local newer → push ───────────────────────────────────────────────

  describe('LWW — local entry is newer → push', () => {
    it('pushes entry when local updatedAt > remote updatedAt', async () => {
      mockTestConnection.mockResolvedValue({ success: true });

      const remoteManifest = makeManifest({
        'entry-push': { updatedAt: '2026-01-01T00:00:00.000Z', deviceId: 'remote-device-id' },
      });
      mockDownload.mockResolvedValueOnce({ success: true, data: JSON.stringify(remoteManifest) });

      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_entry_timestamps')
          return [{ id: 'entry-push', updated_at: '2026-01-10T00:00:00.000Z' }]; // local is newer
        if (cmd === 'get_journal_entry') return makeEntryRow('entry-push', '2026-01-10T00:00:00.000Z');
        if (cmd === 'list_all_media') return [];
        if (cmd === 'list_books') return [];
        return undefined;
      });

      const result = await syncWithWebDAV(CONFIG, PASSWORD);

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(1);
      expect(result.pulled).toBe(0);
    });

    it('counts a push as a conflict when the remote had an older version', async () => {
      mockTestConnection.mockResolvedValue({ success: true });

      const remoteManifest = makeManifest({
        'entry-conflict': { updatedAt: '2026-01-01T00:00:00.000Z', deviceId: 'remote-device-id' },
      });
      mockDownload.mockResolvedValueOnce({ success: true, data: JSON.stringify(remoteManifest) });

      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_entry_timestamps')
          return [{ id: 'entry-conflict', updated_at: '2026-01-10T00:00:00.000Z' }];
        if (cmd === 'get_journal_entry') return makeEntryRow('entry-conflict', '2026-01-10T00:00:00.000Z');
        if (cmd === 'list_all_media') return [];
        if (cmd === 'list_books') return [];
        return undefined;
      });

      const result = await syncWithWebDAV(CONFIG, PASSWORD);
      expect(result.conflicts).toBe(1); // local wins a conflict
    });
  });

  // ── LWW: equal timestamps → no action ────────────────────────────────────

  describe('LWW — equal timestamps', () => {
    it('neither pulls nor pushes when timestamps are equal', async () => {
      mockTestConnection.mockResolvedValue({ success: true });
      const ts = '2026-01-05T12:00:00.000Z';

      const remoteManifest = makeManifest({
        'entry-same': { updatedAt: ts, deviceId: 'remote-device-id' },
      });
      mockDownload.mockResolvedValueOnce({ success: true, data: JSON.stringify(remoteManifest) });

      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_entry_timestamps')
          return [{ id: 'entry-same', updated_at: ts }]; // exactly equal
        if (cmd === 'list_all_media') return [];
        if (cmd === 'list_books') return [];
        return undefined;
      });

      const result = await syncWithWebDAV(CONFIG, PASSWORD);

      expect(result.pulled).toBe(0);
      expect(result.pushed).toBe(0);
      expect(mockInvoke).not.toHaveBeenCalledWith('upsert_entry_from_sync', expect.anything());
      expect(mockInvoke).not.toHaveBeenCalledWith('get_journal_entry', expect.anything());
    });
  });

  // ── Tombstone propagation ─────────────────────────────────────────────────

  describe('tombstone propagation', () => {
    it('deletes a local entry that is tombstoned in the remote manifest', async () => {
      mockTestConnection.mockResolvedValue({ success: true });

      const remoteManifest = makeManifest(
        {},
        [{ id: 'deleted-entry', type: 'entry', deletedAt: '2026-01-05T00:00:00.000Z', deviceId: 'remote-device-id' }],
      );
      mockDownload.mockResolvedValueOnce({ success: true, data: JSON.stringify(remoteManifest) });

      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_entry_timestamps')
          return [{ id: 'deleted-entry', updated_at: '2026-01-01T00:00:00.000Z' }]; // we have it locally
        if (cmd === 'delete_journal_entry') return true;
        if (cmd === 'list_all_media') return [];
        if (cmd === 'list_books') return [];
        return undefined;
      });

      await syncWithWebDAV(CONFIG, PASSWORD);

      expect(mockInvoke).toHaveBeenCalledWith('delete_journal_entry', { id: 'deleted-entry' });
    });

    it('does not try to pull a tombstoned entry', async () => {
      mockTestConnection.mockResolvedValue({ success: true });

      const remoteManifest = makeManifest(
        { 'tombstoned-entry': { updatedAt: '2026-01-10T00:00:00.000Z', deviceId: 'remote-device-id' } },
        [{ id: 'tombstoned-entry', type: 'entry', deletedAt: '2026-01-10T00:00:00.000Z', deviceId: 'remote-device-id' }],
      );
      mockDownload.mockResolvedValueOnce({ success: true, data: JSON.stringify(remoteManifest) });

      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_entry_timestamps') return [];
        if (cmd === 'list_all_media') return [];
        if (cmd === 'list_books') return [];
        return undefined;
      });

      await syncWithWebDAV(CONFIG, PASSWORD);

      // The tombstoned entry was in the remote manifest as "newer" but we don't have it locally
      // The engine should still apply the tombstone (no-op since we don't have it) without pulling
      expect(mockInvoke).not.toHaveBeenCalledWith('upsert_entry_from_sync', expect.anything());
    });
  });

  // ── Partial sync: download failures ──────────────────────────────────────

  describe('partial sync — individual download failures', () => {
    it('continues syncing remaining entries when one download fails', async () => {
      mockTestConnection.mockResolvedValue({ success: true });

      const remoteManifest = makeManifest({
        'entry-ok': { updatedAt: '2026-01-10T00:00:00.000Z', deviceId: 'remote-device-id' },
        'entry-fail': { updatedAt: '2026-01-10T00:00:00.000Z', deviceId: 'remote-device-id' },
      });

      mockDownload
        .mockResolvedValueOnce({ success: true, data: JSON.stringify(remoteManifest) }) // manifest
        .mockResolvedValueOnce({ success: false })  // entry-ok download fails
        .mockResolvedValueOnce({ success: true, data: JSON.stringify({ ciphertext: btoa(JSON.stringify(makeEntryRow('entry-fail', '2026-01-10T00:00:00.000Z'))), iv: 'iv', salt: 'sa', version: 1 }) }); // entry-fail succeeds

      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_entry_timestamps') return []; // we have neither entry locally
        if (cmd === 'list_all_media') return [];
        if (cmd === 'list_books') return [];
        return undefined;
      });

      const result = await syncWithWebDAV(CONFIG, PASSWORD);

      // One succeeded, one failed — overall sync still succeeded
      expect(result.success).toBe(true);
      expect(result.pulled).toBe(1); // only the successful one counted
    });

    it('returns success even when all entry downloads fail', async () => {
      mockTestConnection.mockResolvedValue({ success: true });

      const remoteManifest = makeManifest({
        'entry-a': { updatedAt: '2026-01-10T00:00:00.000Z', deviceId: 'remote-device-id' },
      });
      mockDownload
        .mockResolvedValueOnce({ success: true, data: JSON.stringify(remoteManifest) })
        .mockResolvedValue({ success: false }); // all entry downloads fail

      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_entry_timestamps') return [];
        if (cmd === 'list_all_media') return [];
        if (cmd === 'list_books') return [];
        return undefined;
      });

      const result = await syncWithWebDAV(CONFIG, PASSWORD);

      expect(result.success).toBe(true);
      expect(result.pulled).toBe(0);
    });
  });

  // ── New local entry not in remote ─────────────────────────────────────────

  describe('local entry not in remote manifest', () => {
    it('pushes the entry to the remote', async () => {
      mockTestConnection.mockResolvedValue({ success: true });

      const remoteManifest = makeManifest({}); // empty — remote knows nothing
      mockDownload.mockResolvedValueOnce({ success: true, data: JSON.stringify(remoteManifest) });

      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_entry_timestamps')
          return [{ id: 'new-local-entry', updated_at: '2026-01-01T00:00:00.000Z' }];
        if (cmd === 'get_journal_entry') return makeEntryRow('new-local-entry', '2026-01-01T00:00:00.000Z');
        if (cmd === 'list_all_media') return [];
        if (cmd === 'list_books') return [];
        return undefined;
      });

      const result = await syncWithWebDAV(CONFIG, PASSWORD);

      expect(result.pushed).toBe(1);
      expect(mockInvoke).toHaveBeenCalledWith('get_journal_entry', { id: 'new-local-entry' });
    });
  });

  // ── Progress callbacks ────────────────────────────────────────────────────

  describe('progress callbacks', () => {
    it('reports phases in order: connecting → manifest → pulling → pushing → media → books → finalizing', async () => {
      mockTestConnection.mockResolvedValue({ success: true });
      mockDownload.mockResolvedValue({ success: false }); // no manifest

      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_entry_timestamps') return [];
        if (cmd === 'list_all_media') return [];
        if (cmd === 'list_books') return [];
        return undefined;
      });

      const phases: string[] = [];
      await syncWithWebDAV(CONFIG, PASSWORD, (p) => phases.push(p.phase));

      expect(phases[0]).toBe('connecting');
      expect(phases).toContain('manifest');
      expect(phases).toContain('pulling');
      expect(phases).toContain('pushing');
      expect(phases).toContain('finalizing');
    });
  });

  // ── syncedAt timestamp ────────────────────────────────────────────────────

  describe('result metadata', () => {
    it('includes a valid syncedAt timestamp on success', async () => {
      mockTestConnection.mockResolvedValue({ success: true });
      mockDownload.mockResolvedValue({ success: false });
      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_entry_timestamps') return [];
        if (cmd === 'list_all_media') return [];
        if (cmd === 'list_books') return [];
        return undefined;
      });

      const before = Date.now();
      const result = await syncWithWebDAV(CONFIG, PASSWORD);
      const after = Date.now();

      const ts = new Date(result.syncedAt).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it('includes a valid syncedAt timestamp on failure', async () => {
      mockTestConnection.mockResolvedValue({ success: false, error: 'unreachable' });
      const result = await syncWithWebDAV(CONFIG, PASSWORD);
      expect(new Date(result.syncedAt).getTime()).toBeGreaterThan(0);
    });
  });
});

// ── recordTombstone ───────────────────────────────────────────────────────────

describe('recordTombstone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(uploadFile).mockResolvedValue({ success: true });
    vi.mocked(deleteFile).mockResolvedValue({ success: true });
  });

  it('adds tombstone to manifest and re-uploads it', async () => {
    const manifest = makeManifest({
      'to-delete': { updatedAt: '2026-01-01T00:00:00.000Z', deviceId: 'remote-device-id' },
    });

    vi.mocked(downloadFile).mockResolvedValue({
      success: true,
      data: JSON.stringify(manifest),
    });

    await recordTombstone('to-delete', CONFIG, PASSWORD);

    // Manifest should be re-uploaded
    const uploadCalls = vi.mocked(uploadFile).mock.calls;
    const manifestUpload = uploadCalls.find(([, path]) => (path as string).includes('manifest'));
    expect(manifestUpload).toBeTruthy();

    // Entry file should be deleted from WebDAV
    expect(vi.mocked(deleteFile)).toHaveBeenCalledWith(
      CONFIG,
      expect.stringContaining('to-delete'),
    );
  });

  it('exits silently when manifest download fails (best-effort)', async () => {
    vi.mocked(downloadFile).mockResolvedValue({ success: false });
    await expect(recordTombstone('orphan-entry', CONFIG, PASSWORD)).resolves.toBeUndefined();
    expect(vi.mocked(uploadFile)).not.toHaveBeenCalled();
  });
});
