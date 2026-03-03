/**
 * Sidebar - Left navigation sidebar
 *
 * Per UX spec:
 * - Always visible
 * - Fixed order: Timeline, On This Day, Insights
 * - Footer: Health status (if Oura connected) + Theme toggle + Settings + Lock
 * - Never overlays writing space
 * - Never auto-opens content
 */

import { useState } from 'react';
import { SidebarItem } from './SidebarItem';
import { useSettingsStore } from '../../stores/settingsStore';
import { useOuraContext } from '../../hooks/useOuraContext';
import type { OuraHealthBadge } from '../../types/oura';

export type ViewType = 'writing' | 'timeline' | 'onthisday' | 'insights' | 'settings';

interface SidebarProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  onLock: () => void;
}

// ─── Sentiment colours (shared with HealthContextBadge) ─────────────────────

const SENTIMENT_BG: Record<OuraHealthBadge['sentiment'], string> = {
  good:    'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700',
  neutral: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  low:     'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700',
};

const SENTIMENT_DOT: Record<OuraHealthBadge['sentiment'], string> = {
  good:    'bg-emerald-500',
  neutral: 'bg-slate-400',
  low:     'bg-amber-500',
};

/** Derive dominant sentiment from badges for the collapsed-mode dot */
function dominantSentiment(badges: OuraHealthBadge[]): OuraHealthBadge['sentiment'] {
  if (badges.some((b) => b.sentiment === 'low')) return 'low';
  if (badges.some((b) => b.sentiment === 'good')) return 'good';
  return 'neutral';
}

// ─── Theme helpers ───────────────────────────────────────────────────────────

const THEME_ICONS = {
  light:  (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1.5M12 19.5V21M4.22 4.22l1.06 1.06M18.72 18.72l1.06 1.06M3 12h1.5M19.5 12H21M4.22 19.78l1.06-1.06M18.72 5.28l1.06-1.06M12 7.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z" />
    </svg>
  ),
  dark:   (
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

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 px-1">
      {children}
    </p>
  );
}

