import { useEffect, useState, useCallback } from 'react';
import { JournalPage } from './pages/JournalPage';
import { CalendarPage } from './pages/CalendarPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SettingsPage } from './pages/SettingsPage';
import { LockScreen } from './pages/LockScreen';
import { SetupScreen } from './pages/SetupScreen';
import { Navigation, type ViewType } from './components/layout';
import { useAppStore } from './stores/appStore';
import { useSettingsStore } from './stores/settingsStore';

function App() {
  const { isUnlocked, isInitialized, checkInitialization, lock } = useAppStore();
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [currentView, setCurrentView] = useState<ViewType>('journal');

  useEffect(() => {
    const init = async () => {
      await checkInitialization();
      await loadSettings();
      setIsLoading(false);
    };
    init();
  }, [checkInitialization, loadSettings]);

  const handleNavigate = useCallback((view: ViewType) => {
    setCurrentView(view);
  }, []);

  const handleNavigateToJournal = useCallback(() => {
    setCurrentView('journal');
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center animate-pulse">
            <span className="text-white text-xl font-bold">M</span>
          </div>
          <p className="text-slate-500 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  // First-time setup
  if (!isInitialized) {
    return <SetupScreen />;
  }

  // Locked state
  if (!isUnlocked) {
    return <LockScreen />;
  }

  // Main app with navigation
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-white/70 dark:bg-slate-900/70 border-b border-slate-200/50 dark:border-slate-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <span className="text-white text-sm font-bold">M</span>
              </div>
              <h1 className="text-xl font-semibold text-slate-800 dark:text-white">
                MoodBloom
              </h1>
            </div>

            {/* Lock button */}
            <button
              type="button"
              onClick={lock}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Lock journal"
              title="Lock journal"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {currentView === 'journal' && <JournalPage />}
          {currentView === 'calendar' && (
            <CalendarPage onNavigateToJournal={handleNavigateToJournal} />
          )}
          {currentView === 'analytics' && <AnalyticsPage />}
          {currentView === 'settings' && <SettingsPage />}
        </div>
      </main>

      {/* Bottom navigation */}
      <Navigation currentView={currentView} onNavigate={handleNavigate} />

      {/* Decorative background elements */}
      <div
        className="fixed inset-0 -z-10 overflow-hidden pointer-events-none"
        aria-hidden="true"
      >
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-violet-200/30 dark:bg-violet-900/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-purple-200/30 dark:bg-purple-900/20 blur-3xl" />
      </div>
    </div>
  );
}

export default App;
