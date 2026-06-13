// @vitest-environment node
import { generateRecoveryKey, wrapPasswordForRecovery } from './recoveryKeyService';
import { decrypt, type EncryptedData } from './crypto';

describe('recoveryKeyService', () => {
  describe('wrapPasswordForRecovery', () => {
    it('produces an escrow blob that the recovery key (dashes/case-insensitive) decrypts', async () => {
      const key = generateRecoveryKey();
      const blob = await wrapPasswordForRecovery(key, 'new-master-pw');
      const parsed = JSON.parse(blob) as EncryptedData;
      // Recovery codes are normalized (dashes stripped, uppercased) before use as the key.
      const dec = await decrypt(parsed, key.replace(/-/g, '').toUpperCase());
      expect(dec.success).toBe(true);
      expect(dec.data).toBe('new-master-pw');
    });

    it('does not decrypt under the wrong recovery key', async () => {
      const blob = await wrapPasswordForRecovery(generateRecoveryKey(), 'pw');
      const parsed = JSON.parse(blob) as EncryptedData;
      const dec = await decrypt(parsed, 'WRONGWRONGWRONGWRONGWRON');
      expect(dec.success).toBe(false);
    });
  });

  describe('generateRecoveryKey', () => {
    it('uses crypto.getRandomValues, not Math.random', () => {
      const spy = vi.spyOn(crypto, 'getRandomValues');
      const mathSpy = vi.spyOn(Math, 'random');
      generateRecoveryKey();
      expect(spy).toHaveBeenCalled();
      expect(mathSpy).not.toHaveBeenCalled();
      spy.mockRestore();
      mathSpy.mockRestore();
    });


    it('returns string in XXXX-XXXX-XXXX-XXXX-XXXX-XXXX format', () => {
      const key = generateRecoveryKey();
      expect(key).toMatch(
        /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/
      );
    });

    it('has exactly 6 groups separated by dashes', () => {
      const key = generateRecoveryKey();
      const groups = key.split('-');
      expect(groups).toHaveLength(6);
    });

    it('each group has exactly 4 characters', () => {
      const key = generateRecoveryKey();
      const groups = key.split('-');
      for (const group of groups) {
        expect(group).toHaveLength(4);
      }
    });

    it('excludes ambiguous characters (0, O, 1, I)', () => {
      // Generate many keys to increase confidence
      for (let i = 0; i < 50; i++) {
        const key = generateRecoveryKey();
        const chars = key.replace(/-/g, '');
        expect(chars).not.toContain('0');
        expect(chars).not.toContain('O');
        expect(chars).not.toContain('1');
        expect(chars).not.toContain('I');
      }
    });

    it('total length is 29 (24 chars + 5 dashes)', () => {
      const key = generateRecoveryKey();
      expect(key).toHaveLength(29);
    });

    it('generates different keys on each call', () => {
      const key1 = generateRecoveryKey();
      const key2 = generateRecoveryKey();
      expect(key1).not.toBe(key2);
    });

    it('contains only uppercase alphanumeric characters (excluding ambiguous)', () => {
      const key = generateRecoveryKey();
      const chars = key.replace(/-/g, '');
      const validChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for (const char of chars) {
        expect(validChars).toContain(char);
      }
    });
  });
});
