import { invoke } from '@tauri-apps/api/core';
import { encrypt, decrypt } from './crypto';
import type { EncryptedData, CryptoResult } from './crypto';
import { encryptedExport, encryptedImport, exportData } from './dataManagementService';

vi.mock('./crypto', () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);
const mockEncrypt = vi.mocked(encrypt);
const mockDecrypt = vi.mocked(decrypt);

const fakeEncryptedData: EncryptedData = {
  ciphertext: 'encrypted-ciphertext-base64',
  iv: 'iv-base64',
  salt: 'salt-base64',
  version: 1,
};

describe('dataManagementService encryption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('encryptedExport', () => {
    it('calls export_data with password and no filter, returns envelope directly', async () => {
      const fakeEnvelope = JSON.stringify({
        format: 'moodhaven-encrypted-v1',
        payload: fakeEncryptedData,
      });
      mockInvoke.mockResolvedValueOnce(fakeEnvelope);

      const result = await encryptedExport('test-password');

      expect(mockInvoke).toHaveBeenCalledWith('export_data', {
        password: 'test-password',
        filter: null,
      });
      expect(result).toBe(fakeEnvelope);
    });

    it('returns the Rust-encrypted envelope without re-encrypting via WebCrypto', async () => {
      const fakeEnvelope = JSON.stringify({
        format: 'moodhaven-encrypted-v1',
        payload: fakeEncryptedData,
      });
      mockInvoke.mockResolvedValueOnce(fakeEnvelope);

      const result = await encryptedExport('my-password');
      const parsed = JSON.parse(result);

      expect(parsed.format).toBe('moodhaven-encrypted-v1');
      expect(parsed.payload).toEqual(fakeEncryptedData);
      expect(mockEncrypt).not.toHaveBeenCalled();
    });

    it('propagates IPC errors from Rust', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('export encryption failed'));

      await expect(encryptedExport('password')).rejects.toThrow('export encryption failed');
    });
  });

  describe('G2: exportData with filters', () => {
    it('G2-1: passes tags + moodRange filter params to invoke', async () => {
      mockInvoke.mockResolvedValueOnce('base64result');

      await exportData(undefined, { tags: ['work'], moodMin: 1, moodMax: 3 });

      expect(mockInvoke).toHaveBeenCalledWith('export_data', {
        password: null,
        filter: { tags: ['work'], moodMin: 1, moodMax: 3 },
      });
    });

    it('G2-2: exportData() with no args passes password: null, filter: null — WebDAV regression', async () => {
      mockInvoke.mockResolvedValueOnce('base64result');

      await exportData();

      expect(mockInvoke).toHaveBeenCalledWith('export_data', {
        password: null,
        filter: null,
      });
    });
  });

  describe('encryptedImport', () => {
    it('decrypts and imports encrypted export', async () => {
      const envelope = JSON.stringify({
        format: 'moodhaven-encrypted-v1',
        payload: fakeEncryptedData,
      });

      mockDecrypt.mockResolvedValueOnce({
        success: true,
        data: 'decrypted-base64-data',
      } as CryptoResult<string>);
      mockInvoke.mockResolvedValueOnce(5);

      const count = await encryptedImport(envelope, 'test-password');

      expect(count).toBe(5);
      expect(mockDecrypt).toHaveBeenCalledWith(fakeEncryptedData, 'test-password');
      expect(mockInvoke).toHaveBeenCalledWith('import_data', {
        data: 'decrypted-base64-data',
      });
    });

    it('throws when decryption fails', async () => {
      const envelope = JSON.stringify({
        format: 'moodhaven-encrypted-v1',
        payload: fakeEncryptedData,
      });

      mockDecrypt.mockResolvedValueOnce({
        success: false,
        error: 'Invalid password or corrupted data',
      } as CryptoResult<string>);

      await expect(
        encryptedImport(envelope, 'wrong-password')
      ).rejects.toThrow('Invalid password or corrupted data');
    });

    it('handles legacy base64 format (not JSON)', async () => {
      const legacyBase64 = 'notvalidjson+++';
      mockInvoke.mockResolvedValueOnce(3);

      const count = await encryptedImport(legacyBase64, 'any-password');

      expect(count).toBe(3);
      expect(mockDecrypt).not.toHaveBeenCalled();
      expect(mockInvoke).toHaveBeenCalledWith('import_data', {
        data: legacyBase64,
      });
    });

    it('handles legacy JSON format without encrypted envelope', async () => {
      const legacyJson = JSON.stringify({ version: '1.0.0', entries: [] });
      mockInvoke.mockResolvedValueOnce(2);

      const count = await encryptedImport(legacyJson, 'any-password');

      expect(count).toBe(2);
      expect(mockDecrypt).not.toHaveBeenCalled();
      expect(mockInvoke).toHaveBeenCalledWith('import_data', {
        data: legacyJson,
      });
    });
  });
});
