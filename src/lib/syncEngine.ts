/**
 * syncEngine.ts
 *
 * Multi-device sync engine for MoodBloom.
 *
 * WebDAV directory layout (under MoodBloom/):
 *   sync/manifest.enc          — encrypted SyncManifest (source of truth)
 *   sync/entries/<uuid>.enc    — per-entry encrypted JournalEntryRow JSON
 *   sync/books/<uuid>.enc      — per-book encrypted Book JSON
 *
 * Algorithm (last-write-wins by ISO updated_at string comparison):
 *   1. Download + decrypt manifest (empty manifest if 404 — first sync)
 *   2. Get local entry timestamps via `get_entry_timestamps` command
 *   3. Diff local vs remote:
 *        remote only / remote newer  → pull
 *        local only  / local  newer  → push
 *   4. Apply tombstones (entries deleted on another device)
 *   5. Sync books (presence-based; books don't carry updated_at)
 *   6. Upload updated manifest
 *
 * Encryption: each file is encrypted independently with `encrypt(json, password)`.
 * The EncryptedData struct embeds its own random salt, so any device with the
 * same password can decrypt any file — no shared salt coordination needed.
 */

import { invoke } from '@tauri-apps/api/core';
import { encrypt, decrypt } from './crypto';
import type { EncryptedData } from './crypto';
import type { WebDAVConfig } from '../types/settings';
import type { Book, MediaAttachment } from '../types/journal';
import {
  testConnection,
  ensureSyncDirectories,
  uploadFile,
  downloadFile,
  deleteFile,
} from './webdavService';
import { getDeviceId } from './deviceIdentity';
import {
  createEmptyManifest,
  encryptManifest,
  decryptManifest,
  type SyncManifest,
} from './syncManifest';

// ── WebDAV paths (relative to MoodBloom/ root) ────────────────────────────────

const MANIFEST_FILE = 'sync/manifest.enc';
const entryFile = (id: string) => `sync/entries/${id}.enc`;
const bookFile  = (id: string) => `sync/books/${id}.enc`;
const mediaFile = (id: string) => `sync/media/${id}.enc`;

// ── Public types ──────────────────────────────────────────────────────────────

/** Payload exchanged for each media file during WebDAV sync */
interface MediaSyncPayload {
  id: string;
  entryId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  dataBase64: string;
}

export interface SyncProgress {
  phase: 'connecting' | 'manifest' | 'pulling' | 'pushing' | 'media' | 'books' | 'finalizing';
  pulled: number;
  pushed: number;
  total: number;
  message: string;
}

export interface SyncResult {
  success: boolean;
  pulled: number;
  pushed: number;
  conflicts: number; // entries skipped because local was newer (not an error)
  error?: string;
  syncedAt: string;
}

export type OnSyncProgress = (p: SyncProgress) => void;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function encryptFile(data: unknown, password: string): Promise<string> {
  const result = await encrypt(JSON.stringify(data), password);
  if (!result.success || !result.data) throw new Error(result.error ?? 'Encryption failed');
  return JSON.stringify(result.data);
}

async function decryptFile<T>(raw: string, password: string): Promise<T> {
  const enc: EncryptedData = JSON.parse(raw);
  const result = await decrypt(enc, password);
  if (!result.success || !result.data) throw new Error('Decryption failed — wrong password?');
  return JSON.parse(result.data) as T;
}

// ── Main sync function ────────────────────────────────────────────────────────

