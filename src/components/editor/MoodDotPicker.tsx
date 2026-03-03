/**
 * MoodDotPicker
 *
 * A compact, ambient mood selector for the WritingView status bar.
 *
 * Design principles:
 * - Non-intrusive: lives in the existing status bar, takes minimal space
 * - Auto-detected mood is pre-selected and subtly indicated with a spark icon
 * - Single-click override: user can tap any dot to set their own mood
 * - Selected dot is larger and colored; others are small and grey
 * - Gentle pulse animation on first auto-detection to draw attention once
 */

import { useEffect, useRef, useState } from 'react';
import type { MoodLevel } from '../../types/journal';
import { MOOD_OPTIONS } from '../../types/journal';

// Tailwind bg classes per mood level
const DOT_COLORS: Record<MoodLevel, string> = {
  1: 'bg-rose-500',
  2: 'bg-orange-400',
  3: 'bg-amber-400',
  4: 'bg-lime-400',
  5: 'bg-emerald-500',
};

interface MoodDotPickerProps {
  mood: MoodLevel | null;
  isAutoDetected: boolean;
  wordCount: number;
  onChange: (mood: MoodLevel) => void;
}

export function MoodDotPicker({ mood, isAutoDetected, wordCount, onChange }: MoodDotPickerProps) {
  const [pulse, setPulse] = useState(false);
  const prevMoodRef = useRef<MoodLevel | null>(null);
  const [hovered, setHovered] = useState<MoodLevel | null>(null);

  // Pulse once when mood first auto-detected
  useEffect(() => {
    if (mood !== null && prevMoodRef.current === null && isAutoDetected) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1200);
      prevMoodRef.current = mood;
      return () => clearTimeout(t);
    }
    prevMoodRef.current = mood;
  }, [mood, isAutoDetected]);

  const displayMood = hovered ?? mood;
  const option = displayMood ? MOOD_OPTIONS[displayMood - 1] : null;

  return (
    <div className="flex items-center gap-1.5" title={option ? `Mood: ${option.emoji} ${option.label}` : wordCount < 8 ? 'Write a bit more to auto-detect mood' : 'Detecting mood…'}>
      {/* Auto-detected indicator */}
      {isAutoDetected && mood !== null && (
        <span className="text-[10px] text-violet-400 dark:text-violet-500 select-none" title="Auto-detected from your writing">
          ✦
        </span>
      )}

      {/* 5 mood dots */}
      {([1, 2, 3, 4, 5] as MoodLevel[]).map((level) => {
        const isActive = level === mood;
        return (
          <button
            key={level}
            type="button"
            onClick={() => onChange(level)}
            onMouseEnter={() => setHovered(level)}
            onMouseLeave={() => setHovered(null)}
            title={`${MOOD_OPTIONS[level - 1].emoji} ${MOOD_OPTIONS[level - 1].label}`}
            className={`
              rounded-full transition-all duration-300 flex-shrink-0
              ${isActive
                ? `w-3 h-3 ${DOT_COLORS[level]} ${pulse ? 'animate-pulse' : ''} shadow-sm`
                : level === hovered
                  ? `w-2.5 h-2.5 ${DOT_COLORS[level]} opacity-60`
                  : 'w-1.5 h-1.5 bg-slate-200 dark:bg-slate-700 hover:scale-125'
              }
            `}
          />
        );
      })}

      {/* Current mood emoji — subtle, appears after detection */}
      {mood !== null && (
        <span className="text-[11px] leading-none select-none transition-all">
          {MOOD_OPTIONS[mood - 1].emoji}
        </span>
      )}
    </div>
  );
}
