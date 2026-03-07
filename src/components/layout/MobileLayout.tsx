/**
 * MobileLayout — full-screen Android layout.
 *
 * Structure:
 *   [MobileHeader  52px ]
 *   [page content flex-1]
 *   [BottomTabBar  64px ]
 *
 * Drop-in replacement for MainLayout on Android. Accepts the same props so
 * App.tsx can swap between the two with a single conditional.
 */

import { MobileHeader } from './MobileHeader';
import { BottomTabBar } from './BottomTabBar';
import type { ViewType } from './Sidebar';
import type { UseUpdateCheckReturn } from '../../hooks/useUpdateCheck';

interface MobileLayoutProps {
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

export function MobileLayout({
  currentView,
  onNavigate,
  onLock,
  onOpenSync,
  children,
}: MobileLayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Slim top bar */}
      <MobileHeader currentView={currentView} onLock={onLock} />

      {/* Page content */}
      <main className="flex-1 min-h-0 overflow-auto">
        {children}
      </main>

      {/* Bottom navigation */}
      <BottomTabBar
        currentView={currentView}
        onNavigate={onNavigate}
        onLock={onLock}
        onOpenSync={onOpenSync}
      />
    </div>
  );
}
