import { describe, it, expect, vi, afterEach } from 'vitest';
import { ensurePersistentStorage } from './storagePersistence';

function stubStorageManager(value: Partial<StorageManager> | undefined) {
  Object.defineProperty(navigator, 'storage', {
    value,
    configurable: true,
  });
}

afterEach(() => {
  // Restore whatever jsdom provides by default between tests.
  stubStorageManager(undefined);
  vi.restoreAllMocks();
});

describe('ensurePersistentStorage', () => {
  it('returns "unsupported" when the Storage Manager API is missing', async () => {
    stubStorageManager(undefined);
    expect(await ensurePersistentStorage()).toBe('unsupported');
  });

  it('returns "unsupported" when persist/persisted are not functions', async () => {
    stubStorageManager({} as StorageManager);
    expect(await ensurePersistentStorage()).toBe('unsupported');
  });

  it('returns "persisted" without re-prompting when already persisted', async () => {
    const persist = vi.fn();
    stubStorageManager({
      persisted: vi.fn().mockResolvedValue(true),
      persist,
    } as unknown as StorageManager);
    expect(await ensurePersistentStorage()).toBe('persisted');
    expect(persist).not.toHaveBeenCalled();
  });

  it('returns "persisted" when the browser grants the request', async () => {
    stubStorageManager({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(true),
    } as unknown as StorageManager);
    expect(await ensurePersistentStorage()).toBe('persisted');
  });

  it('returns "denied" when the browser declines the request', async () => {
    stubStorageManager({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(false),
    } as unknown as StorageManager);
    expect(await ensurePersistentStorage()).toBe('denied');
  });

  it('returns "unsupported" when the API throws', async () => {
    stubStorageManager({
      persisted: vi.fn().mockRejectedValue(new Error('boom')),
      persist: vi.fn(),
    } as unknown as StorageManager);
    expect(await ensurePersistentStorage()).toBe('unsupported');
  });
});