export async function syncWithWebDAV(
  config: WebDAVConfig,
  password: string,
  onProgress?: OnSyncProgress,
): Promise<SyncResult> {
  const report = (
    phase: SyncProgress['phase'],
    pulled: number,
    pushed: number,
    total: number,
    message: string,
  ) => onProgress?.({ phase, pulled, pushed, total, message });

  let pulled = 0;
  let pushed = 0;
  let conflicts = 0;

  try {
    // 1. Test connection
    report('connecting', 0, 0, 0, 'Connecting to WebDAV…');
    const conn = await testConnection(config);
    if (!conn.success) throw new Error(conn.error ?? 'WebDAV connection failed');

    // 2. Ensure sync directories exist
    await ensureSyncDirectories(config);

    const deviceId = await getDeviceId();

    // 3. Download remote manifest
    report('manifest', 0, 0, 0, 'Reading remote state…');
    let manifest: SyncManifest;
    const manifestDownload = await downloadFile(config, MANIFEST_FILE);
    if (manifestDownload.success && manifestDownload.data) {
      manifest = await decryptManifest(manifestDownload.data, password);
      // Back-fill media map for manifests created before media sync was added
      if (!manifest.media) manifest.media = {};
    } else {
      // No manifest yet — first sync from this WebDAV
      manifest = createEmptyManifest(deviceId);
    }

    // 4. Get local entry timestamps
    const localMetas = await invoke<Array<{ id: string; updated_at: string }>>('get_entry_timestamps');
    const localMap = new Map(localMetas.map((m) => [m.id, m.updated_at]));

    // 5. Diff: determine what to pull and what to push
    const toPull: string[] = [];
    const toPush: string[] = [];

    for (const [id, remote] of Object.entries(manifest.entries)) {
      const localTs = localMap.get(id);
      if (!localTs) {
        toPull.push(id);               // remote has it, we don't
      } else if (remote.updatedAt > localTs) {
        toPull.push(id);               // remote is newer
      } else if (localTs > remote.updatedAt) {
        toPush.push(id);               // local is newer
        conflicts++;                   // "conflict" resolved in local's favour
      }
      // equal → nothing to do
    }

    // Local entries not in remote manifest → push
    for (const [id, localTs] of localMap) {
      if (!manifest.entries[id]) {
        toPush.push(id);
      }
      // If already in toPush from above loop, Set would dedupe — use a guard:
      // (already covered by the loop above when localTs > remote.updatedAt)
      void localTs;
    }
    // Deduplicate toPush (can appear from both loops for local-newer case)
    const toPushUniq = [...new Set(toPush)];

    // 6. Apply tombstones — entries deleted on another device
    const tombstoneIds = new Set(
      manifest.tombstones.filter((t) => t.type === 'entry').map((t) => t.id),
    );
    for (const id of tombstoneIds) {
      if (localMap.has(id)) {
        await invoke('delete_journal_entry', { id }).catch(() => {});
        localMap.delete(id);
      }
    }

    const total = toPull.length + toPushUniq.length;

    // 7. Pull remote entries
    report('pulling', 0, 0, total, `Pulling ${toPull.length} entr${toPull.length === 1 ? 'y' : 'ies'}…`);
    for (const id of toPull) {
      const dl = await downloadFile(config, entryFile(id));
      if (!dl.success || !dl.data) continue;

      try {
        const entryRow = await decryptFile<Record<string, unknown>>(dl.data, password);
        await invoke('upsert_entry_from_sync', { entryJson: JSON.stringify(entryRow) });

        const updatedAt = (entryRow.updated_at as string) ?? new Date().toISOString();
        manifest.entries[id] = { updatedAt, deviceId: manifest.entries[id]?.deviceId ?? deviceId };
        pulled++;
        report('pulling', pulled, pushed, total, `Pulled ${pulled}/${toPull.length}`);
      } catch {
        // Malformed or wrong-password entry — skip silently
      }
    }

    // 8. Push local entries
    report('pushing', pulled, 0, total, `Pushing ${toPushUniq.length} entr${toPushUniq.length === 1 ? 'y' : 'ies'}…`);
    for (const id of toPushUniq) {
      const entry = await invoke<Record<string, unknown> | null>('get_journal_entry', { id });
      if (!entry) continue;

      try {
        const fileContent = await encryptFile(entry, password);
        const ul = await uploadFile(config, entryFile(id), fileContent);
        if (!ul.success) continue;

        const updatedAt = (entry.updated_at as string) ?? new Date().toISOString();
        manifest.entries[id] = { updatedAt, deviceId };
        pushed++;
        report('pushing', pulled, pushed, total, `Pushed ${pushed}/${toPushUniq.length}`);
      } catch {
        // Skip entry on error
      }
    }

    // 9. Sync media files
    report('media', pulled, pushed, total, 'Syncing media files…');

    // Fetch all local media in a single DB call
    const allLocalMedia = await invoke<MediaAttachment[]>('list_all_media').catch(() => []);
    const remoteMediaMap = manifest.media ?? {};
    const localMediaIds = new Set(allLocalMedia.map((m) => m.id));

    // Push any local media files not yet in the remote manifest
    for (const media of allLocalMedia) {
      if (remoteMediaMap[media.id]) continue; // already uploaded
      try {
        const payload = await invoke<MediaSyncPayload>('read_media_for_sync', { mediaId: media.id });
        const ul = await uploadFile(config, mediaFile(media.id), JSON.stringify(payload));
        if (ul.success) {
          manifest.media[media.id] = {
            entryId: media.entryId,
            createdAt: media.createdAt,
            deviceId,
          };
        }
      } catch {
        // Skip individual file errors — non-fatal
      }
    }

    // Pull any remote media files we don't have locally
    for (const [mid, meta] of Object.entries(remoteMediaMap)) {
      if (localMediaIds.has(mid)) continue; // already have it
      const dl = await downloadFile(config, mediaFile(mid));
      if (!dl.success || !dl.data) continue;
      try {
        const payload = JSON.parse(dl.data) as MediaSyncPayload;
        await invoke('write_media_from_sync', {
          entryId: payload.entryId,
          mediaId: payload.id,
          filename: payload.filename,
          mimeType: payload.mimeType,
          sizeBytes: payload.sizeBytes,
          createdAt: payload.createdAt,
          dataBase64: payload.dataBase64,
        });
        localMediaIds.add(mid);
      } catch {
        // Skip
      }
      void meta;
    }

    // 11. Sync books (presence-based — no updated_at on books)
    report('books', pulled, pushed, total, 'Syncing journals…');
    const localBooks = await invoke<Book[]>('list_books');
    const localBookIds = new Set(localBooks.map((b) => b.id));

    // Push local books not in remote manifest
    for (const book of localBooks) {
      if (!manifest.books[book.id]) {
        try {
          const fileContent = await encryptFile(book, password);
          const ul = await uploadFile(config, bookFile(book.id), fileContent);
          if (ul.success) {
            manifest.books[book.id] = { updatedAt: book.created_at, deviceId };
          }
        } catch {
          // Skip
        }
      }
    }

    // Pull remote books not in local DB
    for (const [id] of Object.entries(manifest.books)) {
      if (!localBookIds.has(id)) {
        const dl = await downloadFile(config, bookFile(id));
        if (!dl.success || !dl.data) continue;
        try {
          const book = await decryptFile<Book>(dl.data, password);
          // create_book will ignore if id already exists (UNIQUE constraint)
          await invoke('create_book', {
            id: book.id,
            name: book.name,
            emoji: book.emoji,
            color: book.color,
            description: book.description ?? null,
            settings: book.settings ? JSON.stringify(book.settings) : null,
          }).catch(() => {});
        } catch {
          // Skip
        }
      }
    }

    // 12. Write updated manifest back to WebDAV
    report('finalizing', pulled, pushed, total, 'Saving sync state…');
    manifest.generatedAt = new Date().toISOString();
    manifest.deviceId = deviceId;
    const encManifest = await encryptManifest(manifest, password);
    await uploadFile(config, MANIFEST_FILE, encManifest);

    return { success: true, pulled, pushed, conflicts, syncedAt: new Date().toISOString() };

  } catch (error) {
    return {
      success: false,
      pulled,
      pushed,
      conflicts,
      error: error instanceof Error ? error.message : 'Sync failed',
      syncedAt: new Date().toISOString(),
    };
  }
}

/**
 * Record a tombstone for an entry that was deleted locally, so other devices
 * will remove it on their next sync.
 *
 * Call this after successfully deleting an entry (e.g. from EntryActionsMenu).
 * The tombstone is written into the remote manifest immediately.
 */
export async function recordTombstone(
  entryId: string,
  config: WebDAVConfig,
  password: string,
): Promise<void> {
  const manifestDownload = await downloadFile(config, MANIFEST_FILE);
  if (!manifestDownload.success || !manifestDownload.data) return;

  try {
    const manifest = await decryptManifest(manifestDownload.data, password);
    const deviceId = await getDeviceId();

    manifest.tombstones.push({
      id: entryId,
      type: 'entry',
      deletedAt: new Date().toISOString(),
      deviceId,
    });
    delete manifest.entries[entryId];
    manifest.generatedAt = new Date().toISOString();
    manifest.deviceId = deviceId;

    // Also remove the entry file from WebDAV
    await deleteFile(config, entryFile(entryId)).catch(() => {});

    const encManifest = await encryptManifest(manifest, password);
    await uploadFile(config, MANIFEST_FILE, encManifest);
  } catch {
    // Best-effort — tombstone can be re-recorded on next full sync
  }
}
