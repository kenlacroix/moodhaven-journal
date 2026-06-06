import { useSettingsStore } from '../../stores/settingsStore';
import type { ViewType } from './Sidebar';

interface SidebarHeaderProps {
  currentView: ViewType;
  collapsed: boolean;
  onNavigate: (view: ViewType) => void;
  onOpenSync: () => void;
}

export function SidebarHeader({ currentView, collapsed, onNavigate, onOpenSync }: SidebarHeaderProps) {
  const savingState = useSettingsStore((s) => s.savingState);
  const lastAutoSaved = useSettingsStore((s) => s.lastAutoSaved);

  return (
    <div className={`flex items-center border-b border-slate-100 dark:border-slate-800 px-3 py-3 ${
      collapsed ? 'flex-col gap-2 justify-center' : 'justify-between'
    }`}>
      {/* Settings */}
      <button
        type="button"
        onClick={() => onNavigate('settings')}
        aria-label="Settings"
        aria-pressed={currentView === 'settings'}
        className={`p-1.5 rounded-lg transition-all duration-200 ${
          currentView === 'settings'
            ? 'text-violet-500 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20'
            : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {/* Save / Sync indicator */}
      <button
        type="button"
        onClick={onOpenSync}
        aria-label={
          savingState === 'saving' ? 'Saving…' :
          savingState === 'saved' ? `Saved${lastAutoSaved ? ' · ' + new Date(lastAutoSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}` :
          lastAutoSaved ? `Last saved ${new Date(lastAutoSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Click for sync details` :
          'Sync details'
        }
        className={`p-1.5 rounded-lg transition-all duration-200 ${
          savingState === 'saved'
            ? 'text-emerald-500 dark:text-emerald-400'
            : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        {savingState === 'saving' ? (
          <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : savingState === 'saved' ? (
          <svg className="w-5 h-5 animate-cloud-saved" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M8 15l2 2 4.5-4.5" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
          </svg>
        )}
      </button>
    </div>
  );
}
