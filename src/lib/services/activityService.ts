import { invoke } from '@tauri-apps/api/core';
import type { Activity, ActivityStat } from '../../types/activities';

// Rust returns snake_case; map to camelCase
function mapActivity(raw: Record<string, unknown>): Activity {
  return {
    id: raw.id as string,
    name: raw.name as string,
    emoji: raw.emoji as string,
    isCustom: raw.is_custom as boolean,
    sortOrder: raw.sort_order as number,
  };
}

function mapActivityStat(raw: Record<string, unknown>): ActivityStat {
  return {
    id: raw.id as string,
    name: raw.name as string,
    emoji: raw.emoji as string,
    isCustom: raw.is_custom as boolean,
    avgMood: raw.avg_mood as number,
    entryCount: raw.entry_count as number,
  };
}

export async function listActivities(): Promise<Activity[]> {
  const raw = await invoke<Record<string, unknown>[]>('list_activities');
  return raw.map(mapActivity);
}

export async function createActivity(name: string, emoji: string): Promise<Activity> {
  const raw = await invoke<Record<string, unknown>>('create_activity', { name, emoji });
  return mapActivity(raw);
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

export async function getEntryActivities(entryId: string): Promise<string[]> {
  return invoke('get_entry_activities', { entryId });
}

export interface EntryActivityRow {
  entryId: string;
  activityId: string;
}

export async function listAllEntryActivities(): Promise<EntryActivityRow[]> {
  const raw = await invoke<Record<string, unknown>[]>('list_all_entry_activities');
  return raw.map((r) => ({ entryId: r.entry_id as string, activityId: r.activity_id as string }));
}

export async function getActivityStats(): Promise<ActivityStat[]> {
  const raw = await invoke<Record<string, unknown>[]>('get_activity_stats');
  return raw.map(mapActivityStat);
}
