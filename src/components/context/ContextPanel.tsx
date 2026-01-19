/**
 * ContextPanel - Side panel for entry metadata
 *
 * Per UX spec:
 * - Opens as side panel
 * - Overlays OUTSIDE writing column (writing remains readable)
 * - Dismissible via: Close button, ESC key, clicking outside
 * - Contains: Photos, attachments, links, location, weather, mood
 * - None of this appears unless panel is opened
 */

import { useEffect, useRef } from 'react';

interface ContextPanelProps {
  mood: number | null;
  onMoodChange: (mood: number | null) => void;
  onClose: () => void;
}

const MOODS = [
  { value: 1, emoji: '😢', label: 'Terrible' },
  { value: 2, emoji: '😔', label: 'Bad' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😊', label: 'Great' },
];

export function ContextPanel({ mood, onMoodChange, onClose }: ContextPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Delay to prevent immediate close on button click
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="
        fixed right-0 top-0 bottom-0 w-80
        bg-white dark:bg-slate-900
        border-l border-slate-200 dark:border-slate-800
        shadow-xl
        overflow-auto
        animate-in slide-in-from-right duration-200
      "
    >
      {/* Header */}
      <div className="sticky top-0 flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">
          Context
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Close panel"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-6">
        {/* Mood selector */}
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">
            How are you feeling?
          </label>
          <div className="flex justify-between">
            {MOODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => onMoodChange(mood === m.value ? null : m.value)}
                className={`
                  flex flex-col items-center gap-1 p-2 rounded-lg transition-all
                  ${mood === m.value
                    ? 'bg-violet-100 dark:bg-violet-900/30 scale-110'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                  }
                `}
                title={m.label}
              >
                <span className="text-2xl">{m.emoji}</span>
                <span className={`text-[10px] ${mood === m.value ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400'}`}>
                  {m.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Photos placeholder */}
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            Photos
          </label>
          <button
            type="button"
            className="w-full p-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-500 transition-colors"
          >
            <svg className="w-6 h-6 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            <span className="text-xs">Add photos</span>
          </button>
        </div>

        {/* Location placeholder */}
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            Location
          </label>
          <button
            type="button"
            className="w-full flex items-center gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-500 transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            Add location
          </button>
        </div>

        {/* Tags placeholder */}
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            Tags
          </label>
          <button
            type="button"
            className="w-full flex items-center gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-500 transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
            </svg>
            Add tags
          </button>
        </div>
      </div>

      {/* Keyboard hint */}
      <div className="absolute bottom-4 left-4 right-4">
        <p className="text-[10px] text-slate-300 dark:text-slate-600 text-center">
          Press <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px]">ESC</kbd> to close
        </p>
      </div>
    </div>
  );
}
