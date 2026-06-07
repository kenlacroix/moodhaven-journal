import { renderHook, act, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { useActivities } from './useActivities';

const mockInvoke = vi.mocked(invoke);

const predefined = [
  { id: 'act_exercise', name: 'exercise', emoji: '🏃', is_custom: false, sort_order: 0 },
  { id: 'act_social', name: 'social', emoji: '👥', is_custom: false, sort_order: 1 },
];

const custom = [
  { id: 'act_custom_1', name: 'yoga', emoji: '🧘', is_custom: true, sort_order: 1000 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockInvoke.mockResolvedValue([...predefined, ...custom]);
});

describe('useActivities', () => {
  it('loads activities on mount', async () => {
    const { result } = renderHook(() => useActivities());
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activities).toHaveLength(3);
    expect(mockInvoke).toHaveBeenCalledWith('list_activities');
  });

  it('addCustom appends to local state after success', async () => {
    const newActivity = { id: 'act_custom_2', name: 'dance', emoji: '💃', is_custom: true, sort_order: 1001 };
    mockInvoke
      .mockResolvedValueOnce([...predefined, ...custom]) // list_activities
      .mockResolvedValueOnce(newActivity);                // create_activity

    const { result } = renderHook(() => useActivities());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.addCustom('dance', '💃');
    });

    expect(result.current.activities.some((a) => a.id === 'act_custom_2')).toBe(true);
  });

  it('addCustom propagates error on duplicate name', async () => {
    mockInvoke
      .mockResolvedValueOnce([...predefined])
      .mockRejectedValueOnce(new Error('An activity with that name already exists'));

    const { result } = renderHook(() => useActivities());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => result.current.addCustom('exercise', '🏃'))
    ).rejects.toThrow('An activity with that name already exists');
  });

  it('remove deletes from local state after success', async () => {
    mockInvoke
      .mockResolvedValueOnce([...predefined, ...custom])
      .mockResolvedValueOnce(undefined); // delete_activity

    const { result } = renderHook(() => useActivities());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.remove('act_custom_1');
    });

    expect(result.current.activities.find((a) => a.id === 'act_custom_1')).toBeUndefined();
  });

  it('remove errors if called on predefined activity', async () => {
    mockInvoke
      .mockResolvedValueOnce([...predefined])
      .mockRejectedValueOnce(new Error('Predefined activities cannot be deleted'));

    const { result } = renderHook(() => useActivities());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => result.current.remove('act_exercise'))
    ).rejects.toThrow('Predefined activities cannot be deleted');
  });

  it('reload re-fetches after external change', async () => {
    const updated = [...predefined, { id: 'act_custom_99', name: 'hiking', emoji: '🥾', is_custom: true, sort_order: 2000 }];
    mockInvoke
      .mockResolvedValueOnce([...predefined])
      .mockResolvedValueOnce(updated);

    const { result } = renderHook(() => useActivities());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activities).toHaveLength(2);

    await act(async () => { await result.current.reload(); });
    expect(result.current.activities).toHaveLength(3);
  });

  it('handles empty activity list', async () => {
    mockInvoke.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useActivities());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activities).toHaveLength(0);
  });

  it('handles list_activities error gracefully (does not throw)', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('DB error'));
    const { result } = renderHook(() => useActivities());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activities).toHaveLength(0);
  });

  it('addCustom with missing emoji uses default', async () => {
    mockInvoke
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ id: 'act_custom_x', name: 'unnamed', emoji: '✨', is_custom: true, sort_order: 1000 });

    const { result } = renderHook(() => useActivities());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.addCustom('unnamed', ''); });
    expect(mockInvoke).toHaveBeenCalledWith('create_activity', { name: 'unnamed', emoji: '' });
  });

  it('concurrent reload calls do not cause duplicate state', async () => {
    mockInvoke.mockResolvedValue([...predefined]);
    const { result } = renderHook(() => useActivities());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await Promise.all([result.current.reload(), result.current.reload()]);
    });
    expect(result.current.activities).toHaveLength(2);
  });
});
