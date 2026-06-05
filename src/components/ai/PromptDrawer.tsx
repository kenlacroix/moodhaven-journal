/**
 * PromptDrawer
 *
 * A slide-up panel that gives the user access to writing prompts without
 * occupying any space in the writing view until opened.
 *
 * Three tabs:
 *   For You  — AI-personalised prompts (badge when AI enabled)
 *   General  — always-available local prompts across all categories
 *   Health   — locally generated from Oura biometric context (hidden if unavailable)
 *
 * Triggered by the ✦ button in the status bar.
 * Closes on backdrop click, close button, or after using a prompt.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AIPrompt } from '../../types/ai';
import { TemplateSelector } from '../journal/TemplateSelector';
import type { JournalTemplate } from '../../lib/utils/journalTemplates';

// ============================================================================
// Category colours (shared with PromptCard)
// ============================================================================

const CATEGORY_ICONS: Record<AIPrompt['category'], string> = {
  gratitude: '🙏',
  reflection: '💭',
  goals: '🎯',
  emotions: '💜',
  'self-care': '🌸',
  exploration: '✨',
};

const CATEGORY_BADGE: Record<AIPrompt['category'], string> = {
  gratitude:   'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  reflection:  'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
  goals:       'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  emotions:    'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400',
  'self-care': 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400',
  exploration: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400',
};

const CARD_BG: Record<AIPrompt['category'], string> = {
  gratitude:   'border-emerald-100 dark:border-emerald-800/60 hover:border-emerald-300 dark:hover:border-emerald-700',
  reflection:  'border-violet-100 dark:border-violet-800/60 hover:border-violet-300 dark:hover:border-violet-700',
  goals:       'border-amber-100 dark:border-amber-800/60 hover:border-amber-300 dark:hover:border-amber-700',
  emotions:    'border-rose-100 dark:border-rose-800/60 hover:border-rose-300 dark:hover:border-rose-700',
  'self-care': 'border-pink-100 dark:border-pink-800/60 hover:border-pink-300 dark:hover:border-pink-700',
  exploration: 'border-sky-100 dark:border-sky-800/60 hover:border-sky-300 dark:hover:border-sky-700',
};

// ============================================================================
// Compact card (one click to use)
// ============================================================================

function DrawerPromptCard({
  prompt,
  onUse,
}: {
  prompt: AIPrompt;
  onUse: (p: AIPrompt) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onUse(prompt)}
      className={`
        group w-full text-left flex flex-col gap-2 p-3.5 rounded-xl border
        bg-white dark:bg-slate-900/80 transition-all duration-200
        hover:shadow-md hover:-translate-y-0.5
        ${CARD_BG[prompt.category]}
      `}
    >
      {/* Category badge */}
      <span
        className={`inline-flex items-center gap-1 self-start text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${CATEGORY_BADGE[prompt.category]}`}
      >
        <span className="text-[11px]">{CATEGORY_ICONS[prompt.category]}</span>
        {prompt.category}
      </span>

      {/* Prompt text */}
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-snug line-clamp-3">
        {prompt.text}
      </p>

      {/* Reasoning */}
      <p className="text-[10px] text-slate-400 dark:text-slate-500 italic leading-snug line-clamp-1">
        {prompt.reasoning}
      </p>

      {/* Use affordance — appears on hover */}
      <span className="self-end text-xs font-medium text-violet-500 dark:text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        Use this →
      </span>
    </button>
  );
}

// ============================================================================
// Skeleton card
// ============================================================================

function CardSkeleton() {
  return (
    <div className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/80 animate-pulse space-y-2.5">
      <div className="w-16 h-4 bg-slate-100 dark:bg-slate-800 rounded-full" />
      <div className="space-y-1.5">
        <div className="h-3.5 bg-slate-100 dark:bg-slate-800 rounded w-full" />
        <div className="h-3.5 bg-slate-100 dark:bg-slate-800 rounded w-5/6" />
        <div className="h-3.5 bg-slate-100 dark:bg-slate-800 rounded w-3/4" />
      </div>
      <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/2" />
    </div>
  );
}

