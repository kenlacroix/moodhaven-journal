import { useState, useEffect, useCallback } from 'react';
import {
  listActivities,
  createActivity,
  deleteActivity,
} from '../lib/services/activityService';
import type { Activity } from '../types/activities';

export function useActivities() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setActivities(await listActivities());
    } catch {
      // non-critical; leave current state
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addCustom = useCallback(async (name: string, emoji: string): Promise<Activity> => {
    const created = await createActivity(name, emoji);
    setActivities((prev) => [...prev, created]);
    return created;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteActivity(id);
    setActivities((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return { activities, isLoading, addCustom, remove, reload: load };
}
