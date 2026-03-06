/**
 * MainLayout - Two-region layout wrapper
 *
 * Per UX spec:
 * - Left sidebar (fixed width) — navigation only
 * - TopBar — utility controls (health, theme, settings, lock, focus, fullscreen)
 * - Main writing area (flexible width)
 * - No additional persistent regions allowed
 * - Sidebar + TopBar hidden in distraction-free mode
 */

import { Sidebar, type ViewType } from './Sidebar';
import { TopBar } from './TopBar';
import { useSettingsStore } from '../../stores/settingsStore';
import { openBreakoutWriter } from '../../lib/windowUtils';
import type { UseUpdateCheckReturn } from '../../hooks/useUpdateCheck';

interface MainLayoutProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  onLock: () => void;
  onSelectEntry?: (id: string) => void;
  onNewEntry?: () => void;
  onOpenSync: () => void;
  onNavigateToJournalOverview?: (bookId: string) => void;
  updateHook: UseUpdateCheckReturn;
  children: React.ReactNode;
}

export function MainLayout({ currentView, onNavigate, onLock, onSelectEntry, onNewEntry, onOpenSync, onNavigateToJournalOverview, updateHook, children }: MainLayoutProps) {
  const distractionFree = useSettingsStore((s) => s.distractionFree);

  return (
    <div className="min-h-screen flex bg-white dark:bg-slate-900">
      {/* Left Sidebar — slides out in distraction-free mode */}
      <div
        className={`flex-shrink-0 overflow-hidden transition-all duration-500 ease-in-out ${
          distractionFree ? 'w-0 opacity-0' : 'opacity-100'
        }`}
      >
        <Sidebar
          currentView={currentView}
          onNavigate={onNavigate}
          onLock={onLock}
          onOpenSync={onOpenSync}
          onNavigateToJournalOverview={onNavigateToJournalOverview}
          updateHook={updateHook}
        />
      </div>

      {/* Right column: TopBar + main content */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <TopBar
          currentView={currentView}
          onLock={onLock}
          onSelectEntry={onSelectEntry}
          onNewEntry={onNewEntry}
          onOpenBreakout={() => openBreakoutWriter().catch(() => {})}
        />
        <main className="flex-1 min-h-0 overflow-auto bg-slate-50 dark:bg-slate-950">
          {children}
        </main>
      </div>
    </div>
  );
}
