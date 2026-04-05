import { getDueCapsules, sealEntry, unsealEntry, getMoodDelta } from './timeCapsuleService';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
const mockInvoke = vi.mocked(invoke);

beforeEach(() => { vi.clearAllMocks(); });

describe('timeCapsuleService', () => {
  describe('sealEntry', () => {
    it('invokes seal_entry with correct args', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await sealEntry('entry-1', '2027-01-01T00:00:00Z', 'letter');
      expect(mockInvoke).toHaveBeenCalledWith('seal_entry', {
        id: 'entry-1',
        unlockAt: '2027-01-01T00:00:00Z',
        capsuleType: 'letter',
      });
    });
  });

  describe('getDueCapsules', () => {
    it('passes includeAnniversary=true by default', async () => {
      mockInvoke.mockResolvedValue(null);
      await getDueCapsules();
      expect(mockInvoke).toHaveBeenCalledWith('get_due_capsules', {
        includeAnniversary: true,
        localDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
    });

    it('passes includeAnniversary=false when disabled', async () => {
      mockInvoke.mockResolvedValue(null);
      await getDueCapsules(false);
      expect(mockInvoke).toHaveBeenCalledWith('get_due_capsules', {
        includeAnniversary: false,
        localDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
    });

    it('returns null when no capsule is due', async () => {
      mockInvoke.mockResolvedValue(null);
      const result = await getDueCapsules();
      expect(result).toBeNull();
    });
  });

  describe('unsealEntry', () => {
    it('invokes unseal_entry with id', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await unsealEntry('entry-1');
      expect(mockInvoke).toHaveBeenCalledWith('unseal_entry', { id: 'entry-1' });
    });
  });

  describe('getMoodDelta', () => {
    it('invokes get_mood_delta with correct args', async () => {
      mockInvoke.mockResolvedValue({ avg_since: 3.5, mood_today: 4 });
      const result = await getMoodDelta('entry-1', '2025-01-01T00:00:00Z');
      expect(mockInvoke).toHaveBeenCalledWith('get_mood_delta', {
        entryId: 'entry-1',
        entryCreatedAt: '2025-01-01T00:00:00Z',
      });
      expect(result.avg_since).toBe(3.5);
      expect(result.mood_today).toBe(4);
    });
  });
});
