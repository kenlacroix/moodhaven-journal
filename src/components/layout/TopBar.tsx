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

import { useSettingsStore } from '../../stores/settingsStore';
import { useOuraContext } from '../../hooks/useOuraContext';
import { toggleFullscreen } from '../../lib/windowUtils';
import type { ViewType } from './Sidebar';
import type { OuraHealthBadge } from '../../types/oura';

const VIEW_LABELS: Record<ViewType, string> = {
  writing:    'Write',
  timeline:   'All Entries',
  onthisday:  'On This Day',
  insights:   'Insights',
  settings:   'Settings',
};

// ── Sentiment helpers (mirrors Sidebar) ─────────────────────────────────────

const SENTIMENT_BG: Record<OuraHealthBadge['sentiment'], string> = {
  good:    'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700',
  neutral: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  low:     'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700',
};

// ── Theme icons ──────────────────────────────────────────────────────────────

const THEME_ICONS = {
  light: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1.5M12 19.5V21M4.22 4.22l1.06 1.06M18.72 18.72l1.06 1.06M3 12h1.5M19.5 12H21M4.22 19.78l1.06-1.06M18.72 5.28l1.06-1.06M12 7.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z" />
    </svg>
  ),
  dark: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  ),
  system: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 7.409A2.25 2.25 0 012.25 5.493V5.25" />
    </svg>
  ),
} as const;

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
      className={`p-1.5 rounded-lg transition-all duration-200 ${
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
  onNavigate: (view: ViewType) => void;
  onLock: () => void;
}

export function TopBar({ currentView, onNavigate, onLock }: TopBarProps) {
  const distractionFree = useSettingsStore((s) => s.distractionFree);
  const setDistractionFree = useSettingsStore((s) => s.setDistractionFree);
  const theme = useSettingsStore((s) => s.settings.appearance.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  const { summary: healthSummary, isEnabled: ouraEnabled } = useOuraContext();
  const hasHealth = ouraEnabled && healthSummary && healthSummary.badges.length > 0;

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const themeLabel = theme === 'light' ? 'Light mode' : theme === 'dark' ? 'Dark mode' : 'System theme';

  return (
    <div
      className={`flex-shrink-0 flex items-center justify-between px-4 h-11 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-100 dark:border-slate-800 transition-all duration-500 ${
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

        {/* Focus mode toggle — only when writing */}
        {currentView === 'writing' && (
          <IconBtn
            onClick={() => setDistractionFree(!distractionFree)}
            title={distractionFree ? 'Exit focus mode (Ctrl+Shift+F)' : 'Focus mode (Ctrl+Shift+F)'}
            active={distractionFree}
          >
            {distractionFree ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            )}
          </IconBtn>
        )}

        {/* Fullscreen toggle */}
        <IconBtn
          onClick={() => { toggleFullscreen().catch(() => { /* ignore errors in non-Tauri env */ }); }}
          title="Toggle fullscreen"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
        </IconBtn>

        {/* Divider */}
        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />

        {/* Theme cycle */}
        <IconBtn onClick={cycleTheme} title={`${themeLabel} — click to cycle`}>
          {THEME_ICONS[theme]}
        </IconBtn>

        {/* Settings */}
        <IconBtn
          onClick={() => onNavigate('settings')}
          title="Settings"
          active={currentView === 'settings'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </IconBtn>

        {/* Lock */}
        <IconBtn onClick={onLock} title="Lock journal">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </IconBtn>
      </div>
    </div>
  );
}
