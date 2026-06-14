/**
 * SessionChrome — shared overlay UI for the 2D session environments
 * (Underwater2D / Forest2D / Sky2D): elapsed timer, pause overlay, control bar.
 * The canvas content differs per environment; this chrome does not.
 */

import React from 'react';
import { formatElapsed } from './canvasUtils';

interface Props {
  elapsedSeconds: number;
  isAdapting: boolean;
  isPaused: boolean;
  isRunning: boolean;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
}

export function SessionChrome({
  elapsedSeconds,
  isAdapting,
  isPaused,
  isRunning,
  onPause,
  onResume,
  onEnd,
}: Props): React.JSX.Element {
  return (
    <>
      {/* Elapsed timer — top-left, always visible */}
      <div className="absolute top-4 left-5 select-none pointer-events-none flex items-center gap-2">
        <span className="text-white/60 text-sm tabular-nums font-medium">{formatElapsed(elapsedSeconds)}</span>
        {isAdapting && (
          <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-pulse" title="Session adapting to biometrics" />
        )}
      </div>

      {/* Paused overlay */}
      {isPaused && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
          <p className="text-white/90 text-sm mb-4 font-medium tracking-wide">Paused</p>
          <button
            onClick={onResume}
            className="px-6 py-2.5 rounded-full bg-white/20 border border-white/30 text-white text-sm font-medium hover:bg-white/30 transition-colors"
          >
            Resume
          </button>
        </div>
      )}

      {/* Always-visible control bar */}
      <div className="absolute bottom-0 inset-x-0 h-20 flex items-center justify-between px-6 bg-gradient-to-t from-black/50 to-transparent">
        {!isPaused && isRunning ? (
          <button
            onClick={onPause}
            className="px-4 py-1.5 rounded-full border border-white/30 text-white/70 text-sm hover:bg-white/10 transition-colors"
          >
            Pause
          </button>
        ) : (
          <div />
        )}
        <button
          onClick={onEnd}
          className="px-5 py-2 rounded-full bg-white/15 border border-white/30 text-white/90 text-sm font-medium hover:bg-white/25 transition-colors"
        >
          End session
        </button>
      </div>
    </>
  );
}
