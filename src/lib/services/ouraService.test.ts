import { invoke } from '@tauri-apps/api/core';
import {
  savePAT,
  disconnect,
  getStatus,
  syncToday,
  getContext,
  getTodayContext,
  getHistory,
  backfill,
} from './ouraService';

vi.mock('./secureStorage', () => ({
  secureSet: vi.fn(),
  secureGet: vi.fn(),
}));

import { secureSet, secureGet } from './secureStorage';

const mockInvoke = vi.mocked(invoke);
const mockSecureSet = vi.mocked(secureSet);
const mockSecureGet = vi.mocked(secureGet);

const fakeHealthContext = {
  date: '2026-06-01',
  sleepScore: 82,
  readinessScore: 78,
  hrvAvg: 55,
  activityScore: 70,
  restingHeartRate: 58,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('savePAT', () => {
  it('validates via Rust first, then stores encrypted', async () => {
    mockInvoke.mockResolvedValue(undefined);
    mockSecureSet.mockResolvedValue(undefined);

    await savePAT('oura-token-123', 'session-password');

    expect(mockInvoke).toHaveBeenCalledWith('oura_validate_pat', { pat: 'oura-token-123' });
    expect(mockSecureSet).toHaveBeenCalledWith('oura_pat', 'oura-token-123', 'session-password');
  });

  it('does not store PAT if validation throws', async () => {
    mockInvoke.mockRejectedValue(new Error('Invalid token'));

    await expect(savePAT('bad-token', 'pass')).rejects.toThrow('Invalid token');
    expect(mockSecureSet).not.toHaveBeenCalled();
  });

  it('propagates storage errors', async () => {
    mockInvoke.mockResolvedValue(undefined);
    mockSecureSet.mockRejectedValue(new Error('Storage error'));

    await expect(savePAT('token', 'pass')).rejects.toThrow('Storage error');
  });
});

describe('disconnect', () => {
  it('calls oura_disconnect', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await disconnect();

    expect(mockInvoke).toHaveBeenCalledWith('oura_disconnect');
  });
});

describe('getStatus', () => {
  it('calls oura_get_status and returns response', async () => {
    const status = { connected: true, connectedAt: '2026-06-01T00:00:00Z' };
    mockInvoke.mockResolvedValue(status);

    const result = await getStatus();

    expect(mockInvoke).toHaveBeenCalledWith('oura_get_status');
    expect(result).toEqual(status);
  });

  it('returns disconnected status', async () => {
    mockInvoke.mockResolvedValue({ connected: false, connectedAt: null });

    const result = await getStatus();

    expect(result.connected).toBe(false);
    expect(result.connectedAt).toBeNull();
  });
});

describe('syncToday', () => {
  it('decrypts PAT then calls oura_sync_today', async () => {
    mockSecureGet.mockResolvedValue('oura-pat-value');
    mockInvoke.mockResolvedValue(fakeHealthContext);

    const result = await syncToday('session-password');

    expect(mockSecureGet).toHaveBeenCalledWith('oura_pat', 'session-password');
    expect(mockInvoke).toHaveBeenCalledWith('oura_sync_today', { pat: 'oura-pat-value' });
    expect(result).toEqual(fakeHealthContext);
  });

  it('throws if no PAT is stored', async () => {
    mockSecureGet.mockResolvedValue(null);

    await expect(syncToday('pass')).rejects.toThrow('Oura not connected');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('propagates API errors', async () => {
    mockSecureGet.mockResolvedValue('token');
    mockInvoke.mockRejectedValue(new Error('API rate limit'));

    await expect(syncToday('pass')).rejects.toThrow('API rate limit');
  });
});

describe('getContext', () => {
  it('calls oura_get_context with date', async () => {
    mockInvoke.mockResolvedValue(fakeHealthContext);

    const result = await getContext('2026-06-01');

    expect(mockInvoke).toHaveBeenCalledWith('oura_get_context', { date: '2026-06-01' });
    expect(result).toEqual(fakeHealthContext);
  });

  it('returns null when no data for date', async () => {
    mockInvoke.mockResolvedValue(null);

    const result = await getContext('2026-01-01');

    expect(result).toBeNull();
  });
});

describe('getTodayContext', () => {
  it('returns cached context without syncing', async () => {
    // Mock getContext to return cached data
    mockInvoke.mockResolvedValue(fakeHealthContext);

    const result = await getTodayContext(false);

    expect(result).toEqual(fakeHealthContext);
    expect(mockSecureGet).not.toHaveBeenCalled();
  });

  it('returns null when no cached and autoSync false', async () => {
    mockInvoke.mockResolvedValue(null);

    const result = await getTodayContext(false);

    expect(result).toBeNull();
    expect(mockSecureGet).not.toHaveBeenCalled();
  });

  it('returns null when no cached and no password provided', async () => {
    mockInvoke.mockResolvedValue(null);

    const result = await getTodayContext(true);

    expect(result).toBeNull();
    expect(mockSecureGet).not.toHaveBeenCalled();
  });

  it('syncs when cache miss, autoSync true, and password provided', async () => {
    // First invoke is getContext → null (cache miss)
    mockInvoke.mockResolvedValueOnce(null);
    mockSecureGet.mockResolvedValue('token');
    // Second invoke is oura_sync_today
    mockInvoke.mockResolvedValueOnce(fakeHealthContext);

    const result = await getTodayContext(true, 'pass');

    expect(mockSecureGet).toHaveBeenCalledWith('oura_pat', 'pass');
    expect(result).toEqual(fakeHealthContext);
  });

  it('returns null when sync throws', async () => {
    mockInvoke.mockResolvedValueOnce(null);
    mockSecureGet.mockResolvedValue('token');
    mockInvoke.mockRejectedValueOnce(new Error('Network error'));

    const result = await getTodayContext(true, 'pass');

    expect(result).toBeNull();
  });
});

describe('getHistory', () => {
  it('calls oura_get_history with days', async () => {
    mockInvoke.mockResolvedValue([fakeHealthContext]);

    const result = await getHistory(7);

    expect(mockInvoke).toHaveBeenCalledWith('oura_get_history', { days: 7 });
    expect(result).toHaveLength(1);
  });

  it('returns empty array when no history', async () => {
    mockInvoke.mockResolvedValue([]);

    const result = await getHistory(30);

    expect(result).toEqual([]);
  });
});

describe('backfill', () => {
  it('decrypts PAT then calls oura_backfill', async () => {
    mockSecureGet.mockResolvedValue('oura-token');
    mockInvoke.mockResolvedValue(14);

    const count = await backfill(30, 'session-pass');

    expect(mockSecureGet).toHaveBeenCalledWith('oura_pat', 'session-pass');
    expect(mockInvoke).toHaveBeenCalledWith('oura_backfill', { days: 30, pat: 'oura-token' });
    expect(count).toBe(14);
  });

  it('throws if no PAT stored', async () => {
    mockSecureGet.mockResolvedValue(null);

    await expect(backfill(7, 'pass')).rejects.toThrow('Oura not connected');
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
