import { useEffect, useRef, useState } from 'react';
import { healthSnapshotToSpeed } from '../modules/stillhaven/engine/bioMapping';
import { useStillStore } from '../stores/stillStore';
import type { HealthSnapshotPayload } from '../types/signals';

const STALE_MS = 3 * 60 * 1000;   // revert to base after 3 min without a signal
const SMOOTHING = 0.3;             // 0.7 * old + 0.3 * new
const MIN_DELTA = 0.1;             // only update engine if speed changes by ≥ 0.1 Hz

interface Options {
  enabled: boolean;
  baseSpeed: number;
}

interface Result {
  isAdapting: boolean;
  /** Returns the count of speed adjustments made during the current session. */
  getAdaptations: () => number;
}

export function useStillBioFeedback({ enabled, baseSpeed }: Options): Result {
  const [isAdapting, setIsAdapting] = useState(false);
  const smoothedRef = useRef<number>(baseSpeed);
  const appliedHzRef = useRef<number>(baseSpeed);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adaptationsRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) {
      setIsAdapting(false);
      return;
    }

    // Reset count at the start of each session
    adaptationsRef.current = 0;

    // No-op in browser / web build — Tauri events are unavailable.
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      return;
    }

    let cancelled = false;
    let unlistenFn: (() => void) | null = null;

    // Dynamic import keeps the web bundle clean — tauri event module is absent there.
    import('@tauri-apps/api/event').then(({ listen }) => {
      if (cancelled) return;

      listen<{ type: string; payload: string }>('wear://signal', (event) => {
        if (cancelled) return;
        if (event.payload.type !== 'health_snapshot') return;

        let snap: Partial<HealthSnapshotPayload>;
        try {
          snap = JSON.parse(event.payload.payload) as Partial<HealthSnapshotPayload>;
        } catch {
          return;
        }

        const targetHz = healthSnapshotToSpeed(
          { hrvAvg: snap.hrvAvg, readinessScore: snap.readinessScore, heartRate: snap.heartRate },
          baseSpeed,
        );

        // Exponential smoothing to avoid jitter from single readings
        smoothedRef.current = 0.7 * smoothedRef.current + SMOOTHING * targetHz;

        if (Math.abs(smoothedRef.current - appliedHzRef.current) >= MIN_DELTA) {
          appliedHzRef.current = smoothedRef.current;
          useStillStore.getState().setSpeed(smoothedRef.current);
          adaptationsRef.current += 1;
        }

        setIsAdapting(true);

        // Reset stale timer
        if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
        staleTimerRef.current = setTimeout(() => {
          if (!cancelled) {
            useStillStore.getState().setSpeed(baseSpeed);
            smoothedRef.current = baseSpeed;
            setIsAdapting(false);
          }
        }, STALE_MS);
      }).then((unlisten) => {
        if (cancelled) { unlisten(); return; }
        unlistenFn = unlisten;
      }).catch(() => { /* Tauri not available */ });
    }).catch(() => { /* module unavailable in web build */ });

    return () => {
      cancelled = true;
      unlistenFn?.();
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    };
  }, [enabled, baseSpeed]);

  return { isAdapting, getAdaptations: () => adaptationsRef.current };
}
