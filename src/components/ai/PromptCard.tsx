/**
 * PromptCard - Display a journal prompt suggestion
 */

import type { AIPrompt } from '../../types/ai';

interface PromptCardProps {
  prompt: AIPrompt;
  onUse: (prompt: AIPrompt) => void;
  onDismiss: (id: string) => void;
}

const CATEGORY_ICONS: Record<AIPrompt['category'], string> = {
  gratitude: '🙏',
  reflection: '💭',
  goals: '🎯',
  emotions: '💜',
  'self-care': '🌸',
  exploration: '✨',
};

const CATEGORY_COLORS: Record<AIPrompt['category'], string> = {
  gratitude: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
  reflection: 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800',
  goals: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
  emotions: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800',
  'self-care': 'bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800',
  exploration: 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800',
};

export function PromptCard({ prompt, onUse, onDismiss }: PromptCardProps) {
  return (
    <div
      className={`
        relative p-4 rounded-xl border transition-all duration-200
        hover:shadow-md hover:scale-[1.01]
        ${CATEGORY_COLORS[prompt.category]}
      `}
    >
      {/* Category badge */}
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 capitalize">
          <span>{CATEGORY_ICONS[prompt.category]}</span>
          {prompt.category}
        </span>

        {/* Dismiss button */}
        <button
          type="button"
          onClick={() => onDismiss(prompt.id)}
          className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-black/20 transition-colors"
          aria-label="Dismiss prompt"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Prompt text */}
      <p className="text-slate-700 dark:text-slate-200 font-medium mb-3">
        {prompt.text}
      </p>

      {/* Reasoning (subtle) */}
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 italic">
        {prompt.reasoning}
      </p>

      {/* Use prompt button */}
      <button
        type="button"
        onClick={() => onUse(prompt)}
        className="w-full py-2 px-4 rounded-lg bg-white/60 dark:bg-black/20 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-white dark:hover:bg-black/30 transition-colors"
      >
        Use this prompt
      </button>
    </div>
  );
}
