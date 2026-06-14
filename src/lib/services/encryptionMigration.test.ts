// Mock the crypto + journalService dependencies so the sweep's branching can be
// driven deterministically without running real PBKDF2 / holding a real session.
vi.mock('./crypto', () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}));

vi.mock('./journalService', () => ({
  isUnlocked: vi.fn(),
  getSessionPassword: vi.fn(),
  getAccountSaltBase64: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { encrypt, decrypt, type EncryptedData } from './crypto';
import {
  isUnlocked,
  getSessionPassword,
  getAccountSaltBase64,
} from './journalService';
import { migrateEntriesToAccountSalt } from './encryptionMigration';

const mockInvoke = vi.mocked(invoke);
const mockEncrypt = vi.mocked(encrypt);
const mockDecrypt = vi.mocked(decrypt);
const mockIsUnlocked = vi.mocked(isUnlocked);
const mockGetSessionPassword = vi.mocked(getSessionPassword);
const mockGetAccountSalt = vi.mocked(getAccountSaltBase64);

const ACCOUNT_SALT = 'AAAA';
const OLD_SALT = 'BBBB';

function blob(salt: string): EncryptedData {
  return { ciphertext: 'ct', iv: 'iv', salt, version: 1 };
}

function row(id: string, salt: string | null, updatedAt = '2026-01-01T00:00:00') {
  return {
    id,
    encrypted_content: salt === null ? null : blob(salt),
    updated_at: updatedAt,
  };
}

/** Wire up a "happy" unlocked session with the account salt installed. */
function armSession() {
  mockIsUnlocked.mockReturnValue(true);
  mockGetSessionPassword.mockReturnValue('pw');
  mockGetAccountSalt.mockReturnValue(ACCOUNT_SALT);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('migrateEntriesToAccountSalt', () => {
  // ── guard conditions ──────────────────────────────────────────────────────

  it('no-ops when the session is locked', async () => {
    mockIsUnlocked.mockReturnValue(false);
    await migrateEntriesToAccountSalt();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('no-ops when there is no session password', async () => {
    mockIsUnlocked.mockReturnValue(true);
    mockGetSessionPassword.mockReturnValue(null);
    await migrateEntriesToAccountSalt();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('no-ops when the account salt is not yet installed', async () => {
    mockIsUnlocked.mockReturnValue(true);
    mockGetSessionPassword.mockReturnValue('pw');
    mockGetAccountSalt.mockReturnValue(null);
    await migrateEntriesToAccountSalt();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  // ── filtering ─────────────────────────────────────────────────────────────

  it('sets the done flag and migrates nothing when every row is already on the account salt', async () => {
    armSession();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_all_journal_entries') {
        return Promise.resolve([row('a', ACCOUNT_SALT), row('b', ACCOUNT_SALT)]);
      }
      return Promise.resolve(undefined);
    });

    await migrateEntriesToAccountSalt();

    expect(mockDecrypt).not.toHaveBeenCalled();
    expect(mockEncrypt).not.toHaveBeenCalled();
    // Only patch we make is the flag write.
    expect(mockInvoke).toHaveBeenCalledWith('set_setting', {
      key: 'encryption_migration_done',
      value: '1',
    });
    expect(mockInvoke).not.toHaveBeenCalledWith(
      'patch_entry_encrypted_content',
      expect.anything()
    );
  });

  it('only migrates rows whose embedded salt differs from the account salt', async () => {
    armSession();
    mockDecrypt.mockResolvedValue({ success: true, data: 'plain' });
    mockEncrypt.mockResolvedValue({ success: true, data: blob(ACCOUNT_SALT) });
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_all_journal_entries') {
        return Promise.resolve([
          row('fresh', ACCOUNT_SALT), // already current — skipped
          row('stale', OLD_SALT), // needs migration
          row('sealed', null), // null content — filtered out
        ]);
      }
      return Promise.resolve(undefined);
    });

    await migrateEntriesToAccountSalt();

    expect(mockDecrypt).toHaveBeenCalledTimes(1);
    const patchCalls = mockInvoke.mock.calls.filter(
      (c) => c[0] === 'patch_entry_encrypted_content'
    );
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0][1]).toMatchObject({ id: 'stale' });
  });

  // ── happy path ────────────────────────────────────────────────────────────

  it('decrypts, re-encrypts, and patches a stale row, then records the done flag', async () => {
    armSession();
    mockDecrypt.mockResolvedValue({ success: true, data: 'hello' });
    mockEncrypt.mockResolvedValue({ success: true, data: blob(ACCOUNT_SALT) });
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_all_journal_entries') {
        return Promise.resolve([row('s1', OLD_SALT, '2026-02-02T00:00:00')]);
      }
      return Promise.resolve(undefined);
    });

    await migrateEntriesToAccountSalt();

    expect(mockDecrypt).toHaveBeenCalledWith(blob(OLD_SALT), 'pw');
    expect(mockEncrypt).toHaveBeenCalledWith('hello', 'pw');
    // CAS: patch carries the snapshotted updated_at so a concurrent edit no-ops server-side.
    expect(mockInvoke).toHaveBeenCalledWith('patch_entry_encrypted_content', {
      id: 's1',
      encryptedContent: blob(ACCOUNT_SALT),
      expectedUpdatedAt: '2026-02-02T00:00:00',
    });
    expect(mockInvoke).toHaveBeenCalledWith('set_setting', {
      key: 'encryption_migration_done',
      value: '1',
    });
  });

  // ── resilience: never throw, never set the flag on a dirty pass ────────────

  it('does not set the done flag when a row fails to decrypt (allClean=false)', async () => {
    armSession();
    mockDecrypt.mockResolvedValue({ success: false, error: 'wrong password' });
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_all_journal_entries') {
        return Promise.resolve([row('bad', OLD_SALT)]);
      }
      return Promise.resolve(undefined);
    });

    await migrateEntriesToAccountSalt();

    expect(mockInvoke).not.toHaveBeenCalledWith(
      'patch_entry_encrypted_content',
      expect.anything()
    );
    expect(mockInvoke).not.toHaveBeenCalledWith('set_setting', {
      key: 'encryption_migration_done',
      value: '1',
    });
  });

  it('does not set the done flag when re-encryption fails', async () => {
    armSession();
    mockDecrypt.mockResolvedValue({ success: true, data: 'plain' });
    mockEncrypt.mockResolvedValue({ success: false, error: 'enc failed' });
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_all_journal_entries') {
        return Promise.resolve([row('s', OLD_SALT)]);
      }
      return Promise.resolve(undefined);
    });

    await migrateEntriesToAccountSalt();

    expect(mockInvoke).not.toHaveBeenCalledWith(
      'patch_entry_encrypted_content',
      expect.anything()
    );
    expect(mockInvoke).not.toHaveBeenCalledWith('set_setting', {
      key: 'encryption_migration_done',
      value: '1',
    });
  });

  it('never throws when a row throws mid-migration; bad row is skipped, good row still migrates', async () => {
    armSession();
    // first row's decrypt throws, second decrypts fine
    mockDecrypt
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ success: true, data: 'ok' });
    mockEncrypt.mockResolvedValue({ success: true, data: blob(ACCOUNT_SALT) });
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_all_journal_entries') {
        return Promise.resolve([row('boom', OLD_SALT), row('good', OLD_SALT)]);
      }
      return Promise.resolve(undefined);
    });

    await expect(migrateEntriesToAccountSalt()).resolves.toBeUndefined();

    const patchIds = mockInvoke.mock.calls
      .filter((c) => c[0] === 'patch_entry_encrypted_content')
      .map((c) => (c[1] as { id: string }).id);
    expect(patchIds).toContain('good');
    expect(patchIds).not.toContain('boom');
    // A bad row makes the pass dirty → flag is NOT recorded.
    expect(mockInvoke).not.toHaveBeenCalledWith('set_setting', {
      key: 'encryption_migration_done',
      value: '1',
    });
  });

  // ── idempotency ───────────────────────────────────────────────────────────

  it('is cheap on re-run: a second clean pass touches no rows', async () => {
    armSession();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_all_journal_entries') {
        return Promise.resolve([row('a', ACCOUNT_SALT)]);
      }
      return Promise.resolve(undefined);
    });

    await migrateEntriesToAccountSalt();
    await migrateEntriesToAccountSalt();

    expect(mockDecrypt).not.toHaveBeenCalled();
    expect(mockEncrypt).not.toHaveBeenCalled();
    const patchCalls = mockInvoke.mock.calls.filter(
      (c) => c[0] === 'patch_entry_encrypted_content'
    );
    expect(patchCalls).toHaveLength(0);
  });
});
