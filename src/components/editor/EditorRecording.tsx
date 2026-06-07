import { type STTState } from '../../hooks/useSpeechToText';

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function WaveformBars({ active }: { active: boolean }) {
  const bars = Array.from({ length: 20 }, (_, i) => i);

  if (!active || prefersReducedMotion) {
    return (
      <div className="flex items-center gap-px h-5" aria-hidden="true">
        {bars.map((i) => (
          <div
            key={i}
            className="w-px rounded-full bg-red-400 dark:bg-red-500"
            style={{ height: '6px' }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-px h-5" aria-hidden="true">
      {bars.map((i) => (
        <div
          key={i}
          className="w-px rounded-full bg-red-400 dark:bg-red-500 animate-waveform"
          style={{
            height: '6px',
            animationDelay: `${(i * 80) % 600}ms`,
            animationDuration: `${600 + (i * 37) % 400}ms`,
          }}
        />
      ))}
    </div>
  );
}

export interface RecordingStripProps {
  state: STTState;
  elapsedSeconds: number;
  onStop: () => void;
  onCancel: () => void;
}

export function RecordingStrip({ state, elapsedSeconds, onStop, onCancel }: RecordingStripProps) {
  const isRecording = state === 'recording';
  const isTranscribing = state === 'transcribing' || state === 'processing' || state === 'formatting';

  if (!isRecording && !isTranscribing) return null;

  return (
    <div className="flex-shrink-0 flex items-center gap-3 px-3 border-b border-red-100 dark:border-red-900/30 bg-red-50/60 dark:bg-red-950/20 h-10">
      {/* Waveform */}
      {isRecording ? (
        <WaveformBars active />
      ) : (
        <svg className="w-4 h-4 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}

      {/* Status text + timer */}
      <span className="text-xs text-red-600 dark:text-red-400 tabular-nums flex-1">
        {isRecording ? (
          <>{formatElapsed(elapsedSeconds)} &mdash; Recording&hellip;</>
        ) : (
          'Transcribing…'
        )}
      </span>

      {/* Stop / Cancel buttons */}
      {isRecording && (
        <>
          <button
            type="button"
            onClick={onStop}
            className="text-xs font-medium px-2 py-0.5 rounded bg-red-500 hover:bg-red-600 text-white transition-colors duration-150"
            aria-label="Stop recording"
          >
            Stop
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors duration-150"
            aria-label="Cancel recording"
          >
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
