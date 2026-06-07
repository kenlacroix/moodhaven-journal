export interface Activity {
  id: string;
  name: string;
  emoji: string;
  isCustom: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface ActivityStats {
  activityId: string;
  name: string;
  emoji: string;
  entryCount: number;
  avgMood: number;
}
