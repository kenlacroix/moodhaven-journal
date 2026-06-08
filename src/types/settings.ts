/**
 * Settings type definitions for MoodHaven Journal
 */

import type { WritingAppearance } from './writingAppearance';
import { createDefaultWritingAppearance } from './writingAppearance';

// AI Provider options
export type AIProvider = 'openai' | 'local' | 'none';

// Local AI configuration (for Ollama or similar)
interface LocalAIConfig {
  enabled: boolean;
  endpoint: string; // e.g., 'http://localhost:11434'
  model: string; // e.g., 'llama2', 'mistral'
}

// OpenAI configuration
interface OpenAIConfig {
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
interface AIConsent {
  agreedToTerms: boolean;
  consentDate: string | null; // ISO timestamp
  dataUsageUnderstood: boolean;
}

// Complete AI settings
interface AISettings {
  enabled: boolean;
  provider: AIProvider;
  openai: OpenAIConfig;
  localAI: LocalAIConfig;
  features: AIFeatures;
  consent: AIConsent;
}

// Journal preferences
interface JournalPreferences {
  defaultMood: number | null; // Pre-select a mood or null for none
  showPrompts: boolean;
  autoSave: boolean;
  autoSaveInterval: number; // seconds
  /** Automatically capture weather + city when creating a new entry (opt-in; contacts Open-Meteo and Nominatim) */
  autoLocationWeather: boolean;
  /** Temperature display unit for weather chips */
  temperatureUnit: 'C' | 'F';
  /** Auto-generate entry title from first sentence when no title is typed */
  autoTitle: boolean;
}

// Privacy settings
interface PrivacySettings {
  autoLockTimeout: number; // minutes, 0 = disabled
  clearClipboardOnLock: boolean;
  hideContentInTaskbar: boolean;
  /** Desktop: password stored in OS keyring (Keychain / Credential Manager / libsecret). Default: false */
  biometricEnabled: boolean;
}

// Appearance settings
interface AppearanceSettings {
  theme: 'light' | 'dark' | 'system';
  compactMode: boolean;
  animationsEnabled: boolean;
  /**
   * Device-global defaults for the WritingView customization drawer.
   * Future: per-book overrides via `BookSettings.writingOverrides:
   * Partial<WritingAppearance>` (slot reserved, not implemented in v1).
   */
  writing: WritingAppearance;
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
export type StorageBackend = 'local' | 'webdav' | 'dropbox' | 'gdrive' | 'byocloud';

// WebDAV connection configuration
export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
}

// Storage settings
interface StorageSettings {
  type: StorageBackend;
  webdav: WebDAVConfig;
  lastSyncDate?: string; // ISO timestamp
  lastSyncDirection?: 'upload' | 'download';
  // Cloud provider connection state (refreshed from backend on settings load)
  cloudProviders: {
    dropbox: { connected: boolean; lastSyncAt: string | null };
    gdrive: { connected: boolean; lastSyncAt: string | null };
  };
  // BYO-Cloud folder sync: a user-picked folder mirrored to iCloud/Drive/Dropbox/OneDrive
  // by the OS sync client. We write/read the encrypted backup blob there directly.
  byocloud: { folderPath: string | null; lastSyncAt: string | null };
}

// Tutorial settings
interface TutorialSettings {
  hasSeenTutorial: boolean;
  /** True after the writing-view drawer toggle has been pulsed once for discoverability. */
  hasSeenWritingDrawerHint: boolean;
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

// Speech-to-Text formatting layer options
export type STTFormattingLayer = 'local' | 'ollama' | 'openai';

// Speech-to-Text formatting settings
interface STTFormattingSettings {
  layer: STTFormattingLayer;
  cloudConsentGiven: boolean;
  consentDate: string | null;
}

// Speech-to-Text settings
export interface SpeechToTextSettings {
  enabled: boolean;
  model: STTModel;
  modelDownloaded: boolean;
  downloadProgress: number | null; // 0-100 during download, null otherwise
  formatting: STTFormattingSettings;
}

// Oura Ring integration settings
export interface OuraSettings {
  enabled: boolean;
  autoSyncOnOpen: boolean; // Sync today's data when app unlocks
  enrichPrompts: boolean;  // Include health context in writing prompts
  // Connection metadata (actual PAT stored in SQLite, not here)
  connectedAt: string | null;  // ISO timestamp
  lastSyncAt: string | null;   // ISO timestamp
}

// Multi-device sync preferences
interface SyncSettings {
  /** Human-readable name shown to other devices (e.g. "Ken's Desktop") */
  deviceName: string;
  /** When to run the sync engine automatically */
  syncMode: 'manual' | 'on-open' | 'on-save';
  /** Auto-sync interval in minutes (0 = disabled). Independent of syncMode. */
  syncIntervalMinutes: number;
  /** ISO timestamp of the last completed sync */
  lastSyncAt: string | null;
  /** Result of the last sync attempt */
  lastSyncResult: 'success' | 'error' | null;
  /** Number of entries pulled on the last sync */
  lastSyncPulled: number;
  /** Number of entries pushed on the last sync */
  lastSyncPushed: number;
  /** Peer sync: only auto-sync when the peer's IP is RFC-1918 (LAN-only). Default: true */
  peerSyncLanOnly: boolean;
  /** Peer sync: auto-sync cooldown in seconds (10–300). Default: 30 */
  peerSyncIntervalSecs: number;
  /** Whether LAN peer sync discovery is enabled. Default: false */
  peerSyncEnabled: boolean;
}

// Time Capsule settings
export interface TimeCapsuleSettings {
  enabled: boolean;
  defaultSealDays: number;
  anniversaryReveal: boolean;
}

// Update manager preferences
interface UpdateSettings {
  /** Auto-check for updates on startup (max once per 24 h). Default: true */
  autoCheck: boolean;
  /** ISO timestamp of last successful check */
  lastChecked: string | null;
  /** Version string the user chose to skip, e.g. "v1.2.3" */
  skippedVersion: string | null;
}

// Wellness feature settings
export interface WellnessSettings {
  /** True once user has acknowledged the app-wide wellness disclaimer (shown once) */
  hasSeenDisclaimer: boolean;
  /** StillHaven is off by default; user enables it after reading the consent notice */
  stillhavenEnabled: boolean;
  /** ISO timestamp when user consented to StillHaven */
  stillhavenConsentDate: string | null;
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
  oura: OuraSettings;
  updates: UpdateSettings;
  sync: SyncSettings;
  timeCapsule: TimeCapsuleSettings;
  wellness: WellnessSettings;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  moduleLogLevels?: Partial<Record<import('../lib/services/logger').LogModule, import('../lib/services/logger').LogLevel>>;
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
      autoLocationWeather: false,
      temperatureUnit: 'C',
      autoTitle: false,
    },
    privacy: {
      autoLockTimeout: 5,
      clearClipboardOnLock: true,
      hideContentInTaskbar: false,
      biometricEnabled: false,
    },
    appearance: {
      theme: 'system',
      compactMode: false,
      animationsEnabled: true,
      writing: createDefaultWritingAppearance(),
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
      cloudProviders: {
        dropbox: { connected: false, lastSyncAt: null },
        gdrive: { connected: false, lastSyncAt: null },
      },
      byocloud: { folderPath: null, lastSyncAt: null },
    },
    tutorial: {
      hasSeenTutorial: false,
      hasSeenWritingDrawerHint: false,
    },
    speechToText: {
      enabled: false,
      model: 'base.en',
      modelDownloaded: false,
      downloadProgress: null,
      formatting: {
        layer: 'local',
        cloudConsentGiven: false,
        consentDate: null,
      },
    },
    oura: {
      enabled: false,
      autoSyncOnOpen: true,
      enrichPrompts: true,
      connectedAt: null,
      lastSyncAt: null,
    },
    updates: {
      autoCheck: true,
      lastChecked: null,
      skippedVersion: null,
    },
    sync: {
      deviceName: '',
      syncMode: 'manual',
      syncIntervalMinutes: 0,
      lastSyncAt: null,
      lastSyncResult: null,
      lastSyncPulled: 0,
      lastSyncPushed: 0,
      peerSyncLanOnly: true,
      peerSyncIntervalSecs: 30,
      peerSyncEnabled: false,
    },
    timeCapsule: {
      enabled: true,
      defaultSealDays: 30,
      anniversaryReveal: true,
    },
    wellness: {
      hasSeenDisclaimer: false,
      stillhavenEnabled: false,
      stillhavenConsentDate: null,
    },
    logLevel: 'warn',
  };
}
