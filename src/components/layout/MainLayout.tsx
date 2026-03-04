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

      {/* Right column: TopBar + main content */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <TopBar
          currentView={currentView}
          onNavigate={onNavigate}
          onLock={onLock}
        />
        <main className="flex-1 min-h-0 overflow-auto bg-slate-50 dark:bg-slate-950">
          {children}
        </main>
      </div>
    </div>
  );
}
