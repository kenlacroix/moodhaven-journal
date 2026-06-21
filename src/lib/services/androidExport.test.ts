// Covers the Android export branches that route through the share sheet instead
// of the desktop save() dialog. usePlatform + mobileExport are mocked so each
// service's `isAndroidPlatform` branch is exercised in isolation.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../hooks/usePlatform', () => ({ isAndroidPlatform: true }));
vi.mock('./mobileExport', () => ({
  shareExportedText: vi.fn(async () => {}),
  shareExportedBinary: vi.fn(async () => {}),
}));

import { shareExportedText, shareExportedBinary } from './mobileExport';
import { downloadBackup } from './dataManagementService';
import { downloadBackupCodes } from './twoFactorService';
import { exportRecoveryPdf } from './recoveryPdfService';

const mockText = vi.mocked(shareExportedText);
const mockBinary = vi.mocked(shareExportedBinary);

describe('android export branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('downloadBackup shares the encrypted envelope', async () => {
    const data = JSON.stringify({ format: 'moodhaven-encrypted-v1', payload: {} });
    await downloadBackup(data, 'backup.moodhaven');
    expect(mockText).toHaveBeenCalledWith('backup.moodhaven', data, 'application/octet-stream');
  });

  it('downloadBackupCodes shares the codes text', async () => {
    await downloadBackupCodes(['AAA', 'BBB']);
    expect(mockText).toHaveBeenCalledWith(
      'moodhaven-backup-codes.txt',
      expect.any(String),
      'text/plain'
    );
  });

  it('exportRecoveryPdf shares the PDF and reports success', async () => {
    const result = await exportRecoveryPdf('ABCD-EFGH-JKLM-NPQR-STUV-WXYZ');
    expect(result).toBe(true);
    expect(mockBinary).toHaveBeenCalledWith(
      'moodhaven-recovery-key.pdf',
      expect.any(String),
      'application/pdf'
    );
  });
});
