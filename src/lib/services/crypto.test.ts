// @vitest-environment node
import { encrypt, decrypt, verifyPassword, hashPassword, verifyPasswordHash, clearKeyCache } from './crypto';

// ── PBKDF2 cross-language vector ──────────────────────────────────────────────
// Verifies that TypeScript's WebCrypto PBKDF2 (hashPassword / verifyPasswordHash)
// produces the same output as Rust's pbkdf2::pbkdf2::<Hmac<Sha256>> for the same
// inputs.  The expected hash was pre-computed with the Rust implementation using
// the test in src-tauri/src/commands/journal.rs (test_verify_ascii_password_correct).
// If these diverge, verify_password (Rust) and verifyPasswordHash (TS) would
// silently disagree, meaning the unlock flow would break for affected users.
describe('PBKDF2 cross-language vector', () => {
  it('matches the Rust PBKDF2-HMAC-SHA-256 output for the same (password, salt)', async () => {
    // Known vector: password = "test123", salt = 0x6162636465666768696a6b6c6d6e6f70
    // Expected hash verified against Python hashlib.pbkdf2_hmac('sha256', b'test123', salt, 600000)
    // and cross-checked against the Rust test in journal.rs::tests::test_verify_ascii_password_correct
    const password = 'test123';
    const saltHex = '6162636465666768696a6b6c6d6e6f70'; // "abcdefghijklmnop" in hex
    const expectedHashB64 = 'PQCnBCnAGh9xK0nFfNyw4ajx4IutGSq+wYD3nrAXlPQ=';

    const saltBytes = new Uint8Array(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const saltB64 = btoa(String.fromCharCode(...saltBytes));

    const { hash } = await hashPassword(password, saltBytes);
    expect(hash).toBe(expectedHashB64);

    // verifyPasswordHash must agree
    expect(await verifyPasswordHash(password, expectedHashB64, saltB64)).toBe(true);
    expect(await verifyPasswordHash('wrong', expectedHashB64, saltB64)).toBe(false);
  }, 10_000);
});

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

  describe('session key cache', () => {
    beforeEach(() => {
      clearKeyCache();
    });

    it('cache hit: multiple encrypts with same password all decrypt correctly', async () => {
      // Regression: ISSUE-QA-001 — session key cache must return a functionally valid key on hit
      // Found by /qa on 2026-03-27
      // Report: .gstack/qa-reports/qa-report-feat-db-performance-2026-03-27.md
      const enc1 = await encrypt('entry one', 'mypassword');
      const enc2 = await encrypt('entry two', 'mypassword');
      const enc3 = await encrypt('entry three', 'mypassword');

      // All three must decrypt — verifies cache returns a valid key each time
      const d1 = await decrypt(enc1.data!, 'mypassword');
      const d2 = await decrypt(enc2.data!, 'mypassword');
      const d3 = await decrypt(enc3.data!, 'mypassword');

      expect(d1.data).toBe('entry one');
      expect(d2.data).toBe('entry two');
      expect(d3.data).toBe('entry three');
    });

    it('cache miss: different passwords derive independently', async () => {
      // Regression: ISSUE-QA-002 — different passwords must not share cache entries
      // Found by /qa on 2026-03-27
      const enc = await encrypt('secret text', 'password-A');
      const result = await decrypt(enc.data!, 'password-B');
      expect(result.success).toBe(false);
    });

    it('clearKeyCache forces re-derivation on next decrypt', async () => {
      // Regression: ISSUE-QA-003 — clearKeyCache must actually bust the cache
      // Found by /qa on 2026-03-27
      const enc = await encrypt('text', 'pass');
      // Warm up the cache
      await decrypt(enc.data!, 'pass');
      // Clear it
      clearKeyCache();
      // Must still decrypt correctly — re-derives from scratch
      const result = await decrypt(enc.data!, 'pass');
      expect(result.success).toBe(true);
      expect(result.data).toBe('text');
    });

    it('clearKeyCache prevents stale key from decrypting after password change', async () => {
      // Regression: ISSUE-QA-004 — lock (clearKeyCache) means old session key cannot decrypt new data
      // Found by /qa on 2026-03-27
      const enc = await encrypt('private journal entry', 'old-password');
      // Warm the cache with old-password
      await decrypt(enc.data!, 'old-password');
      // Simulate lock
      clearKeyCache();
      // New entry encrypted with new password — old key must not decrypt it
      const enc2 = await encrypt('new private entry', 'new-password');
      const result = await decrypt(enc2.data!, 'old-password');
      expect(result.success).toBe(false);
    });
  });
});
