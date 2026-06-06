import { invoke } from '@tauri-apps/api/core';
import {
  cloudProviderAuthStart,
  cloudProviderUploadBlob,
  cloudProviderDownloadBlob,
  cloudProviderStatus,
  cloudProviderDisconnect,
  cloudProviderRefreshToken,
  syncUpload,
  syncDownload,
} from './cloudProvidersService';

vi.mock('./dataManagementService', () => ({
  exportData: vi.fn(),
  encryptedImport: vi.fn(),
}));

import { exportData, encryptedImport } from './dataManagementService';

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cloudProviderAuthStart', () => {
  it('calls cloud_provider_auth_start with dropbox', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await cloudProviderAuthStart('dropbox');
    expect(mockInvoke).toHaveBeenCalledWith('cloud_provider_auth_start', { provider: 'dropbox' });
  });

  it('calls cloud_provider_auth_start with gdrive', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await cloudProviderAuthStart('gdrive');
    expect(mockInvoke).toHaveBeenCalledWith('cloud_provider_auth_start', { provider: 'gdrive' });
  });

  it('propagates error from invoke', async () => {
    mockInvoke.mockRejectedValue(new Error('OAuth failed'));
    await expect(cloudProviderAuthStart('dropbox')).rejects.toThrow('OAuth failed');
  });
});

describe('cloudProviderUploadBlob', () => {
  it('calls cloud_provider_upload_blob with correct args', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await cloudProviderUploadBlob('dropbox', 'encrypted-data');
    expect(mockInvoke).toHaveBeenCalledWith('cloud_provider_upload_blob', {
      provider: 'dropbox',
      blob: 'encrypted-data',
    });
  });

  it('calls with gdrive provider', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await cloudProviderUploadBlob('gdrive', 'blob-content');
    expect(mockInvoke).toHaveBeenCalledWith('cloud_provider_upload_blob', {
      provider: 'gdrive',
      blob: 'blob-content',
    });
  });

  it('propagates upload errors', async () => {
    mockInvoke.mockRejectedValue(new Error('Upload failed'));
    await expect(cloudProviderUploadBlob('dropbox', 'data')).rejects.toThrow('Upload failed');
  });
});

describe('cloudProviderDownloadBlob', () => {
  it('calls cloud_provider_download_blob and returns string', async () => {
    mockInvoke.mockResolvedValue('downloaded-blob');
    const result = await cloudProviderDownloadBlob('dropbox');
    expect(result).toBe('downloaded-blob');
    expect(mockInvoke).toHaveBeenCalledWith('cloud_provider_download_blob', { provider: 'dropbox' });
  });

  it('propagates download errors', async () => {
    mockInvoke.mockRejectedValue(new Error('Not found'));
    await expect(cloudProviderDownloadBlob('gdrive')).rejects.toThrow('Not found');
  });
});

describe('cloudProviderStatus', () => {
  const mockStatuses = [
    { provider: 'dropbox', connected: true, lastSyncAt: '2026-06-01T00:00:00Z' },
    { provider: 'gdrive', connected: false, lastSyncAt: null },
  ];

  it('calls with null provider when no arg given', async () => {
    mockInvoke.mockResolvedValue(mockStatuses);
    await cloudProviderStatus();
    expect(mockInvoke).toHaveBeenCalledWith('cloud_provider_status', { provider: null });
  });

  it('passes provider filter when given', async () => {
    mockInvoke.mockResolvedValue([mockStatuses[0]]);
    await cloudProviderStatus('dropbox');
    expect(mockInvoke).toHaveBeenCalledWith('cloud_provider_status', { provider: 'dropbox' });
  });

  it('returns array of ProviderStatus', async () => {
    mockInvoke.mockResolvedValue(mockStatuses);
    const result = await cloudProviderStatus();
    expect(result).toHaveLength(2);
    expect(result[0].provider).toBe('dropbox');
    expect(result[0].connected).toBe(true);
    expect(result[1].lastSyncAt).toBeNull();
  });
});

describe('cloudProviderDisconnect', () => {
  it('calls cloud_provider_disconnect', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await cloudProviderDisconnect('dropbox');
    expect(mockInvoke).toHaveBeenCalledWith('cloud_provider_disconnect', { provider: 'dropbox' });
  });

  it('propagates disconnect errors', async () => {
    mockInvoke.mockRejectedValue(new Error('Disconnect failed'));
    await expect(cloudProviderDisconnect('gdrive')).rejects.toThrow('Disconnect failed');
  });
});

describe('cloudProviderRefreshToken', () => {
  it('calls cloud_provider_refresh_token', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await cloudProviderRefreshToken('dropbox');
    expect(mockInvoke).toHaveBeenCalledWith('cloud_provider_refresh_token', { provider: 'dropbox' });
  });
});

describe('syncUpload', () => {
  it('exports data and uploads blob on success', async () => {
    vi.mocked(exportData).mockResolvedValue('encrypted-export');
    mockInvoke.mockResolvedValue(undefined);

    const result = await syncUpload('dropbox', 'password123');

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(exportData).toHaveBeenCalledWith('password123');
    expect(mockInvoke).toHaveBeenCalledWith('cloud_provider_upload_blob', {
      provider: 'dropbox',
      blob: 'encrypted-export',
    });
  });

  it('returns error when exportData throws', async () => {
    vi.mocked(exportData).mockRejectedValue(new Error('Export failed'));

    const result = await syncUpload('dropbox', 'password123');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Export failed');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('returns error when upload throws', async () => {
    vi.mocked(exportData).mockResolvedValue('blob');
    mockInvoke.mockRejectedValue(new Error('Upload error'));

    const result = await syncUpload('gdrive', 'pass');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Upload error');
  });

  it('handles non-Error thrown objects', async () => {
    vi.mocked(exportData).mockRejectedValue('string error');

    const result = await syncUpload('dropbox', 'pass');

    expect(result.success).toBe(false);
    expect(result.error).toBe('string error');
  });
});

describe('syncDownload', () => {
  it('downloads blob and imports on success', async () => {
    mockInvoke.mockResolvedValue('encrypted-blob');
    vi.mocked(encryptedImport).mockResolvedValue(7);

    const result = await syncDownload('dropbox', 'password123');

    expect(result.success).toBe(true);
    expect(result.entriesCount).toBe(7);
    expect(result.error).toBeUndefined();
    expect(mockInvoke).toHaveBeenCalledWith('cloud_provider_download_blob', { provider: 'dropbox' });
    expect(encryptedImport).toHaveBeenCalledWith('encrypted-blob', 'password123');
  });

  it('returns error when download throws', async () => {
    mockInvoke.mockRejectedValue(new Error('Download failed'));

    const result = await syncDownload('gdrive', 'pass');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Download failed');
    expect(result.entriesCount).toBeUndefined();
  });

  it('returns error when import throws', async () => {
    mockInvoke.mockResolvedValue('blob');
    vi.mocked(encryptedImport).mockRejectedValue(new Error('Wrong password'));

    const result = await syncDownload('dropbox', 'wrongpass');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Wrong password');
  });

  it('handles non-Error thrown objects', async () => {
    mockInvoke.mockRejectedValue(42);

    const result = await syncDownload('dropbox', 'pass');

    expect(result.success).toBe(false);
    expect(result.error).toBe('42');
  });

  it('works with gdrive provider', async () => {
    mockInvoke.mockResolvedValue('gdrive-blob');
    vi.mocked(encryptedImport).mockResolvedValue(3);

    const result = await syncDownload('gdrive', 'pass');

    expect(result.success).toBe(true);
    expect(result.entriesCount).toBe(3);
  });
});
