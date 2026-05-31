import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import {
  getDataStats,
  downloadBackup as downloadBackupFile,
  exportWithMedia,
  exportData,
  type ExportFilter,
} from '../lib/services/dataManagementService';
import { encrypt } from '../lib/services/crypto';
import {
  get2FAStatus,
  getBackupCodesCount,
} from '../lib/services/twoFactorService';
import type { TwoFactorStatus } from '../types/twoFactor';
import { verifyUserPassword, getSessionPassword } from '../lib/services/journalService';
import type { UseUpdateCheckReturn } from '../hooks/useUpdateCheck';
import {
  loadRateLimitState,
  recordFailedAttempt,
  resetRateLimit,
  isLockedOut,
  getRemainingLockoutMs,
  getRemainingFreeAttempts,
  getNextLockoutDuration,
  formatDuration,
  type RateLimitState,
} from '../lib/services/rateLimitService';
import { DevicesTab } from '../components/peer-sync';
import { invoke } from '@tauri-apps/api/core';
import { logger, setLevel } from '../lib/services/logger';
import type { LogLevel } from '../lib/services/logger';
import {
  GeneralTab,
  AppearanceTab,
  PrivacyTab,
  SyncTab,
  AITab,
  HealthTab,
  ExportTab,
  AboutTab,
  SpeechToTextTab,
} from '../components/settings/tabs';

type SettingsTab = 'general' | 'appearance' | 'privacy' | 'sync' | 'ai' | 'health' | 'devices' | 'export' | 'about' | 'speech';

interface TabConfig {
  id: SettingsTab;
  label: string;
  icon: string;
  keywords: string[];
}

const TABS: TabConfig[] = [
  {
    id: 'general',
    label: 'General',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    keywords: ['journal', 'prompts', 'auto-save', 'reminders', 'notifications', 'tutorial', 'help', 'tour', 'speech', 'voice', 'dictation', 'whisper', 'microphone', 'transcription', 'location', 'weather', 'city', 'time capsule', 'capsule', 'seal', 'reveal', 'anniversary'],
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z',
    keywords: ['appearance', 'theme', 'dark', 'light', 'compact', 'animations', 'display', 'color scheme'],
  },
  {
    id: 'privacy',
    label: 'Privacy',
    icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
    keywords: ['security', 'lock', 'timeout', 'clipboard', 'encryption', 'password', '2fa', 'two-factor', 'authenticator', 'yubikey', 'backup codes', 'totp'],
  },
  {
    id: 'sync',
    label: 'Sync',
    icon: 'M3 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 003 15z',
    keywords: ['sync', 'cloud', 'webdav', 'backup', 'upload', 'download', 'interval', 'auto-sync', 'storage'],
  },
  {
    id: 'ai',
    label: 'AI Features',
    icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
    keywords: ['openai', 'ollama', 'local', 'insights', 'prompts', 'wellness', 'reflections', 'api key'],
  },
  {
    id: 'health',
    label: 'Health',
    icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
    keywords: ['oura', 'ring', 'sleep', 'readiness', 'activity', 'stress', 'heart rate', 'health', 'biometrics', 'wearable'],
  },
  {
    id: 'devices',
    label: 'Devices',
    icon: 'M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z M13 17h-2m10 0h-1.5a2 2 0 01-2-2v-4a2 2 0 012-2h1.5M5 17H3.5a2 2 0 01-2-2v-4a2 2 0 012-2H5m0 0V7a2 2 0 012-2h6a2 2 0 012 2v2M5 9h14',
    keywords: ['devices', 'sync', 'local', 'peer', 'nearby', 'pairing', 'pair', 'wifi', 'network', 'lan'],
  },
  {
    id: 'export',
    label: 'Export',
    icon: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3',
    keywords: ['export', 'backup', 'download', 'filter', 'tags', 'mood', 'selective', 'date range'],
  },
  {
    id: 'speech',
    label: 'Speech to Text',
    icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z',
    keywords: ['speech', 'voice', 'dictation', 'whisper', 'microphone', 'transcription', 'stt', 'audio'],
  },
  {
    id: 'about',
    label: 'About',
    icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    keywords: ['version', 'info', 'app', 'moodhaven', 'update', 'updates', 'upgrade', 'release'],
  },
];

