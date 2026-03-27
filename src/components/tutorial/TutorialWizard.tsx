/**
 * TutorialWizard - Post-setup tutorial overlay
 *
 * A step-by-step wizard that teaches users how to use MoodHaven Journal
 * after initial setup. Shows automatically on first unlock and
 * can be replayed from Settings > General.
 */

import { useState, useEffect, useCallback } from 'react';

interface TutorialStep {
  id: string;
  title: string;
  subtitle: string;
  icon: string; // SVG path
  features: { title: string; description: string }[];
}

interface TutorialWizardProps {
  onComplete: () => void;
}

const STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to MoodHaven Journal',
    subtitle: "You're all set up! Let's take a quick tour of what you can do.",
    icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
    features: [
      {
        title: 'Track your mood daily',
        description: 'Choose from 5 mood levels with a simple tap',
      },
      {
        title: 'Write journal entries',
        description: 'Rich text editor with formatting and templates',
      },
      {
        title: 'Everything is encrypted',
        description: 'Your data is protected with AES-256 encryption',
      },
    ],
  },
  {
    id: 'editor',
    title: 'Your Writing Space',
    subtitle: 'The editor is your default view - a calm space for your thoughts.',
    icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
    features: [
      {
        title: 'Rich text formatting',
        description: 'Bold, italic, lists, links - use the toolbar or keyboard shortcuts',
      },
      {
        title: 'Auto-save',
        description: 'Your entries save automatically as you type - no need to worry',
      },
      {
        title: 'Journal templates',
        description: 'Start from pre-made templates like Gratitude, Reflection, and more',
      },
    ],
  },
  {
    id: 'sidebar',
    title: 'Navigate with the Sidebar',
    subtitle: 'The left sidebar is your hub for navigating between views.',
    icon: 'M4 6h16M4 12h16M4 18h7',
    features: [
      {
        title: 'New Entry button',
        description: 'Start a fresh journal entry from anywhere in the app',
      },
      {
        title: 'Quick navigation',
        description: 'Switch between Timeline, Search, On This Day, Insights, and Settings',
      },
      {
        title: 'Collapse & Lock',
        description: 'Collapse the sidebar for more space, and lock your journal when you step away',
      },
    ],
  },
  {
    id: 'find',
    title: 'Find Your Entries',
    subtitle: 'Multiple ways to browse and search your past entries.',
    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    features: [
      {
        title: 'Timeline',
        description: 'See all your entries in chronological order, grouped by date',
      },
      {
        title: 'Search',
        description: 'Find any entry by typing keywords - results appear instantly',
      },
      {
        title: 'On This Day',
        description: 'Revisit entries from the same date in previous years - your personal memories',
      },
    ],
  },
  {
    id: 'insights',
    title: 'Mood Insights',
    subtitle: 'Understand your patterns and trends over time.',
    icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
    features: [
      {
        title: 'Mood trends & patterns',
        description: 'Visual charts show how your mood changes over days and weeks',
      },
      {
        title: 'AI-powered insights (opt-in)',
        description: 'Get personalized prompts and wellness suggestions - your content is never sent',
      },
      {
        title: 'Configure in Settings',
        description: 'Choose your AI provider (OpenAI or local) and which features to enable',
      },
    ],
  },
  {
    id: 'ready',
    title: 'Start Journaling',
    subtitle: "That's it! Your secure journal is ready to use.",
    icon: 'M5 13l4 4L19 7',
    features: [
      {
        title: 'Your data is yours',
        description: 'Everything stays on your device, encrypted with your password',
      },
      {
        title: 'Customize in Settings',
        description: 'Adjust appearance, reminders, privacy, and AI features to your liking',
      },
      {
        title: 'Replay this tour anytime',
        description: 'Find it in Settings > General > Help',
      },
    ],
  },
];

export function TutorialWizard({ onComplete }: TutorialWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === STEPS.length - 1;
  const step = STEPS[currentStep];

  const goNext = useCallback(() => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep((s) => s + 1);
    }
  }, [isLastStep, onComplete]);

  const goBack = useCallback(() => {
    if (!isFirstStep) {
      setCurrentStep((s) => s - 1);
    }
  }, [isFirstStep]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onComplete();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        goNext();
      } else if (e.key === 'ArrowLeft') {
        goBack();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onComplete, goNext, goBack]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onComplete}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-3xl shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div className="h-1 bg-slate-100 dark:bg-slate-700">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-purple-600 transition-all duration-500"
            role="progressbar"
            aria-valuenow={currentStep + 1}
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Step indicators */}
        <div className="flex justify-center gap-2 pt-6 pb-2">
          {STEPS.map((s, index) => (
            <div
              key={s.id}
              aria-label={`Step ${index + 1} of ${STEPS.length}: ${s.title}`}
              className={`
                h-2 rounded-full transition-all duration-300
                ${index === currentStep
                  ? 'w-6 bg-violet-500'
                  : index < currentStep
                  ? 'w-2 bg-violet-300 dark:bg-violet-600'
                  : 'w-2 bg-slate-200 dark:bg-slate-700'
                }
              `}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="p-8" key={step.id}>
          <div className="text-center space-y-4 animate-fade-in">
            {/* Icon */}
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ${
              isLastStep
                ? 'bg-emerald-100 dark:bg-emerald-900/30'
                : 'bg-violet-100 dark:bg-violet-900/30'
            }`}>
              <svg
                className={`w-7 h-7 ${
                  isLastStep
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-violet-600 dark:text-violet-400'
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={step.icon} />
              </svg>
            </div>

            {/* Title */}
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">
                {step.title}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {step.subtitle}
              </p>
            </div>
          </div>

          {/* Feature cards */}
          <div className="mt-6 space-y-3">
            {step.features.map((feature) => (
              <div
                key={feature.title}
                className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50"
              >
                <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-slate-700 dark:text-slate-200 text-sm">
                    {feature.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Navigation */}
          <div className="mt-8 space-y-3">
            <div className="flex gap-3">
              {!isFirstStep && (
                <button
                  type="button"
                  onClick={goBack}
                  className="btn-secondary flex-1 py-3"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={goNext}
                className={`btn-primary py-3 ${isFirstStep ? 'w-full' : 'flex-1'}`}
                autoFocus
              >
                {isLastStep ? 'Start Writing' : 'Next'}
              </button>
            </div>

            {!isLastStep && (
              <button
                type="button"
                onClick={onComplete}
                className="w-full text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 py-1 transition-colors"
              >
                Skip tutorial
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
