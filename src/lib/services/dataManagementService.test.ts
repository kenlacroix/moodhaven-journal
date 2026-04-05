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
    it('returns JSON with format marker and encrypted payload', async () => {
      mockInvoke.mockResolvedValueOnce('eyJ2ZXJzaW9uIjoiMS4wLjAifQ==');
      mockEncrypt.mockResolvedValueOnce({ success: true, data: fakeEncryptedData });

      const result = await encryptedExport('test-password');
      const parsed = JSON.parse(result);

      expect(parsed.format).toBe('moodhaven-encrypted-v1');
      expect(parsed.payload).toEqual(fakeEncryptedData);
    });

    it('calls export_data with no filter', async () => {
      mockInvoke.mockResolvedValueOnce('dGVzdA==');
      mockEncrypt.mockResolvedValueOnce({ success: true, data: fakeEncryptedData });

      await encryptedExport('my-password');

      expect(mockInvoke).toHaveBeenCalledWith('export_data', { filter: null });
    });

    it('encrypts the base64 data with the provided password', async () => {
      mockInvoke.mockResolvedValueOnce('base64-export-data');
      mockEncrypt.mockResolvedValueOnce({ success: true, data: fakeEncryptedData });

      await encryptedExport('my-password');

      expect(mockEncrypt).toHaveBeenCalledWith('base64-export-data', 'my-password');
    });

    it('throws when encryption fails', async () => {
      mockInvoke.mockResolvedValueOnce('data');
      mockEncrypt.mockResolvedValueOnce({ success: false, error: 'Encryption error' });

      await expect(encryptedExport('password')).rejects.toThrow('Encryption error');
    });
  });

  describe('G2: exportData with filters', () => {
    it('G2-1: passes tags + moodRange filter params to invoke', async () => {
      mockInvoke.mockResolvedValueOnce('base64result');

      await exportData({ tags: ['work'], moodMin: 1, moodMax: 3 });

      expect(mockInvoke).toHaveBeenCalledWith('export_data', {
        filter: { tags: ['work'], moodMin: 1, moodMax: 3 },
      });
    });

    it('G2-2: exportData() with no filters passes filter: null — WebDAV regression', async () => {
      mockInvoke.mockResolvedValueOnce('base64result');

      await exportData();

      expect(mockInvoke).toHaveBeenCalledWith('export_data', {
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
