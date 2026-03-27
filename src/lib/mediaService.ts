/**
 * Media attachment service for MoodHaven Journal
 *
 * IPC wrappers around the Rust media commands.
 * All crypto (encrypt/decrypt) happens Rust-side; this module
 * handles file picking, calling commands, and returning typed results.
 */

import { invoke } from '@tauri-apps/api/core';
import { open as openFilePicker } from '@tauri-apps/plugin-dialog';
import type { MediaAttachment } from '../types/journal';

// Dialog filter groups
const MEDIA_FILTERS = [
  {
    name: 'Images',
    extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'],
  },
  {
    name: 'PDF Documents',
    extensions: ['pdf'],
  },
  {
    name: 'Audio',
    extensions: ['mp3', 'm4a', 'ogg', 'wav', 'flac'],
  },
  {
    name: 'Video',
    extensions: ['mp4', 'mov', 'webm'],
  },
];

/**
 * Open the system file picker, let the user choose one or more media files,
 * then encrypt and attach each to the given entry.
 *
 * Returns the newly created MediaAttachment records (one per file).
 * Files that exceed the size limit are skipped and reported in `skipped`.
 */
export async function pickAndAttachMedia(
  entryId: string,
  password: string,
): Promise<{ attached: MediaAttachment[]; skipped: string[] }> {
  const selected = await openFilePicker({
    multiple: true,
    filters: MEDIA_FILTERS,
  });

  if (!selected) return { attached: [], skipped: [] };

  const paths = Array.isArray(selected) ? selected : [selected];
  const attached: MediaAttachment[] = [];
  const skipped: string[] = [];

  for (const filePath of paths) {
    try {
      const attachment = await invoke<MediaAttachment>('save_media_attachment', {
        entryId,
        filePath,
        password,
      });
      attached.push(attachment);
    } catch (err) {
      const msg = String(err);
      // Surface size-limit errors from the dialog layer (future: pre-check with fs stat)
      skipped.push(msg);
    }
  }

  return { attached, skipped };
}

/** List all media attachments for an entry. */
export async function listEntryMedia(entryId: string): Promise<MediaAttachment[]> {
  return invoke<MediaAttachment[]>('list_entry_media', { entryId });
}

/** List all media attachments across all entries (used in timeline + export). */
export async function listAllMedia(): Promise<MediaAttachment[]> {
  return invoke<MediaAttachment[]>('list_all_media');
}

/**
 * Decrypt a media file to a temp location and open it with the system viewer.
 * The temp file is automatically deleted after 60 seconds.
 */
export async function openMedia(mediaId: string, password: string): Promise<void> {
  return invoke('open_media_attachment', { mediaId, password });
}

/**
 * Decrypt an image attachment and return a data URL for use in <img> elements.
 * Returns null for non-image attachments or if decryption fails.
 */
export async function getMediaThumbnail(
  mediaId: string,
  password: string,
): Promise<string | null> {
  try {
    const base64 = await invoke<string>('get_media_thumbnail', { mediaId, password });
    return `data:image/jpeg;base64,${base64}`;
  } catch {
    return null;
  }
}

/** Delete a media attachment (file + DB record). */
export async function deleteMedia(mediaId: string): Promise<void> {
  return invoke('delete_media_attachment', { mediaId });
}
