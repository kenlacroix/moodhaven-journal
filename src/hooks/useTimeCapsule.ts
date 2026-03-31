import { useState, useEffect, useCallback } from 'react';
import { getDueCapsules, unsealEntry, type CapsuleEntryRow } from '../lib/services/timeCapsuleService';
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
  const anniversaryReveal = useSettingsStore((s) => s.settings.timeCapsule?.anniversaryReveal ?? true);

  // Poll once on unlock
  useEffect(() => {
    if (!enabled || !timeCapsuleEnabled) return;

    getDueCapsules(anniversaryReveal)
      .then((capsule) => setPendingCapsule(capsule))
      .catch(() => {/* non-critical */});
  }, [enabled, timeCapsuleEnabled, anniversaryReveal]);

  const revealCapsule = useCallback(async (id: string) => {
    await unsealEntry(id);
    // Surface next due capsule (handles multiple due at once)
    const next = await getDueCapsules(anniversaryReveal).catch(() => null);
    setPendingCapsule(next);
  }, [anniversaryReveal]);

  const dismissCapsule = useCallback(() => {
    setPendingCapsule(null);
  }, []);

  return { pendingCapsule, revealCapsule, dismissCapsule };
}
