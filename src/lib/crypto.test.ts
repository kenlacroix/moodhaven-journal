// @vitest-environment node
import { encrypt, decrypt, verifyPassword, hashPassword, verifyPasswordHash } from './crypto';

describe('crypto', () => {
  // Note: These tests use real WebCrypto with PBKDF2 (600K iterations).
  // Each encrypt/decrypt may take 100-500ms. This is expected and correct.

  describe('encrypt', () => {
    it('returns success with valid plaintext and password', async () => {
      const result = await encrypt('hello world', 'test-password');
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('returns EncryptedData with ciphertext, iv, salt, version', async () => {
      const result = await encrypt('hello world', 'test-password');
      expect(result.data!.ciphertext).toBeTruthy();
      expect(result.data!.iv).toBeTruthy();
      expect(result.data!.salt).toBeTruthy();
      expect(result.data!.version).toBe(1);
    });

    it('returns failure when plaintext is empty', async () => {
      const result = await encrypt('', 'password');
      expect(result.success).toBe(false);
    });

    it('returns failure when password is empty', async () => {
      const result = await encrypt('hello', '');
      expect(result.success).toBe(false);
    });

    it('produces different ciphertext for same input (random IV/salt)', async () => {
      const r1 = await encrypt('hello', 'password');
      const r2 = await encrypt('hello', 'password');
      expect(r1.data!.ciphertext).not.toBe(r2.data!.ciphertext);
    });
  });

  describe('decrypt', () => {
    it('successfully decrypts data encrypted with same password', async () => {
      const encrypted = await encrypt('hello world', 'my-secret');
      const decrypted = await decrypt(encrypted.data!, 'my-secret');
      expect(decrypted.success).toBe(true);
      expect(decrypted.data).toBe('hello world');
    });

    it('returns failure with wrong password', async () => {
      const encrypted = await encrypt('hello world', 'correct-password');
      const decrypted = await decrypt(encrypted.data!, 'wrong-password');
      expect(decrypted.success).toBe(false);
    });

    it('returns descriptive error for wrong password', async () => {
      const encrypted = await encrypt('hello', 'right');
      const decrypted = await decrypt(encrypted.data!, 'wrong');
      expect(decrypted.error).toContain('Invalid password');
    });

    it('returns failure when password is empty', async () => {
      const encrypted = await encrypt('hello', 'password');
      const decrypted = await decrypt(encrypted.data!, '');
      expect(decrypted.success).toBe(false);
    });
  });

  describe('encrypt + decrypt round-trip', () => {
    it('preserves ASCII plaintext', async () => {
      const text = 'The quick brown fox jumps over the lazy dog';
      const encrypted = await encrypt(text, 'pass');
      const decrypted = await decrypt(encrypted.data!, 'pass');
      expect(decrypted.data).toBe(text);
    });

    it('preserves Unicode content (emoji)', async () => {
      const text = 'I feel 😊 today! 日本語テスト';
      const encrypted = await encrypt(text, 'pass');
      const decrypted = await decrypt(encrypted.data!, 'pass');
      expect(decrypted.data).toBe(text);
    });

    it('preserves long content', async () => {
      const text = 'a'.repeat(10000);
      const encrypted = await encrypt(text, 'pass');
      const decrypted = await decrypt(encrypted.data!, 'pass');
      expect(decrypted.data).toBe(text);
    });

    it('preserves special characters', async () => {
      const text = '<script>alert("xss")</script> & "quotes" \'single\' `backticks`';
      const encrypted = await encrypt(text, 'pass');
      const decrypted = await decrypt(encrypted.data!, 'pass');
      expect(decrypted.data).toBe(text);
    });
  });

  describe('verifyPassword', () => {
    it('returns true for correct password', async () => {
      const encrypted = await encrypt('secret data', 'correct');
      expect(await verifyPassword(encrypted.data!, 'correct')).toBe(true);
    });

    it('returns false for incorrect password', async () => {
      const encrypted = await encrypt('secret data', 'correct');
      expect(await verifyPassword(encrypted.data!, 'incorrect')).toBe(false);
    });
  });

  describe('hashPassword', () => {
    it('produces hash and salt strings', async () => {
      const { hash, salt } = await hashPassword('test-password');
      expect(hash).toBeTruthy();
      expect(salt).toBeTruthy();
      expect(typeof hash).toBe('string');
      expect(typeof salt).toBe('string');
    });

    it('same password with different salt produces different hash', async () => {
      const r1 = await hashPassword('same-password');
      const r2 = await hashPassword('same-password');
      // Different random salts -> different hashes
      expect(r1.hash).not.toBe(r2.hash);
    });
  });

  describe('verifyPasswordHash', () => {
    it('returns true for correct password', async () => {
      const { hash, salt } = await hashPassword('my-password');
      expect(await verifyPasswordHash('my-password', hash, salt)).toBe(true);
    });

    it('returns false for incorrect password', async () => {
      const { hash, salt } = await hashPassword('my-password');
      expect(await verifyPasswordHash('wrong-password', hash, salt)).toBe(false);
    });

    it('returns false for near-miss password', async () => {
      const { hash, salt } = await hashPassword('password123');
      expect(await verifyPasswordHash('password124', hash, salt)).toBe(false);
    });
  });
});
