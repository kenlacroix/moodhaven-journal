/**
 * MainLayout - Two-region layout wrapper
 *
 * Per UX spec:
 * - Left sidebar (fixed width)
 * - Main writing area (flexible width)
 * - No additional persistent regions allowed
 * - Sidebar hidden (width → 0) in distraction-free mode
 */

import { Sidebar, type ViewType } from './Sidebar';
import { useSettingsStore } from '../../stores/settingsStore';

interface MainLayoutProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  onLock: () => void;
  children: React.ReactNode;
}

export function MainLayout({ currentView, onNavigate, onLock, children }: MainLayoutProps) {
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
        />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 min-h-screen overflow-auto bg-slate-50 dark:bg-slate-950">
        {children}
      </main>
    </div>
  );
}
