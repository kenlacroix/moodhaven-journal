/**
 * MoodSelector - Calm, accessible mood selection component
 *
 * Design principles:
 * - Large touch targets for ease of use
 * - Soft animations for calm feel
 * - Clear visual feedback on selection
 * - Keyboard navigable
 */

import { type MoodLevel, MOOD_OPTIONS } from '../../types/journal';

interface MoodSelectorProps {
  value: MoodLevel | null;
  onChange: (mood: MoodLevel) => void;
  disabled?: boolean;
}

export function MoodSelector({
  value,
  onChange,
  disabled = false,
}: MoodSelectorProps) {
  return (
    <div className="space-y-3">
      <p id="mood-selector-label" className="block text-sm font-medium text-slate-600 dark:text-slate-300">
        How are you feeling?
      </p>

      <div
        role="group"
        aria-labelledby="mood-selector-label"
        className="flex items-center justify-center gap-2 sm:gap-4"
      >
        {MOOD_OPTIONS.map((option) => {
          const isSelected = value === option.level;

          return (
            <button
              key={option.level}
              type="button"
              onClick={() => onChange(option.level)}
              disabled={disabled}
              aria-label={`${option.label} mood`}
              aria-pressed={isSelected}
              className={`
                group relative flex flex-col items-center gap-1.5 p-3 sm:p-4
                rounded-2xl transition-all duration-200 ease-out
                focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
                ${
                  isSelected
                    ? 'bg-white dark:bg-slate-800 shadow-lg scale-110 -translate-y-1'
                    : 'bg-slate-50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 hover:shadow-md hover:-translate-y-0.5'
                }
              `}
            >
              {/* Mood indicator dot */}
              <span
                className={`
                  absolute -top-1 -right-1 w-3 h-3 rounded-full
                  transition-all duration-200
                  ${option.color}
                  ${isSelected ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}
                `}
              />

              {/* Emoji */}
              <span
                className={`
                  text-2xl sm:text-3xl transition-transform duration-200
                  ${isSelected ? 'scale-110' : 'group-hover:scale-105'}
                `}
                role="img"
                aria-hidden="true"
              >
                {option.emoji}
              </span>

              {/* Label */}
              <span
                className={`
                  text-xs font-medium transition-colors duration-200
                  ${
                    isSelected
                      ? 'text-slate-800 dark:text-slate-100'
                      : 'text-slate-500 dark:text-slate-400'
                  }
                `}
              >
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
