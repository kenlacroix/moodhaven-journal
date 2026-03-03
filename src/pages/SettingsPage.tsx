/**
 * SettingsPage - User preferences and configuration
 *
 * Features:
 * - Tabbed interface for organized navigation
 * - Search functionality to find settings quickly
 * - Keyboard navigation support
 */

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import {
  SettingSection,
  SettingToggle,
  SettingSelect,
  SettingInput,
  DaySelector,
} from '../components/settings';
import { testOpenAIKey, testLocalAIConnection } from '../lib/settingsService';
import {
  factoryReset,
  exitApp,
  getDataStats,
  downloadBackup as downloadBackupFile,
  encryptedExport,
} from '../lib/dataManagementService';
import { testConnection as testWebDAVConnection } from '../lib/webdavService';
import { uploadBackup, downloadBackup as downloadCloudBackup } from '../lib/cloudSyncService';
import {
  get2FAStatus,
  regenerateBackupCodes,
  disable2FA,
  getBackupCodesCount,
} from '../lib/twoFactorService';
import { TotpSetup, HardwareKeySetup, BackupCodesDisplay } from '../components/twoFactor';
import type { TwoFactorStatus, BackupCodes } from '../types/twoFactor';
import type { ReminderFrequency, StorageBackend, STTModel } from '../types/settings';
import { STT_MODELS } from '../types/settings';
import { sendTestNotification } from '../lib/reminderService';
import {
  checkModelStatus,
  downloadModel,
  deleteModel,
  checkSidecarAvailable,
} from '../lib/speechToTextService';
import { verifyUserPassword } from '../lib/journalService';
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
} from '../lib/rateLimitService';

type SettingsTab = 'general' | 'privacy' | 'ai' | 'about';

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
    keywords: ['appearance', 'theme', 'dark', 'light', 'compact', 'animations', 'journal', 'prompts', 'auto-save', 'reminders', 'notifications', 'tutorial', 'help', 'tour', 'speech', 'voice', 'dictation', 'whisper', 'microphone', 'transcription'],
  },
  {
    id: 'privacy',
    label: 'Privacy',
    icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
    keywords: ['security', 'lock', 'timeout', 'clipboard', 'encryption', 'password', '2fa', 'two-factor', 'authenticator', 'yubikey', 'backup codes', 'totp', 'cloud', 'sync', 'webdav', 'backup'],
  },
  {
    id: 'ai',
    label: 'AI Features',
    icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
    keywords: ['openai', 'ollama', 'local', 'insights', 'prompts', 'wellness', 'reflections', 'api key'],
  },
  {
    id: 'about',
    label: 'About',
    icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    keywords: ['version', 'info', 'app', 'moodbloom'],
  },
];

