/**
 * storagePersistence — request durable IndexedDB storage in the browser/PWA build.
 *
 * Browsers may evict IndexedDB under storage pressure; in the web build that means
 * losing the journal. `navigator.storage.persist()` asks the browser to exempt this
 * origin from automatic eviction. Desktop/native builds are unaffected (they use a
 * real filesystem) — callers gate this to the browser build.
 */

export type PersistenceState = 'persisted' | 'denied' | 'unsupported';

/**
 * Ensure the origin has durable storage. Returns:
 *  - `'persisted'`   — storage is (now or already) exempt from eviction
 *  - `'denied'`      — the browser declined the request (eviction still possible)
 *  - `'unsupported'` — the Storage Manager API is unavailable or threw
 *
 * Idempotent and safe to call repeatedly: if storage is already persisted it
 * short-circuits without re-prompting.
 */
export async function ensurePersistentStorage(): Promise<PersistenceState> {
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (
    !storage ||
    typeof storage.persist !== 'function' ||
    typeof storage.persisted !== 'function'
  ) {
    return 'unsupported';
  }
  try {
    if (await storage.persisted()) return 'persisted';
    return (await storage.persist()) ? 'persisted' : 'denied';
  } catch {
    return 'unsupported';
  }
}
