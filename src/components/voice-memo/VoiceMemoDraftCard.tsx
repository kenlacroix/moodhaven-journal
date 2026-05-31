/**
 * VoiceMemoDraftCard — compact card for a pending voice memo draft.
 *
 * Shows: duration, timestamp, optional context chip, 2-line transcript
 * preview, inferred mood dots, Review and Discard CTAs.
 */

import type { VoiceMemo } from '../../lib/services/voiceMemoService';

// Mood colours from design system
const MOOD_COLORS: Record<number, string> = {
  5: '#10b981',
  4: '#84cc16',
  3: '#eab308',
  2: '#f97316',
  1: '#ef4444',
};

interface VoiceMemoDraftCardProps {
  memo: VoiceMemo;
  onReview: (memo: VoiceMemo) => void;
  onDiscard: (id: string) => void;
}

function formatCardDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min}m ${sec}s`;
}

export function VoiceMemoDraftCard({ memo, onReview, onDiscard }: VoiceMemoDraftCardProps) {
  const timeLabel = new Date(memo.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const preview = memo.transcription
    ? memo.transcription.replace(/\s+/g, ' ').trim().slice(0, 140)
    : null;

  const inferredMood = memo.inferred_mood ?? 0;

  return (
    <div className="rounded-xl border border-sky-100 dark:border-sky-900/40 bg-sky-50 dark:bg-sky-950/20 p-4 transition-shadow duration-150 hover:shadow-sm">
      {/* Header row */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sky-500 dark:text-sky-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
        </span>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Voice Memo
        </span>
        <span className="text-xs text-slate-400 dark:text-slate-500">·</span>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {formatCardDuration(memo.duration_ms)}
        </span>
      </div>

      {/* Context chip */}
      {(memo.context || memo.health_json) && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 line-clamp-1">
          {timeLabel}
          {memo.context ? ` · ${memo.context}` : ''}
        </p>
      )}
      {!memo.context && !memo.health_json && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">{timeLabel}</p>
      )}

      {/* Transcript preview */}
      {preview ? (
        <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 mb-3">
          &ldquo;{preview}{memo.transcription && memo.transcription.length > 140 ? '…' : ''}&rdquo;
        </p>
      ) : (
        <p className="text-sm italic text-slate-400 dark:text-slate-500 mb-3">
          Transcribing…
        </p>
      )}

      {/* Footer: mood dots + CTAs */}
      <div className="flex items-center justify-between gap-2">
        {/* Mood dots (1–5, filled up to inferred_mood) */}
        <div className="flex items-center gap-1" aria-label={`Inferred mood: ${inferredMood || 'unknown'}`}>
          {[1, 2, 3, 4, 5].map((level) => (
            <span
              key={level}
              className="w-2.5 h-2.5 rounded-full transition-colors duration-150"
              style={{
                backgroundColor: level <= inferredMood
                  ? (MOOD_COLORS[level] ?? '#94a3b8')
                  : undefined,
              }}
              aria-hidden="true"
            >
              {level > inferredMood && (
                <span
                  className="block w-2.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-700"
                />
              )}
            </span>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onDiscard(memo.id)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors duration-150"
            aria-label="Discard draft"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onReview(memo)}
            disabled={!memo.transcription}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
          >
            Review
          </button>
        </div>
      </div>
    </div>
  );
}
