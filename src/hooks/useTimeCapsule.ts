import { useState, useEffect, useCallback } from 'react';
import { getDueCapsules, unsealEntry, type CapsuleEntryRow } from '../lib/timeCapsuleService';
import { useSettingsStore } from '../stores/settingsStore';

interface UseTimeCapsuleOptions {
  enabled: boolean;
}

interface UseTimeCapsuleReturn {
  pendingCapsule: CapsuleEntryRow | null;
  revealCapsule: (id: string) => Promise<void>;
  dismissCapsule: () => void;
}

export function useTimeCapsule({ enabled }: UseTimeCapsuleOptions): UseTimeCapsuleReturn {
  const [pendingCapsule, setPendingCapsule] = useState<CapsuleEntryRow | null>(null);
  const timeCapsuleEnabled = useSettingsStore((s) => s.settings.timeCapsule?.enabled ?? true);

  // Poll once on unlock
  useEffect(() => {
    if (!enabled || !timeCapsuleEnabled) return;

    getDueCapsules()
      .then((capsule) => setPendingCapsule(capsule))
      .catch(() => {/* non-critical */});
  }, [enabled, timeCapsuleEnabled]);

  const revealCapsule = useCallback(async (id: string) => {
    await unsealEntry(id);
    // Surface next due capsule (handles multiple due at once)
    const next = await getDueCapsules();
    setPendingCapsule(next);
  }, []);

  const dismissCapsule = useCallback(() => {
    setPendingCapsule(null);
  }, []);

  return { pendingCapsule, revealCapsule, dismissCapsule };
}