// ============================================================================
// Tab button
// ============================================================================

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-sm
        font-medium transition-all duration-200
        ${
          active
            ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
        }
      `}
    >
      {children}
    </button>
  );
}

// ============================================================================
// Main drawer
// ============================================================================

type Tab = 'forYou' | 'general' | 'health' | 'templates';

interface PromptDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  forYouPrompts: AIPrompt[];
  generalPrompts: AIPrompt[];
  healthPrompts: AIPrompt[];
  isLoading: boolean;
  isAIEnabled: boolean;
  onUsePrompt: (prompt: AIPrompt) => void;
  onRefresh: () => void;
  onDisablePrompts: () => void;
  onUseTemplate?: (template: JournalTemplate) => void;
  usedTemplateIds?: string[];
}

export function PromptDrawer({
  isOpen,
  onClose,
  forYouPrompts,
  generalPrompts,
  healthPrompts,
  isLoading,
  isAIEnabled,
  onUsePrompt,
  onRefresh,
  onDisablePrompts,
  onUseTemplate,
  usedTemplateIds,
}: PromptDrawerProps) {
  const [tab, setTab] = useState<Tab>('forYou');
  const panelRef = useRef<HTMLDivElement>(null);

  // Block keyboard focus into the closed drawer via `inert`.
  useEffect(() => {
    const el = panelRef.current as HTMLElement | null;
    if (!el) return;
    if (isOpen) el.removeAttribute('inert');
    else el.setAttribute('inert', '');
  }, [isOpen]);

  // Reset to For You whenever drawer opens
  useEffect(() => {
    if (isOpen) setTab('forYou');
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const handleUse = useCallback(
    (prompt: AIPrompt) => {
      onUsePrompt(prompt);
      onClose();
    },
    [onUsePrompt, onClose]
  );

  const handleDisable = useCallback(() => {
    onDisablePrompts();
    onClose();
  }, [onDisablePrompts, onClose]);

  const activePrompts =
    tab === 'forYou' ? forYouPrompts
    : tab === 'general' ? generalPrompts
    : tab === 'health' ? healthPrompts
    : [];

  const handleUseTemplate = useCallback(
    (template: JournalTemplate) => {
      onUseTemplate?.(template);
      onClose();
    },
    [onUseTemplate, onClose],
  );

  const showHealthTab = healthPrompts.length > 0 || isLoading;

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        className={`fixed inset-0 z-40 bg-black/20 dark:bg-black/50 backdrop-blur-[1px] transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* ── Panel ── centered + width-matched to writing column ── */}
      <div
        className={`
          fixed bottom-0 inset-x-0 z-50
          flex items-end justify-center
          px-6 sm:px-12 lg:px-20
          transition-transform duration-300 ease-out
          ${isOpen ? 'translate-y-0 pointer-events-auto' : 'translate-y-full pointer-events-none'}
        `}
      >
        <div
          ref={panelRef}
          className="w-full max-w-3xl lg:max-w-[75%] bg-white dark:bg-slate-900 rounded-t-2xl shadow-2xl flex flex-col"
          style={{ height: '56vh', maxHeight: '520px' }}
          role="dialog"
          aria-label="Writing prompts"
          aria-hidden={!isOpen}
        >
          {/* ── Drag handle ── */}
          <div className="flex-shrink-0 pt-3 flex justify-center">
            <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-slate-700" />
          </div>

          {/* ── Header ── */}
          <div className="flex-shrink-0 px-5 pt-3 pb-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 tracking-tight">
                Writing Prompts
              </h2>
              <div className="flex items-center gap-1.5">
                {/* Refresh */}
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isLoading}
                  title="Refresh prompts"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-violet-500 dark:hover:text-violet-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
                >
                  <svg
                    className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
                {/* Close */}
                <button
                  type="button"
                  onClick={onClose}
                  title="Close"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* ── Tabs ── */}
            <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl mb-4">
              <TabBtn active={tab === 'forYou'} onClick={() => setTab('forYou')}>
                For You
                {isAIEnabled && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 font-semibold tracking-wide">
                    AI
                  </span>
                )}
              </TabBtn>
              <TabBtn active={tab === 'general'} onClick={() => setTab('general')}>
                General
              </TabBtn>
              {showHealthTab && (
                <TabBtn active={tab === 'health'} onClick={() => setTab('health')}>
                  Health
                  <span className="text-[11px]">🌿</span>
                </TabBtn>
              )}
              {onUseTemplate && (
                <TabBtn active={tab === 'templates'} onClick={() => setTab('templates')}>
                  Templates
                </TabBtn>
              )}
            </div>
          </div>

          {/* ── Content (scrollable) ── */}
          <div className="flex-1 overflow-y-auto px-5 pb-2">
            {tab === 'templates' ? (
              <div className="pt-1 pb-2">
                <TemplateSelector
                  onSelect={handleUseTemplate}
                  usedTemplateIds={usedTemplateIds}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pb-2">
                {isLoading ? (
                  <>
                    <CardSkeleton />
                    <CardSkeleton />
                    <CardSkeleton />
                    <CardSkeleton />
                  </>
                ) : activePrompts.length > 0 ? (
                  activePrompts.map((p) => (
                    <DrawerPromptCard key={p.id} prompt={p} onUse={handleUse} />
                  ))
                ) : (
                  <div className="col-span-2 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                    {tab === 'health'
                      ? 'Connect your Oura Ring and journal for a few days to unlock health-aware prompts.'
                      : 'No prompts available.'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="flex-shrink-0 border-t border-slate-100 dark:border-slate-800 px-5 py-3 flex items-center justify-center">
            <button
              type="button"
              onClick={handleDisable}
              className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              Don't show prompts
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
