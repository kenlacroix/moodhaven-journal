import {
  testConnection,
  ensureDirectory,
  uploadFile,
  downloadFile,
  listFiles,
} from './webdavService';
import {
  encryptedExport,
  encryptedImport,
} from './dataManagementService';
import { uploadBackup, downloadBackup, listBackups } from './cloudSyncService';

vi.mock('./webdavService', () => ({
  testConnection: vi.fn(),
  ensureDirectory: vi.fn(),
  uploadFile: vi.fn(),
  downloadFile: vi.fn(),
  listFiles: vi.fn(),
}));

vi.mock('./dataManagementService', () => ({
  encryptedExport: vi.fn(),
  encryptedImport: vi.fn(),
}));

const mockConfig = { url: 'https://dav.example.com/', username: 'user', password: 'pass' };

describe('cloudSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadBackup', () => {
    it('returns success when all steps succeed', async () => {
      vi.mocked(testConnection).mockResolvedValue({ success: true });
      vi.mocked(ensureDirectory).mockResolvedValue({ success: true });
      vi.mocked(encryptedExport).mockResolvedValue('encrypted-data');
      vi.mocked(uploadFile).mockResolvedValue({ success: true });

      const result = await uploadBackup('password', mockConfig);

      expect(result.success).toBe(true);
      expect(result.filename).toMatch(/^moodbloom-backup-\d{4}-\d{2}-\d{2}-\d{6}\.moodbloom$/);
      expect(result.timestamp).toBeTruthy();
    });

    it('calls steps in correct order', async () => {
      vi.mocked(testConnection).mockResolvedValue({ success: true });
      vi.mocked(ensureDirectory).mockResolvedValue({ success: true });
      vi.mocked(encryptedExport).mockResolvedValue('encrypted-data');
      vi.mocked(uploadFile).mockResolvedValue({ success: true });

      await uploadBackup('password', mockConfig);

      expect(testConnection).toHaveBeenCalledWith(mockConfig);
      expect(ensureDirectory).toHaveBeenCalledWith(mockConfig);
      expect(encryptedExport).toHaveBeenCalledWith('password');
      expect(uploadFile).toHaveBeenCalledWith(
        mockConfig,
        expect.stringMatching(/\.moodbloom$/),
        'encrypted-data',
      );
    });

    it('returns error when connection fails', async () => {
      vi.mocked(testConnection).mockResolvedValue({ success: false, error: 'Timeout' });

      const result = await uploadBackup('password', mockConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Timeout');
      expect(ensureDirectory).not.toHaveBeenCalled();
    });

    it('returns error when directory creation fails', async () => {
      vi.mocked(testConnection).mockResolvedValue({ success: true });
      vi.mocked(ensureDirectory).mockResolvedValue({ success: false, error: 'Permission denied' });

      const result = await uploadBackup('password', mockConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    it('returns error when upload fails', async () => {
      vi.mocked(testConnection).mockResolvedValue({ success: true });
      vi.mocked(ensureDirectory).mockResolvedValue({ success: true });
      vi.mocked(encryptedExport).mockResolvedValue('data');
      vi.mocked(uploadFile).mockResolvedValue({ success: false, error: 'Disk full' });

      const result = await uploadBackup('password', mockConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Disk full');
    });

    it('catches thrown errors', async () => {
      vi.mocked(testConnection).mockRejectedValue(new Error('Network error'));

      const result = await uploadBackup('password', mockConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('downloadBackup', () => {
    it('downloads latest backup when no filename specified', async () => {
      vi.mocked(listFiles).mockResolvedValue({
        success: true,
        files: [
          'moodbloom-backup-2026-01-28-120000.moodbloom',
          'moodbloom-backup-2026-01-30-090000.moodbloom',
        ],
      });
      vi.mocked(downloadFile).mockResolvedValue({ success: true, data: 'encrypted' });
      vi.mocked(encryptedImport).mockResolvedValue(5);

      const result = await downloadBackup('password', mockConfig);

      expect(result.success).toBe(true);
      expect(result.entriesCount).toBe(5);
      expect(downloadFile).toHaveBeenCalledWith(
        mockConfig,
        'moodbloom-backup-2026-01-30-090000.moodbloom',
      );
    });

    it('downloads specific file when filename provided', async () => {
      vi.mocked(downloadFile).mockResolvedValue({ success: true, data: 'encrypted' });
      vi.mocked(encryptedImport).mockResolvedValue(3);

      const result = await downloadBackup('password', mockConfig, 'specific.moodbloom');

      expect(result.success).toBe(true);
      expect(result.entriesCount).toBe(3);
      expect(listFiles).not.toHaveBeenCalled();
      expect(downloadFile).toHaveBeenCalledWith(mockConfig, 'specific.moodbloom');
    });

    it('returns error when no backups found', async () => {
      vi.mocked(listFiles).mockResolvedValue({ success: true, files: [] });

      const result = await downloadBackup('password', mockConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No backups found');
    });

    it('returns error when download fails', async () => {
      vi.mocked(listFiles).mockResolvedValue({
        success: true,
        files: ['backup.moodbloom'],
      });
      vi.mocked(downloadFile).mockResolvedValue({ success: false, error: 'Not found' });

      const result = await downloadBackup('password', mockConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not found');
    });

    it('catches thrown errors', async () => {
      vi.mocked(listFiles).mockRejectedValue(new Error('Network error'));

      const result = await downloadBackup('password', mockConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('listBackups', () => {
    it('returns filenames sorted most recent first', async () => {
      vi.mocked(listFiles).mockResolvedValue({
        success: true,
        files: [
          'moodbloom-backup-2026-01-28.moodbloom',
          'moodbloom-backup-2026-01-30.moodbloom',
          'moodbloom-backup-2026-01-25.moodbloom',
        ],
      });

      const backups = await listBackups(mockConfig);

      expect(backups).toEqual([
        'moodbloom-backup-2026-01-30.moodbloom',
        'moodbloom-backup-2026-01-28.moodbloom',
        'moodbloom-backup-2026-01-25.moodbloom',
      ]);
    });

    it('returns empty array on failure', async () => {
      vi.mocked(listFiles).mockResolvedValue({ success: false, error: 'fail' });

      const backups = await listBackups(mockConfig);

      expect(backups).toEqual([]);
    });
  });
});
