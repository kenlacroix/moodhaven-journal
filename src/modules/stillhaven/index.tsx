// StillHaven — module entry view
// Phase 3: renders the underwater session scene for testing.
// Full check-in / check-out UI lands in Phase 4.

import React, { useCallback, useState } from 'react';
import { Underwater2D } from './environments/underwater/Underwater2D';
import { SubmergeOverlay } from './environments/underwater/SubmergeOverlay';
import { useBilateralEngine } from './hooks/useBilateralEngine';

type SceneState = 'idle' | 'submerging' | 'live' | 'ended';

export function StillView(): React.JSX.Element {
  const [scene, setScene] = useState<SceneState>('idle');
  const { startEngine, stopEngine } = useBilateralEngine();

  // Called synchronously in onClick — required for AudioContext.resume()
  const handleStart = useCallback(() => {
    startEngine();
    setScene('submerging');
  }, [startEngine]);

  const handleSubmergeComplete = useCallback(() => {
    setScene('live');
  }, []);

  const handleEnd = useCallback(() => {
    stopEngine();
    setScene('ended');
  }, [stopEngine]);

  const handlePause = useCallback(() => {
    // isPaused state is managed inside stillStore via engine.onPause()
  }, []);

  const handleResume = useCallback(() => {
    // resumeEngine() is called inside Underwater2D's resume button
  }, []);

  // ── Idle / ended: minimal launch screen ──────────────────────────────────
  if (scene === 'idle' || scene === 'ended') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-neutral-700">
        <p className="text-sm text-neutral-500">
          {scene === 'ended' ? 'Session complete.' : 'StillHaven — Phase 3 preview'}
        </p>
        <button
          onClick={handleStart}
          className="px-6 py-3 rounded-full bg-[#F28C38] text-white text-sm font-semibold shadow hover:bg-[#e07c28] transition-colors"
        >
          {scene === 'ended' ? 'Start again' : 'Start session'}
        </button>
      </div>
    );
  }

  // ── Submerging + live ─────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full">
      {/* Scene renders behind transition overlay */}
      {(scene === 'submerging' || scene === 'live') && (
        <Underwater2D
          onEnd={handleEnd}
          onPause={handlePause}
          onResume={handleResume}
        />
      )}

      {/* Submerge transition sits on top */}
      {scene === 'submerging' && (
        <SubmergeOverlay onComplete={handleSubmergeComplete} />
      )}
    </div>
  );
}
