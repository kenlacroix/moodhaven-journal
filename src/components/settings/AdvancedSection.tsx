import { useState, useEffect } from 'react';

interface AdvancedSectionProps {
  storageKey: string;
  children: React.ReactNode;
}

export function AdvancedSection({ storageKey, children }: AdvancedSectionProps) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(`advanced_open_${storageKey}`) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (open) {
        localStorage.setItem(`advanced_open_${storageKey}`, '1');
      } else {
        localStorage.removeItem(`advanced_open_${storageKey}`);
      }
    } catch { /* ignore */ }
  }, [open, storageKey]);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={`advanced-section-${storageKey}`}
        className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Advanced options
      </button>

      <div
        id={`advanced-section-${storageKey}`}
        hidden={!open}
        className="mt-3 space-y-6"
      >
        {children}
      </div>
    </div>
  );
}
