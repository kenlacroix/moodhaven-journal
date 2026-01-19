/**
 * App - Main application component
 *
 * Layout: Left sidebar + Main writing area
 * Per UX spec: Writing is the primary action
 */

import { useEffect, useState, useCallback } from 'react';
import { WritingView } from './pages/WritingView';
import { TimelineView } from './pages/TimelineView';
import { SearchView } from './pages/SearchView';
import { OnThisDayView } from './pages/OnThisDayView';
import { InsightsView } from './pages/InsightsView';
import { SettingsPage } from './pages/SettingsPage';
import { LockScreen } from './pages/LockScreen';
import { SetupScreen } from './pages/SetupScreen';
import { MainLayout, type ViewType } from './components/layout';
import { useAppStore } from './stores/appStore';
import { useSettingsStore } from './stores/settingsStore';

function App() {
  const { isUnlocked, isInitialized, checkInitialization, lock } = useAppStore();
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [currentView, setCurrentView] = useState<ViewType>('writing');
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

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
    // Clear selected entry when navigating to writing view for new entry
    if (view === 'writing') {
      setSelectedEntryId(null);
    }
  }, []);

  // Open an existing entry in writing view
  const handleSelectEntry = useCallback((entryId: string) => {
    setSelectedEntryId(entryId);
    setCurrentView('writing');
  }, []);

  // Create new entry
  const handleNewEntry = useCallback(() => {
    setSelectedEntryId(null);
    setCurrentView('writing');
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
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

  // Main app with sidebar layout
  return (
    <MainLayout
      currentView={currentView}
      onNavigate={handleNavigate}
      onLock={lock}
    >
      {/* Writing View - calm writing space (default) */}
      {currentView === 'writing' && (
        <WritingView
          entryId={selectedEntryId}
          onEntrySaved={() => {
            // Optionally refresh timeline, etc.
          }}
        />
      )}

      {/* Timeline View - chronological entry list */}
      {currentView === 'timeline' && (
        <TimelineView
          onSelectEntry={handleSelectEntry}
          onNewEntry={handleNewEntry}
        />
      )}

      {/* Search View */}
      {currentView === 'search' && (
        <SearchView onSelectEntry={handleSelectEntry} />
      )}

      {/* On This Day View */}
      {currentView === 'onthisday' && (
        <OnThisDayView onSelectEntry={handleSelectEntry} />
      )}

      {/* Insights View - AI content only here */}
      {currentView === 'insights' && (
        <InsightsView />
      )}

      {/* Settings */}
      {currentView === 'settings' && (
        <SettingsPage />
      )}
    </MainLayout>
  );
}

export default App;
