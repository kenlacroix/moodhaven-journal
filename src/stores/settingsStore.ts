/**
 * Settings Store
 *
 * Zustand store for managing application settings.
 */

import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import type {
  AppSettings,
  AIProvider,
  AIFeatures,
  ReminderFrequency,
  DayOfWeek,
  StorageBackend,
  WebDAVConfig,
  STTModel,
  STTFormattingLayer,
  OuraSettings,
  TimeCapsuleSettings,
  WellnessSettings,
} from '../types/settings';
import { createDefaultSettings } from '../types/settings';
import type { WritingAppearance } from '../types/writingAppearance';
import { clampTextScale } from '../types/writingAppearance';
import { setLevel, setModuleLevel } from '../lib/services/logger';
import type { LogModule, LogLevel } from '../lib/services/logger';
import {
  loadSettings,
  saveSettings,
  getAppVersion,
  resetSettings as resetSettingsService,
} from '../lib/services/settingsService';
import { cloudProviderStatus } from '../lib/services/cloudProvidersService';
import { useAppStore } from './appStore';

// Section to scroll to when settings page opens
type SettingsScrollTarget = 'speech-to-text' | 'ai' | 'privacy' | 'privacy-checkup' | 'health' | 'notifications' | 'sync' | null;

interface SettingsState {
  settings: AppSettings;
  appVersion: string;
  isLoading: boolean;
  error: string | null;
  hasUnsavedChanges: boolean;
  scrollToSection: SettingsScrollTarget;

  // Actions
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  resetSettings: () => Promise<void>;
  updateSettings: (updates: Partial<AppSettings>) => void;

  // AI Settings
  setAIEnabled: (enabled: boolean) => void;
  setAIProvider: (provider: AIProvider) => void;
  setOpenAIKey: (key: string | null) => void;
  setOpenAIModel: (model: 'gpt-4o-mini' | 'gpt-4o' | 'gpt-3.5-turbo') => void;
  setLocalAIEndpoint: (endpoint: string) => void;
  setLocalAIModel: (model: string) => void;
  setAIFeatures: (features: Partial<AIFeatures>) => void;
  setAIConsent: (agreed: boolean) => void;

  // Appearance
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setCompactMode: (enabled: boolean) => void;
  setAnimationsEnabled: (enabled: boolean) => void;
  setWritingAppearance: (patch: Partial<WritingAppearance>) => void;

  // Privacy
  setAutoLockTimeout: (minutes: number) => void;

  // Journal
  setShowPrompts: (enabled: boolean) => void;
  setAutoLocationWeather: (enabled: boolean) => void;
  setTemperatureUnit: (unit: 'C' | 'F') => void;
  setAutoTitle: (enabled: boolean) => void;

  // Reminders
  setReminderEnabled: (enabled: boolean) => void;
  setReminderTime: (time: string) => void;
  setReminderFrequency: (frequency: ReminderFrequency) => void;
  setReminderCustomDays: (days: DayOfWeek[]) => void;
  setReminderMessage: (message: string) => void;
  setReminderSound: (sound: boolean) => void;

  // Cloud Storage
  setStorageType: (type: StorageBackend) => void;
  setWebDAVConfig: (config: Partial<WebDAVConfig>) => void;
  setLastSyncDate: (date: string, direction: 'upload' | 'download') => void;
  setByoCloudFolder: (folderPath: string | null) => void;
  setByoCloudLastSync: (date: string) => void;

  // Tutorial
  setHasSeenTutorial: (seen: boolean) => void;
  setHasSeenWritingDrawerHint: (seen: boolean) => void;

  // Speech-to-Text
  setSTTEnabled: (enabled: boolean) => void;
  setSTTModel: (model: STTModel) => void;
  setSTTModelDownloaded: (downloaded: boolean) => void;
  setSTTDownloadProgress: (progress: number | null) => void;
  setSttFormattingLayer: (layer: STTFormattingLayer) => void;
  setSttCloudConsent: (given: boolean) => void;

