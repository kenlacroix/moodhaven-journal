/**
 * App - Main application component
 *
 * Layout: Left sidebar + Main writing area
 * Per UX spec: Writing is the primary action
 */

import { useEffect, useState, useCallback } from 'react';
import { BreakoutWriterApp } from './components/breakout/BreakoutWriterApp';
import { WritingView } from './pages/WritingView';
import { TimelineView } from './pages/TimelineView';
import { OnThisDayView } from './pages/OnThisDayView';
import { InsightsView } from './pages/InsightsView';
import { CalendarPage } from './pages/CalendarPage';
import { SettingsPage } from './pages/SettingsPage';
import { JournalOverviewPage } from './pages/JournalOverviewPage';
import { useBooksStore } from './stores/booksStore';
import { LockScreen } from './pages/LockScreen';
import { SetupScreen } from './pages/SetupScreen';
import { MainLayout, MobileLayout, type ViewType } from './components/layout';
import { usePlatform } from './hooks/usePlatform';
import { TutorialWizard } from './components/tutorial';
import { SyncDetailsModal } from './components/sync/SyncDetailsModal';
import { useAppStore } from './stores/appStore';
import { useSettingsStore } from './stores/settingsStore';
import { useReminderScheduler } from './hooks/useReminderScheduler';
import { useUpdateCheck } from './hooks/useUpdateCheck';
import { useWearSignals } from './hooks/useWearSignals';
import { usePeerSync } from './hooks/usePeerSync';
import { PeerSyncWireframes } from './pages/PeerSyncWireframes';
import { useTimeCapsule } from './hooks/useTimeCapsule';
import { TimeCapsuleRevealModal } from './components/timecapsule/TimeCapsuleRevealModal';
import { SealEntryModal } from './components/timecapsule/SealEntryModal';
import { logger } from './lib/logger';

// Detect special dev modes outside the component so hooks order is stable.
const IS_BREAKOUT = new URLSearchParams(window.location.search).get('mode') === 'writer';
const IS_PEERSYNC_WIREFRAMES = new URLSearchParams(window.location.search).get('mode') === 'peersync';

/** Thin router: send special dev-mode URLs to isolated components with no hooks. */
function App() {
  if (IS_BREAKOUT) return <BreakoutWriterApp />;
  if (IS_PEERSYNC_WIREFRAMES) return <PeerSyncWireframes />;
  return <MainApp />;
}

