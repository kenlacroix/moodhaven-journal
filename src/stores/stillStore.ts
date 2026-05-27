/**
 * StillHaven Store
 *
 * Owns the BilateralEngine singleton. Manages session run state and the
 * elapsed timer so all components share the same counter without each
 * polling independently.
 *
 * Engine lifecycle contract (D3):
 *   startEngine() MUST be called synchronously inside a user-gesture handler
 *   so that AudioContext.resume() succeeds on all browsers (no await before).
 */

import { create } from 'zustand';
import { BilateralEngine, type BilateralEvent, type EngineConfig } from '../modules/stillhaven/engine/bilateralEngine';

interface StillState {
  engine: BilateralEngine | null;
  isRunning: boolean;
  isPaused: boolean;
  elapsedSeconds: number;
  lastTick: BilateralEvent | null;

  // Actions
  startEngine: (config?: Partial<EngineConfig>) => void;
  stopEngine: () => void;
  resumeEngine: () => void;
  setSpeed: (hz: number) => void;
}

let _elapsedTimer: ReturnType<typeof setInterval> | null = null;
let _unsubTick: (() => void) | null = null;
let _unsubPause: (() => void) | null = null;

function clearElapsedTimer(): void {
  if (_elapsedTimer !== null) {
    clearInterval(_elapsedTimer);
    _elapsedTimer = null;
  }
}

export const useStillStore = create<StillState>((set, get) => ({
  engine: null,
  isRunning: false,
  isPaused: false,
  elapsedSeconds: 0,
  lastTick: null,

  startEngine(config) {
    const existing = get().engine;

    // Reuse existing engine if already built (e.g. resume after pause)
    const engine = existing ?? new BilateralEngine(config);

    // Wire subscriptions if this is a fresh engine
    if (!existing) {
      _unsubTick?.();
      _unsubPause?.();

      _unsubTick = engine.onTick((ev) => {
        set({ lastTick: ev });
      });

      _unsubPause = engine.onPause(() => {
        clearElapsedTimer();
        set({ isPaused: true });
      });
    }

    // MUST be synchronous — AudioContext.resume() needs to be inside the gesture
    engine.start();

    set({ engine, isRunning: true, isPaused: false, elapsedSeconds: 0 });

    clearElapsedTimer();
    _elapsedTimer = setInterval(() => {
      const { isRunning, isPaused } = get();
      if (isRunning && !isPaused) {
        set((s) => ({ elapsedSeconds: s.elapsedSeconds + 1 }));
      }
    }, 1000);
  },

  stopEngine() {
    const { engine } = get();
    engine?.stop();

    _unsubTick?.();
    _unsubPause?.();
    _unsubTick = null;
    _unsubPause = null;
    clearElapsedTimer();

    set({ engine: null, isRunning: false, isPaused: false, elapsedSeconds: 0, lastTick: null });
  },

  resumeEngine() {
    const { engine } = get();
    if (!engine) return;

    // MUST be synchronous — inside the tap-to-resume button's onClick
    engine.resume();

    set({ isPaused: false });

    clearElapsedTimer();
    _elapsedTimer = setInterval(() => {
      const { isRunning, isPaused } = get();
      if (isRunning && !isPaused) {
        set((s) => ({ elapsedSeconds: s.elapsedSeconds + 1 }));
      }
    }, 1000);
  },

  setSpeed(hz) {
    get().engine?.setSpeed(hz);
  },
}));
