/**
 * Encryption migration — bring existing entries onto the per-account PBKDF2 salt.
 *
 * Historical entries were each encrypted with a random per-entry salt, so unlock used to
 * re-run a full 600k-iteration PBKDF2 derivation for *every* entry (a cache miss per blob).
 * Once `initAccountEncryption()` installs a stable per-account salt, newly written blobs all
 * share it and the derived key is cached for the whole session. This sweep migrates the old
 * blobs in the background so the cache benefit eventually covers the entire journal.
 *
 * Crash-safety / idempotency:
 *  - Each entry is migrated independently: decrypt under the session password, re-encrypt
 *    (encrypt() now stamps the account salt), then patch ONLY that row's encrypted_content
 *    (updated_at preserved). A crash mid-sweep leaves already-migrated rows on the account
 *    salt and the rest on their old salts — both still decrypt (decrypt() reads each blob's
 *    own salt), so there is no half-written / corrupt state.
 *  - Rows already on the account salt are skipped, so re-running is cheap and safe.
 *  - The `encryption_migration_done` flag is set ONLY after a full clean pass. It is purely an
 *    optimization to skip the fetch on subsequent unlocks; the sweep is correct even if the
 *    flag is stale (e.g. set then a new old-salt entry arrives via sync), so we still run a
 *    pass and only short-circuit when nothing needs migrating.
 *  - Undecryptable rows (sealed/null content, wrong-password blobs synced from a device with a
 *    different password) are caught and skipped — the loop never throws.
 */
import { invoke } from '@tauri-apps/api/core';
import { encrypt, decrypt, type EncryptedData } from './crypto';
import { isUnlocked, getSessionPassword, getAccountSaltBase64 } from './journalService';

interface RawEntryRow {
  id: string;
  encrypted_content: EncryptedData | null;
  updated_at: string;
}

const MIGRATION_CONCURRENCY = 4;
const MIGRATION_DONE_KEY = 'encryption_migration_done';

async function mapConcurrent<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Migrate every entry still on a random per-entry salt onto the stable account salt.
 * No-op if the session is locked or the account salt is not yet set. Fire-and-forget:
 * callers must not await this on the unlock-transition critical path.
 */
export async function migrateEntriesToAccountSalt(): Promise<void> {
  if (!isUnlocked()) return;
  const password = getSessionPassword();
  if (!password) return;
  const accountSalt = getAccountSaltBase64();
  if (!accountSalt) return;

  const rows = await invoke<RawEntryRow[]>('get_all_journal_entries', {});

  // Only rows that carry an embedded salt different from the account salt need migrating.
  const stale = rows.filter(
    (r) => r.encrypted_content && r.encrypted_content.salt !== accountSalt
  );

  if (stale.length === 0) {
    await invoke('set_setting', { key: MIGRATION_DONE_KEY, value: '1' }).catch(() => {});
    return;
  }

  let allClean = true;
  await mapConcurrent(stale, MIGRATION_CONCURRENCY, async (row) => {
    const blob = row.encrypted_content;
    if (!blob) return;
    try {
      const dec = await decrypt(blob, password);
      if (!dec.success || dec.data === undefined) {
        // Sealed marker, wrong-password (cross-device) blob, or corrupt — leave as-is.
        allClean = false;
        return;
      }
      const enc = await encrypt(dec.data, password);
      if (!enc.success || !enc.data) {
        allClean = false;
        return;
      }
      // Compare-and-swap on the snapshot's updated_at: if the user edited this row
      // since the snapshot, the patch no-ops (returns false) and we leave their edit
      // alone. Such a row was already re-saved with the account salt anyway (encrypt
      // stamps it once the salt is installed), so skipping it loses nothing.
      await invoke('patch_entry_encrypted_content', {
        id: row.id,
        encryptedContent: enc.data,
        expectedUpdatedAt: row.updated_at,
      });
    } catch {
      // Never throw out of the sweep — skip and continue so one bad row can't strand the rest.
      allClean = false;
    }
  });

  // Only record completion when the whole pass migrated cleanly, so a crashed/partial pass
  // (or a skipped undecryptable row) leaves the flag unset and the sweep retries next unlock.
  if (allClean) {
    await invoke('set_setting', { key: MIGRATION_DONE_KEY, value: '1' }).catch(() => {});
  }
}
