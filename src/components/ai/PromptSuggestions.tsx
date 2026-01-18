/**
 * PromptSuggestions - Container for displaying journal prompts
 */

import { useState } from 'react';
import { PromptCard } from './PromptCard';
import type { AIPrompt } from '../../types/ai';

interface PromptSuggestionsProps {
  prompts: AIPrompt[];
  isLoading: boolean;
  isAIEnabled: boolean;
  onUsePrompt: (prompt: AIPrompt) => void;
  onDismissPrompt: (id: string) => void;
  onRefresh: () => void;
}

export function PromptSuggestions({
  prompts,
  isLoading,
  isAIEnabled,
  onUsePrompt,
  onDismissPrompt,
  onRefresh,
}: PromptSuggestionsProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (prompts.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
        >
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <h3 className="font-semibold">Writing Prompts</h3>
          {isAIEnabled && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
              AI
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          aria-label="Refresh prompts"
        >
          <svg
            className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      {/* Prompts grid */}
      {isExpanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {isLoading ? (
            // Loading skeletons
            <>
              <PromptSkeleton />
              <PromptSkeleton />
              <PromptSkeleton />
            </>
          ) : (
            prompts.map((prompt) => (
              <PromptCard
                key={prompt.id}
                prompt={prompt}
                onUse={onUsePrompt}
                onDismiss={onDismissPrompt}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function PromptSkeleton() {
  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-12 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full" />
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
      </div>
      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mt-3" />
      <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded mt-4" />
    </div>
  );
}
