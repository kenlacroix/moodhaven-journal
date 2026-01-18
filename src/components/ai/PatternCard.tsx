/**
 * PatternCard - Display a detected recurring pattern
 */

import type { RecurringPattern } from '../../types/ai';

interface PatternCardProps {
  pattern: RecurringPattern;
}

const TYPE_CONFIG: Record<RecurringPattern['type'], { icon: string; color: string }> = {
  mood_cycle: {
    icon: '🔄',
    color: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
  },
  weekly_pattern: {
    icon: '📅',
    color: 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800',
  },
  trigger: {
    icon: '⚡',
    color: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800',
  },
  positive_habit: {
    icon: '⭐',
    color: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
  },
};

export function PatternCard({ pattern }: PatternCardProps) {
  const config = TYPE_CONFIG[pattern.type];

  return (
    <div className={`p-4 rounded-xl border ${config.color}`}>
      <div className="flex items-start gap-3">
        <span className="text-xl">{config.icon}</span>

        <div className="flex-1 min-w-0">
          {/* Description */}
          <p className="text-slate-700 dark:text-slate-200 font-medium">
            {pattern.description}
          </p>

          {/* Frequency */}
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {pattern.frequency}
          </p>

          {/* Suggestion if available */}
          {pattern.suggestion && (
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 p-2 bg-white/50 dark:bg-black/20 rounded-lg">
              💡 {pattern.suggestion}
            </p>
          )}

          {/* Confidence indicator */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full"
                style={{ width: `${pattern.confidence * 100}%` }}
              />
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {Math.round(pattern.confidence * 100)}% confident
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
