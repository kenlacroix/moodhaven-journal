/**
 * Media attachment service for MoodHaven Journal
 *
 * IPC wrappers around the Rust media commands.
 * All crypto (encrypt/decrypt) happens Rust-side; this module
 * handles file picking, calling commands, and returning typed results.
 */

import { invoke } from '@tauri-apps/api/core';
import { open as openFilePicker } from '@tauri-apps/plugin-dialog';
import type { MediaAttachment } from '../../types/journal';

const IS_ANDROID =
  typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

/** Base64-encode bytes in 32 KB chunks to avoid call-stack overflow on large images. */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + CHUNK) as unknown as number[],
    );
  }
  return btoa(binary);
}

/**
 * Best-effort filename from a picked path or content:// URI.
 * Takes the last `/` segment (URL-decoded), strips any path separators / `..`,
 * and falls back to `attachment-<index>` when nothing usable remains.
 * The Rust side validates the final name (no separators / traversal).
 */
function deriveFilename(filePath: string, index: number): string {
  let segment = filePath.split(/[/\\]/).pop() ?? '';
  try {
    segment = decodeURIComponent(segment);
  } catch {
    // leave segment as-is if it isn't valid percent-encoding
  }
  // Drop anything that still looks like a path separator or traversal.
  segment = segment.replace(/[/\\]/g, '').replace(/\.\./g, '');
  return segment.trim() || `attachment-${index}`;
}

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

  for (let i = 0; i < paths.length; i++) {
    const filePath = paths[i];
    try {
      let attachment: MediaAttachment;
      if (IS_ANDROID) {
        // Android's picker returns a content:// URI, not a filesystem path —
        // std::fs::read fails on it. Read the bytes via the fs plugin (which
        // resolves content:// URIs on Android) and send them base64-encoded.
        const { readFile } = await import('@tauri-apps/plugin-fs');
        const bytes = await readFile(filePath);
        const dataBase64 = bytesToBase64(bytes);
        const filename = deriveFilename(filePath, i);
        attachment = await invoke<MediaAttachment>('save_media_attachment_bytes', {
          entryId,
          filename,
          dataBase64,
          password,
        });
      } else {
        attachment = await invoke<MediaAttachment>('save_media_attachment', {
          entryId,
          filePath,
          password,
        });
      }
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
 *
 * Desktop opens the file in the Rust command and returns an empty string. Android
 * has no native launcher, so Rust returns the temp path and we fire an
 * ACTION_VIEW intent via the `opener` plugin (FileProvider).
 */
export async function openMedia(mediaId: string, password: string): Promise<void> {
  const path = await invoke<string>('open_media_attachment', { mediaId, password });
  if (path) {
    await invoke('plugin:opener|openFile', { path });
  }
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
