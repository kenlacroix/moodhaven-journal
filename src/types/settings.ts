/**
 * Settings type definitions for MoodBloom
 */

// AI Provider options
export type AIProvider = 'openai' | 'local' | 'none';

// Local AI configuration (for Ollama or similar)
export interface LocalAIConfig {
  enabled: boolean;
  endpoint: string; // e.g., 'http://localhost:11434'
  model: string; // e.g., 'llama2', 'mistral'
}

// OpenAI configuration
export interface OpenAIConfig {
  apiKey: string | null;
  model: 'gpt-4o-mini' | 'gpt-4o' | 'gpt-3.5-turbo';
}

// AI feature toggles
export interface AIFeatures {
  contextualPrompts: boolean;
  wellnessInsights: boolean;
  weeklyReflections: boolean;
  sentimentAnalysis: boolean;
}

// AI consent tracking
export interface AIConsent {
  agreedToTerms: boolean;
  consentDate: string | null; // ISO timestamp
  dataUsageUnderstood: boolean;
}

// Complete AI settings
export interface AISettings {
  enabled: boolean;
  provider: AIProvider;
  openai: OpenAIConfig;
  localAI: LocalAIConfig;
  features: AIFeatures;
  consent: AIConsent;
}

// Journal preferences
export interface JournalPreferences {
  defaultMood: number | null; // Pre-select a mood or null for none
  showPrompts: boolean;
  autoSave: boolean;
  autoSaveInterval: number; // seconds
}

// Privacy settings
export interface PrivacySettings {
  autoLockTimeout: number; // minutes, 0 = disabled
  clearClipboardOnLock: boolean;
  hideContentInTaskbar: boolean;
}

// Appearance settings
export interface AppearanceSettings {
  theme: 'light' | 'dark' | 'system';
  compactMode: boolean;
  animationsEnabled: boolean;
}

// Complete app settings
export interface AppSettings {
  version: string; // Settings schema version
  ai: AISettings;
  journal: JournalPreferences;
  privacy: PrivacySettings;
  appearance: AppearanceSettings;
}

// Default settings factory
export function createDefaultSettings(): AppSettings {
  return {
    version: '1.0.0',
    ai: {
      enabled: false,
      provider: 'none',
      openai: {
        apiKey: null,
        model: 'gpt-4o-mini',
      },
      localAI: {
        enabled: false,
        endpoint: 'http://localhost:11434',
        model: 'llama2',
      },
      features: {
        contextualPrompts: true,
        wellnessInsights: true,
        weeklyReflections: true,
        sentimentAnalysis: false,
      },
      consent: {
        agreedToTerms: false,
        consentDate: null,
        dataUsageUnderstood: false,
      },
    },
    journal: {
      defaultMood: null,
      showPrompts: true,
      autoSave: true,
      autoSaveInterval: 30,
    },
    privacy: {
      autoLockTimeout: 5,
      clearClipboardOnLock: true,
      hideContentInTaskbar: false,
    },
    appearance: {
      theme: 'system',
      compactMode: false,
      animationsEnabled: true,
    },
  };
}
