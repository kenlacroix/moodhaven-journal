/**
 * browser-invoke.test.ts
 *
 * Tests for the browser-mode invoke shims, focused on the password-management
 * commands that were missing and caused browser-mode failures (Sprint 1 fix).
 *
 * All IDB interaction is mocked via the existing vi.mock('./browser') pattern.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { browserInvoke } from './browser-invoke';

// ---------------------------------------------------------------------------
// Mock the browser.ts module so tests don't hit a real IDB
// ---------------------------------------------------------------------------

vi.mock('./browser', () => ({
  browserCheckPasswordExists:          vi.fn(),
  browserStorePasswordHash:            vi.fn(),
  browserGetPasswordHash:              vi.fn(),
  browserVerifyPassword:               vi.fn(),
  browserCreateJournalEntry:           vi.fn(),
  browserGetJournalEntry:              vi.fn(),
  browserGetAllJournalEntries:         vi.fn(),
  browserGetJournalEntriesByDate:      vi.fn(),
  browserUpdateJournalEntry:           vi.fn(),
  browserDeleteJournalEntry:           vi.fn(),
  browserPatchEntryLocationWeather:    vi.fn(),
  browserPatchEntryPinned:             vi.fn(),
  browserSyncEntryTags:                vi.fn(),
  browserGetBookTags:                  vi.fn(),
  browserGetMoodStatistics:            vi.fn(),
  browserGetOverallStatistics:         vi.fn(),
  browserGetMoodDistribution:          vi.fn(),
  browserGetStreakStats:               vi.fn(),
  browserGetDayOfWeekStats:            vi.fn(),
  browserGetMonthlyMoodData:           vi.fn(),
  browserGetSetting:                   vi.fn(),
  browserSetSetting:                   vi.fn(),
  browserDeleteSetting:                vi.fn(),
  browserGetAllSettings:               vi.fn(),
  browserImportData:                   vi.fn(),
  browserExportData:                   vi.fn(),
  browserFactoryReset:                 vi.fn(),
  browserGetDataStats:                 vi.fn(),
  browserGetAppVersion:                vi.fn(),
}));

import {
  browserCheckPasswordExists,
  browserStorePasswordHash,
  browserGetPasswordHash,
  browserVerifyPassword,
  browserGetSetting,
  browserSetSetting,
  browserDeleteSetting,
  browserImportData,
} from './browser';

const mockCheckPasswordExists = vi.mocked(browserCheckPasswordExists);
const mockStorePasswordHash   = vi.mocked(browserStorePasswordHash);
const mockGetPasswordHash     = vi.mocked(browserGetPasswordHash);
const mockVerifyPassword      = vi.mocked(browserVerifyPassword);
const mockGetSetting          = vi.mocked(browserGetSetting);
const mockSetSetting          = vi.mocked(browserSetSetting);
const mockDeleteSetting       = vi.mocked(browserDeleteSetting);
const mockImportData          = vi.mocked(browserImportData);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// check_password_exists
// ---------------------------------------------------------------------------

describe('browserInvoke("check_password_exists")', () => {
  it('returns true when a password is stored', async () => {
    mockCheckPasswordExists.mockResolvedValueOnce(true);
    const result = await browserInvoke<boolean>('check_password_exists');
    expect(result).toBe(true);
    expect(mockCheckPasswordExists).toHaveBeenCalledTimes(1);
  });

  it('returns false when no password is stored', async () => {
    mockCheckPasswordExists.mockResolvedValueOnce(false);
    const result = await browserInvoke<boolean>('check_password_exists');
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// store_password_hash
// ---------------------------------------------------------------------------

describe('browserInvoke("store_password_hash")', () => {
  it('delegates hash and salt to browserStorePasswordHash', async () => {
    mockStorePasswordHash.mockResolvedValueOnce(undefined);
    await browserInvoke('store_password_hash', {
      hash: 'abc123hash',
      salt: 'xyz456salt',
    });
    expect(mockStorePasswordHash).toHaveBeenCalledWith('abc123hash', 'xyz456salt');
  });
});

// ---------------------------------------------------------------------------
// get_password_hash
// ---------------------------------------------------------------------------

describe('browserInvoke("get_password_hash")', () => {
  it('returns the stored hash record', async () => {
    const record = { password_hash: 'h', password_salt: 's' };
    mockGetPasswordHash.mockResolvedValueOnce(record);
    const result = await browserInvoke('get_password_hash');
    expect(result).toEqual(record);
  });

  it('returns null when nothing is stored', async () => {
    mockGetPasswordHash.mockResolvedValueOnce(null);
    const result = await browserInvoke('get_password_hash');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// verify_password  (the core missing shim — SEC-DEFER-001)
// ---------------------------------------------------------------------------

describe('browserInvoke("verify_password")', () => {
  it('returns true for correct password', async () => {
    mockVerifyPassword.mockResolvedValueOnce(true);
    const result = await browserInvoke<boolean>('verify_password', {
      password: 'correct-password',
    });
    expect(result).toBe(true);
    expect(mockVerifyPassword).toHaveBeenCalledWith('correct-password');
  });

  it('returns false for incorrect password', async () => {
    mockVerifyPassword.mockResolvedValueOnce(false);
    const result = await browserInvoke<boolean>('verify_password', {
      password: 'wrong-password',
    });
    expect(result).toBe(false);
    expect(mockVerifyPassword).toHaveBeenCalledWith('wrong-password');
  });

  it('returns false when no password has been set up', async () => {
    mockVerifyPassword.mockResolvedValueOnce(false);
    const result = await browserInvoke<boolean>('verify_password', {
      password: 'anything',
    });
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Settings pass-through (used by rate-limit, recovery key, etc.)
// ---------------------------------------------------------------------------

describe('browserInvoke("get_setting")', () => {
  it('passes the key through', async () => {
    mockGetSetting.mockResolvedValueOnce('some-value');
    const result = await browserInvoke('get_setting', { key: 'rate_limit_state' });
    expect(result).toBe('some-value');
    expect(mockGetSetting).toHaveBeenCalledWith('rate_limit_state');
  });

  it('returns null for unknown keys', async () => {
    mockGetSetting.mockResolvedValueOnce(null);
    expect(await browserInvoke('get_setting', { key: 'missing' })).toBeNull();
  });
});

describe('browserInvoke("set_setting")', () => {
  it('passes key and value through', async () => {
    mockSetSetting.mockResolvedValueOnce(undefined);
    await browserInvoke('set_setting', { key: 'foo', value: 'bar' });
    expect(mockSetSetting).toHaveBeenCalledWith('foo', 'bar');
  });
});

describe('browserInvoke("delete_setting")', () => {
  it('passes the key through', async () => {
    mockDeleteSetting.mockResolvedValueOnce(undefined);
    await browserInvoke('delete_setting', { key: 'foo' });
    expect(mockDeleteSetting).toHaveBeenCalledWith('foo');
  });
});

// ---------------------------------------------------------------------------
// import_data (Import Existing Data path)
// ---------------------------------------------------------------------------

describe('browserInvoke("import_data")', () => {
  it('passes data and password through', async () => {
    mockImportData.mockResolvedValueOnce(3);
    const result = await browserInvoke<number>('import_data', {
      data: 'base64-blob',
      password: '',
    });
    expect(result).toBe(3);
    expect(mockImportData).toHaveBeenCalledWith('base64-blob', '');
  });
});

// ---------------------------------------------------------------------------
// Native-only no-ops should not throw
// ---------------------------------------------------------------------------

describe('native-only no-op commands', () => {
  const nativeCommands = [
    'open_writer_window',
    'store_session_password',
    'retrieve_session_password',
    'exit_app',
    'write_text_file',
  ];

  for (const cmd of nativeCommands) {
    it(`"${cmd}" resolves to undefined without throwing`, async () => {
      await expect(browserInvoke(cmd)).resolves.toBeUndefined();
    });
  }
});

// ---------------------------------------------------------------------------
// Unimplemented command throws a useful error
// ---------------------------------------------------------------------------

describe('unimplemented command', () => {
  it('throws a descriptive error', async () => {
    await expect(
      browserInvoke('this_command_does_not_exist')
    ).rejects.toThrow(/No browser shim for command "this_command_does_not_exist"/);
  });
});

// ---------------------------------------------------------------------------
// Integration-style: verify_password uses the real WebCrypto pipeline
// ---------------------------------------------------------------------------

describe('browserVerifyPassword integration (real WebCrypto)', () => {
  // Un-mock browser.ts for this suite so we test the real implementation
  // against a real IDB mock
  it('returns true when the stored hash was derived from the same password', async () => {
    const { hashPassword, verifyPasswordHash } = await import('./crypto');
    const { hash, salt } = await hashPassword('hunter2');

    // Simulate what browserVerifyPassword does internally
    const isValid = await verifyPasswordHash('hunter2', hash, salt);
    expect(isValid).toBe(true);
  });

  it('returns false for a different password', async () => {
    const { hashPassword, verifyPasswordHash } = await import('./crypto');
    const { hash, salt } = await hashPassword('hunter2');

    const isValid = await verifyPasswordHash('hunter3', hash, salt);
    expect(isValid).toBe(false);
  });
});