  // Oura Ring
  setOuraEnabled: (enabled: boolean) => void;
  setOuraSettings: (updates: Partial<OuraSettings>) => void;

  // Updates
  setUpdateAutoCheck: (enabled: boolean) => void;
  setUpdateLastChecked: (iso: string) => void;
  setUpdateSkippedVersion: (version: string | null) => void;

  // Multi-device sync
  setSyncDeviceName: (name: string) => void;
  setSyncMode: (mode: 'manual' | 'on-open' | 'on-save') => void;
  setSyncIntervalMinutes: (minutes: number) => void;
  setSyncResult: (result: { at: string; success: boolean; pulled: number; pushed: number }) => void;
  setPeerSyncLanOnly: (lanOnly: boolean) => void;
  setPeerSyncIntervalSecs: (secs: number) => void;
  setPeerSyncEnabled: (enabled: boolean) => void;

  // Time Capsule
  setTimeCapsuleSettings: (updates: Partial<TimeCapsuleSettings>) => void;

  // Wellness
  setWellnessSettings: (updates: Partial<WellnessSettings>) => void;

  // Cloud providers
  setCloudProviderStatus: (
    provider: 'dropbox' | 'gdrive',
    status: { connected: boolean; lastSyncAt: string | null },
  ) => void;
  refreshCloudProviderStatus: () => Promise<void>;

  // Per-module log levels
  setModuleLogLevel: (module: LogModule, level: LogLevel | null) => void;

  // Navigation
  setScrollToSection: (section: SettingsScrollTarget) => void;

  // Session UI (not persisted)
  distractionFree: boolean;
  setDistractionFree: (v: boolean) => void;

  // Writing appearance drawer — toggle lives in TopBar, drawer renders in
  // WritingView, so the open + onboarding-pulse state is shared here.
  appearanceDrawerOpen: boolean;
  appearanceHintPulse: boolean;
  setAppearanceDrawerOpen: (v: boolean) => void;
  toggleAppearanceDrawer: () => void;
  setAppearanceHintPulse: (v: boolean) => void;

  // Auto-save indicator (not persisted — set by WritingView, read by Sidebar)
  savingState: 'idle' | 'saving' | 'saved';
  lastAutoSaved: string | null; // ISO date string
  setSavingState: (state: 'idle' | 'saving' | 'saved') => void;
  setLastAutoSaved: (iso: string) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: createDefaultSettings(),
  appVersion: '0.0.0',
  isLoading: true,
  error: null,
  hasUnsavedChanges: false,
  scrollToSection: null,
  distractionFree: false,
  appearanceDrawerOpen: false,
  appearanceHintPulse: false,
  savingState: 'idle',
  lastAutoSaved: null,

  loadSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const password = useAppStore.getState().sessionPassword ?? undefined;
      const [settings, version] = await Promise.all([
        loadSettings(password),
        getAppVersion(),
      ]);
      set({ settings, appVersion: version, isLoading: false, hasUnsavedChanges: false });

