// @vitest-environment node
// Signal payloads must be encrypted before reaching Rust.
// These tests verify the encrypt-before-invoke contract and decryption on read-back.

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
import { encrypt } from './crypto';
import type { MoodTapPayload, HealthSnapshotPayload, SignalRow } from '../../types/signals';

const mockInvoke = vi.mocked(invoke);

// Helper: create a mock SignalRow with a real encrypted payload for read-back tests
async function makeEncryptedRow(payload: object, password: string): Promise<SignalRow> {
  const encResult = await encrypt(JSON.stringify(payload), password);
  return {
    id: 'sig-001',
    timestamp: '2026-01-01T10:00:00.000Z',
    signal_type: 'mood_tap',
    source: 'watch',
    payload: JSON.stringify(encResult.data),
    synced: false,
    created_at: '2026-01-01T10:00:00.000Z',
  };
}

describe('signalService', () => {
  const PASSWORD = 'test-signal-password';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── createSignal ─────────────────────────────────────────────────────────────

  describe('createSignal — encrypt before invoke', () => {
    it('invokes create_signal with an encrypted payload (not raw plaintext)', async () => {
      const moodPayload: MoodTapPayload = { mood: 4, note: 'feeling good' };
      let capturedPayload: unknown;

      mockInvoke.mockImplementation(async (cmd, args) => {
        if (cmd === 'create_signal') {
          capturedPayload = (args as Record<string, unknown>).payload;
          // Return a row with the same payload so decryptRow can decrypt it
          const row: SignalRow = {
            id: 'sig-new',
            timestamp: '2026-01-01T10:00:00.000Z',
            signal_type: 'mood_tap',
            source: 'watch',
            payload: capturedPayload as string,
            synced: false,
            created_at: '2026-01-01T10:00:00.000Z',
          };
          return row;
        }
        return undefined;
      });

      await createSignal(PASSWORD, 'sig-new', '2026-01-01T10:00:00.000Z', 'mood_tap', 'watch', moodPayload);

      // The payload sent to Rust must be encrypted — not the raw mood value
      const payloadStr = capturedPayload as string;
      const payloadObj = JSON.parse(payloadStr);
      expect(payloadObj).toHaveProperty('ciphertext');
      expect(payloadObj).toHaveProperty('iv');
      expect(payloadObj).toHaveProperty('salt');
      // Raw values must NOT appear in the encrypted payload
      expect(payloadStr).not.toContain('"mood"');
      expect(payloadStr).not.toContain('feeling good');
    }, 20_000);

    it('decrypts the returned row correctly', async () => {
      const moodPayload: MoodTapPayload = { mood: 5 };

      mockInvoke.mockImplementation(async (cmd, args) => {
        if (cmd === 'create_signal') {
          const p = (args as Record<string, unknown>).payload as string;
          const row: SignalRow = {
            id: 'sig-r1',
            timestamp: '2026-01-01T10:00:00.000Z',
            signal_type: 'mood_tap',
            source: 'watch',
            payload: p,
            synced: false,
            created_at: '2026-01-01T10:00:00.000Z',
          };
          return row;
        }
        return undefined;
      });

      const signal = await createSignal<MoodTapPayload>(
        PASSWORD,
        'sig-r1',
        '2026-01-01T10:00:00.000Z',
        'mood_tap',
        'watch',
        moodPayload,
      );

      expect(signal.id).toBe('sig-r1');
      expect(signal.type).toBe('mood_tap');
      expect(signal.source).toBe('watch');
      expect(signal.payload.mood).toBe(5);
    }, 20_000);

    it('throws when password is empty (encryption must fail)', async () => {
      await expect(
        createSignal('', 'sig-err', '2026-01-01T10:00:00.000Z', 'mood_tap', 'watch', { mood: 3 }),
      ).rejects.toThrow();
    }, 20_000);

    it('passes correct IPC arguments for create_signal', async () => {
      mockInvoke.mockImplementation(async (_cmd, args) => {
        const a = args as Record<string, unknown>;
        const row: SignalRow = {
          id: a.id as string,
          timestamp: a.timestamp as string,
          signal_type: a.signalType as string,
          source: a.source as string,
          payload: a.payload as string,
          synced: false,
          created_at: a.timestamp as string,
        };
        return row;
      });

      await createSignal(
        PASSWORD,
        'my-sig-id',
        '2026-06-01T09:00:00.000Z',
        'health_snapshot',
        'desktop',
        { sleepScore: 80, source: 'oura' } as HealthSnapshotPayload,
      );

      expect(mockInvoke).toHaveBeenCalledWith(
        'create_signal',
        expect.objectContaining({
          id: 'my-sig-id',
          timestamp: '2026-06-01T09:00:00.000Z',
          signalType: 'health_snapshot',
          source: 'desktop',
        }),
      );
    }, 20_000);
  });

  // ── captureSignal ─────────────────────────────────────────────────────────────

  describe('captureSignal', () => {
    it('auto-generates an id and timestamp', async () => {
      let capturedId: string | undefined;
      let capturedTimestamp: string | undefined;

      mockInvoke.mockImplementation(async (_cmd, args) => {
        const a = args as Record<string, unknown>;
        capturedId = a.id as string;
        capturedTimestamp = a.timestamp as string;
        const row: SignalRow = {
          id: capturedId,
          timestamp: capturedTimestamp,
          signal_type: 'mood_tap',
          source: 'watch',
          payload: a.payload as string,
          synced: false,
          created_at: capturedTimestamp,
        };
        return row;
      });

      await captureSignal(PASSWORD, 'mood_tap', 'watch', { mood: 3 } as MoodTapPayload);

      expect(capturedId).toBeTruthy();
      expect(capturedId!.length).toBeGreaterThan(10); // UUID-like
      expect(capturedTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }, 20_000);
  });

  // ── listSignals ───────────────────────────────────────────────────────────────

  describe('listSignals', () => {
    it('decrypts all returned rows', async () => {
      const payload: MoodTapPayload = { mood: 5, note: 'great day' };
      const row = await makeEncryptedRow(payload, PASSWORD);
      mockInvoke.mockResolvedValue([row]);

      const signals = await listSignals<MoodTapPayload>(PASSWORD, 'mood_tap');

      expect(signals).toHaveLength(1);
      expect(signals[0].payload.mood).toBe(5);
      expect(signals[0].payload.note).toBe('great day');
    }, 20_000);

    it('forwards signalType filter to invoke', async () => {
      mockInvoke.mockResolvedValue([]);
      await listSignals(PASSWORD, 'health_snapshot', 10);
      expect(mockInvoke).toHaveBeenCalledWith('list_signals', {
        signalType: 'health_snapshot',
        limit: 10,
      });
    });

    it('passes null for omitted optional parameters', async () => {
      mockInvoke.mockResolvedValue([]);
      await listSignals(PASSWORD);
      expect(mockInvoke).toHaveBeenCalledWith('list_signals', { signalType: null, limit: null });
    });

    it('throws when decryption fails (wrong password)', async () => {
      const payload: MoodTapPayload = { mood: 2 };
      const row = await makeEncryptedRow(payload, PASSWORD);
      mockInvoke.mockResolvedValue([row]);

      // wrong password — decryption must fail
      await expect(listSignals('wrong-password', 'mood_tap')).rejects.toThrow();
    }, 20_000);

    it('returns empty array when no signals exist', async () => {
      mockInvoke.mockResolvedValue([]);
      const signals = await listSignals(PASSWORD);
      expect(signals).toEqual([]);
    });
  });

  // ── listEntrySignals ──────────────────────────────────────────────────────────

  describe('listEntrySignals', () => {
    it('invokes list_entry_signals with reflectionId', async () => {
      mockInvoke.mockResolvedValue([]);
      await listEntrySignals(PASSWORD, 'entry-abc');
      expect(mockInvoke).toHaveBeenCalledWith('list_entry_signals', { reflectionId: 'entry-abc' });
    });
  });

  // ── linkSignalToEntry ─────────────────────────────────────────────────────────

  describe('linkSignalToEntry', () => {
    it('invokes link_signal_to_entry with correct args', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await linkSignalToEntry('entry-001', 'sig-001');
      expect(mockInvoke).toHaveBeenCalledWith('link_signal_to_entry', {
        reflectionId: 'entry-001',
        signalId: 'sig-001',
      });
    });
  });

  // ── deleteSignal ──────────────────────────────────────────────────────────────

  describe('deleteSignal', () => {
    it('invokes delete_signal with the id', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await deleteSignal('sig-to-delete');
      expect(mockInvoke).toHaveBeenCalledWith('delete_signal', { id: 'sig-to-delete' });
    });
  });

  // ── sync log helpers ──────────────────────────────────────────────────────────

  describe('getUnsyncedLog', () => {
    it('invokes get_unsynced_log with null limit when omitted', async () => {
      mockInvoke.mockResolvedValue([]);
      await getUnsyncedLog();
      expect(mockInvoke).toHaveBeenCalledWith('get_unsynced_log', { limit: null });
    });

    it('forwards limit when provided', async () => {
      mockInvoke.mockResolvedValue([]);
      await getUnsyncedLog(50);
      expect(mockInvoke).toHaveBeenCalledWith('get_unsynced_log', { limit: 50 });
    });
  });

  describe('markSyncLogSynced', () => {
    it('invokes mark_sync_log_synced with the given id', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await markSyncLogSynced(42);
      expect(mockInvoke).toHaveBeenCalledWith('mark_sync_log_synced', { upToId: 42 });
    });
  });
});
