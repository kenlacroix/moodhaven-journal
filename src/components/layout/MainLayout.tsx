/**
 * MainLayout - Two-region layout wrapper
 *
 * Per UX spec:
 * - Left sidebar (fixed width)
 * - Main writing area (flexible width)
 * - No additional persistent regions allowed
 */

import { Sidebar, type ViewType } from './Sidebar';

interface MainLayoutProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  onLock: () => void;
  children: React.ReactNode;
}

export function MainLayout({ currentView, onNavigate, onLock, children }: MainLayoutProps) {
  return (
    <div className="min-h-screen flex bg-white dark:bg-slate-900">
      {/* Left Sidebar */}
      <Sidebar
        currentView={currentView}
        onNavigate={onNavigate}
        onLock={onLock}
      />

      {/* Main Content Area */}
      <main className="flex-1 min-h-screen overflow-auto bg-slate-50 dark:bg-slate-950">
        {children}
      </main>
    </div>
  );
}