function ThemeBtn({
  active,
  onClick,
  theme,
  label,
}: {
  active: boolean;
  onClick: () => void;
  theme: 'light' | 'dark' | 'system';
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`
        flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg
        text-xs font-semibold transition-all duration-200
        ${
          active
            ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
            : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
        }
      `}
    >
      {THEME_ICONS[theme]}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function Sidebar({ currentView, onNavigate, onLock }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; }
    catch { return false; }
  });

  const theme = useSettingsStore((s) => s.settings.appearance.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  const { summary: healthSummary, isEnabled: ouraEnabled, isSyncing: healthSyncing, refresh: refreshHealth } = useOuraContext();

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('sidebar-collapsed', String(next)); }
    catch { /* ignore */ }
  };

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const hasHealth = ouraEnabled && healthSummary && healthSummary.badges.length > 0;
  const dot = hasHealth ? dominantSentiment(healthSummary!.badges) : null;

  return (
    <aside
      className={`relative flex-shrink-0 h-screen bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-all duration-300 ${
        collapsed ? 'w-[68px]' : 'w-64'
      }`}
    >
      {/* Collapse toggle */}
      <button
        type="button"
        onClick={toggleCollapsed}
        className="absolute top-4 -right-3 z-10 w-6 h-6 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors shadow-sm"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg className={`w-3.5 h-3.5 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Logo */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">M</span>
          </div>
          <span className={`text-lg font-semibold text-slate-800 dark:text-white whitespace-nowrap overflow-hidden transition-all duration-300 ${collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
            MoodHaven
          </span>
        </div>
      </div>

      {/* New Entry button */}
      <div className="p-3">
        <button
          type="button"
          onClick={() => onNavigate('writing')}
          className={`
            w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
            text-sm font-medium transition-all duration-300
            ${currentView === 'writing'
              ? 'bg-violet-500 text-white'
              : 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/30'
            }
          `}
          title={collapsed ? 'New Entry' : undefined}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
            New Entry
          </span>
        </button>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 px-3 py-2 space-y-1">
        <SidebarItem
          label="Timeline"
          isActive={currentView === 'timeline'}
          onClick={() => onNavigate('timeline')}
          collapsed={collapsed}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <SidebarItem
          label="On This Day"
          isActive={currentView === 'onthisday'}
          onClick={() => onNavigate('onthisday')}
          collapsed={collapsed}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
            </svg>
          }
        />
        <SidebarItem
          label="Insights"
          isActive={currentView === 'insights'}
          onClick={() => onNavigate('insights')}
          collapsed={collapsed}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
            </svg>
          }
        />
      </nav>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="border-t-2 border-slate-200 dark:border-slate-700">

        {/* ─ Expanded footer ─ */}
        {!collapsed && (
          <div className="px-4 pt-4 pb-3 space-y-4">

            {/* Health status */}
            {hasHealth && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <SectionLabel>
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                        <circle cx="12" cy="12" r="9" />
                        <circle cx="12" cy="12" r="4" />
                      </svg>
                      Health
                    </span>
                  </SectionLabel>
                  <button
                    type="button"
                    onClick={refreshHealth}
                    disabled={healthSyncing}
                    title="Refresh health data"
                    className="text-slate-300 dark:text-slate-600 hover:text-slate-400 dark:hover:text-slate-500 transition-colors disabled:opacity-40 mb-2"
                  >
                    <svg className={`w-3.5 h-3.5 ${healthSyncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {healthSummary!.badges.map((badge) => (
                    <span
                      key={badge.label}
                      title={`${badge.label}: ${badge.value}`}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${SENTIMENT_BG[badge.sentiment]}`}
                    >
                      <span className="text-sm">{badge.icon}</span>
                      {/* Show score/status only (before the em dash) */}
                      {badge.value.split(' — ')[0]}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Theme toggle */}
            <div>
              <SectionLabel>Appearance</SectionLabel>
              <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 gap-0.5">
                <ThemeBtn active={theme === 'light'}  onClick={() => setTheme('light')}  theme="light"  label="Light"  />
                <ThemeBtn active={theme === 'dark'}   onClick={() => setTheme('dark')}   theme="dark"   label="Dark"   />
                <ThemeBtn active={theme === 'system'} onClick={() => setTheme('system')} theme="system" label="Auto"   />
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-100 dark:border-slate-800 -mx-1" />

            {/* Settings */}
            <SidebarItem
              label="Settings"
              isActive={currentView === 'settings'}
              onClick={() => onNavigate('settings')}
              collapsed={false}
              icon={
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            />

            {/* Lock */}
            <button
              type="button"
              onClick={onLock}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-all duration-300"
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              Lock
            </button>
          </div>
        )}

        {/* ─ Collapsed footer ─ icons only ─ */}
        {collapsed && (
          <div className="px-2 py-3 flex flex-col items-center gap-1">

            {/* Health dot */}
            {hasHealth && dot && (
              <div
                title={healthSummary!.headline}
                className="w-full flex justify-center py-1.5"
              >
                <div className={`w-2.5 h-2.5 rounded-full ${SENTIMENT_DOT[dot]}`} />
              </div>
            )}

            {/* Theme cycle button */}
            <button
              type="button"
              onClick={cycleTheme}
              title={`Theme: ${theme}`}
              className="w-full flex justify-center p-2.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
            >
              {THEME_ICONS[theme]}
            </button>

            {/* Settings */}
            <SidebarItem
              label="Settings"
              isActive={currentView === 'settings'}
              onClick={() => onNavigate('settings')}
              collapsed={true}
              icon={
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            />

            {/* Lock */}
            <button
              type="button"
              onClick={onLock}
              title="Lock"
              className="w-full flex justify-center p-2.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
