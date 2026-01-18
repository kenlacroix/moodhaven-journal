/**
 * Settings Service
 *
 * Handles communication with Tauri backend for settings persistence.
 */

import { invoke } from '@tauri-apps/api/core';
import type { AppSettings } from '../types/settings';
import { createDefaultSettings } from '../types/settings';

const SETTINGS_KEY = 'app_settings';

/**
 * Load settings from the database
 */
export async function loadSettings(): Promise<AppSettings> {
  try {
    const value = await invoke<string | null>('get_setting', { key: SETTINGS_KEY });
    if (value) {
      const parsed = JSON.parse(value) as Partial<AppSettings>;
      // Merge with defaults to handle any missing fields from older versions
      return { ...createDefaultSettings(), ...parsed };
    }
    return createDefaultSettings();
  } catch (error) {
    console.error('Failed to load settings:', error);
    return createDefaultSettings();
  }
}

/**
 * Save settings to the database
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    await invoke('set_setting', {
      key: SETTINGS_KEY,
      value: JSON.stringify(settings),
    });
  } catch (error) {
    console.error('Failed to save settings:', error);
    throw error;
  }
}

/**
 * Save a single setting by path (e.g., 'ai.openai.apiKey')
 */
export async function saveSetting<T>(
  settings: AppSettings,
  path: string,
  value: T
): Promise<AppSettings> {
  const keys = path.split('.');
  const newSettings = { ...settings };

  // Navigate to the nested property and update it
  let current: Record<string, unknown> = newSettings as unknown as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (typeof current[key] === 'object' && current[key] !== null) {
      current[key] = { ...(current[key] as Record<string, unknown>) };
      current = current[key] as Record<string, unknown>;
    }
  }
  current[keys[keys.length - 1]] = value;

  await saveSettings(newSettings);
  return newSettings;
}

/**
 * Get the app version from the Rust backend
 */
export async function getAppVersion(): Promise<string> {
  try {
    return await invoke<string>('get_app_version');
  } catch (error) {
    console.error('Failed to get app version:', error);
    return '0.0.0';
  }
}

/**
 * Reset settings to defaults
 */
export async function resetSettings(): Promise<AppSettings> {
  const defaults = createDefaultSettings();
  await saveSettings(defaults);
  return defaults;
}

/**
 * Validate OpenAI API key format
 */
export function validateOpenAIKey(key: string): boolean {
  // OpenAI keys start with 'sk-' and are about 51 characters
  return /^sk-[a-zA-Z0-9]{48,}$/.test(key);
}

/**
 * Test OpenAI API key by making a simple request
 */
export async function testOpenAIKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 401) {
      return { valid: false, error: 'Invalid API key' };
    }

    return { valid: false, error: `API error: ${response.status}` };
  } catch (error) {
    return { valid: false, error: 'Failed to connect to OpenAI' };
  }
}

/**
 * Test local AI connection (Ollama)
 */
export async function testLocalAIConnection(
  endpoint: string
): Promise<{ valid: boolean; models?: string[]; error?: string }> {
  try {
    const response = await fetch(`${endpoint}/api/tags`, {
      method: 'GET',
    });

    if (response.ok) {
      const data = await response.json();
      const models = data.models?.map((m: { name: string }) => m.name) || [];
      return { valid: true, models };
    }

    return { valid: false, error: `Connection error: ${response.status}` };
  } catch (error) {
    return { valid: false, error: 'Failed to connect to local AI server' };
  }
}
