/**
 * Sidebar - Left navigation sidebar
 *
 * Per UX spec:
 * - Always visible (slides out in distraction-free mode)
 * - Header: Settings icon (left) + Sync icon (right) — no logo
 * - Fixed nav order: Write | All Entries | On This Day | Insights | Calendar
 * - No footer — CloudSyncChip replaced by Sync icon in header
 * - Never overlays writing space
 */

import { useState, useEffect } from 'react';
import { SidebarItem } from './SidebarItem';
import { useBooksStore } from '../../stores/booksStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { NewBookModal } from '../books/NewBookModal';
import { UpdateBanner } from '../updater/UpdateBanner';
import type { UseUpdateCheckReturn } from '../../hooks/useUpdateCheck';

export type ViewType = 'writing' | 'timeline' | 'onthisday' | 'insights' | 'calendar' | 'settings' | 'journalOverview';

interface SidebarProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  onLock: () => void;
  onOpenSync: () => void;
  onNavigateToJournalOverview?: (bookId: string) => void;
  updateHook: UseUpdateCheckReturn;
}

export function Sidebar({ currentView, onNavigate, onOpenSync, onNavigateToJournalOverview, updateHook }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; }
    catch { return false; }
  });
  const [showNewBookModal, setShowNewBookModal] = useState(false);

  const { books, activeBookId, loadBooks, setActiveBook, addBook } = useBooksStore();
  const savingState = useSettingsStore((s) => s.savingState);
  const lastAutoSaved = useSettingsStore((s) => s.lastAutoSaved);

  // Load books once on mount
  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('sidebar-collapsed', String(next)); }
    catch { /* ignore */ }
  };

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

      {/* Header: Settings icon (left) + Sync icon (right) */}
      <div className={`flex items-center border-b border-slate-100 dark:border-slate-800 px-3 py-3 ${
        collapsed ? 'flex-col gap-2 justify-center' : 'justify-between'
      }`}>
        {/* Settings */}
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          title="Settings"
          className={`p-1.5 rounded-lg transition-all duration-200 ${
            currentView === 'settings'
              ? 'text-violet-500 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20'
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Save / Sync indicator */}
        <button
          type="button"
          onClick={onOpenSync}
          title={
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
            /* Spinning ring while saving */
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : savingState === 'saved' ? (
            /* Cloud + checkmark — pops in when saved */
            <svg className="w-4 h-4 animate-cloud-saved" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              {/* Cloud body */}
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
              {/* Checkmark inside cloud */}
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M8 15l2 2 4.5-4.5" />
            </svg>
          ) : (
            /* Cloud icon at rest */
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
            </svg>
          )}
        </button>
      </div>

      {/* Main navigation */}
      <nav className="px-3 py-2 space-y-1">
        <SidebarItem
          label="All Entries"
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
        <SidebarItem
          label="Calendar"
          isActive={currentView === 'calendar'}
          onClick={() => onNavigate('calendar')}
          collapsed={collapsed}
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          }
        />
      </nav>

      {/* My Books section */}
      <div className="flex-1 px-3 py-2 overflow-y-auto border-t border-slate-100 dark:border-slate-800">
        {/* Section header */}
        {!collapsed && (
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">
              My Books
            </span>
            <button
              type="button"
              onClick={() => setShowNewBookModal(true)}
              title="New book"
              className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        )}

        {/* Book list */}
        <div className="space-y-0.5">
          {/* "All" entry — shows when on timeline */}
          {currentView === 'timeline' && books.length > 1 && (
            <button
              type="button"
              onClick={() => { setActiveBook(null); onNavigate('timeline'); }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                activeBookId === null
                  ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 font-medium'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title={collapsed ? 'All books' : undefined}
            >
              <span className="w-4 text-center text-sm flex-shrink-0">📚</span>
              {!collapsed && <span className="truncate">All books</span>}
            </button>
          )}

          {books.map((book) => (
            <button
              key={book.id}
              type="button"
              onClick={() => {
                if (onNavigateToJournalOverview) {
                  onNavigateToJournalOverview(book.id);
                } else {
                  setActiveBook(book.id);
                  onNavigate('timeline');
                }
              }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                currentView === 'journalOverview' && activeBookId === book.id
                  ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 font-medium'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title={collapsed ? book.name : undefined}
            >
              <span className="w-4 text-center text-sm flex-shrink-0">{book.emoji}</span>
              {!collapsed && <span className="truncate">{book.name}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Update available banner — shown only when an update exists */}
      <div className="px-3 pb-1">
        <UpdateBanner
          hook={updateHook}
          collapsed={collapsed}
          onOpenSettings={() => onNavigate('settings')}
        />
      </div>

      {/* User Guide link */}
      <div className={`px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800 ${collapsed ? 'flex justify-center' : ''}`}>
        <a
          href="https://github.com/kenlacroix/moodbloom-tauri#readme"
          target="_blank"
          rel="noopener noreferrer"
          title="User Guide"
          className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-violet-500 dark:hover:text-violet-400 transition-colors"
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          {!collapsed && <span>User Guide ↗</span>}
        </a>
      </div>

      {/* New Book Modal */}
      {showNewBookModal && (
        <NewBookModal
          onClose={() => setShowNewBookModal(false)}
          onCreate={async (name, emoji, color, description, settings) => {
            await addBook(name, emoji, color, description, settings);
          }}
        />
      )}
    </aside>
  );
}
