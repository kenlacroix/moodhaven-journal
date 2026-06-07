import { renderHook, act, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { useActivities } from './useActivities';
import type { Activity, ActivityStats } from '../types/activities';

const mockInvoke = vi.mocked(invoke);

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'act_exercise',
    name: 'Exercise',
    emoji: '🏃',
    isCustom: false,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00',
    ...overrides,
  };
}

function makeStats(overrides: Partial<ActivityStats> = {}): ActivityStats {
  return {
    activityId: 'act_exercise',
    name: 'Exercise',
    emoji: '🏃',
    entryCount: 5,
    avgMood: 4.2,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInvoke.mockResolvedValue([]);
});

describe('useActivities', () => {
  it('loads activities and stats on mount', async () => {
    const activities = [makeActivity()];
    const stats = [makeStats()];
    mockInvoke
      .mockResolvedValueOnce(activities)
      .mockResolvedValueOnce(stats);

    const { result } = renderHook(() => useActivities());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.activities).toEqual(activities);
    expect(result.current.stats).toEqual(stats);
    expect(mockInvoke).toHaveBeenCalledWith('list_activities');
    expect(mockInvoke).toHaveBeenCalledWith('get_activity_stats');
  });

  it('starts in loading state', () => {
    mockInvoke.mockResolvedValue([]);
    const { result } = renderHook(() => useActivities());
    expect(result.current.isLoading).toBe(true);
  });

  it('silently ignores load errors', async () => {
    mockInvoke.mockRejectedValue(new Error('IPC error'));
    const { result } = renderHook(() => useActivities());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activities).toEqual([]);
  });

  it('createCustomActivity adds to activities list', async () => {
    const existing = [makeActivity()];
    mockInvoke
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce([]);

    const { result } = renderHook(() => useActivities());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const newAct = makeActivity({ id: 'act_custom_abc', name: 'Yoga', emoji: '🧘', isCustom: true, sortOrder: 99 });
    mockInvoke.mockResolvedValueOnce(newAct);

    await act(async () => {
      await result.current.createCustomActivity('Yoga', '🧘');
    });

    expect(mockInvoke).toHaveBeenCalledWith('create_activity', { name: 'Yoga', emoji: '🧘' });
    expect(result.current.activities).toContainEqual(newAct);
  });

  it('deleteCustomActivity removes from activities list', async () => {
    const custom = makeActivity({ id: 'act_custom_abc', isCustom: true });
    mockInvoke
      .mockResolvedValueOnce([custom])
      .mockResolvedValueOnce([]);

    const { result } = renderHook(() => useActivities());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockInvoke.mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.deleteCustomActivity('act_custom_abc');
    });

    expect(mockInvoke).toHaveBeenCalledWith('delete_activity', { id: 'act_custom_abc' });
    expect(result.current.activities.find((a) => a.id === 'act_custom_abc')).toBeUndefined();
  });

  it('syncActivities calls sync_entry_activities', async () => {
    mockInvoke.mockResolvedValue([]);
    const { result } = renderHook(() => useActivities());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockInvoke.mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.syncActivities('entry-1', ['act_exercise', 'act_social']);
    });

    expect(mockInvoke).toHaveBeenCalledWith('sync_entry_activities', {
      entryId: 'entry-1',
      activityIds: ['act_exercise', 'act_social'],
    });
  });

  it('getForEntry calls get_entry_activities', async () => {
    mockInvoke.mockResolvedValue([]);
    const { result } = renderHook(() => useActivities());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const entryActs = [makeActivity()];
    mockInvoke.mockResolvedValueOnce(entryActs);
    let returned: Activity[] = [];
    await act(async () => {
      returned = await result.current.getForEntry('entry-1');
    });

    expect(mockInvoke).toHaveBeenCalledWith('get_entry_activities', { entryId: 'entry-1' });
    expect(returned).toEqual(entryActs);
  });
});
