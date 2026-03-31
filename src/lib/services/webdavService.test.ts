import {
  buildAuthHeader,
  normalizeWebDAVUrl,
  buildFilePath,
  buildDirectoryPath,
  parseFilenamesFromPropfind,
} from './webdavService';

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
});
