export interface Activity {
  id: string;
  name: string;
  emoji: string;
  isCustom: boolean;
  sortOrder: number;
}

export interface ActivityStat {
  id: string;
  name: string;
  emoji: string;
  isCustom: boolean;
  avgMood: number;
  entryCount: number;
  moodDelta?: number;
}

export const PREDEFINED_ACTIVITY_IDS = [
  'act_exercise', 'act_social', 'act_work', 'act_reading', 'act_creative',
  'act_meditation', 'act_good_sleep', 'act_poor_sleep', 'act_nature',
  'act_family', 'act_cooking', 'act_music', 'act_learning', 'act_travel',
  'act_gaming',
] as const;
