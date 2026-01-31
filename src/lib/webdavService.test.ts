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
    it('constructs full path with MoodBloom directory', () => {
      const path = buildFilePath(
        'https://cloud.example.com/dav/',
        'backup.moodbloom'
      );
      expect(path).toBe(
        'https://cloud.example.com/dav/MoodBloom/backup.moodbloom'
      );
    });

    it('handles base URL without trailing slash', () => {
      const path = buildFilePath(
        'https://cloud.example.com/dav',
        'backup.moodbloom'
      );
      expect(path).toBe(
        'https://cloud.example.com/dav/MoodBloom/backup.moodbloom'
      );
    });
  });

  describe('buildDirectoryPath', () => {
    it('constructs MoodBloom directory path', () => {
      const path = buildDirectoryPath('https://cloud.example.com/dav');
      expect(path).toBe('https://cloud.example.com/dav/MoodBloom/');
    });

    it('handles URL with trailing slash', () => {
      const path = buildDirectoryPath('https://cloud.example.com/dav/');
      expect(path).toBe('https://cloud.example.com/dav/MoodBloom/');
    });
  });

  describe('parseFilenamesFromPropfind', () => {
    it('extracts .moodbloom filenames from WebDAV XML', () => {
      const xml = `<?xml version="1.0"?>
        <D:multistatus xmlns:D="DAV:">
          <D:response>
            <D:href>/dav/MoodBloom/</D:href>
          </D:response>
          <D:response>
            <D:href>/dav/MoodBloom/moodbloom-backup-2026-01-28-120000.moodbloom</D:href>
          </D:response>
          <D:response>
            <D:href>/dav/MoodBloom/moodbloom-backup-2026-01-30-090000.moodbloom</D:href>
          </D:response>
        </D:multistatus>`;

      const files = parseFilenamesFromPropfind(xml);
      expect(files).toEqual([
        'moodbloom-backup-2026-01-28-120000.moodbloom',
        'moodbloom-backup-2026-01-30-090000.moodbloom',
      ]);
    });

    it('handles lowercase namespace prefix', () => {
      const xml = `<d:multistatus xmlns:d="DAV:">
        <d:response><d:href>/MoodBloom/test.moodbloom</d:href></d:response>
      </d:multistatus>`;

      const files = parseFilenamesFromPropfind(xml);
      expect(files).toEqual(['test.moodbloom']);
    });

    it('handles no namespace prefix', () => {
      const xml = `<multistatus>
        <response><href>/MoodBloom/backup.moodbloom</href></response>
      </multistatus>`;

      const files = parseFilenamesFromPropfind(xml);
      expect(files).toEqual(['backup.moodbloom']);
    });

    it('ignores non-.moodbloom files', () => {
      const xml = `<D:multistatus xmlns:D="DAV:">
        <D:response><D:href>/MoodBloom/</D:href></D:response>
        <D:response><D:href>/MoodBloom/readme.txt</D:href></D:response>
        <D:response><D:href>/MoodBloom/backup.moodbloom</D:href></D:response>
      </D:multistatus>`;

      const files = parseFilenamesFromPropfind(xml);
      expect(files).toEqual(['backup.moodbloom']);
    });

    it('handles URL-encoded filenames', () => {
      const xml = `<D:multistatus xmlns:D="DAV:">
        <D:response><D:href>/MoodBloom/mood%20bloom-backup.moodbloom</D:href></D:response>
      </D:multistatus>`;

      const files = parseFilenamesFromPropfind(xml);
      expect(files).toEqual(['mood bloom-backup.moodbloom']);
    });

    it('returns empty array for empty XML', () => {
      expect(parseFilenamesFromPropfind('')).toEqual([]);
    });
  });
});
