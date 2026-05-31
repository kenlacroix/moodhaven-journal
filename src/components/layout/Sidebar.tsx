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
import { useBooksStore } from '../../stores/booksStore';
import type { UseUpdateCheckReturn } from '../../hooks/useUpdateCheck';
import { SidebarHeader } from './SidebarHeader';
import { SidebarNavigation } from './SidebarNavigation';
import { SidebarBooks } from './SidebarBooks';
import { SidebarPrompts } from './SidebarPrompts';

export type ViewType = 'writing' | 'timeline' | 'onthisday' | 'insights' | 'calendar' | 'settings' | 'journalOverview' | 'still' | 'stillSessions';

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

  const { loadBooks } = useBooksStore();

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

      <SidebarHeader
        currentView={currentView}
        collapsed={collapsed}
        onNavigate={onNavigate}
        onOpenSync={onOpenSync}
      />

      <SidebarNavigation
        currentView={currentView}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />

      <SidebarBooks
        currentView={currentView}
        collapsed={collapsed}
        onNavigate={onNavigate}
        onNavigateToJournalOverview={onNavigateToJournalOverview}
        showNewBookModal={showNewBookModal}
        onOpenNewBookModal={() => setShowNewBookModal(true)}
        onCloseNewBookModal={() => setShowNewBookModal(false)}
      />

      <SidebarPrompts
        collapsed={collapsed}
        updateHook={updateHook}
        onNavigate={onNavigate}
      />
    </aside>
  );
}
