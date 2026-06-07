import { useState, useEffect } from 'react';
import { getActivityStats } from '../lib/services/activityService';
import type { ActivityStat } from '../types/activities';

export function useActivityAnalytics(overallAvgMood: number) {
  const [stats, setStats] = useState<ActivityStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    getActivityStats()
      .then((raw) =>
        raw
          .filter((s) => s.entryCount >= 3)
          .map((s) => ({ ...s, moodDelta: s.avgMood - overallAvgMood }))
          .sort((a, b) => (b.moodDelta ?? 0) - (a.moodDelta ?? 0)),
      )
      .then(setStats)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [overallAvgMood]);

  return { stats, isLoading, hasData: stats.length > 0 };
}
