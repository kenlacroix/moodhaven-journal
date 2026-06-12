/**
 * BottomTabBar — 5-tab Android navigation bar.
 *
 * Tabs: Write | Journal | Insights | Calendar | More
 * "More" opens an overlay sheet: On This Day, StillHaven (when enabled),
 * Settings, Sync, Lock
 */

import { useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import type { ViewType } from './Sidebar';

interface Tab {
  id: ViewType | 'more';
  label: string;
  icon: React.ReactNode;
}

const ICON_WRITE = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487a2.1 2.1 0 113 3L8 19.5H5v-3L16.862 4.487z" />
  </svg>
);
const ICON_JOURNAL = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h10" />
  </svg>
);
const ICON_INSIGHTS = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);
const ICON_CALENDAR = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
const ICON_MORE = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);
const ICON_ONTHISDAY = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const ICON_SETTINGS = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const ICON_SYNC = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);
const ICON_LOCK = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);
const ICON_STILL = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5c.75-3 3.75-6 8.25-6s7.5 3 8.25 6M3.75 13.5c-.75 3 .75 5.25 3 6s4.5.75 5.25.75 3.75.25 5.25-.75 3.75-3 3-6M3.75 13.5h16.5" />
  </svg>
);
const ICON_SESSIONS = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
  </svg>
);

const TABS: Tab[] = [
  { id: 'writing',   label: 'Write',    icon: ICON_WRITE },
  { id: 'timeline',  label: 'Journal',  icon: ICON_JOURNAL },
  { id: 'insights',  label: 'Insights', icon: ICON_INSIGHTS },
  { id: 'calendar',  label: 'Calendar', icon: ICON_CALENDAR },
  { id: 'more',      label: 'More',     icon: ICON_MORE },
];

interface BottomTabBarProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  onLock: () => void;
  onOpenSync: () => void;
}

export function BottomTabBar({ currentView, onNavigate, onLock, onOpenSync }: BottomTabBarProps) {
  const [showMore, setShowMore] = useState(false);
  const stillhavenEnabled = useSettingsStore((s) => s.settings.wellness?.stillhavenEnabled ?? false);
  const showStill = import.meta.env.VITE_FEATURE_STILL && stillhavenEnabled;

  const isMoreActive =
    currentView === 'onthisday' ||
    currentView === 'settings' ||
    currentView === 'still' ||
    currentView === 'stillSessions';

  const handleTab = (id: ViewType | 'more') => {
    if (id === 'more') {
      setShowMore((v) => !v);
    } else {
      setShowMore(false);
      onNavigate(id);
    }
  };

  return (
    <>
      {/* More overlay sheet */}
      {showMore && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowMore(false)}
          />
          {/* Sheet */}
          <div className="fixed bottom-[64px] left-0 right-0 z-50 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-2xl shadow-xl animate-slide-up">
            <div className="px-4 pt-3 pb-2">
              <div className="w-8 h-1 bg-slate-300 dark:bg-slate-600 rounded-full mx-auto mb-4" />
              <div className="space-y-1">
                <button
                  onClick={() => { setShowMore(false); onNavigate('onthisday'); }}
                  className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100 dark:active:bg-slate-700 transition-colors min-h-[52px]"
                >
                  {ICON_ONTHISDAY}
                  <span className="font-medium">On This Day</span>
                </button>
                {showStill && (
                  <>
                    <button
                      onClick={() => { setShowMore(false); onNavigate('still'); }}
                      className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100 dark:active:bg-slate-700 transition-colors min-h-[52px]"
                    >
                      {ICON_STILL}
                      <span className="font-medium">StillHaven</span>
                    </button>
                    <button
                      onClick={() => { setShowMore(false); onNavigate('stillSessions'); }}
                      className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100 dark:active:bg-slate-700 transition-colors min-h-[52px]"
                    >
                      {ICON_SESSIONS}
                      <span className="font-medium">Sessions</span>
                    </button>
                  </>
                )}
                <button
                  onClick={() => { setShowMore(false); onNavigate('settings'); }}
                  className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100 dark:active:bg-slate-700 transition-colors min-h-[52px]"
                >
                  {ICON_SETTINGS}
                  <span className="font-medium">Settings</span>
                </button>
                <button
                  onClick={() => { setShowMore(false); onOpenSync(); }}
                  className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100 dark:active:bg-slate-700 transition-colors min-h-[52px]"
                >
                  {ICON_SYNC}
                  <span className="font-medium">Sync</span>
                </button>
                <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
                <button
                  onClick={() => { setShowMore(false); onLock(); }}
                  className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 active:bg-red-100 dark:active:bg-red-900/30 transition-colors min-h-[52px]"
                >
                  {ICON_LOCK}
                  <span className="font-medium">Lock</span>
                </button>
              </div>
            </div>
            {/* Safe area spacer */}
            <div className="h-safe-bottom" />
          </div>
        </>
      )}

      {/* Tab bar */}
      <nav className="flex-shrink-0 h-16 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center px-1"
           style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {TABS.map((tab) => {
          const active = tab.id === 'more'
            ? isMoreActive || showMore
            : currentView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl transition-all duration-150 min-h-[48px] active:scale-95 active:opacity-70 ${
                active
                  ? 'text-violet-600 dark:text-violet-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {tab.icon}
              <span className={`text-[10px] font-medium ${active ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400 dark:text-slate-500'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
