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
