// @vitest-environment node
import { encrypt, decrypt } from './crypto';
import { reKeyBatch, type ReKeyTarget } from './changePasswordService';

const OLD = 'old-password-123';
const NEW = 'new-password-456';

async function target(id: string, plaintext: string): Promise<ReKeyTarget> {
  const enc = await encrypt(plaintext, OLD);
  if (!enc.success || !enc.data) throw new Error('seed encrypt failed');
  return { id, encrypted: enc.data };
}

describe('reKeyBatch', () => {
  it('round-trips: re-keyed blobs decrypt under the new password, not the old', async () => {
    const targets = [await target('a', 'first entry'), await target('b', 'second entry')];
    const out = await reKeyBatch(targets, OLD, NEW);

    expect(out.map((o) => o.id)).toEqual(['a', 'b']);

    const a = await decrypt(out[0].encrypted, NEW);
    expect(a.success).toBe(true);
    expect(a.data).toBe('first entry');

    // The old password must no longer open the re-keyed blob.
    const stale = await decrypt(out[0].encrypted, OLD);
    expect(stale.success).toBe(false);
  });

  it('re-keying changes iv and salt (fresh envelope per blob)', async () => {
    const t = await target('c', 'payload');
    const [out] = await reKeyBatch([t], OLD, NEW);
    expect(out.encrypted.salt).not.toBe(t.encrypted.salt);
    expect(out.encrypted.iv).not.toBe(t.encrypted.iv);
  });

  it('throws (before any backend call) when the old password is wrong', async () => {
    const t = await target('d', 'payload');
    await expect(reKeyBatch([t], 'wrong-old', NEW)).rejects.toThrow();
  });

  it('a signal envelope survives a JSON.stringify round-trip (storage shape)', async () => {
    // Signals are stored as JSON.stringify(EncryptedData); re-keying must preserve that shape.
    const t = await target('s', JSON.stringify({ mood: 4 }));
    const [out] = await reKeyBatch([t], OLD, NEW);
    const restored = JSON.parse(JSON.stringify(out.encrypted));
    const dec = await decrypt(restored, NEW);
    expect(dec.success).toBe(true);
    expect(JSON.parse(dec.data as string)).toEqual({ mood: 4 });
  });
});
