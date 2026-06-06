// @vitest-environment node
import {
  createEmptyManifest,
  encryptManifest,
  decryptManifest,
  type SyncManifest,
} from './syncManifest';

vi.mock('./crypto', () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}));

import { encrypt, decrypt } from './crypto';

const mockEncrypt = vi.mocked(encrypt);
const mockDecrypt = vi.mocked(decrypt);

const fakeEncData = { iv: 'iv==', data: 'data==', salt: 'salt==' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createEmptyManifest', () => {
  it('returns a manifest with correct schema version', () => {
    const manifest = createEmptyManifest('device-001');
    expect(manifest.schemaVersion).toBe(1);
  });

  it('sets the provided deviceId', () => {
    const manifest = createEmptyManifest('my-device-id');
    expect(manifest.deviceId).toBe('my-device-id');
  });

  it('initializes empty entries, books, media maps', () => {
    const manifest = createEmptyManifest('dev');
    expect(manifest.entries).toEqual({});
    expect(manifest.books).toEqual({});
    expect(manifest.media).toEqual({});
  });

  it('initializes empty tombstones array', () => {
    const manifest = createEmptyManifest('dev');
    expect(manifest.tombstones).toEqual([]);
  });

  it('sets generatedAt to a recent ISO timestamp', () => {
    const before = Date.now();
    const manifest = createEmptyManifest('dev');
    const after = Date.now();
    const ts = new Date(manifest.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe('encryptManifest', () => {
  const sampleManifest: SyncManifest = {
    schemaVersion: 1,
    generatedAt: '2026-06-01T00:00:00Z',
    deviceId: 'dev-001',
    entries: { 'e1': { updatedAt: '2026-06-01T00:00:00Z', deviceId: 'dev-001' } },
    books: {},
    media: {},
    tombstones: [],
  };

  it('encrypts the manifest JSON and returns serialized EncryptedData', async () => {
    mockEncrypt.mockResolvedValue({ success: true, data: fakeEncData });

    const result = await encryptManifest(sampleManifest, 'password');

    expect(mockEncrypt).toHaveBeenCalledWith(JSON.stringify(sampleManifest), 'password');
    expect(result).toBe(JSON.stringify(fakeEncData));
  });

  it('throws when encryption returns failure', async () => {
    mockEncrypt.mockResolvedValue({ success: false, error: 'Crypto error' });

    await expect(encryptManifest(sampleManifest, 'pass')).rejects.toThrow('Crypto error');
  });

  it('throws when encryption returns no data', async () => {
    mockEncrypt.mockResolvedValue({ success: true, data: undefined });

    await expect(encryptManifest(sampleManifest, 'pass')).rejects.toThrow('Failed to encrypt manifest');
  });

  it('preserves manifest structure through encryption call', async () => {
    mockEncrypt.mockResolvedValue({ success: true, data: fakeEncData });

    await encryptManifest(sampleManifest, 'password');

    const encryptedJson = mockEncrypt.mock.calls[0][0] as string;
    const parsed = JSON.parse(encryptedJson) as SyncManifest;
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.entries['e1'].updatedAt).toBe('2026-06-01T00:00:00Z');
  });
});

describe('decryptManifest', () => {
  const validManifest: SyncManifest = {
    schemaVersion: 1,
    generatedAt: '2026-06-01T00:00:00Z',
    deviceId: 'dev-001',
    entries: {},
    books: {},
    media: {},
    tombstones: [],
  };
  const encryptedStr = JSON.stringify(fakeEncData);

  it('decrypts and parses manifest', async () => {
    mockDecrypt.mockResolvedValue({ success: true, data: JSON.stringify(validManifest) });

    const result = await decryptManifest(encryptedStr, 'password');

    expect(mockDecrypt).toHaveBeenCalledWith(fakeEncData, 'password');
    expect(result.schemaVersion).toBe(1);
    expect(result.deviceId).toBe('dev-001');
  });

  it('throws when decryption fails', async () => {
    mockDecrypt.mockResolvedValue({ success: false, error: 'Wrong password' });

    await expect(decryptManifest(encryptedStr, 'badpass')).rejects.toThrow(
      'Failed to decrypt sync manifest',
    );
  });

  it('throws when decryption returns no data', async () => {
    mockDecrypt.mockResolvedValue({ success: true, data: undefined });

    await expect(decryptManifest(encryptedStr, 'pass')).rejects.toThrow(
      'Failed to decrypt sync manifest',
    );
  });

  it('throws on malformed encrypted string', async () => {
    await expect(decryptManifest('not-json', 'pass')).rejects.toThrow();
  });

  it('preserves entries and tombstones', async () => {
    const withData: SyncManifest = {
      ...validManifest,
      entries: { 'abc': { updatedAt: '2026-06-01T00:00:00Z', deviceId: 'dev-001' } },
      tombstones: [{ id: 'old-entry', type: 'entry', deletedAt: '2026-05-01T00:00:00Z', deviceId: 'dev-001' }],
    };
    mockDecrypt.mockResolvedValue({ success: true, data: JSON.stringify(withData) });

    const result = await decryptManifest(encryptedStr, 'pass');

    expect(result.entries['abc'].updatedAt).toBe('2026-06-01T00:00:00Z');
    expect(result.tombstones).toHaveLength(1);
    expect(result.tombstones[0].id).toBe('old-entry');
  });
});