function MainApp() {
  const { isUnlocked, isInitialized, checkInitialization, lock, sessionPassword } = useAppStore();
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const hasSeenTutorial = useSettingsStore((s) => s.settings.tutorial?.hasSeenTutorial);
  const syncMode = useSettingsStore((s) => s.settings.sync?.syncMode);
  const syncIntervalMinutes = useSettingsStore((s) => s.settings.sync?.syncIntervalMinutes ?? 0);
  const webdavConfig = useSettingsStore((s) => s.settings.storage?.webdav);
  const storageType = useSettingsStore((s) => s.settings.storage?.type);
  const defaultSealDays = useSettingsStore((s) => s.settings.timeCapsule?.defaultSealDays ?? 30);
  const [isLoading, setIsLoading] = useState(true);
  const [currentView, setCurrentView] = useState<ViewType>('writing');
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [journalOverviewBookId, setJournalOverviewBookId] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  /**
   * Incremented each time the user starts a genuinely new entry while already
   * in write mode. Changing this key remounts WritingView, giving a clean slate
   * without needing to navigate away.
   */
  const [writingKey, setWritingKey] = useState(0);
  const [sealingEntryId, setSealingEntryId] = useState<string | null>(null);
  const [timelineRefresh, setTimelineRefresh] = useState(0);

  const { isAndroid } = usePlatform();

  // Schedule reminder notifications (hook checks enabled state internally)
  useReminderScheduler();

  // Update check — runs once per session after settings are loaded, respects 24h gate
  const updateHook = useUpdateCheck();

  // Wear OS signal bridge — active whenever the app is unlocked.
  // Listens for "wear://signal" Tauri events from WearPlugin, encrypts the
  // plaintext payload the watch sent, and stores it as a Signal in SQLite.
  // Auto-sends a haptic "saved" pulse back to the watch on success.
  useWearSignals({
    password: sessionPassword ?? '',
    enabled: isUnlocked && !!sessionPassword,
  });

  // Peer-to-peer sync — initializes device identity and starts mDNS discovery.
  // Runs for the entire app lifetime; discovery state lives in peerSyncStore.
  usePeerSync();

  // Time capsule — polls once per session on unlock for due capsules.
  const { pendingCapsule, revealCapsule, dismissCapsule } = useTimeCapsule({
    enabled: isUnlocked && !!sessionPassword,
  });

  useEffect(() => {
    const init = async () => {
      await checkInitialization();
      await loadSettings();
      setIsLoading(false);
    };
    init();
  }, [checkInitialization, loadSettings]);

  // Show tutorial on first unlock when user hasn't seen it
  useEffect(() => {
    if (isUnlocked && hasSeenTutorial === false && !import.meta.env.VITE_DEV_MODE) {
      setShowTutorial(true);
    }
  }, [isUnlocked, hasSeenTutorial]);

  // Helper: run a silent background sync (no UI feedback — fire and forget)
  const runBackgroundSync = useCallback(() => {
    if (!isUnlocked || storageType !== 'webdav' || !webdavConfig?.url || !sessionPassword) return;
    import('./lib/syncEngine').then(({ syncWithWebDAV }) => {
      syncWithWebDAV(webdavConfig, sessionPassword).catch((err) =>
        logger.warn('Background sync failed:', { error: String(err) })
      );
    });
  }, [isUnlocked, storageType, webdavConfig, sessionPassword]);

  // Auto-sync once on unlock when mode is 'on-open'
  useEffect(() => {
    if (isUnlocked && syncMode === 'on-open') runBackgroundSync();
    // Only run on unlock transition
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnlocked]);

  // Periodic auto-sync timer
  useEffect(() => {
    if (!isUnlocked || syncIntervalMinutes <= 0) return;
    const ms = syncIntervalMinutes * 60 * 1000;
    const id = setInterval(runBackgroundSync, ms);
    return () => clearInterval(id);
  }, [isUnlocked, syncIntervalMinutes, runBackgroundSync]);

  const handleTutorialComplete = useCallback(async () => {
    setShowTutorial(false);
    useSettingsStore.getState().setHasSeenTutorial(true);
    await useSettingsStore.getState().saveSettings();
  }, []);

  const handleNavigate = useCallback((view: ViewType) => {
    if (view === 'settings') {
      setShowSettings(true);
      return;
    }
    setCurrentView(view);
    if (view === 'writing') {
      setSelectedEntryId(null);
      // Always increment writingKey so the sidebar "New Entry" button gives a
      // fresh WritingView even when the user is already writing a new entry.
      setWritingKey((k) => k + 1);
    }
  }, []);

  // Open an existing entry in writing view
  const handleSelectEntry = useCallback((entryId: string) => {
    setSelectedEntryId(entryId);
    setCurrentView('writing');
  }, []);

  // Create new entry — increments writingKey to force a clean WritingView remount
  const handleNewEntry = useCallback(() => {
    setSelectedEntryId(null);
    setCurrentView('writing');
    setWritingKey((k) => k + 1);
  }, []);

  // Navigate to journal overview
  const handleNavigateToJournalOverview = useCallback((bookId: string) => {
    useBooksStore.getState().setActiveBook(bookId);
    setJournalOverviewBookId(bookId);
    setCurrentView('journalOverview');
  }, []);

  // Navigate to settings with optional section scroll target
  const handleNavigateToSettings = useCallback((section?: 'speech-to-text' | 'ai') => {
    if (section) {
      useSettingsStore.getState().setScrollToSection(section);
    }
    setShowSettings(true);
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

  // Main app — MobileLayout on Android, MainLayout on desktop
  const Layout = isAndroid ? MobileLayout : MainLayout;
  return (
    <>
      <Layout
        currentView={currentView}
        onNavigate={handleNavigate}
        onLock={lock}
        onSelectEntry={handleSelectEntry}
        onNewEntry={handleNewEntry}
        onOpenSync={() => setShowSyncModal(true)}
        onNavigateToJournalOverview={handleNavigateToJournalOverview}
        updateHook={updateHook}
      >
        {/* Keyed wrapper replays fade animation on view change */}
        <div key={currentView} className="h-full animate-view-enter">
          {/* Writing View - calm writing space (default) */}
          {currentView === 'writing' && (
            <WritingView
              key={selectedEntryId ?? `new-${writingKey}`}
              entryId={selectedEntryId}
              onEntrySaved={() => {/* timeline refreshes on next navigation */}}
              onNewEntry={handleNewEntry}
              onNavigateToSTTSettings={() => handleNavigateToSettings('speech-to-text')}
            />
          )}

          {/* Timeline View - chronological entry list */}
          {currentView === 'timeline' && (
            <TimelineView
              onSelectEntry={handleSelectEntry}
              onNewEntry={handleNewEntry}
              onSealEntry={(id) => setSealingEntryId(id)}
              refreshTrigger={timelineRefresh}
            />
          )}

          {/* On This Day View */}
          {currentView === 'onthisday' && (
            <OnThisDayView onSelectEntry={handleSelectEntry} />
          )}

          {/* Insights View - AI insights + local analytics merged */}
          {currentView === 'insights' && (
            <InsightsView onNavigateToSettings={handleNavigateToSettings} />
          )}

          {/* Calendar View */}
          {currentView === 'calendar' && (
            <CalendarPage onSelectEntry={handleSelectEntry} />
          )}

          {/* Journal Overview */}
          {currentView === 'journalOverview' && journalOverviewBookId && (
            <JournalOverviewPage
              bookId={journalOverviewBookId}
              onViewEntries={() => handleNavigate('timeline')}
              onBack={() => handleNavigate('timeline')}
            />
          )}
        </div>
      </Layout>

      {showTutorial && <TutorialWizard onComplete={handleTutorialComplete} />}
      {showSyncModal && <SyncDetailsModal onClose={() => setShowSyncModal(false)} onNavigateToSettings={() => handleNavigateToSettings()} />}
      {showSettings && <SettingsPage updateHook={updateHook} onClose={() => setShowSettings(false)} />}
      {pendingCapsule && sessionPassword && (
        <TimeCapsuleRevealModal
          capsule={pendingCapsule}
          password={sessionPassword}
          onReveal={async (id) => { await revealCapsule(id); setTimelineRefresh((n) => n + 1); }}
          onWriteResponse={() => { dismissCapsule(); handleNewEntry(); }}
          onDismiss={dismissCapsule}
        />
      )}
      {sealingEntryId && (
        <SealEntryModal
          entryId={sealingEntryId}
          defaultDays={defaultSealDays}
          onSeal={() => { setSealingEntryId(null); setTimelineRefresh((n) => n + 1); }}
          onCancel={() => setSealingEntryId(null)}
        />
      )}
    </>
  );
}

export { App as default };
