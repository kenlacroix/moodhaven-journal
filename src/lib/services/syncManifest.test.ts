// @vitest-environment node
import {
  createEmptyManifest,
  encryptManifest,
  decryptManifest,
  type SyncManifest,
} from './syncManifest';

// syncManifest uses real AES-256-GCM encryption via WebCrypto (PBKDF2).
// These tests run in the node environment where node:crypto is available.

const PASSWORD = 'test-manifest-password';

describe('createEmptyManifest', () => {
  it('creates a manifest with the given deviceId', () => {
    const m = createEmptyManifest('device-abc');
    expect(m.deviceId).toBe('device-abc');
    expect(m.schemaVersion).toBe(1);
  });

  it('initialises all collections as empty', () => {
    const m = createEmptyManifest('dev');
    expect(m.entries).toEqual({});
    expect(m.books).toEqual({});
    expect(m.media).toEqual({});
    expect(m.tombstones).toEqual([]);
  });

  it('sets generatedAt to a valid ISO timestamp close to now', () => {
    const before = Date.now();
    const m = createEmptyManifest('dev');
    const after = Date.now();
    const ts = new Date(m.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe('encryptManifest / decryptManifest round-trip', () => {
  it('decryptManifest returns the original manifest', async () => {
    const manifest = createEmptyManifest('device-xyz');
    manifest.entries['entry-1'] = {
      updatedAt: '2026-01-01T00:00:00.000Z',
      deviceId: 'device-xyz',
    };
    manifest.tombstones.push({
      id: 'deleted-entry',
      type: 'entry',
      deletedAt: '2026-01-01T00:00:00.000Z',
      deviceId: 'device-xyz',
    });
    manifest.media['media-1'] = {
      entryId: 'entry-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      deviceId: 'device-xyz',
    };

    const encrypted = await encryptManifest(manifest, PASSWORD);
    const decrypted = await decryptManifest(encrypted, PASSWORD);

    expect(decrypted.deviceId).toBe('device-xyz');
    expect(decrypted.schemaVersion).toBe(1);
    expect(decrypted.entries['entry-1'].updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(decrypted.tombstones).toHaveLength(1);
    expect(decrypted.tombstones[0].id).toBe('deleted-entry');
    expect(decrypted.media['media-1'].entryId).toBe('entry-1');
  }, 20_000);

  it('produces different ciphertext on each call (random IV)', async () => {
    const manifest = createEmptyManifest('dev');
    const enc1 = await encryptManifest(manifest, PASSWORD);
    const enc2 = await encryptManifest(manifest, PASSWORD);
    expect(enc1).not.toBe(enc2);
  }, 20_000);

  it('outputs valid JSON that can be re-parsed', async () => {
    const manifest = createEmptyManifest('dev');
    const encrypted = await encryptManifest(manifest, PASSWORD);
    expect(() => JSON.parse(encrypted)).not.toThrow();
    const parsed = JSON.parse(encrypted) as SyncManifest;
    // It should be an EncryptedData blob, not the raw manifest
    expect(parsed).not.toHaveProperty('schemaVersion');
    expect(parsed).toHaveProperty('ciphertext');
  }, 20_000);
});

describe('decryptManifest error paths', () => {
  it('throws when wrong password is used', async () => {
    const manifest = createEmptyManifest('dev');
    const encrypted = await encryptManifest(manifest, PASSWORD);
    await expect(decryptManifest(encrypted, 'wrong-password')).rejects.toThrow();
  }, 20_000);

  it('throws on completely invalid JSON input', async () => {
    await expect(decryptManifest('not-json-at-all', PASSWORD)).rejects.toThrow();
  });

  it('throws on valid JSON that is not an EncryptedData blob', async () => {
    // A plain manifest JSON is not an encrypted blob
    const plain = JSON.stringify(createEmptyManifest('dev'));
    await expect(decryptManifest(plain, PASSWORD)).rejects.toThrow();
  }, 20_000);
});
