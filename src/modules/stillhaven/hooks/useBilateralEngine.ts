import { useStillStore } from '../../../stores/stillStore';
import type { EngineConfig } from '../engine/bilateralEngine';

export function useBilateralEngine() {
  const isRunning = useStillStore((s) => s.isRunning);
  const isPaused = useStillStore((s) => s.isPaused);
  const elapsedSeconds = useStillStore((s) => s.elapsedSeconds);
  const lastTick = useStillStore((s) => s.lastTick);
  const startEngine = useStillStore((s) => s.startEngine);
  const stopEngine = useStillStore((s) => s.stopEngine);
  const resumeEngine = useStillStore((s) => s.resumeEngine);
  const setSpeed = useStillStore((s) => s.setSpeed);

  return {
    isRunning,
    isPaused,
    elapsedSeconds,
    lastTick,
    /** MUST be called synchronously inside a user-gesture handler. */
    startEngine: (config?: Partial<EngineConfig>) => startEngine(config),
    stopEngine,
    /** MUST be called synchronously inside the tap-to-resume button's onClick. */
    resumeEngine,
    setSpeed,
  };
}
