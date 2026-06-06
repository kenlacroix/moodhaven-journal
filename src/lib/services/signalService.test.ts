import { invoke } from '@tauri-apps/api/core';
import {
  createSignal,
  captureSignal,
  listSignals,
  linkSignalToEntry,
  listEntrySignals,
  deleteSignal,
  getUnsyncedLog,
  markSyncLogSynced,
} from './signalService';

vi.mock('./crypto', () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}));

import { encrypt, decrypt } from './crypto';

const mockInvoke = vi.mocked(invoke);
const mockEncrypt = vi.mocked(encrypt);
const mockDecrypt = vi.mocked(decrypt);

// Minimal encrypted payload that decryptRow can round-trip
const fakeEncryptedData = { iv: 'iv==', data: 'data==', salt: 'salt==' };
const fakePayload = { mood: 4 as const };

function makeSignalRow(overrides = {}) {
  return {
    id: 'signal-id-001',
    timestamp: '2026-06-01T10:00:00Z',
    signal_type: 'mood_tap',
    source: 'watch',
    payload: JSON.stringify(fakeEncryptedData),
    synced: 0,
    created_at: '2026-06-01T10:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: encrypt succeeds
  mockEncrypt.mockResolvedValue({ success: true, data: fakeEncryptedData });
  // Default: decrypt succeeds returning the payload JSON
  mockDecrypt.mockResolvedValue({ success: true, data: JSON.stringify(fakePayload) });
});

