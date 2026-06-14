import { invoke } from '@tauri-apps/api/core';
import { open as openFilePicker } from '@tauri-apps/plugin-dialog';
import type { MediaAttachment } from '../../types/journal';

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(openFilePicker);

const fakeAttachment: MediaAttachment = {
  id: 'media-1',
  entryId: 'entry-1',
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 1234,
  encPath: 'media/entry-1/media-1.jpg.enc',
  createdAt: '2026-06-14T00:00:00',
};

/**
 * `IS_ANDROID` is computed once at module load from `navigator.userAgent`.
 * To exercise each branch we stub the UA, reset the module registry, then
 * dynamically import a fresh copy of the service.
 */
async function loadService(userAgent: string) {
  vi.resetModules();
  Object.defineProperty(navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  });
  return import('./mediaService');
}

const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) Tauri';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Tauri';

describe('mediaService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock('@tauri-apps/plugin-fs');
  });

  describe('pickAndAttachMedia — picker dismissed', () => {
    it('returns empty result when the picker is cancelled (null)', async () => {
      const { pickAndAttachMedia } = await loadService(DESKTOP_UA);
      mockOpen.mockResolvedValueOnce(null);

      const result = await pickAndAttachMedia('entry-1', 'pw');

      expect(result).toEqual({ attached: [], skipped: [] });
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  describe('pickAndAttachMedia — desktop path', () => {
    it('calls save_media_attachment with the picked filePath', async () => {
      const { pickAndAttachMedia } = await loadService(DESKTOP_UA);
      mockOpen.mockResolvedValueOnce('/home/user/pics/photo.jpg');
      mockInvoke.mockResolvedValueOnce(fakeAttachment);

      const result = await pickAndAttachMedia('entry-1', 'secret');

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockInvoke).toHaveBeenCalledWith('save_media_attachment', {
        entryId: 'entry-1',
        filePath: '/home/user/pics/photo.jpg',
        password: 'secret',
      });
      expect(result.attached).toEqual([fakeAttachment]);
      expect(result.skipped).toEqual([]);
    });

    it('normalises a single selection and handles multiple files', async () => {
      const { pickAndAttachMedia } = await loadService(DESKTOP_UA);
      mockOpen.mockResolvedValueOnce(['/a/one.png', '/a/two.png']);
      mockInvoke
        .mockResolvedValueOnce({ ...fakeAttachment, id: 'm1' })
        .mockResolvedValueOnce({ ...fakeAttachment, id: 'm2' });

      const result = await pickAndAttachMedia('entry-1', 'pw');

      expect(mockInvoke).toHaveBeenCalledTimes(2);
      expect(mockInvoke).toHaveBeenNthCalledWith(1, 'save_media_attachment', {
        entryId: 'entry-1',
        filePath: '/a/one.png',
        password: 'pw',
      });
      expect(result.attached).toHaveLength(2);
    });

    it('collects per-file errors in `skipped` and keeps going', async () => {
      const { pickAndAttachMedia } = await loadService(DESKTOP_UA);
      mockOpen.mockResolvedValueOnce(['/a/bad.png', '/a/ok.png']);
      mockInvoke
        .mockRejectedValueOnce('File too large (600 MB, max 500 MB)')
        .mockResolvedValueOnce(fakeAttachment);

      const result = await pickAndAttachMedia('entry-1', 'pw');

      expect(result.attached).toEqual([fakeAttachment]);
      expect(result.skipped).toEqual(['File too large (600 MB, max 500 MB)']);
    });
  });

  describe('pickAndAttachMedia — Android path', () => {
    it('reads bytes via plugin-fs, base64-encodes, and calls save_media_attachment_bytes', async () => {
      const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
      const readFile = vi.fn().mockResolvedValue(bytes);
      vi.doMock('@tauri-apps/plugin-fs', () => ({ readFile }));

      const { pickAndAttachMedia } = await loadService(ANDROID_UA);
      // Android picker returns a content:// URI with the filename as the last segment.
      mockOpen.mockResolvedValueOnce(
        'content://media/external/images/photo%20one.jpg',
      );
      mockInvoke.mockResolvedValueOnce(fakeAttachment);

      const result = await pickAndAttachMedia('entry-1', 'pw');

      expect(readFile).toHaveBeenCalledWith(
        'content://media/external/images/photo%20one.jpg',
      );
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      const [cmd, args] = mockInvoke.mock.calls[0] as [string, Record<string, unknown>];
      expect(cmd).toBe('save_media_attachment_bytes');
      expect(args.entryId).toBe('entry-1');
      expect(args.password).toBe('pw');
      // Filename derived from the URI: last segment, URL-decoded, separators stripped.
      expect(args.filename).toBe('photo one.jpg');
      // base64 of [0,1,2,253,254,255]
      expect(args.dataBase64).toBe(btoa('\x00\x01\x02\xfd\xfe\xff'));
      expect(result.attached).toEqual([fakeAttachment]);
    });

    it('falls back to attachment-<index> when the URI has no usable name', async () => {
      const readFile = vi.fn().mockResolvedValue(new Uint8Array([1]));
      vi.doMock('@tauri-apps/plugin-fs', () => ({ readFile }));

      const { pickAndAttachMedia } = await loadService(ANDROID_UA);
      mockOpen.mockResolvedValueOnce(['content://x/..']);
      mockInvoke.mockResolvedValueOnce(fakeAttachment);

      await pickAndAttachMedia('entry-1', 'pw');

      const [, args] = mockInvoke.mock.calls[0] as [string, Record<string, unknown>];
      expect(args.filename).toBe('attachment-0');
    });

    it('records a read failure in `skipped` without calling invoke', async () => {
      const readFile = vi.fn().mockRejectedValue(new Error('content read denied'));
      vi.doMock('@tauri-apps/plugin-fs', () => ({ readFile }));

      const { pickAndAttachMedia } = await loadService(ANDROID_UA);
      mockOpen.mockResolvedValueOnce('content://x/a.jpg');

      const result = await pickAndAttachMedia('entry-1', 'pw');

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(result.attached).toEqual([]);
      expect(result.skipped).toEqual(['Error: content read denied']);
    });

    it('base64-encodes large byte arrays across chunk boundaries', async () => {
      // 0x8000 + a few bytes forces more than one chunk through bytesToBase64.
      const big = new Uint8Array(0x8000 + 5).fill(65); // 'A'
      const readFile = vi.fn().mockResolvedValue(big);
      vi.doMock('@tauri-apps/plugin-fs', () => ({ readFile }));

      const { pickAndAttachMedia } = await loadService(ANDROID_UA);
      mockOpen.mockResolvedValueOnce('content://x/big.png');
      mockInvoke.mockResolvedValueOnce(fakeAttachment);

      await pickAndAttachMedia('entry-1', 'pw');

      const [, args] = mockInvoke.mock.calls[0] as [string, Record<string, unknown>];
      expect(args.dataBase64).toBe(btoa('A'.repeat(0x8000 + 5)));
    });
  });

  describe('listEntryMedia / listAllMedia', () => {
    it('lists media for an entry', async () => {
      const { listEntryMedia } = await loadService(DESKTOP_UA);
      mockInvoke.mockResolvedValueOnce([fakeAttachment]);

      const result = await listEntryMedia('entry-1');

      expect(mockInvoke).toHaveBeenCalledWith('list_entry_media', {
        entryId: 'entry-1',
      });
      expect(result).toEqual([fakeAttachment]);
    });

    it('lists all media', async () => {
      const { listAllMedia } = await loadService(DESKTOP_UA);
      mockInvoke.mockResolvedValueOnce([fakeAttachment]);

      const result = await listAllMedia();

      expect(mockInvoke).toHaveBeenCalledWith('list_all_media');
      expect(result).toEqual([fakeAttachment]);
    });
  });

  describe('openMedia', () => {
    it('opens via the opener plugin when Rust returns a path (Android)', async () => {
      const { openMedia } = await loadService(DESKTOP_UA);
      mockInvoke
        .mockResolvedValueOnce('/tmp/decrypted.jpg') // open_media_attachment
        .mockResolvedValueOnce(undefined); // plugin:opener|openFile

      await openMedia('media-1', 'pw');

      expect(mockInvoke).toHaveBeenNthCalledWith(1, 'open_media_attachment', {
        mediaId: 'media-1',
        password: 'pw',
      });
      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'plugin:opener|openFile', {
        path: '/tmp/decrypted.jpg',
      });
    });

    it('does not call the opener when Rust opened the file itself (desktop, empty path)', async () => {
      const { openMedia } = await loadService(DESKTOP_UA);
      mockInvoke.mockResolvedValueOnce('');

      await openMedia('media-1', 'pw');

      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });
  });

  describe('getMediaThumbnail', () => {
    it('returns a data URL on success', async () => {
      const { getMediaThumbnail } = await loadService(DESKTOP_UA);
      mockInvoke.mockResolvedValueOnce('QUJD');

      const result = await getMediaThumbnail('media-1', 'pw');

      expect(result).toBe('data:image/jpeg;base64,QUJD');
    });

    it('returns null when decryption fails', async () => {
      const { getMediaThumbnail } = await loadService(DESKTOP_UA);
      mockInvoke.mockRejectedValueOnce(new Error('decrypt failed'));

      const result = await getMediaThumbnail('media-1', 'pw');

      expect(result).toBeNull();
    });
  });

  describe('deleteMedia', () => {
    it('calls delete_media_attachment', async () => {
      const { deleteMedia } = await loadService(DESKTOP_UA);
      mockInvoke.mockResolvedValueOnce(undefined);

      await deleteMedia('media-1');

      expect(mockInvoke).toHaveBeenCalledWith('delete_media_attachment', {
        mediaId: 'media-1',
      });
    });
  });
});
