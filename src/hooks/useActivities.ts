import { useState, useEffect, useCallback } from 'react';
import {
  listActivities,
  createActivity,
  deleteActivity,
  syncEntryActivities,
  getEntryActivities,
  getActivityStats,
} from '../lib/services/activityService';
import type { Activity, ActivityStats } from '../types/activities';

interface UseActivitiesResult {
  activities: Activity[];
  stats: ActivityStats[];
  isLoading: boolean;
  createCustomActivity: (name: string, emoji: string) => Promise<Activity>;
  deleteCustomActivity: (id: string) => Promise<void>;
  syncActivities: (entryId: string, activityIds: string[]) => Promise<void>;
  getForEntry: (entryId: string) => Promise<Activity[]>;
  refresh: () => Promise<void>;
}

export function useActivities(): UseActivitiesResult {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stats, setStats] = useState<ActivityStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [acts, actStats] = await Promise.all([listActivities(), getActivityStats()]);
      setActivities(acts ?? []);
      setStats(actStats ?? []);
    } catch {
      // non-critical
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createCustomActivity = useCallback(
    async (name: string, emoji: string): Promise<Activity> => {
      const activity = await createActivity(name, emoji);
      setActivities((prev) => [...prev, activity].sort((a, b) => a.sortOrder - b.sortOrder));
      return activity;
    },
    [],
  );

  const deleteCustomActivity = useCallback(async (id: string) => {
    await deleteActivity(id);
    setActivities((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const syncActivities = useCallback(
    async (entryId: string, activityIds: string[]) => {
      await syncEntryActivities(entryId, activityIds);
    },
    [],
  );

  const getForEntry = useCallback(async (entryId: string): Promise<Activity[]> => {
    return getEntryActivities(entryId);
  }, []);

  return {
    activities,
    stats,
    isLoading,
    createCustomActivity,
    deleteCustomActivity,
    syncActivities,
    getForEntry,
    refresh,
  };
}
