/**
 * MobileHeader — slim 52px top bar for the Android layout.
 *
 * Left:  current view title
 * Right: theme toggle + lock button
 *
 * Desktop-only features (health badges, focus mode, fullscreen, breakout
 * writer) are intentionally omitted.
 */

import { useSettingsStore } from '../../stores/settingsStore';
import type { ViewType } from './Sidebar';

const VIEW_LABELS: Record<ViewType, string> = {
  writing:         'Write',
  timeline:        'Journal',
  onthisday:       'On This Day',
  insights:        'Insights',
  calendar:        'Calendar',
  settings:        'Settings',
  journalOverview: 'Journal',
  still:           'StillHaven',
  stillSessions:   'Session History',
};

const ICON_SUN = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1.5M12 19.5V21M4.22 4.22l1.06 1.06M18.72 18.72l1.06 1.06M3 12h1.5M19.5 12H21M4.22 19.78l1.06-1.06M18.72 5.28l1.06-1.06M12 7.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z" />
  </svg>
);
const ICON_MOON = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
  </svg>
);
const ICON_MONITOR = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-4m-4 4h4m-4 0H9m0 0v-4" />
  </svg>
);
const ICON_LOCK = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

interface MobileHeaderProps {
  currentView: ViewType;
  onLock: () => void;
}

export function MobileHeader({ currentView, onLock }: MobileHeaderProps) {
  const theme = useSettingsStore((s) => s.settings.appearance?.theme ?? 'system');
  const setTheme = useSettingsStore((s) => s.setTheme);

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const themeIcon = theme === 'light' ? ICON_MOON : theme === 'dark' ? ICON_SUN : ICON_MONITOR;
  const themeLabel = theme === 'light' ? 'Switch to dark' : theme === 'dark' ? 'Switch to system' : 'Switch to light';

  return (
    <header className="flex-shrink-0 h-[52px] bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center px-4 gap-2">
      {/* Title */}
      <span className="flex-1 text-base font-semibold text-slate-800 dark:text-slate-100 truncate">
        {VIEW_LABELS[currentView]}
      </span>

      {/* Theme toggle */}
      <button
        onClick={cycleTheme}
        aria-label={themeLabel}
        className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        {themeIcon}
      </button>

      {/* Lock */}
      <button
        onClick={onLock}
        aria-label="Lock app"
        className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        {ICON_LOCK}
      </button>
    </header>
  );
}