export function SettingsPage() {
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
    setLastSyncDate,
    setHasSeenTutorial,
    setSTTEnabled,
    setSTTModel,
    setSTTModelDownloaded,
    setSTTDownloadProgress,
  } = useSettingsStore();

  const scrollToSection = useSettingsStore((s) => s.scrollToSection);
  const setScrollToSection = useSettingsStore((s) => s.setScrollToSection);

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [searchQuery, setSearchQuery] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Ref for scrolling to STT section
  const sttSectionRef = useRef<HTMLDivElement>(null);

  // Data management state
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [dataStats, setDataStats] = useState<{ totalEntries: number; averageMood: number } | null>(null);

  // 2FA state
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus | null>(null);
  const [backupCodesCount, setBackupCodesCount] = useState<number>(0);
  const [show2FASetup, setShow2FASetup] = useState<'totp' | 'webauthn' | null>(null);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [backupCodes, setBackupCodes] = useState<BackupCodes | null>(null);
  const [isDisabling2FA, setIsDisabling2FA] = useState(false);
  const [showDisable2FAConfirm, setShowDisable2FAConfirm] = useState(false);

  // Reminder test state
  const [testingNotification, setTestingNotification] = useState(false);
  const [notificationTestResult, setNotificationTestResult] = useState<string | null>(null);

  // Speech-to-Text state
  const [sttDownloading, setSTTDownloading] = useState(false);
  const [sttDownloadError, setSTTDownloadError] = useState<string | null>(null);
  const [sttSidecarAvailable, setSTTSidecarAvailable] = useState<boolean | null>(null);

  // Tutorial state
  const handleShowTutorial = useCallback(async () => {
    setHasSeenTutorial(false);
    await saveSettings();
  }, [setHasSeenTutorial, saveSettings]);

  // Check STT model and sidecar on mount
  useEffect(() => {
    checkSidecarAvailable().then(setSTTSidecarAvailable);
    if (settings.speechToText.model) {
      checkModelStatus(settings.speechToText.model).then((status) => {
        if (status.downloaded !== settings.speechToText.modelDownloaded) {
          setSTTModelDownloaded(status.downloaded);
        }
      });
    }
  }, [settings.speechToText.model, settings.speechToText.modelDownloaded, setSTTModelDownloaded]);

  // Handle STT model download
  const handleSTTModelDownload = useCallback(async () => {
    setSTTDownloading(true);
    setSTTDownloadError(null);
    setSTTDownloadProgress(0);

    try {
      await downloadModel(settings.speechToText.model, (progress) => {
        setSTTDownloadProgress(progress.percentage);
      });
      setSTTModelDownloaded(true);
      setSTTDownloadProgress(null);
      await saveSettings();
    } catch (error) {
      setSTTDownloadError(error instanceof Error ? error.message : 'Download failed');
      setSTTDownloadProgress(null);
    } finally {
      setSTTDownloading(false);
    }
  }, [settings.speechToText.model, setSTTModelDownloaded, setSTTDownloadProgress, saveSettings]);

  // Handle STT model delete
  const handleSTTModelDelete = useCallback(async () => {
    try {
      await deleteModel(settings.speechToText.model);
      setSTTModelDownloaded(false);
      await saveSettings();
    } catch (error) {
      setSTTDownloadError(error instanceof Error ? error.message : 'Delete failed');
    }
  }, [settings.speechToText.model, setSTTModelDownloaded, saveSettings]);

  // Cloud sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState<'export' | 'upload' | 'download' | null>(null);
  const [syncPassword, setSyncPassword] = useState('');
  const [syncPasswordError, setSyncPasswordError] = useState<string | null>(null);

  // Rate limiting for password modal (shares persisted state with lock screen)
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

  // Handle scroll-to-section navigation from other pages
  useEffect(() => {
    if (scrollToSection === 'speech-to-text') {
      // Switch to general tab (where STT settings are)
      setActiveTab('general');
      // Clear the scroll target
      setScrollToSection(null);
      // Scroll to the section after a brief delay for the tab to render
      setTimeout(() => {
        sttSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [scrollToSection, setScrollToSection]);

  // Load data stats and 2FA status when privacy tab is active
  useEffect(() => {
    if (activeTab === 'privacy') {
      getDataStats().then(setDataStats).catch(() => setDataStats(null));
      get2FAStatus().then(setTwoFactorStatus).catch(() => setTwoFactorStatus(null));
      getBackupCodesCount().then(setBackupCodesCount).catch(() => setBackupCodesCount(0));
    }
  }, [activeTab]);

  // Refresh 2FA status after setup/changes
  const refresh2FAStatus = useCallback(async () => {
    const status = await get2FAStatus();
    setTwoFactorStatus(status);
    const count = await getBackupCodesCount();
    setBackupCodesCount(count);
  }, []);

  // Handle 2FA setup completion
  const handle2FASetupComplete = useCallback(() => {
    setShow2FASetup(null);
    refresh2FAStatus();
  }, [refresh2FAStatus]);

  // Handle regenerate backup codes
  const handleRegenerateBackupCodes = useCallback(async () => {
    try {
      const codes = await regenerateBackupCodes();
      setBackupCodes(codes);
      setShowBackupCodes(true);
      refresh2FAStatus();
    } catch (error) {
      console.error('Failed to regenerate backup codes:', error);
    }
  }, [refresh2FAStatus]);

  // Handle disable 2FA
  const handleDisable2FA = useCallback(async () => {
    setIsDisabling2FA(true);
    try {
      await disable2FA();
      setShowDisable2FAConfirm(false);
      refresh2FAStatus();
    } catch (error) {
      console.error('Failed to disable 2FA:', error);
    } finally {
      setIsDisabling2FA(false);
    }
  }, [refresh2FAStatus]);

  const handleExport = useCallback(() => {
    setShowPasswordModal('export');
  }, []);

  // Load rate limit state when password modal opens
  useEffect(() => {
    if (showPasswordModal) {
      setSyncPasswordError(null);
      loadRateLimitState().then((state) => {
        setSyncRateLimit(state);
        setSyncLockoutRemaining(getRemainingLockoutMs(state));
      });
    }
    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [showPasswordModal]);

  // Countdown timer for lockout in password modal
  useEffect(() => {
    if (syncTimerRef.current) {
      clearInterval(syncTimerRef.current);
      syncTimerRef.current = null;
    }

    if (syncLockoutRemaining > 0) {
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
  }, [syncLockoutRemaining > 0, syncRateLimit]);

  const syncLockedOut = syncLockoutRemaining > 0;

  /** Format remaining ms as mm:ss for the countdown display. */
  const formatCountdown = (ms: number): string => {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handlePasswordSubmit = useCallback(async () => {
    if (!syncPassword) return;

    // Block if currently locked out
    if (isLockedOut(syncRateLimit)) {
      const remaining = getRemainingLockoutMs(syncRateLimit);
      setSyncLockoutRemaining(remaining);
      setSyncPasswordError(`Too many failed attempts. Try again in ${formatDuration(remaining)}.`);
      return;
    }

    setSyncPasswordError(null);
    setIsSyncing(true);
    setSyncStatus(null);

    try {
      // Verify password before proceeding
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

      // Password verified — reset rate limit
      await resetRateLimit();
      setSyncRateLimit({ failedAttempts: 0, lockoutUntil: null, lastFailedAt: null });

      if (showPasswordModal === 'export') {
        setIsExporting(true);
        const data = await encryptedExport(syncPassword);
        const date = new Date().toISOString().split('T')[0];
        await downloadBackupFile(data, `moodbloom-backup-${date}.moodbloom`);
        setIsExporting(false);
        setSyncStatus('Encrypted backup saved successfully.');
      } else if (showPasswordModal === 'upload') {
        const result = await uploadBackup(syncPassword, settings.storage.webdav);
        if (result.success) {
          setLastSyncDate(result.timestamp!, 'upload');
          setSyncStatus(`Uploaded: ${result.filename}`);
        } else {
          setSyncStatus(`Error: ${result.error}`);
        }
      } else if (showPasswordModal === 'download') {
        const result = await downloadCloudBackup(syncPassword, settings.storage.webdav);
        if (result.success) {
          setLastSyncDate(result.timestamp!, 'download');
          setSyncStatus(`Downloaded ${result.entriesCount} entries`);
        } else {
          setSyncStatus(`Error: ${result.error}`);
        }
      }

      setShowPasswordModal(null);
      setSyncPassword('');
    } catch (error) {
      setSyncStatus(`Error: ${error instanceof Error ? error.message : 'Operation failed'}`);
      setIsExporting(false);
    } finally {
      setIsSyncing(false);
    }
  }, [syncPassword, syncRateLimit, showPasswordModal, settings.storage.webdav, setLastSyncDate]);

  const handleTestNotification = useCallback(async () => {
    setTestingNotification(true);
    setNotificationTestResult(null);
    try {
      await sendTestNotification(settings.reminders.message);
      setNotificationTestResult('Notification sent!');
      setTimeout(() => setNotificationTestResult(null), 3000);
    } catch (error) {
      setNotificationTestResult(
        error instanceof Error ? error.message : 'Failed to send notification'
      );
    } finally {
      setTestingNotification(false);
    }
  }, [settings.reminders.message]);

  const handleReset = useCallback(async () => {
    if (resetConfirmText !== 'RESET') return;

    setIsResetting(true);
    try {
      await factoryReset();
      // Exit the app completely - user will need to reopen it
      // This ensures the backend reinitializes with a fresh database
      await exitApp();
    } catch (error) {
      console.error('Reset failed:', error);
      setIsResetting(false);
    }
  }, [resetConfirmText]);

  // Auto-switch tabs based on search query
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

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = TABS.findIndex(t => t.id === activeTab);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % TABS.length;
      setActiveTab(TABS[nextIndex].id);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + TABS.length) % TABS.length;
      setActiveTab(TABS[prevIndex].id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-slate-500 dark:text-slate-400">
          Loading settings...
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            Settings
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Customize your MoodBloom experience
          </p>
        </div>

        {/* Save button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasUnsavedChanges || saveStatus === 'saving'}
          className={`
            px-4 py-2 rounded-xl font-medium transition-all duration-200
            ${hasUnsavedChanges
              ? 'bg-violet-500 text-white hover:bg-violet-600 shadow-lg shadow-violet-500/25'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
            }
          `}
        >
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          placeholder="Search settings..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Tabs navigation */}
      <div
        role="tablist"
        className="flex gap-1 p-1 mb-4 bg-slate-100 dark:bg-slate-800 rounded-xl"
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
              flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200
              ${activeTab === tab.id
                ? 'bg-white dark:bg-slate-700 text-violet-600 dark:text-violet-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }
            `}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div className="flex-1 overflow-auto pb-6">
        {/* General Tab */}
        {activeTab === 'general' && (
          <div id="panel-general" role="tabpanel" className="space-y-6">
            <SettingSection
              title="Appearance"
              description="Customize how MoodBloom looks"
            >
              <SettingSelect
                label="Theme"
                description="Choose your preferred color scheme"
                value={settings.appearance.theme}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
                onChange={(v) => setTheme(v as 'light' | 'dark' | 'system')}
              />

              <SettingToggle
                label="Compact mode"
                description="Use less spacing for a denser layout"
                checked={settings.appearance.compactMode}
                onChange={setCompactMode}
              />

              <SettingToggle
                label="Animations"
                description="Enable smooth transitions and animations"
                checked={settings.appearance.animationsEnabled}
                onChange={setAnimationsEnabled}
              />
            </SettingSection>

            <SettingSection
              title="Journal"
              description="Configure your journaling experience"
            >
              <SettingToggle
                label="Show writing prompts"
                description="Display helpful prompts when creating entries"
                checked={settings.journal.showPrompts}
                onChange={setShowPrompts}
              />

              <SettingToggle
                label="Auto-save drafts"
                description="Automatically save your entry as you type"
                checked={settings.journal.autoSave}
                onChange={(v) => useSettingsStore.setState((s) => ({
                  settings: { ...s.settings, journal: { ...s.settings.journal, autoSave: v } },
                  hasUnsavedChanges: true,
                }))}
              />
            </SettingSection>

            <SettingSection
              title="Reminders"
              description="Get notified to journal regularly"
            >
              <SettingToggle
                label="Enable reminders"
                description="Receive notifications at your preferred time"
                checked={settings.reminders.enabled}
                onChange={setReminderEnabled}
              />

              {settings.reminders.enabled && (
                <>
                  <SettingInput
                    label="Reminder time"
                    description="When should we remind you?"
                    value={settings.reminders.time}
                    onChange={setReminderTime}
                    type="time"
                  />

                  <SettingSelect
                    label="Frequency"
                    description="How often do you want reminders?"
                    value={settings.reminders.frequency}
                    options={[
                      { value: 'daily', label: 'Every day' },
                      { value: 'weekdays', label: 'Weekdays only' },
                      { value: 'weekends', label: 'Weekends only' },
                      { value: 'custom', label: 'Custom days' },
                    ]}
                    onChange={(v) => setReminderFrequency(v as ReminderFrequency)}
                  />

                  {settings.reminders.frequency === 'custom' && (
                    <div className="py-2">
                      <p className="font-medium text-slate-700 dark:text-slate-200 mb-2">
                        Select days
                      </p>
                      <DaySelector
                        selectedDays={settings.reminders.customDays}
                        onChange={setReminderCustomDays}
                      />
                    </div>
                  )}

                  <SettingInput
                    label="Reminder message"
                    description="Customize your notification message"
                    value={settings.reminders.message}
                    onChange={setReminderMessage}
                    placeholder="Time to reflect on your day"
                  />

                  <SettingToggle
                    label="Play sound"
                    description="Play a sound with the notification"
                    checked={settings.reminders.sound}
                    onChange={setReminderSound}
                  />

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={handleTestNotification}
                      disabled={testingNotification}
                      className="px-4 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors disabled:opacity-50"
                    >
                      {testingNotification ? 'Sending...' : 'Send Test Notification'}
                    </button>
                    {notificationTestResult && (
                      <p className={`text-sm mt-2 ${notificationTestResult.includes('sent') ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {notificationTestResult}
                      </p>
                    )}
                  </div>
                </>
              )}
            </SettingSection>

            <div ref={sttSectionRef}>
            <SettingSection
              title="Speech to Text"
              description="Dictate journal entries using your voice"
            >
              {sttSidecarAvailable === false && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-sm mb-3">
                  <p className="font-medium">Whisper engine not installed</p>
                  <p className="text-xs mt-1 text-amber-700 dark:text-amber-300">
                    Speech-to-text requires the Whisper sidecar. This feature will be available in a future release.
                  </p>
                </div>
              )}

              <SettingToggle
                label="Enable speech to text"
                description="Show microphone button in the editor toolbar"
                checked={settings.speechToText.enabled}
                onChange={setSTTEnabled}
                disabled={sttSidecarAvailable === false}
              />

              {settings.speechToText.enabled && (
                <>
                  <SettingSelect
                    label="Model"
                    description="Choose quality vs. speed tradeoff"
                    value={settings.speechToText.model}
                    options={STT_MODELS.map((m) => ({
                      value: m.id,
                      label: `${m.name} (${m.size})`,
                    }))}
                    onChange={(v) => setSTTModel(v as STTModel)}
                  />

                  <div className="py-2">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-medium text-slate-700 dark:text-slate-200 text-sm">
                          Model Status
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {settings.speechToText.modelDownloaded
                            ? `${STT_MODELS.find(m => m.id === settings.speechToText.model)?.name} is ready to use`
                            : 'Model needs to be downloaded for offline use'}
                        </p>
                      </div>

                      {settings.speechToText.modelDownloaded ? (
                        <button
                          type="button"
                          onClick={handleSTTModelDelete}
                          className="px-3 py-1.5 text-sm font-medium text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/30 rounded-lg hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors"
                        >
                          Delete Model
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleSTTModelDownload}
                          disabled={sttDownloading}
                          className="px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors disabled:opacity-50"
                        >
                          {sttDownloading ? 'Downloading...' : 'Download Model'}
                        </button>
                      )}
                    </div>

                    {sttDownloading && settings.speechToText.downloadProgress !== null && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                          <span>Downloading...</span>
                          <span>{Math.round(settings.speechToText.downloadProgress)}%</span>
                        </div>
                        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-violet-500 transition-all duration-300"
                            style={{ width: `${settings.speechToText.downloadProgress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {sttDownloadError && (
                      <p className="text-sm text-rose-600 dark:text-rose-400 mt-2">
                        {sttDownloadError}
                      </p>
                    )}
                  </div>

                  <div className="text-xs text-slate-500 dark:text-slate-400 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <p className="font-medium text-slate-600 dark:text-slate-300 mb-1">Privacy Notice</p>
                    <p>
                      All speech recognition happens locally on your device. No audio data is ever sent to external servers.
                      Models are downloaded from Hugging Face once and stored locally.
                    </p>
                  </div>
                </>
              )}
            </SettingSection>
            </div>

            <SettingSection
              title="Help"
              description="Learn how to use MoodBloom"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-700 dark:text-slate-200 text-sm">
                    App Tutorial
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Replay the introductory tour of MoodBloom
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleShowTutorial}
                  className="px-4 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors"
                >
                  Show Tutorial
                </button>
              </div>
            </SettingSection>
          </div>
        )}

        {/* Privacy Tab */}
        {activeTab === 'privacy' && (
          <div id="panel-privacy" role="tabpanel" className="space-y-6">
            <SettingSection
              title="Privacy & Security"
              description="Keep your journal safe"
            >
              <SettingSelect
                label="Auto-lock timeout"
                description="Lock the app after inactivity"
                value={String(settings.privacy.autoLockTimeout)}
                options={[
                  { value: '0', label: 'Never' },
                  { value: '1', label: '1 minute' },
                  { value: '5', label: '5 minutes' },
                  { value: '15', label: '15 minutes' },
                  { value: '30', label: '30 minutes' },
                ]}
                onChange={(v) => setAutoLockTimeout(Number(v))}
              />

              <SettingToggle
                label="Clear clipboard on lock"
                description="Remove copied content when the app locks"
                checked={settings.privacy.clearClipboardOnLock}
                onChange={(v) => useSettingsStore.setState((s) => ({
                  settings: { ...s.settings, privacy: { ...s.settings.privacy, clearClipboardOnLock: v } },
                  hasUnsavedChanges: true,
                }))}
              />
            </SettingSection>

            {/* Two-Factor Authentication Section */}
            <SettingSection
              title="Two-Factor Authentication"
              description="Add an extra layer of security to your account"
            >
              {twoFactorStatus?.enabled ? (
                // 2FA is enabled
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                    <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-800/50 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-emerald-800 dark:text-emerald-200">
                        2FA Enabled
                      </p>
                      <p className="text-sm text-emerald-600 dark:text-emerald-400">
                        {twoFactorStatus.method === 'totp' && 'Using authenticator app'}
                        {twoFactorStatus.method === 'webauthn' && 'Using security key'}
                        {twoFactorStatus.method === 'both' && 'Using authenticator app & security key'}
                      </p>
                    </div>
                  </div>

                  {/* Backup codes status */}
                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        Backup Codes
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {backupCodesCount} code{backupCodesCount !== 1 ? 's' : ''} remaining
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRegenerateBackupCodes}
                      className="px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors"
                    >
                      Regenerate
                    </button>
                  </div>

                  {/* Add another method if only one is enabled */}
                  {twoFactorStatus.method !== 'both' && (
                    <div className="pt-2">
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                        Add another method:
                      </p>
                      <div className="flex gap-2">
                        {twoFactorStatus.method !== 'totp' && (
                          <button
                            type="button"
                            onClick={() => setShow2FASetup('totp')}
                            className="flex-1 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                          >
                            Add Authenticator App
                          </button>
                        )}
                        {twoFactorStatus.method !== 'webauthn' && (
                          <button
                            type="button"
                            onClick={() => setShow2FASetup('webauthn')}
                            className="flex-1 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                          >
                            Add Security Key
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Disable 2FA */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setShowDisable2FAConfirm(true)}
                      className="text-sm text-rose-500 hover:text-rose-600 transition-colors"
                    >
                      Disable Two-Factor Authentication
                    </button>
                  </div>
                </div>
              ) : (
                // 2FA is not enabled
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Protect your journal with an extra layer of security. Choose your preferred method:
                  </p>

                  <div className="grid gap-3">
                    <button
                      type="button"
                      onClick={() => setShow2FASetup('totp')}
                      className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors text-left"
                    >
                      <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center">
                        <span className="text-xl">&#128241;</span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-800 dark:text-slate-100">
                          Authenticator App
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Use Authy, Google Authenticator, or similar
                        </p>
                      </div>
                      <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShow2FASetup('webauthn')}
                      className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors text-left"
                    >
                      <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center">
                        <span className="text-xl">&#128273;</span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-800 dark:text-slate-100">
                          Hardware Security Key
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Use YubiKey or similar device
                        </p>
                      </div>
                      <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </SettingSection>

            <SettingSection
              title="Data Management"
              description="Control your personal data"
            >
              {/* Data stats */}
              {dataStats && (
                <div className="flex gap-4 mb-4">
                  <div className="flex-1 p-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl text-center">
                    <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">
                      {dataStats.totalEntries}
                    </div>
                    <div className="text-xs text-violet-600/70 dark:text-violet-400/70">
                      Total Entries
                    </div>
                  </div>
                  <div className="flex-1 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-center">
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {dataStats.averageMood.toFixed(1)}
                    </div>
                    <div className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                      Avg Mood
                    </div>
                  </div>
                </div>
              )}

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                  Your journal entries are encrypted using AES-256-GCM encryption with PBKDF2 key derivation (600,000 iterations).
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isExporting}
                    className="px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors disabled:opacity-50"
                    onClick={handleExport}
                  >
                    {isExporting ? 'Exporting...' : 'Export Data'}
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm font-medium text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/30 rounded-lg hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors"
                    onClick={() => setShowResetConfirm(true)}
                  >
                    Reset App
                  </button>
                </div>
              </div>

              {/* Reset confirmation dialog */}
              {showResetConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                  <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 max-w-md mx-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                        <svg className="w-5 h-5 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                          Factory Reset
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          This action cannot be undone
                        </p>
                      </div>
                    </div>

                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                      This will permanently delete all your journal entries, settings, and encryption keys.
                      You will need to set up the app again.
                    </p>

                    <div className="mb-4">
                      <label htmlFor="resetConfirm" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                        Type <span className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded">RESET</span> to confirm
                      </label>
                      <input
                        id="resetConfirm"
                        type="text"
                        value={resetConfirmText}
                        onChange={(e) => setResetConfirmText(e.target.value)}
                        placeholder="RESET"
                        className="input"
                        autoFocus
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                        onClick={() => {
                          setShowResetConfirm(false);
                          setResetConfirmText('');
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={resetConfirmText !== 'RESET' || isResetting}
                        className="flex-1 px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={handleReset}
                      >
                        {isResetting ? 'Resetting...' : 'Delete Everything'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 2FA Setup Modal - TOTP */}
              {show2FASetup === 'totp' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                  <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 max-w-md mx-4 w-full">
                    <TotpSetup
                      onComplete={handle2FASetupComplete}
                      onCancel={() => setShow2FASetup(null)}
                    />
                  </div>
                </div>
              )}

              {/* 2FA Setup Modal - Hardware Key (native FIDO2) */}
              {show2FASetup === 'webauthn' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                  <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 max-w-md mx-4 w-full">
                    <HardwareKeySetup
                      onComplete={handle2FASetupComplete}
                      onCancel={() => setShow2FASetup(null)}
                    />
                  </div>
                </div>
              )}

              {/* Backup Codes Modal */}
              {showBackupCodes && backupCodes && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                  <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 max-w-md mx-4 w-full">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
                      New Backup Codes
                    </h3>
                    <BackupCodesDisplay
                      codes={backupCodes.codes}
                      onDone={() => {
                        setShowBackupCodes(false);
                        setBackupCodes(null);
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Disable 2FA Confirmation */}
              {showDisable2FAConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                  <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 max-w-md mx-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                          Disable 2FA
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          This will reduce your account security
                        </p>
                      </div>
                    </div>

                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                      Are you sure you want to disable two-factor authentication?
                      Your journal will only be protected by your password.
                    </p>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                        onClick={() => setShowDisable2FAConfirm(false)}
                      >
                        Keep Enabled
                      </button>
                      <button
                        type="button"
                        disabled={isDisabling2FA}
                        className="flex-1 px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50"
                        onClick={handleDisable2FA}
                      >
                        {isDisabling2FA ? 'Disabling...' : 'Disable 2FA'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </SettingSection>

            {/* Cloud Backup Section */}
            <SettingSection
              title="Cloud Backup"
              description="Sync encrypted backups to a WebDAV server"
            >
              <SettingSelect
                label="Storage backend"
                description="Where to store cloud backups"
                value={settings.storage.type}
                options={[
                  { value: 'local', label: 'Local only' },
                  { value: 'webdav', label: 'WebDAV' },
                ]}
                onChange={(v) => setStorageType(v as StorageBackend)}
              />

              {settings.storage.type === 'webdav' && (
                <>
                  <SettingInput
                    label="WebDAV URL"
                    description="Full URL to your WebDAV directory"
                    value={settings.storage.webdav.url}
                    onChange={(v) => setWebDAVConfig({ url: v })}
                    placeholder="https://cloud.example.com/remote.php/dav/files/user/"
                    type="url"
                    onTest={async () => {
                      const result = await testWebDAVConnection(settings.storage.webdav);
                      return { valid: result.success, error: result.error };
                    }}
                  />

                  <SettingInput
                    label="Username"
                    description="WebDAV login username"
                    value={settings.storage.webdav.username}
                    onChange={(v) => setWebDAVConfig({ username: v })}
                    placeholder="username"
                  />

                  <SettingInput
                    label="Password"
                    description="WebDAV login password"
                    value={settings.storage.webdav.password}
                    onChange={(v) => setWebDAVConfig({ password: v })}
                    placeholder="password"
                    type="password"
                  />

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={isSyncing || !settings.storage.webdav.url}
                        onClick={() => setShowPasswordModal('upload')}
                        className="px-4 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors disabled:opacity-50"
                      >
                        Upload Backup
                      </button>
                      <button
                        type="button"
                        disabled={isSyncing || !settings.storage.webdav.url}
                        onClick={() => setShowPasswordModal('download')}
                        className="px-4 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                      >
                        Download Backup
                      </button>
                    </div>

                    {settings.storage.lastSyncDate && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        Last sync: {new Date(settings.storage.lastSyncDate).toLocaleString()}
                        {settings.storage.lastSyncDirection && ` (${settings.storage.lastSyncDirection})`}
                      </p>
                    )}

                    {syncStatus && (
                      <p className={`text-sm mt-2 ${syncStatus.startsWith('Error') ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {syncStatus}
                      </p>
                    )}
                  </div>
                </>
              )}
            </SettingSection>

            {/* Password prompt modal for export/sync */}
            {showPasswordModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 max-w-md mx-4">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">
                    {showPasswordModal === 'export' ? 'Export Backup' :
                     showPasswordModal === 'upload' ? 'Upload to WebDAV' :
                     'Download from WebDAV'}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                    Enter your master password to {showPasswordModal === 'download' ? 'decrypt' : 'encrypt'} the backup.
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

                  {/* Error message or lockout countdown */}
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
          </div>
        )}

        {/* AI Tab */}
        {activeTab === 'ai' && (
          <div id="panel-ai" role="tabpanel" className="space-y-6">
            <SettingSection
              title="AI Features"
              description="Optional AI-powered insights (your journal content is never sent to external servers)"
            >
              <SettingToggle
                label="Enable AI features"
                description="Get personalized prompts and insights based on your mood patterns"
                checked={settings.ai.enabled}
                onChange={setAIEnabled}
              />

              {settings.ai.enabled && (
                <>
                  {/* AI Provider Selection */}
                  <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-3">
                      AI Provider
                    </p>

                    <div className="space-y-2">
                      <label className="flex items-start gap-3 p-3 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                        <input
                          type="radio"
                          name="ai-provider"
                          value="openai"
                          checked={settings.ai.provider === 'openai'}
                          onChange={() => setAIProvider('openai')}
                          className="mt-1 accent-violet-500"
                        />
                        <div>
                          <p className="font-medium text-slate-700 dark:text-slate-200">OpenAI API</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Use your own OpenAI API key. You control the costs.
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 p-3 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                        <input
                          type="radio"
                          name="ai-provider"
                          value="local"
                          checked={settings.ai.provider === 'local'}
                          onChange={() => setAIProvider('local')}
                          className="mt-1 accent-violet-500"
                        />
                        <div>
                          <p className="font-medium text-slate-700 dark:text-slate-200">Local AI (Ollama)</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Use a local AI server. Maximum privacy - nothing leaves your computer.
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* OpenAI Configuration */}
                  {settings.ai.provider === 'openai' && (
                    <div className="mt-4 space-y-4">
                      <SettingInput
                        label="OpenAI API Key"
                        description="Your key is stored locally and encrypted"
                        value={settings.ai.openai.apiKey || ''}
                        onChange={(v) => setOpenAIKey(v || null)}
                        placeholder="sk-..."
                        type="password"
                        onTest={() => testOpenAIKey(settings.ai.openai.apiKey || '')}
                      />

                      <SettingSelect
                        label="Model"
                        description="Choose the AI model to use"
                        value={settings.ai.openai.model}
                        options={[
                          { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Recommended)' },
                          { value: 'gpt-4o', label: 'GPT-4o (Most capable)' },
                          { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Fastest)' },
                        ]}
                        onChange={(v) => setOpenAIModel(v as 'gpt-4o-mini' | 'gpt-4o' | 'gpt-3.5-turbo')}
                      />
                    </div>
                  )}

                  {/* Local AI Configuration */}
                  {settings.ai.provider === 'local' && (
                    <div className="mt-4 space-y-4">
                      <SettingInput
                        label="Ollama Endpoint"
                        description="URL of your local Ollama server"
                        value={settings.ai.localAI.endpoint}
                        onChange={setLocalAIEndpoint}
                        placeholder="http://localhost:11434"
                        type="url"
                        onTest={async () => {
                          const result = await testLocalAIConnection(settings.ai.localAI.endpoint);
                          if (result.valid && result.models && result.models.length > 0) {
                            return { valid: true, error: `Found ${result.models.length} models` };
                          }
                          return result;
                        }}
                      />

                      <SettingInput
                        label="Model Name"
                        description="The model to use (e.g., llama2, mistral, codellama)"
                        value={settings.ai.localAI.model}
                        onChange={setLocalAIModel}
                        placeholder="llama2"
                      />
                    </div>
                  )}

                  {/* AI Feature Toggles */}
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-3">
                      Features
                    </p>

                    <SettingToggle
                      label="Contextual prompts"
                      description="Get personalized writing prompts based on your patterns"
                      checked={settings.ai.features.contextualPrompts}
                      onChange={(v) => setAIFeatures({ contextualPrompts: v })}
                    />

                    <SettingToggle
                      label="Wellness insights"
                      description="Receive gentle observations about your mood trends"
                      checked={settings.ai.features.wellnessInsights}
                      onChange={(v) => setAIFeatures({ wellnessInsights: v })}
                    />

                    <SettingToggle
                      label="Weekly reflections"
                      description="Get a summary and reflection prompts each week"
                      checked={settings.ai.features.weeklyReflections}
                      onChange={(v) => setAIFeatures({ weeklyReflections: v })}
                    />
                  </div>

                  {/* Privacy Notice */}
                  {!settings.ai.consent.agreedToTerms && (
                    <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                      <p className="text-sm text-amber-800 dark:text-amber-200 font-medium mb-2">
                        Privacy Notice
                      </p>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
                        AI features only send anonymized metadata (mood scores, patterns, statistics) -
                        never your actual journal content. Your thoughts remain private.
                      </p>
                      <button
                        type="button"
                        onClick={() => setAIConsent(true)}
                        className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
                      >
                        I understand, enable AI
                      </button>
                    </div>
                  )}
                </>
              )}
            </SettingSection>
          </div>
        )}

        {/* About Tab */}
        {activeTab === 'about' && (
          <div id="panel-about" role="tabpanel" className="space-y-6">
            <SettingSection
              title="About MoodBloom"
              description="App information and credits"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-700">
                  <p className="text-slate-700 dark:text-slate-200">App Version</p>
                  <p className="text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                    v{appVersion}
                  </p>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-700">
                  <p className="text-slate-700 dark:text-slate-200">Settings Version</p>
                  <p className="text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                    {settings.version}
                  </p>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-700">
                  <p className="text-slate-700 dark:text-slate-200">Platform</p>
                  <p className="text-slate-500 dark:text-slate-400">
                    {navigator.platform}
                  </p>
                </div>

                <div className="pt-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    MoodBloom is a privacy-focused mood tracking and journaling application.
                    All your data is stored locally on your device and encrypted using
                    industry-standard AES-256-GCM encryption.
                  </p>
                </div>

                <div className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-xl border border-violet-100 dark:border-violet-800">
                  <p className="text-sm font-medium text-violet-700 dark:text-violet-300 mb-2">
                    Built with
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {['Tauri', 'React', 'TypeScript', 'TailwindCSS', 'Rust', 'SQLite'].map((tech) => (
                      <span
                        key={tech}
                        className="px-2 py-1 text-xs font-medium bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 rounded-md shadow-sm"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </SettingSection>
          </div>
        )}
      </div>
    </div>
  );
}
