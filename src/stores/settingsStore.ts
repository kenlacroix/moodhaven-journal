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
} from '../types/settings';
import { createDefaultSettings } from '../types/settings';
import {
  loadSettings,
  saveSettings,
  getAppVersion,
  resetSettings as resetSettingsService,
} from '../lib/settingsService';

interface SettingsState {
  settings: AppSettings;
  appVersion: string;
  isLoading: boolean;
  error: string | null;
  hasUnsavedChanges: boolean;

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
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: createDefaultSettings(),
  appVersion: '0.0.0',
  isLoading: true,
  error: null,
  hasUnsavedChanges: false,

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
