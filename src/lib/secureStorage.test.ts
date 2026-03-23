/**
 * secureStorage — unit tests
 *
 * Verifies that secureSet encrypts values before storing and secureGet
 * decrypts them correctly, including the plaintext-fallback migration path.
 */

import { invoke } from '@tauri-apps/api/core';

// Must mock before importing the module under test
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('./crypto', () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}));

import { secureSet, secureGet, isEncrypted } from './secureStorage';
import { encrypt, decrypt } from './crypto';

const mockInvoke = vi.mocked(invoke);
const mockEncrypt = vi.mocked(encrypt);
const mockDecrypt = vi.mocked(decrypt);

const PASSWORD = 'test-password-123';
const PLAINTEXT = 'sk-proj-abc123';
const MARKER = '__enc_v1:';
const FAKE_ENC_DATA = { ciphertext: 'abc', iv: 'def', salt: 'ghi', version: 1 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('secureSet', () => {
  it('encrypts the value and stores with MARKER prefix', async () => {
    mockEncrypt.mockResolvedValue({ success: true, data: FAKE_ENC_DATA });

    await secureSet('my_key', PLAINTEXT, PASSWORD);

    expect(mockEncrypt).toHaveBeenCalledWith(PLAINTEXT, PASSWORD);
    expect(mockInvoke).toHaveBeenCalledWith('set_setting', {
      key: 'my_key',
      value: MARKER + JSON.stringify(FAKE_ENC_DATA),
    });
  });

  it('throws if encryption fails', async () => {
    mockEncrypt.mockResolvedValue({ success: false });
    await expect(secureSet('my_key', PLAINTEXT, PASSWORD)).rejects.toThrow('encryption failed');
  });
});

describe('secureGet', () => {
  it('returns null when no value is stored', async () => {
    mockInvoke.mockResolvedValue(null);
    const result = await secureGet('my_key', PASSWORD);
    expect(result).toBeNull();
  });

  it('decrypts an encrypted blob', async () => {
    const stored = MARKER + JSON.stringify(FAKE_ENC_DATA);
    mockInvoke.mockResolvedValue(stored);
    mockDecrypt.mockResolvedValue({ success: true, data: PLAINTEXT });

    const result = await secureGet('my_key', PASSWORD);

    expect(mockDecrypt).toHaveBeenCalledWith(FAKE_ENC_DATA, PASSWORD);
    expect(result).toBe(PLAINTEXT);
  });

  it('returns null when decryption fails (wrong password)', async () => {
    const stored = MARKER + JSON.stringify(FAKE_ENC_DATA);
    mockInvoke.mockResolvedValue(stored);
    mockDecrypt.mockResolvedValue({ success: false });

    const result = await secureGet('my_key', 'wrong-password');
    expect(result).toBeNull();
  });

  it('returns plaintext as-is for migration (no MARKER)', async () => {
    mockInvoke.mockResolvedValue(PLAINTEXT);

    const result = await secureGet('my_key', PASSWORD);

    expect(mockDecrypt).not.toHaveBeenCalled();
    expect(result).toBe(PLAINTEXT);
  });

  it('returns null when decrypt throws (malformed blob)', async () => {
    mockInvoke.mockResolvedValue(MARKER + 'not-valid-json{{{');

    const result = await secureGet('my_key', PASSWORD);
    expect(result).toBeNull();
  });
});

describe('isEncrypted', () => {
  it('returns true for MARKER-prefixed value', async () => {
    mockInvoke.mockResolvedValue(MARKER + JSON.stringify(FAKE_ENC_DATA));
    expect(await isEncrypted('my_key')).toBe(true);
  });

  it('returns false for plaintext value', async () => {
    mockInvoke.mockResolvedValue(PLAINTEXT);
    expect(await isEncrypted('my_key')).toBe(false);
  });

  it('returns false when no value stored', async () => {
    mockInvoke.mockResolvedValue(null);
    expect(await isEncrypted('my_key')).toBe(false);
  });
});
