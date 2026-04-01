/**
 * AICardWrapper
 *
 * Wraps any AI insight card with a privacy / locality badge so users can
 * see at a glance where inference is happening.
 *
 * Badge states:
 *   "Generated locally"   — apiKeySource null + Ollama configured and online
 *   "Running in cloud mode" — apiKeySource 'user' (OpenAI BYOK)
 *   "Ollama offline"      — Ollama configured but status check failed
 *   (no badge)            — AI features disabled entirely
 */

import type { ReactNode } from 'react';

export type AISource = 'local' | 'cloud' | 'ollama-offline' | 'disabled';

interface AICardWrapperProps {
  children: ReactNode;
  /** Source of AI inference, derived from settings + runtime Ollama check. */
  source: AISource;
}

const badgeConfig: Record<Exclude<AISource, 'disabled'>, { label: string; ariaLabel: string; className: string }> = {
  local: {
    label: '0 bytes left your device',
    ariaLabel: 'Generated locally',
    className:
      'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400',
  },
  cloud: {
    label: 'Cloud mode',
    ariaLabel: 'Running in cloud mode',
    className:
      'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
  },
  'ollama-offline': {
    label: 'Ollama offline',
    ariaLabel: 'Ollama offline',
    className:
      'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
  },
};

export function AICardWrapper({ children, source }: AICardWrapperProps) {
  return (
    <div className="relative">
      {source !== 'disabled' && (
        <div className="flex justify-end mb-1">
          <span
            aria-label={badgeConfig[source].ariaLabel}
            className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${badgeConfig[source].className}`}
          >
            {source === 'local' && (
              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            )}
            {badgeConfig[source].label}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Derive the AISource from runtime settings + Ollama availability.
 *
 * @param apiKeySource  From AISettings — null means no cloud key configured
 * @param ollamaEnabled Whether Ollama is configured in settings
 * @param ollamaOnline  Result of the Ollama health check (null = not yet checked)
 * @param aiEnabled     Whether AI features are enabled at all
 */
export function deriveAISource(
  aiEnabled: boolean,
  apiKeySource: 'user' | 'subscription' | null,
  ollamaEnabled: boolean,
  ollamaOnline: boolean,
): AISource {
  if (!aiEnabled) return 'disabled';
  if (apiKeySource === 'user' || apiKeySource === 'subscription') return 'cloud';
  if (ollamaEnabled && ollamaOnline) return 'local';
  if (ollamaEnabled && !ollamaOnline) return 'ollama-offline';
  return 'disabled';
}
