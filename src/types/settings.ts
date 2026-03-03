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

// Days of week for reminder scheduling (0 = Sunday, 6 = Saturday)
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Reminder frequency options
export type ReminderFrequency = 'daily' | 'weekdays' | 'weekends' | 'custom';

// Reminder settings
export interface ReminderSettings {
  enabled: boolean;
  time: string; // "HH:MM" 24-hour format
  frequency: ReminderFrequency;
  customDays: DayOfWeek[]; // Used when frequency is 'custom'
  message: string;
  sound: boolean;
}

// Storage backend options
export type StorageBackend = 'local' | 'webdav';

// WebDAV connection configuration
export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
}

// Storage settings
export interface StorageSettings {
  type: StorageBackend;
  webdav: WebDAVConfig;
  lastSyncDate?: string; // ISO timestamp
  lastSyncDirection?: 'upload' | 'download';
}

// Tutorial settings
export interface TutorialSettings {
  hasSeenTutorial: boolean;
}

// Speech-to-Text model options (whisper.cpp models)
export type STTModel = 'tiny.en' | 'base.en' | 'small.en' | 'medium.en';

// Speech-to-Text model metadata
export interface STTModelInfo {
  id: STTModel;
  name: string;
  size: string; // Human-readable size
  quality: string;
  speed: string;
}

// Available STT models
export const STT_MODELS: STTModelInfo[] = [
  { id: 'tiny.en', name: 'Tiny (English)', size: '~75 MB', quality: 'Acceptable', speed: 'Fast' },
  { id: 'base.en', name: 'Base (English)', size: '~142 MB', quality: 'Good', speed: 'Fast' },
  { id: 'small.en', name: 'Small (English)', size: '~466 MB', quality: 'Very good', speed: 'Moderate' },
  { id: 'medium.en', name: 'Medium (English)', size: '~1.5 GB', quality: 'Excellent', speed: 'Slower' },
];

// Speech-to-Text settings
export interface SpeechToTextSettings {
  enabled: boolean;
  model: STTModel;
  modelDownloaded: boolean;
  downloadProgress: number | null; // 0-100 during download, null otherwise
}

// Complete app settings
export interface AppSettings {
  version: string; // Settings schema version
  ai: AISettings;
  journal: JournalPreferences;
  privacy: PrivacySettings;
  appearance: AppearanceSettings;
  reminders: ReminderSettings;
  storage: StorageSettings;
  tutorial: TutorialSettings;
  speechToText: SpeechToTextSettings;
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
    reminders: {
      enabled: false,
      time: '20:00',
      frequency: 'daily',
      customDays: [],
      message: 'Time to reflect on your day',
      sound: true,
    },
    storage: {
      type: 'local',
      webdav: {
        url: '',
        username: '',
        password: '',
      },
    },
    tutorial: {
      hasSeenTutorial: false,
    },
    speechToText: {
      enabled: false,
      model: 'base.en',
      modelDownloaded: false,
      downloadProgress: null,
    },
  };
}
