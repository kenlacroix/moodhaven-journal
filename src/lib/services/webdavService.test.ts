import {
  buildAuthHeader,
  normalizeWebDAVUrl,
  buildFilePath,
  buildDirectoryPath,
  parseFilenamesFromPropfind,
  uploadFile,
  uploadFileWithETagRetry,
  downloadFile,
} from './webdavService';

vi.mock('./http', () => ({
  httpFetch: vi.fn(),
}));

import { httpFetch } from './http';
const mockFetch = vi.mocked(httpFetch);

const config = { url: 'https://dav.example.com/', username: 'u', password: 'p' };

describe('webdavService', () => {
  describe('buildAuthHeader', () => {
    it('encodes credentials as Basic auth', () => {
      const header = buildAuthHeader('user', 'pass');
      expect(header).toBe('Basic ' + btoa('user:pass'));
    });

    it('handles special characters in password', () => {
      const header = buildAuthHeader('admin', 'p@ss:word!');
      expect(header).toBe('Basic ' + btoa('admin:p@ss:word!'));
    });

    it('handles empty username and password', () => {
      const header = buildAuthHeader('', '');
      expect(header).toBe('Basic ' + btoa(':'));
    });
  });

  describe('normalizeWebDAVUrl', () => {
    it('adds trailing slash when missing', () => {
      expect(normalizeWebDAVUrl('https://cloud.example.com/dav')).toBe(
        'https://cloud.example.com/dav/'
      );
    });

    it('preserves trailing slash when present', () => {
      expect(normalizeWebDAVUrl('https://cloud.example.com/dav/')).toBe(
        'https://cloud.example.com/dav/'
      );
    });

    it('trims whitespace', () => {
      expect(normalizeWebDAVUrl('  https://example.com  ')).toBe(
        'https://example.com/'
      );
    });

    it('handles URL with path', () => {
      expect(
        normalizeWebDAVUrl('https://nc.example.com/remote.php/dav/files/user')
      ).toBe('https://nc.example.com/remote.php/dav/files/user/');
    });
  });

  describe('buildFilePath', () => {
    it('constructs full path with MoodHaven directory', () => {
      const path = buildFilePath(
        'https://cloud.example.com/dav/',
        'backup.moodhaven'
      );
      expect(path).toBe(
        'https://cloud.example.com/dav/MoodHaven/backup.moodhaven'
      );
    });

    it('handles base URL without trailing slash', () => {
      const path = buildFilePath(
        'https://cloud.example.com/dav',
        'backup.moodhaven'
      );
      expect(path).toBe(
        'https://cloud.example.com/dav/MoodHaven/backup.moodhaven'
      );
    });
  });

  describe('buildDirectoryPath', () => {
    it('constructs MoodHaven directory path', () => {
      const path = buildDirectoryPath('https://cloud.example.com/dav');
      expect(path).toBe('https://cloud.example.com/dav/MoodHaven/');
    });

    it('handles URL with trailing slash', () => {
      const path = buildDirectoryPath('https://cloud.example.com/dav/');
      expect(path).toBe('https://cloud.example.com/dav/MoodHaven/');
    });
  });

  describe('parseFilenamesFromPropfind', () => {
    it('extracts .moodhaven filenames from WebDAV XML', () => {
      const xml = `<?xml version="1.0"?>
        <D:multistatus xmlns:D="DAV:">
          <D:response>
            <D:href>/dav/MoodHaven/</D:href>
          </D:response>
          <D:response>
            <D:href>/dav/MoodHaven/moodhaven-backup-2026-01-28-120000.moodhaven</D:href>
          </D:response>
          <D:response>
            <D:href>/dav/MoodHaven/moodhaven-backup-2026-01-30-090000.moodhaven</D:href>
          </D:response>
        </D:multistatus>`;

      const files = parseFilenamesFromPropfind(xml);
      expect(files).toEqual([
        'moodhaven-backup-2026-01-28-120000.moodhaven',
        'moodhaven-backup-2026-01-30-090000.moodhaven',
      ]);
    });

    it('handles lowercase namespace prefix', () => {
      const xml = `<d:multistatus xmlns:d="DAV:">
        <d:response><d:href>/MoodHaven/test.moodhaven</d:href></d:response>
      </d:multistatus>`;

      const files = parseFilenamesFromPropfind(xml);
      expect(files).toEqual(['test.moodhaven']);
    });

    it('handles no namespace prefix', () => {
      const xml = `<multistatus>
        <response><href>/MoodHaven/backup.moodhaven</href></response>
      </multistatus>`;

      const files = parseFilenamesFromPropfind(xml);
      expect(files).toEqual(['backup.moodhaven']);
    });

    it('ignores non-.moodhaven files', () => {
      const xml = `<D:multistatus xmlns:D="DAV:">
        <D:response><D:href>/MoodHaven/</D:href></D:response>
        <D:response><D:href>/MoodHaven/readme.txt</D:href></D:response>
        <D:response><D:href>/MoodHaven/backup.moodhaven</D:href></D:response>
      </D:multistatus>`;

      const files = parseFilenamesFromPropfind(xml);
      expect(files).toEqual(['backup.moodhaven']);
    });

    it('handles URL-encoded filenames', () => {
      const xml = `<D:multistatus xmlns:D="DAV:">
        <D:response><D:href>/MoodHaven/mood%20bloom-backup.moodhaven</D:href></D:response>
      </D:multistatus>`;

      const files = parseFilenamesFromPropfind(xml);
      expect(files).toEqual(['mood bloom-backup.moodhaven']);
    });

    it('returns empty array for empty XML', () => {
      expect(parseFilenamesFromPropfind('')).toEqual([]);
    });
  });

  describe('uploadFile ETag support', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('succeeds and returns etag from response', async () => {
      mockFetch.mockResolvedValue({
        status: 201,
        ok: true,
        headers: { get: (h: string) => h === 'ETag' ? '"abc"' : null },
      } as unknown as Response);
      const result = await uploadFile(config, 'test.moodhaven', 'data');
      expect(result.success).toBe(true);
      expect(result.etag).toBe('"abc"');
    });

    it('sends If-Match header when etag provided', async () => {
      mockFetch.mockResolvedValue({
        status: 204,
        ok: true,
        headers: { get: () => null },
      } as unknown as Response);
      await uploadFile(config, 'test.moodhaven', 'data', '"v1"');
      const [, opts] = mockFetch.mock.calls[0];
      expect((opts as RequestInit & { headers: Record<string, string> }).headers['If-Match']).toBe('"v1"');
    });

    it('returns status 412 on ETag mismatch', async () => {
      mockFetch.mockResolvedValue({
        status: 412,
        ok: false,
        headers: { get: () => null },
      } as unknown as Response);
      const result = await uploadFile(config, 'test.moodhaven', 'data', '"stale"');
      expect(result.success).toBe(false);
      expect(result.status).toBe(412);
    });
  });

  describe('uploadFileWithETagRetry', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('succeeds on first attempt if no conflict', async () => {
      mockFetch.mockResolvedValue({
        status: 201,
        ok: true,
        headers: { get: (h: string) => h === 'ETag' ? '"new"' : null },
      } as unknown as Response);
      const result = await uploadFileWithETagRetry(config, 'f.moodhaven', 'data', null);
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('on 412: downloads remote, merges LWW, retries once', async () => {
      const localContent = JSON.stringify({ entries: [{ id: 'a', updated_at: '2026-06-01T00:00:00.000Z', mood: 5 }] });
      const remoteContent = JSON.stringify({ entries: [{ id: 'b', updated_at: '2026-01-01T00:00:00.000Z', mood: 1 }] });

      mockFetch
        // First PUT: 412 conflict
        .mockResolvedValueOnce({ status: 412, ok: false, headers: { get: () => null } } as unknown as Response)
        // GET for remote
        .mockResolvedValueOnce({ ok: true, status: 200, text: async () => remoteContent, headers: { get: () => null } } as unknown as Response)
        // Retry PUT: success
        .mockResolvedValueOnce({ status: 201, ok: true, headers: { get: (h: string) => h === 'ETag' ? '"merged"' : null } } as unknown as Response);

      const result = await uploadFileWithETagRetry(config, 'f.moodhaven', localContent, '"old"');
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('returns error if 412 and remote download also fails', async () => {
      mockFetch
        .mockResolvedValueOnce({ status: 412, ok: false, headers: { get: () => null } } as unknown as Response)
        .mockResolvedValueOnce({ ok: false, status: 404, headers: { get: () => null } } as unknown as Response);
      const result = await uploadFileWithETagRetry(config, 'f.moodhaven', 'data', '"old"');
      expect(result.success).toBe(false);
    });
  });

  describe('downloadFile ETag capture', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns etag from response headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'content',
        headers: { get: (h: string) => h === 'ETag' ? '"etag-value"' : null },
      } as unknown as Response);
      const result = await downloadFile(config, 'file.moodhaven');
      expect(result.success).toBe(true);
      expect(result.etag).toBe('"etag-value"');
      expect(result.data).toBe('content');
    });

    it('returns undefined etag when header absent', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '',
        headers: { get: () => null },
      } as unknown as Response);
      const result = await downloadFile(config, 'file.moodhaven');
      expect(result.etag).toBeUndefined();
    });
  });
});
