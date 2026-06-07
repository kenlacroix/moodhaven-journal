import { invoke } from '@tauri-apps/api/core';
import type { Activity, ActivityStats } from '../../types/activities';

export async function listActivities(): Promise<Activity[]> {
  return invoke('list_activities');
}

export async function createActivity(name: string, emoji: string): Promise<Activity> {
  return invoke('create_activity', { name, emoji });
}

export async function deleteActivity(id: string): Promise<void> {
  return invoke('delete_activity', { id });
}

export async function syncEntryActivities(
  entryId: string,
  activityIds: string[],
): Promise<void> {
  return invoke('sync_entry_activities', { entryId, activityIds });
}

export async function getEntryActivities(entryId: string): Promise<Activity[]> {
  return invoke('get_entry_activities', { entryId });
}

export async function getActivityStats(): Promise<ActivityStats[]> {
  return invoke('get_activity_stats');
}
