/**
 * InsightsView - AI insights and analysis
 *
 * Per UX spec:
 * - AI content lives ONLY here
 * - Never appears while typing
 * - Never in writing view
 * - Never automatically
 *
 * This is the only place in the app where AI analysis is shown.
 */

import { useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore';

interface InsightSection {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const INSIGHT_SECTIONS: InsightSection[] = [
  {
    id: 'patterns',
    title: 'Mood Patterns',
    description: 'Trends in your emotional state over time',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    id: 'themes',
    title: 'Common Themes',
    description: 'Topics that appear frequently in your entries',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
      </svg>
    ),
  },
  {
    id: 'reflections',
    title: 'Reflections',
    description: 'AI-generated observations from your writing',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
      </svg>
    ),
  },
];

export function InsightsView() {
  const aiSettings = useSettingsStore((s) => s.settings.ai);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  // AI is disabled
  if (!aiSettings.enabled) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-slate-800 dark:text-slate-100 mb-2">
            AI Insights Disabled
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            Enable AI features in Settings to see insights about your journal.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Settings → AI → Enable AI Features
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-1">
          Insights
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          AI-powered observations from your journal
        </p>
      </div>

      {/* Section cards */}
      <div className="space-y-3">
        {INSIGHT_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setSelectedSection(section.id === selectedSection ? null : section.id)}
            className={`
              w-full text-left p-4 rounded-xl border transition-all
              ${selectedSection === section.id
                ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800'
                : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
              }
            `}
          >
            <div className="flex items-center gap-3">
              <div className={`
                w-10 h-10 rounded-lg flex items-center justify-center
                ${selectedSection === section.id
                  ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                }
              `}>
                {section.icon}
              </div>
              <div className="flex-1">
                <h3 className={`font-medium ${selectedSection === section.id ? 'text-violet-700 dark:text-violet-300' : 'text-slate-800 dark:text-slate-100'}`}>
                  {section.title}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {section.description}
                </p>
              </div>
              <svg
                className={`w-5 h-5 text-slate-400 transition-transform ${selectedSection === section.id ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>

            {/* Expanded content */}
            {selectedSection === section.id && (
              <div className="mt-4 pt-4 border-t border-violet-100 dark:border-violet-800/50">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {section.id === 'patterns' && 'Your mood has been generally positive this week. You tend to feel best on weekdays.'}
                  {section.id === 'themes' && 'Recent themes include: work, creativity, relationships, and personal growth.'}
                  {section.id === 'reflections' && 'You\'ve been reflecting more on long-term goals lately. Consider setting aside time for planning.'}
                </p>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Privacy note */}
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-8">
        All analysis is performed locally. Your data never leaves your device.
      </p>
    </div>
  );
}
