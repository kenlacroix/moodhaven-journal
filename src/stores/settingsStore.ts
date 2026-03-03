/**
 * Settings Store
 *
 * Zustand store for managing application settings.
 */

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
} from '../types/settings';
import { createDefaultSettings } from '../types/settings';
import {
  loadSettings,
  saveSettings,
  getAppVersion,
  resetSettings as resetSettingsService,
} from '../lib/settingsService';

// Section to scroll to when settings page opens
export type SettingsScrollTarget = 'speech-to-text' | null;

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

  // Privacy
  setAutoLockTimeout: (minutes: number) => void;

  // Journal
  setShowPrompts: (enabled: boolean) => void;

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

  // Tutorial
  setHasSeenTutorial: (seen: boolean) => void;

  // Speech-to-Text
  setSTTEnabled: (enabled: boolean) => void;
  setSTTModel: (model: STTModel) => void;
  setSTTModelDownloaded: (downloaded: boolean) => void;
  setSTTDownloadProgress: (progress: number | null) => void;

  // Navigation
  setScrollToSection: (section: SettingsScrollTarget) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: createDefaultSettings(),
  appVersion: '0.0.0',
  isLoading: true,
  error: null,
  hasUnsavedChanges: false,
  scrollToSection: null,

  loadSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const [settings, version] = await Promise.all([
        loadSettings(),
        getAppVersion(),
      ]);
      set({ settings, appVersion: version, isLoading: false, hasUnsavedChanges: false });

      // Apply theme immediately
      applyTheme(settings.appearance.theme);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load settings',
        isLoading: false,
      });
    }
  },

  saveSettings: async () => {
    const { settings } = get();
    try {
      await saveSettings(settings);
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

  // Navigation
  setScrollToSection: (scrollToSection) => {
    set({ scrollToSection });
  },
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