interface SettingsPageProps {
  updateHook: UseUpdateCheckReturn;
  onClose: () => void;
}

export function SettingsPage({ updateHook, onClose }: SettingsPageProps) {
  const {
    settings,
    appVersion,
    isLoading,
    hasUnsavedChanges,
    loadSettings,
    saveSettings,
    setTheme,
    setCompactMode,
    setAnimationsEnabled,
    setAIEnabled,
    setAIProvider,
    setOpenAIKey,
    setOpenAIModel,
    setLocalAIEndpoint,
    setLocalAIModel,
    setAIFeatures,
    setAIConsent,
    setAutoLockTimeout,
    setShowPrompts,
    setReminderEnabled,
    setReminderTime,
    setReminderFrequency,
    setReminderCustomDays,
    setReminderMessage,
    setReminderSound,
    setStorageType,
    setWebDAVConfig,
    setHasSeenTutorial,
    setSTTEnabled,
    setSTTModel,
    setSTTModelDownloaded,
    setSTTDownloadProgress,
    setSttFormattingLayer,
    setSttCloudConsent,
    setOuraEnabled,
    setOuraSettings,
    setWellnessSettings,
    setAutoLocationWeather,
    setTemperatureUnit,
    setAutoTitle,
    setSyncMode,
    setSyncIntervalMinutes,
    setTimeCapsuleSettings,
    updateSettings,
  } = useSettingsStore();

  const scrollToSection = useSettingsStore((s) => s.scrollToSection);
  const setScrollToSection = useSettingsStore((s) => s.setScrollToSection);

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [searchQuery, setSearchQuery] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const sttSectionRef = useRef<HTMLDivElement>(null);
  const aiSectionRef = useRef<HTMLDivElement>(null);

  const [exportMatchCount, setExportMatchCount] = useState<number | null>(null);
  const [exportTags, setExportTags] = useState<string[]>([]);
  const pendingExportFilter = useRef<ExportFilter | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null);
  const [dataStats, setDataStats] = useState<{ totalEntries: number; averageMood: number } | null>(null);

  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus | null>(null);
  const [backupCodesCount, setBackupCodesCount] = useState<number>(0);

  const [logPath, setLogPath] = useState<string | null>(null);

  function handleLogLevelChange(level: LogLevel): void {
    setLevel(level);
    updateSettings({ logLevel: level });
    void Promise.all([
      saveSettings().catch((e: unknown) => {
        logger.error('saveSettings failed in level change', { err: String(e) });
      }),
      invoke('set_log_level', { level }).catch((e: unknown) => {
        logger.error('set_log_level failed', { err: String(e) });
      }),
    ]);
  }

  const [showPasswordModal, setShowPasswordModal] = useState<'export' | null>(null);
  const [syncPassword, setSyncPassword] = useState('');
  const [syncPasswordError, setSyncPasswordError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const [syncRateLimit, setSyncRateLimit] = useState<RateLimitState>({
    failedAttempts: 0,
    lockoutUntil: null,
    lastFailedAt: null,
  });
  const [syncLockoutRemaining, setSyncLockoutRemaining] = useState(0);
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  useEffect(() => {
    if (scrollToSection === 'speech-to-text') {
      setActiveTab('general');
      setScrollToSection(null);
      setTimeout(() => {
        sttSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } else if (scrollToSection === 'ai') {
      setActiveTab('ai');
      setScrollToSection(null);
      setTimeout(() => {
        aiSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } else if (scrollToSection === 'sync') {
      setActiveTab('sync');
      setScrollToSection(null);
    } else if (scrollToSection === 'privacy') {
      setActiveTab('privacy');
      setScrollToSection(null);
    } else if (scrollToSection === 'health') {
      setActiveTab('health');
      setScrollToSection(null);
    } else if (scrollToSection === 'notifications') {
      setActiveTab('general');
      setScrollToSection(null);
    }
  }, [scrollToSection, setScrollToSection]);

  useEffect(() => {
    if (activeTab === 'privacy') {
      getDataStats().then(setDataStats).catch(() => setDataStats(null));
      get2FAStatus().then(setTwoFactorStatus).catch(() => setTwoFactorStatus(null));
      getBackupCodesCount().then(setBackupCodesCount).catch(() => setBackupCodesCount(0));
    }
    if (activeTab === 'about') {
      invoke<string | null>('get_log_path').then(setLogPath).catch(() => setLogPath(null));
    }
    if (activeTab === 'export') {
      getDataStats().then((s) => setExportMatchCount(s.totalEntries)).catch(() => setExportMatchCount(0));
      invoke<string[]>('get_book_tags', { bookId: 'default' }).then(setExportTags).catch(() => setExportTags([]));
    }
  }, [activeTab]);

  const refresh2FAStatus = useCallback(async () => {
    const status = await get2FAStatus();
    setTwoFactorStatus(status);
    const count = await getBackupCodesCount();
    setBackupCodesCount(count);
  }, []);

  const handleExport = useCallback(() => {
    setShowPasswordModal('export');
  }, []);

  const handleSelectiveExport = useCallback((filter: ExportFilter) => {
    pendingExportFilter.current = filter;
    setShowPasswordModal('export');
  }, []);

  useEffect(() => {
    let mounted = true;
    if (showPasswordModal) {
      setSyncPasswordError(null);
      loadRateLimitState().then((state) => {
        if (!mounted) return;
        setSyncRateLimit(state);
        setSyncLockoutRemaining(getRemainingLockoutMs(state));
      });
    }
    return () => {
      mounted = false;
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [showPasswordModal]);

  const syncIsLockedOut = syncLockoutRemaining > 0;
  useEffect(() => {
    if (syncTimerRef.current) {
      clearInterval(syncTimerRef.current);
      syncTimerRef.current = null;
    }

    if (syncIsLockedOut) {
      syncTimerRef.current = setInterval(() => {
        const remaining = getRemainingLockoutMs(syncRateLimit);
        setSyncLockoutRemaining(remaining);
        if (remaining <= 0) {
          setSyncPasswordError(null);
          if (syncTimerRef.current) {
            clearInterval(syncTimerRef.current);
            syncTimerRef.current = null;
          }
        }
      }, 1000);
    }

    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [syncIsLockedOut, syncRateLimit]);

  const syncLockedOut = syncLockoutRemaining > 0;

  const formatCountdown = (ms: number): string => {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handlePasswordSubmit = useCallback(async () => {
    if (!syncPassword) return;

    if (isLockedOut(syncRateLimit)) {
      const remaining = getRemainingLockoutMs(syncRateLimit);
      setSyncLockoutRemaining(remaining);
      setSyncPasswordError(`Too many failed attempts. Try again in ${formatDuration(remaining)}.`);
      return;
    }

    setSyncPasswordError(null);
    setIsSyncing(true);

    try {
      const isValid = await verifyUserPassword(syncPassword);
      if (!isValid) {
        const newState = await recordFailedAttempt(syncRateLimit);
        setSyncRateLimit(newState);
        const remaining = getRemainingLockoutMs(newState);
        setSyncLockoutRemaining(remaining);

        if (remaining > 0) {
          setSyncPasswordError(`Too many failed attempts. Try again in ${formatDuration(remaining)}.`);
        } else {
          const freeLeft = getRemainingFreeAttempts(newState);
          if (freeLeft > 0) {
            setSyncPasswordError(`Incorrect password. ${freeLeft} ${freeLeft === 1 ? 'attempt' : 'attempts'} remaining before lockout.`);
          } else {
            const nextDuration = getNextLockoutDuration(newState);
            setSyncPasswordError(`Incorrect password. Next failure will lock for ${formatDuration(nextDuration)}.`);
          }
        }
        setSyncPassword('');
        setIsSyncing(false);
        return;
      }

      await resetRateLimit();
      setSyncRateLimit({ failedAttempts: 0, lockoutUntil: null, lastFailedAt: null });

      setIsExporting(true);
      setExportProgress(null);
      const filter = pendingExportFilter.current;
      pendingExportFilter.current = null;
      let data: string;
      if (filter !== null) {
        const base64 = await exportData(filter);
        const encrypted = await encrypt(base64, syncPassword);
        if (!encrypted.success || !encrypted.data) throw new Error(encrypted.error || 'Encryption failed');
        data = JSON.stringify({ format: 'moodhaven-encrypted-v1', payload: encrypted.data });
      } else {
        data = await exportWithMedia(syncPassword, (done, total) => {
          setExportProgress({ done, total });
        });
      }
      setExportProgress(null);
      const date = new Date().toISOString().split('T')[0];
      await downloadBackupFile(data, `moodhaven-backup-${date}.moodhaven`);
      setIsExporting(false);

      setShowPasswordModal(null);
      setSyncPassword('');
    } catch (error) {
      logger.error('Export failed:', { error: String(error) });
      setIsExporting(false);
    } finally {
      setIsSyncing(false);
    }
  }, [syncPassword, syncRateLimit]);

  const matchedTab = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const query = searchQuery.toLowerCase();
    for (const tab of TABS) {
      if (tab.keywords.some(kw => kw.includes(query))) {
        return tab.id;
      }
    }
    return null;
  }, [searchQuery]);

  useEffect(() => {
    if (matchedTab) {
      setActiveTab(matchedTab);
    }
  }, [matchedTab]);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await saveSettings();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = TABS.findIndex(t => t.id === activeTab);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % TABS.length;
      setActiveTab(TABS[nextIndex].id);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + TABS.length) % TABS.length;
      setActiveTab(TABS[prevIndex].id);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8">
          <div className="animate-pulse text-slate-500 dark:text-slate-400">Loading settings...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Settings Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col w-full max-w-5xl h-[88vh] mx-4 overflow-hidden">

          {/* Header */}
          <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
            <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex-shrink-0">
              Settings
            </h1>

            <div className="relative flex-1 max-w-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search settings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-colors text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <div className="flex-1" />

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close settings"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body: Left nav sidebar + Right content */}
          <div className="flex flex-1 min-h-0">
            {/* Left sidebar navigation */}
            <nav
              className="w-52 bg-slate-50 dark:bg-slate-800/30 border-r border-slate-200 dark:border-slate-800 flex-shrink-0 overflow-y-auto py-2"
              role="tablist"
              onKeyDown={handleKeyDown}
            >
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`panel-${tab.id}`}
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSearchQuery('');
                  }}
                  className={`
                    w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all duration-150 text-left
                    ${activeTab === tab.id
                      ? 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 border-r-2 border-violet-500'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                    }
                  `}
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                  </svg>
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* Right: Tab content area */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-6 pb-8">

                {activeTab === 'general' && (
                  <GeneralTab
                    settings={settings}
                    saveSettings={saveSettings}
                    sttSectionRef={sttSectionRef}
                    setShowPrompts={setShowPrompts}
                    setAutoLocationWeather={setAutoLocationWeather}
                    setTemperatureUnit={setTemperatureUnit}
                    setAutoTitle={setAutoTitle}
                    setReminderEnabled={setReminderEnabled}
                    setReminderTime={setReminderTime}
                    setReminderFrequency={setReminderFrequency}
                    setReminderCustomDays={setReminderCustomDays}
                    setReminderMessage={setReminderMessage}
                    setReminderSound={setReminderSound}
                    setSTTEnabled={setSTTEnabled}
                    setSTTModel={setSTTModel}
                    setSTTModelDownloaded={setSTTModelDownloaded}
                    setSTTDownloadProgress={setSTTDownloadProgress}
                    setSttFormattingLayer={setSttFormattingLayer}
                    setSttCloudConsent={setSttCloudConsent}
                    setHasSeenTutorial={setHasSeenTutorial}
                    setTimeCapsuleSettings={setTimeCapsuleSettings}
                  />
                )}

                {activeTab === 'appearance' && (
                  <AppearanceTab
                    settings={settings}
                    setTheme={setTheme}
                    setCompactMode={setCompactMode}
                    setAnimationsEnabled={setAnimationsEnabled}
                  />
                )}

                {activeTab === 'privacy' && (
                  <PrivacyTab
                    settings={settings}
                    dataStats={dataStats}
                    twoFactorStatus={twoFactorStatus}
                    backupCodesCount={backupCodesCount}
                    refresh2FAStatus={refresh2FAStatus}
                    isExporting={isExporting}
                    exportProgress={exportProgress}
                    handleExport={handleExport}
                    setAutoLockTimeout={setAutoLockTimeout}
                    sessionPassword={getSessionPassword() ?? ''}
                  />
                )}

                {activeTab === 'sync' && (
                  <SyncTab
                    settings={settings}
                    saveSettings={saveSettings}
                    setStorageType={setStorageType}
                    setWebDAVConfig={setWebDAVConfig}
                    setSyncMode={setSyncMode}
                    setSyncIntervalMinutes={setSyncIntervalMinutes}
                  />
                )}

                {activeTab === 'ai' && (
                  <AITab
                    settings={settings}
                    saveSettings={saveSettings}
                    aiSectionRef={aiSectionRef}
                    setAIEnabled={setAIEnabled}
                    setAIProvider={setAIProvider}
                    setOpenAIKey={setOpenAIKey}
                    setOpenAIModel={setOpenAIModel}
                    setLocalAIEndpoint={setLocalAIEndpoint}
                    setLocalAIModel={setLocalAIModel}
                    setAIFeatures={setAIFeatures}
                    setAIConsent={setAIConsent}
                  />
                )}

                {activeTab === 'health' && (
                  <HealthTab
                    settings={settings}
                    saveSettings={saveSettings}
                    setOuraEnabled={setOuraEnabled}
                    setOuraSettings={setOuraSettings}
                    setWellnessSettings={setWellnessSettings}
                  />
                )}

                {activeTab === 'devices' && (
                  <DevicesTab />
                )}

                {activeTab === 'export' && (
                  <ExportTab
                    exportMatchCount={exportMatchCount}
                    exportTags={exportTags}
                    handleSelectiveExport={handleSelectiveExport}
                    isExporting={isExporting}
                  />
                )}

                {activeTab === 'speech' && (
                  <SpeechToTextTab
                    settings={settings}
                    updateSettings={updateSettings}
                    saveSettings={saveSettings}
                  />
                )}

                {activeTab === 'about' && (
                  <AboutTab
                    settings={settings}
                    updateHook={updateHook}
                    appVersion={appVersion}
                    logPath={logPath}
                    handleLogLevelChange={handleLogLevelChange}
                  />
                )}

              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex-shrink-0 bg-white dark:bg-slate-900">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!hasUnsavedChanges || saveStatus === 'saving'}
              className={`
                px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200
                ${hasUnsavedChanges
                  ? 'bg-violet-500 text-white hover:bg-violet-600 shadow-lg shadow-violet-500/25'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                }
              `}
            >
              {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Password prompt modal for export */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">
              Export Backup
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              Enter your master password to encrypt the backup file.
            </p>
            <input
              type="password"
              value={syncPassword}
              onChange={(e) => { setSyncPassword(e.target.value); setSyncPasswordError(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && syncPassword && !isSyncing && !syncLockedOut) {
                  handlePasswordSubmit();
                }
              }}
              placeholder="Master password"
              disabled={syncLockedOut}
              className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-colors ${
                syncPasswordError
                  ? 'border-rose-400 dark:border-rose-500'
                  : 'border-slate-200 dark:border-slate-700'
              } disabled:opacity-50`}
              autoFocus
            />

            {syncPasswordError && (
              <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                {syncPasswordError}
              </p>
            )}
            {syncLockedOut && (
              <div className="mt-2 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <span>Locked for {formatCountdown(syncLockoutRemaining)}</span>
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button
                type="button"
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                onClick={() => { setShowPasswordModal(null); setSyncPassword(''); setSyncPasswordError(null); }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!syncPassword || isSyncing || syncLockedOut}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handlePasswordSubmit}
              >
                {isSyncing ? 'Verifying...' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
