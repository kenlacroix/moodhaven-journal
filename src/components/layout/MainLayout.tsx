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

      {/* Subtle decorative background - very muted */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-violet-100/20 dark:bg-violet-900/10 blur-3xl" />
        <div className="absolute bottom-0 left-64 w-96 h-96 rounded-full bg-purple-100/20 dark:bg-purple-900/10 blur-3xl" />
      </div>
    </div>
  );
}