      // Apply theme and log level immediately
      applyTheme(settings.appearance.theme);
      setLevel(settings.logLevel ?? 'warn');
      const moduleLevels = settings.moduleLogLevels ?? {};
      for (const [mod, lvl] of Object.entries(moduleLevels) as [LogModule, LogLevel][]) {
        setModuleLevel(mod, lvl);
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load settings',
        isLoading: false,
      });
    }
  },

  saveSettings: async () => {
    const { settings } = get();
    const password = useAppStore.getState().sessionPassword ?? undefined;
    try {
      await saveSettings(settings, password);
      set({ hasUnsavedChanges: false, error: null });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to save settings',
      });
      throw error;
    }
  },

  resetSettings: async () => {
    set({ isLoading: true });
    try {
      const defaults = await resetSettingsService();
      set({ settings: defaults, isLoading: false, hasUnsavedChanges: false });
      applyTheme(defaults.appearance.theme);
      setLevel(defaults.logLevel ?? 'warn');
      void invoke('set_log_level', { level: defaults.logLevel ?? 'warn' }).catch(() => undefined);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to reset settings',
        isLoading: false,
      });
    }
  },

  updateSettings: (updates) => {
    set((state) => ({
      settings: { ...state.settings, ...updates },
      hasUnsavedChanges: true,
    }));
  },

  // AI Settings
  setAIEnabled: (enabled) => {
    set((state) => ({
      settings: {
        ...state.settings,
        ai: { ...state.settings.ai, enabled },
      },
      hasUnsavedChanges: true,
    }));
  },

  setAIProvider: (provider) => {
    set((state) => ({
      settings: {
        ...state.settings,
        ai: { ...state.settings.ai, provider },
      },
      hasUnsavedChanges: true,
    }));
  },

  setOpenAIKey: (apiKey) => {
    set((state) => ({
      settings: {
        ...state.settings,
        ai: {
          ...state.settings.ai,
          openai: { ...state.settings.ai.openai, apiKey },
        },
      },
      hasUnsavedChanges: true,
    }));
  },

  setOpenAIModel: (model) => {
    set((state) => ({
      settings: {
        ...state.settings,
        ai: {
          ...state.settings.ai,
          openai: { ...state.settings.ai.openai, model },
        },
      },
      hasUnsavedChanges: true,
    }));
  },

  setLocalAIEndpoint: (endpoint) => {
    set((state) => ({
      settings: {
        ...state.settings,
        ai: {
          ...state.settings.ai,
          localAI: { ...state.settings.ai.localAI, endpoint },
        },
      },
      hasUnsavedChanges: true,
    }));
  },

  setLocalAIModel: (model) => {
    set((state) => ({
      settings: {
        ...state.settings,
        ai: {
          ...state.settings.ai,
          localAI: { ...state.settings.ai.localAI, model },
        },
      },
      hasUnsavedChanges: true,
    }));
  },

  setAIFeatures: (features) => {
    set((state) => ({
      settings: {
        ...state.settings,
        ai: {
          ...state.settings.ai,
          features: { ...state.settings.ai.features, ...features },
        },
      },
      hasUnsavedChanges: true,
    }));
  },

  setAIConsent: (agreed) => {
    set((state) => ({
      settings: {
        ...state.settings,
        ai: {
          ...state.settings.ai,
          consent: {
            ...state.settings.ai.consent,
            agreedToTerms: agreed,
            dataUsageUnderstood: agreed,
            consentDate: agreed ? new Date().toISOString() : null,
          },
        },
      },
      hasUnsavedChanges: true,
    }));
  },

  // Appearance
  setTheme: (theme) => {
    set((state) => ({
      settings: {
        ...state.settings,
        appearance: { ...state.settings.appearance, theme },
      },
      hasUnsavedChanges: true,
    }));
    applyTheme(theme);
  },

  setCompactMode: (compactMode) => {
    set((state) => ({
      settings: {
        ...state.settings,
        appearance: { ...state.settings.appearance, compactMode },
      },
      hasUnsavedChanges: true,
    }));
  },

  setAnimationsEnabled: (animationsEnabled) => {
    set((state) => ({
      settings: {
        ...state.settings,
        appearance: { ...state.settings.appearance, animationsEnabled },
      },
      hasUnsavedChanges: true,
    }));
  },

  setWritingAppearance: (patch) => {
    set((state) => {
      // Clamp textScale at write time so callers don't have to worry about it.
      const safePatch =
        patch.textScale !== undefined
          ? { ...patch, textScale: clampTextScale(patch.textScale) }
          : patch;
      return {
        settings: {
          ...state.settings,
          appearance: {
            ...state.settings.appearance,
            writing: { ...state.settings.appearance.writing, ...safePatch },
          },
        },
        hasUnsavedChanges: true,
      };
    });
  },

  // Privacy
  setAutoLockTimeout: (autoLockTimeout) => {
    set((state) => ({
      settings: {
        ...state.settings,
        privacy: { ...state.settings.privacy, autoLockTimeout },
      },
      hasUnsavedChanges: true,
    }));
  },

  // Journal
  setShowPrompts: (showPrompts) => {
    set((state) => ({
      settings: {
        ...state.settings,
        journal: { ...state.settings.journal, showPrompts },
      },
      hasUnsavedChanges: true,
    }));
  },

  setAutoLocationWeather: (autoLocationWeather) => {
    set((state) => ({
      settings: {
        ...state.settings,
        journal: { ...state.settings.journal, autoLocationWeather },
      },
      hasUnsavedChanges: true,
    }));
  },

  setTemperatureUnit: (temperatureUnit) => {
    set((state) => ({
      settings: {
        ...state.settings,
        journal: { ...state.settings.journal, temperatureUnit },
      },
      hasUnsavedChanges: true,
    }));
  },

  setAutoTitle: (autoTitle) => {
    set((state) => ({
      settings: {
        ...state.settings,
        journal: { ...state.settings.journal, autoTitle },
      },
      hasUnsavedChanges: true,
    }));
  },

  // Reminders
  setReminderEnabled: (enabled) => {
    set((state) => ({
      settings: {
        ...state.settings,
        reminders: { ...state.settings.reminders, enabled },
      },
      hasUnsavedChanges: true,
    }));
  },

  setReminderTime: (time) => {
    set((state) => ({
      settings: {
        ...state.settings,
        reminders: { ...state.settings.reminders, time },
      },
      hasUnsavedChanges: true,
    }));
  },

  setReminderFrequency: (frequency) => {
    set((state) => ({
      settings: {
        ...state.settings,
        reminders: { ...state.settings.reminders, frequency },
      },
      hasUnsavedChanges: true,
    }));
  },

  setReminderCustomDays: (customDays) => {
    set((state) => ({
      settings: {
        ...state.settings,
        reminders: { ...state.settings.reminders, customDays },
      },
      hasUnsavedChanges: true,
    }));
  },

  setReminderMessage: (message) => {
    set((state) => ({
      settings: {
        ...state.settings,
        reminders: { ...state.settings.reminders, message },
      },
      hasUnsavedChanges: true,
    }));
  },

  setReminderSound: (sound) => {
    set((state) => ({
      settings: {
        ...state.settings,
        reminders: { ...state.settings.reminders, sound },
      },
      hasUnsavedChanges: true,
    }));
  },

  // Cloud Storage
  setStorageType: (type) => {
    set((state) => ({
      settings: {
        ...state.settings,
        storage: { ...state.settings.storage, type },
      },
      hasUnsavedChanges: true,
    }));
  },

  setWebDAVConfig: (config) => {
    set((state) => ({
      settings: {
        ...state.settings,
        storage: {
          ...state.settings.storage,
          webdav: { ...state.settings.storage.webdav, ...config },
        },
      },
      hasUnsavedChanges: true,
    }));
  },

  setLastSyncDate: (date, direction) => {
    set((state) => ({
      settings: {
        ...state.settings,
        storage: {
          ...state.settings.storage,
          lastSyncDate: date,
          lastSyncDirection: direction,
        },
      },
      hasUnsavedChanges: true,
    }));
  },

  setByoCloudFolder: (folderPath) => {
    set((state) => ({
      settings: {
        ...state.settings,
        storage: {
          ...state.settings.storage,
          byocloud: { ...state.settings.storage.byocloud, folderPath },
        },
      },
      hasUnsavedChanges: true,
    }));
  },

  setByoCloudLastSync: (date) => {
    set((state) => ({
      settings: {
        ...state.settings,
        storage: {
          ...state.settings.storage,
          byocloud: { ...state.settings.storage.byocloud, lastSyncAt: date },
        },
      },
      hasUnsavedChanges: true,
    }));
  },

  // Tutorial
  setHasSeenTutorial: (hasSeenTutorial) => {
    set((state) => ({
      settings: {
        ...state.settings,
        tutorial: { ...state.settings.tutorial, hasSeenTutorial },
      },
      hasUnsavedChanges: true,
    }));
  },

  setHasSeenWritingDrawerHint: (hasSeenWritingDrawerHint) => {
    set((state) => ({
      settings: {
        ...state.settings,
        tutorial: { ...state.settings.tutorial, hasSeenWritingDrawerHint },
      },
      hasUnsavedChanges: true,
    }));
  },

  // Speech-to-Text
  setSTTEnabled: (enabled) => {
    set((state) => ({
      settings: {
        ...state.settings,
        speechToText: { ...state.settings.speechToText, enabled },
      },
      hasUnsavedChanges: true,
    }));
  },

  setSTTModel: (model) => {
    set((state) => ({
      settings: {
        ...state.settings,
        speechToText: { ...state.settings.speechToText, model, modelDownloaded: false },
      },
      hasUnsavedChanges: true,
    }));
  },

  setSTTModelDownloaded: (modelDownloaded) => {
    set((state) => ({
      settings: {
        ...state.settings,
        speechToText: { ...state.settings.speechToText, modelDownloaded },
      },
      hasUnsavedChanges: true,
    }));
  },

  setSTTDownloadProgress: (downloadProgress) => {
    set((state) => ({
      settings: {
        ...state.settings,
        speechToText: { ...state.settings.speechToText, downloadProgress },
      },
      // Don't mark as unsaved for progress updates
    }));
  },

  setSttFormattingLayer: (layer) => {
    set((state) => ({
      settings: {
        ...state.settings,
        speechToText: {
          ...state.settings.speechToText,
          formatting: { ...state.settings.speechToText.formatting, layer },
        },
      },
      hasUnsavedChanges: true,
    }));
  },

  setSttCloudConsent: (given) => {
    set((state) => ({
      settings: {
        ...state.settings,
        speechToText: {
          ...state.settings.speechToText,
          formatting: {
            ...state.settings.speechToText.formatting,
            cloudConsentGiven: given,
            consentDate: given ? new Date().toISOString() : null,
          },
        },
      },
      hasUnsavedChanges: true,
    }));
  },

  // Oura Ring
  setOuraEnabled: (enabled) => {
    set((state) => ({
      settings: {
        ...state.settings,
        oura: { ...state.settings.oura, enabled },
      },
      hasUnsavedChanges: true,
    }));
  },

  setOuraSettings: (updates) => {
    set((state) => ({
      settings: {
        ...state.settings,
        oura: { ...state.settings.oura, ...updates },
      },
      hasUnsavedChanges: true,
    }));
  },

  // Updates
  setUpdateAutoCheck: (autoCheck) => {
    set((state) => ({
      settings: {
        ...state.settings,
        updates: { ...state.settings.updates, autoCheck },
      },
      hasUnsavedChanges: true,
    }));
  },

  setUpdateLastChecked: (lastChecked) => {
    set((state) => ({
      settings: {
        ...state.settings,
        updates: { ...state.settings.updates, lastChecked },
      },
      hasUnsavedChanges: true,
    }));
  },

  setUpdateSkippedVersion: (skippedVersion) => {
    set((state) => ({
      settings: {
        ...state.settings,
        updates: { ...state.settings.updates, skippedVersion },
      },
      hasUnsavedChanges: true,
    }));
  },

  // Multi-device sync
  setSyncDeviceName: (deviceName) => {
    set((state) => ({
      settings: { ...state.settings, sync: { ...state.settings.sync, deviceName } },
      hasUnsavedChanges: true,
    }));
  },

  setSyncMode: (syncMode) => {
    set((state) => ({
      settings: { ...state.settings, sync: { ...state.settings.sync, syncMode } },
      hasUnsavedChanges: true,
    }));
  },

  setSyncIntervalMinutes: (syncIntervalMinutes) => {
    set((state) => ({
      settings: { ...state.settings, sync: { ...state.settings.sync, syncIntervalMinutes } },
      hasUnsavedChanges: true,
    }));
  },

  setSyncResult: ({ at, success, pulled, pushed }) => {
    set((state) => ({
      settings: {
        ...state.settings,
        sync: {
          ...state.settings.sync,
          lastSyncAt: at,
          lastSyncResult: success ? 'success' : 'error',
          lastSyncPulled: pulled,
          lastSyncPushed: pushed,
        },
      },
      hasUnsavedChanges: true,
    }));
  },

  setPeerSyncLanOnly: (peerSyncLanOnly) => {
    set((state) => ({
      settings: { ...state.settings, sync: { ...state.settings.sync, peerSyncLanOnly } },
      hasUnsavedChanges: true,
    }));
  },

  setPeerSyncIntervalSecs: (peerSyncIntervalSecs) => {
    set((state) => ({
      settings: { ...state.settings, sync: { ...state.settings.sync, peerSyncIntervalSecs } },
      hasUnsavedChanges: true,
    }));
  },

  setPeerSyncEnabled: (peerSyncEnabled) => {
    set((state) => ({
      settings: { ...state.settings, sync: { ...state.settings.sync, peerSyncEnabled } },
      hasUnsavedChanges: true,
    }));
  },

  // Time Capsule
  setTimeCapsuleSettings: (updates) => {
    set((state) => ({
      settings: {
        ...state.settings,
        timeCapsule: { ...state.settings.timeCapsule, ...updates },
      },
      hasUnsavedChanges: true,
    }));
  },

  setWellnessSettings: (updates) => {
    set((state) => ({
      settings: {
        ...state.settings,
        wellness: { ...state.settings.wellness, ...updates },
      },
      hasUnsavedChanges: true,
    }));
  },

  setCloudProviderStatus: (provider, status) =>
    set((s) => ({
      settings: {
        ...s.settings,
        storage: {
          ...s.settings.storage,
          cloudProviders: {
            ...s.settings.storage.cloudProviders,
            [provider]: status,
          },
        },
      },
      hasUnsavedChanges: true,
    })),

  refreshCloudProviderStatus: async () => {
    try {
      const statuses = await cloudProviderStatus();
      for (const s of statuses) {
        if (s.provider === 'dropbox' || s.provider === 'gdrive') {
          get().setCloudProviderStatus(s.provider, {
            connected: s.connected,
            lastSyncAt: s.lastSyncAt,
          });
        }
      }
    } catch {
      // ignore — status refresh is best-effort
    }
  },

  setModuleLogLevel: (module, level) => {
    setModuleLevel(module, level);
    set((state) => {
      const existing = state.settings.moduleLogLevels ?? {};
      const next = { ...existing };
      if (level === null) {
        delete next[module];
      } else {
        next[module] = level;
      }
      return {
        settings: { ...state.settings, moduleLogLevels: next },
        hasUnsavedChanges: true,
      };
    });
  },

  // Navigation
  setScrollToSection: (scrollToSection) => {
    set({ scrollToSection });
  },

  // Session UI
  setDistractionFree: (distractionFree) => set({ distractionFree }),
  setAppearanceDrawerOpen: (appearanceDrawerOpen) => set({ appearanceDrawerOpen }),
  toggleAppearanceDrawer: () => set((s) => ({ appearanceDrawerOpen: !s.appearanceDrawerOpen })),
  setAppearanceHintPulse: (appearanceHintPulse) => set({ appearanceHintPulse }),

  // Auto-save indicator
  setSavingState: (savingState) => set({ savingState }),
  setLastAutoSaved: (lastAutoSaved) => set({ lastAutoSaved }),
}));

// Helper to apply theme to document
function applyTheme(theme: 'light' | 'dark' | 'system') {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
}