describe('createSignal', () => {
  it('encrypts payload before invoking create_signal', async () => {
    const row = makeSignalRow();
    mockInvoke.mockResolvedValue(row);

    await createSignal('pass', 'id-1', '2026-06-01T10:00:00Z', 'mood_tap', 'watch', fakePayload);

    expect(mockEncrypt).toHaveBeenCalledWith(JSON.stringify(fakePayload), 'pass');
    expect(mockInvoke).toHaveBeenCalledWith('create_signal', {
      id: 'id-1',
      timestamp: '2026-06-01T10:00:00Z',
      signalType: 'mood_tap',
      source: 'watch',
      payload: JSON.stringify(fakeEncryptedData),
    });
  });

  it('decrypts the returned row and returns typed Signal', async () => {
    const row = makeSignalRow();
    mockInvoke.mockResolvedValue(row);

    const signal = await createSignal('pass', 'id-1', '2026-06-01T10:00:00Z', 'mood_tap', 'watch', fakePayload);

    expect(signal.id).toBe('signal-id-001');
    expect(signal.type).toBe('mood_tap');
    expect(signal.source).toBe('watch');
    expect(signal.payload).toEqual(fakePayload);
  });

  it('throws when encryption fails', async () => {
    mockEncrypt.mockResolvedValue({ success: false, error: 'WebCrypto error' });

    await expect(
      createSignal('pass', 'id-1', '2026-06-01T10:00:00Z', 'mood_tap', 'watch', fakePayload),
    ).rejects.toThrow('WebCrypto error');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('throws when encryption returns no data', async () => {
    mockEncrypt.mockResolvedValue({ success: true, data: undefined });

    await expect(
      createSignal('pass', 'id-1', '2026-06-01T10:00:00Z', 'mood_tap', 'watch', fakePayload),
    ).rejects.toThrow('Signal encryption failed');
  });

  it('throws when decryption of returned row fails', async () => {
    const row = makeSignalRow();
    mockInvoke.mockResolvedValue(row);
    mockDecrypt.mockResolvedValue({ success: false, error: 'Decryption error' });

    await expect(
      createSignal('pass', 'id-1', '2026-06-01T10:00:00Z', 'mood_tap', 'watch', fakePayload),
    ).rejects.toThrow('Decryption error');
  });
});

describe('captureSignal', () => {
  it('auto-generates id and timestamp, delegates to createSignal', async () => {
    const row = makeSignalRow();
    mockInvoke.mockResolvedValue(row);

    const signal = await captureSignal('pass', 'health_snapshot', 'desktop', { mood: 3 as const });

    // Should have called create_signal with a UUID-looking id
    const callArgs = mockInvoke.mock.calls[0][1] as Record<string, unknown>;
    expect(typeof callArgs.id).toBe('string');
    expect((callArgs.id as string).length).toBeGreaterThan(10);
    expect(signal.type).toBe('mood_tap'); // from the mocked row
  });
});

describe('listSignals', () => {
  it('calls list_signals with null filter when no type given', async () => {
    mockInvoke.mockResolvedValue([makeSignalRow()]);

    await listSignals('pass');

    expect(mockInvoke).toHaveBeenCalledWith('list_signals', {
      signalType: null,
      limit: null,
    });
  });

  it('passes type and limit when provided', async () => {
    mockInvoke.mockResolvedValue([]);

    await listSignals('pass', 'mood_tap', 10);

    expect(mockInvoke).toHaveBeenCalledWith('list_signals', {
      signalType: 'mood_tap',
      limit: 10,
    });
  });

  it('decrypts all returned rows', async () => {
    const rows = [makeSignalRow({ id: 'a' }), makeSignalRow({ id: 'b' })];
    mockInvoke.mockResolvedValue(rows);

    const signals = await listSignals('pass');

    expect(signals).toHaveLength(2);
    expect(mockDecrypt).toHaveBeenCalledTimes(2);
  });

  it('throws if any row fails to decrypt', async () => {
    mockInvoke.mockResolvedValue([makeSignalRow()]);
    mockDecrypt.mockResolvedValue({ success: false, error: 'Bad key' });

    await expect(listSignals('pass')).rejects.toThrow('Bad key');
  });

  it('returns empty array when no signals exist', async () => {
    mockInvoke.mockResolvedValue([]);

    const result = await listSignals('pass');

    expect(result).toEqual([]);
    expect(mockDecrypt).not.toHaveBeenCalled();
  });
});

describe('linkSignalToEntry', () => {
  it('calls link_signal_to_entry with correct args', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await linkSignalToEntry('entry-id', 'signal-id');

    expect(mockInvoke).toHaveBeenCalledWith('link_signal_to_entry', {
      reflectionId: 'entry-id',
      signalId: 'signal-id',
    });
  });
});

describe('listEntrySignals', () => {
  it('calls list_entry_signals with reflectionId', async () => {
    mockInvoke.mockResolvedValue([makeSignalRow()]);

    const signals = await listEntrySignals('pass', 'entry-123');

    expect(mockInvoke).toHaveBeenCalledWith('list_entry_signals', { reflectionId: 'entry-123' });
    expect(signals).toHaveLength(1);
  });

  it('returns empty array when entry has no signals', async () => {
    mockInvoke.mockResolvedValue([]);

    const signals = await listEntrySignals('pass', 'entry-empty');

    expect(signals).toEqual([]);
  });
});

describe('deleteSignal', () => {
  it('calls delete_signal with id', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await deleteSignal('signal-to-delete');

    expect(mockInvoke).toHaveBeenCalledWith('delete_signal', { id: 'signal-to-delete' });
  });
});

describe('getUnsyncedLog', () => {
  it('calls get_unsynced_log with null limit by default', async () => {
    mockInvoke.mockResolvedValue([]);

    await getUnsyncedLog();

    expect(mockInvoke).toHaveBeenCalledWith('get_unsynced_log', { limit: null });
  });

  it('passes limit when provided', async () => {
    mockInvoke.mockResolvedValue([]);

    await getUnsyncedLog(50);

    expect(mockInvoke).toHaveBeenCalledWith('get_unsynced_log', { limit: 50 });
  });

  it('returns sync log rows', async () => {
    const fakeRows = [{ id: 1, entry_id: 'e1', action: 'created', synced: 0, created_at: '2026-01-01' }];
    mockInvoke.mockResolvedValue(fakeRows);

    const result = await getUnsyncedLog();

    expect(result).toEqual(fakeRows);
  });
});

describe('markSyncLogSynced', () => {
  it('calls mark_sync_log_synced with upToId', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await markSyncLogSynced(42);

    expect(mockInvoke).toHaveBeenCalledWith('mark_sync_log_synced', { upToId: 42 });
  });
});
