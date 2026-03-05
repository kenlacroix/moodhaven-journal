/**
 * TopBar - Utility bar spanning the main content area
 *
 * Left:  small muted view title
 * Right: Health badge (Oura) → Focus toggle (writing view only) → Fullscreen →
 *        Theme cycle → Settings → Lock
 *
 * Slides up / fades out in distraction-free mode so the editor is fully
 * unobstructed.
 */

import { useState, useEffect } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useOuraContext } from '../../hooks/useOuraContext';
import { FocusMenu } from './FocusMenu';
import { SearchModal } from '../search/SearchModal';
import type { ViewType } from './Sidebar';
import type { OuraHealthBadge } from '../../types/oura';

const VIEW_LABELS: Record<ViewType, string> = {
  writing:    'Write',
  timeline:   'All Entries',
  onthisday:  'On This Day',
  insights:   'Insights',
  calendar:   'Calendar',
  settings:   'Settings',
};

// ── Sentiment helpers (mirrors Sidebar) ─────────────────────────────────────

const SENTIMENT_BG: Record<OuraHealthBadge['sentiment'], string> = {
  good:    'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700',
  neutral: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  low:     'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700',
};

// ── Theme icons ──────────────────────────────────────────────────────────────
// Each icon shows the NEXT mode you'll switch to when clicking

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
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 7.409A2.25 2.25 0 012.25 5.493V5.25" />
  </svg>
);

// When current mode is X, show icon for next destination:
// light → show moon ("Switch to dark")
// dark  → show sun  ("Switch to light")
// system → show monitor ("System preference")
const THEME_NEXT_ICON: Record<string, React.ReactNode> = {
  light: ICON_MOON,
  dark: ICON_SUN,
  system: ICON_MONITOR,
};

const THEME_NEXT_LABEL: Record<string, string> = {
  light: 'Switch to dark mode',
  dark: 'Switch to light mode',
  system: 'System preference (click to switch to light)',
};

// ── Icon button ──────────────────────────────────────────────────────────────

function IconBtn({
  onClick,
  title,
  active,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-2 rounded-lg transition-all duration-200 ${
        active
          ? 'text-violet-500 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20'
          : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface TopBarProps {
  currentView: ViewType;
  onLock: () => void;
  onSelectEntry?: (id: string) => void;
  onNewEntry?: () => void;
  onOpenBreakout: () => void;
}

export function TopBar({ currentView, onLock, onSelectEntry, onNewEntry, onOpenBreakout }: TopBarProps) {
  const [showSearch, setShowSearch] = useState(false);
  const distractionFree = useSettingsStore((s) => s.distractionFree);
  const theme = useSettingsStore((s) => s.settings.appearance.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  const { summary: healthSummary, isEnabled: ouraEnabled } = useOuraContext();
  const hasHealth = ouraEnabled && healthSummary && healthSummary.badges.length > 0;

  // Ctrl+K / Cmd+K to open search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  return (
    <>
    <div
      className={`flex-shrink-0 flex items-center justify-between px-4 h-12 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-100 dark:border-slate-800 transition-all duration-500 ${
        distractionFree ? '-translate-y-full opacity-0 pointer-events-none h-0 overflow-hidden' : 'translate-y-0 opacity-100'
      }`}
    >
      {/* Left: view title */}
      <span className="text-xs font-medium text-slate-400 dark:text-slate-500 select-none">
        {VIEW_LABELS[currentView]}
      </span>

      {/* Right: action cluster */}
      <div className="flex items-center gap-0.5">

        {/* Health badges (Oura, if enabled + data available) */}
        {hasHealth && (
          <div className="flex items-center gap-1 mr-2">
            {healthSummary!.badges.slice(0, 3).map((badge) => (
              <span
                key={badge.label}
                title={`${badge.label}: ${badge.value}`}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${SENTIMENT_BG[badge.sentiment]}`}
              >
                <span>{badge.icon}</span>
                {badge.value.split(' — ')[0]}
              </span>
            ))}
          </div>
        )}

        {/* Search */}
        <IconBtn onClick={() => setShowSearch(true)} title="Search entries (Ctrl+K)">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </IconBtn>

        {/* Focus + fullscreen + breakout menu — only when writing */}
        {currentView === 'writing' && (
          <FocusMenu onOpenBreakout={onOpenBreakout} />
        )}

        {/* Divider */}
        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />

        {/* Theme cycle — icon shows next destination */}
        <IconBtn onClick={cycleTheme} title={THEME_NEXT_LABEL[theme]}>
          {THEME_NEXT_ICON[theme]}
        </IconBtn>

        {/* Lock */}
        <IconBtn onClick={onLock} title="Lock journal">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </IconBtn>

        {/* Divider */}
        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />

        {/* New Entry — hidden when already in writing view */}
        {onNewEntry && currentView !== 'writing' && (
          <button
            type="button"
            onClick={onNewEntry}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-violet-500 hover:bg-violet-600 text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Entry
          </button>
        )}
      </div>
    </div>

    {/* Search modal — fixed overlay, works regardless of DOM position */}
    {showSearch && onSelectEntry && (
      <SearchModal
        onClose={() => setShowSearch(false)}
        onSelectEntry={(id) => { setShowSearch(false); onSelectEntry(id); }}
      />
    )}
    </>
  );
}
