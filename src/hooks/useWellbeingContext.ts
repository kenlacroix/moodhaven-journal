import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { stillGetWellbeingContext, type WellbeingContext } from '../lib/stillService';
import { useSettingsStore } from '../stores/settingsStore';

export interface WellbeingState {
  context: WellbeingContext | null;
  isVisible: boolean;
  dismiss: () => void;
  onWordsWritten: (wordCount: number) => void;
}

const OURA_RETRY_DELAY_MS = 4000;

const TODAY_KEY = () => {
  const d = new Date();
  return `wellbeing_card_last_shown_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function useWellbeingContext(): WellbeingState {
  const [context, setContext] = useState<WellbeingContext | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  // Tracks whether the 5-word threshold was crossed before load() completed,
  // so a fast typer doesn't get the card shown after they've already dismissed it.
  const thresholdCrossedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      const key = TODAY_KEY();
      // Check if already shown today (single key per day, not per-day accumulation)
      const lastShown = await invoke<string | null>('get_setting', { key: 'wellbeing_card_last_shown' }).catch(() => null);
      if (lastShown === key) return;

      const ctx = await stillGetWellbeingContext().catch(() => null);
      if (cancelled || !ctx || thresholdCrossedRef.current) return;

      setContext(ctx);
      setIsVisible(true);
      // Mark shown for today (single key, overwrites previous date — no row accumulation)
      invoke('set_setting', { key: 'wellbeing_card_last_shown', value: key }).catch(() => null);

      // oura_sync_today may still be in-flight at mount time. If readiness is null
      // but Oura is connected, do a single retry to pick up the synced data.
      if (ctx.oura_readiness_today === null) {
        const { settings } = useSettingsStore.getState();
        if (settings.oura.connectedAt !== null) {
          retryTimer = setTimeout(async () => {
            if (cancelled) return;
            const fresh = await stillGetWellbeingContext().catch(() => null);
            if (!cancelled && fresh && fresh.oura_readiness_today !== null) {
              setContext(fresh);
            }
          }, OURA_RETRY_DELAY_MS);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  const dismiss = useCallback(() => {
    setIsVisible(false);
  }, []);

  // Called by WritingView when word count crosses the 5-word threshold
  const onWordsWritten = useCallback((wordCount: number) => {
    if (wordCount >= 5) {
      thresholdCrossedRef.current = true;
      setIsVisible(false);
    }
  }, []);

  return { context, isVisible, dismiss, onWordsWritten };
}
