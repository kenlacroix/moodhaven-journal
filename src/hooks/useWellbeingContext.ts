import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { stillGetWellbeingContext, type WellbeingContext } from '../lib/stillService';

export interface WellbeingState {
  context: WellbeingContext | null;
  isVisible: boolean;
  dismiss: () => void;
  onWordsWritten: (wordCount: number) => void;
}

const TODAY_KEY = () => {
  const d = new Date();
  return `wellbeing_card_last_shown_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function useWellbeingContext(): WellbeingState {
  const [context, setContext] = useState<WellbeingContext | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const key = TODAY_KEY();
      // Check if already shown today (single key per day, not per-day accumulation)
      const lastShown = await invoke<string | null>('get_setting', { key: 'wellbeing_card_last_shown' }).catch(() => null);
      if (lastShown === key) return;

      const ctx = await stillGetWellbeingContext().catch(() => null);
      if (cancelled || !ctx) return;

      setContext(ctx);
      setIsVisible(true);
      // Mark shown for today (single key, overwrites previous date — no row accumulation)
      invoke('set_setting', { key: 'wellbeing_card_last_shown', value: key }).catch(() => null);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  function dismiss() {
    setIsVisible(false);
  }

  // Called by WritingView when word count crosses the 5-word threshold
  function onWordsWritten(wordCount: number) {
    if (wordCount >= 5 && isVisible) {
      setIsVisible(false);
    }
  }

  return { context, isVisible, dismiss, onWordsWritten };
}
