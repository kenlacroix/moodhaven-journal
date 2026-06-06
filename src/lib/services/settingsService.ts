/**
 * Settings Service
 *
 * Handles communication with Tauri backend for settings persistence.
 */

import { invoke } from '@tauri-apps/api/core';
import type { AppSettings } from '../../types/settings';
import { createDefaultSettings } from '../../types/settings';
import { encrypt, decrypt } from './crypto';
import { logger } from './logger';

const SETTINGS_KEY = 'app_settings';

/**
 * Dot-notation paths of sensitive fields within AppSettings.
 * These fields are AES-256-GCM encrypted before persisting to SQLite.
 */
const SENSITIVE_PATHS = ['ai.openai.apiKey', 'webdav.password'] as const;

const MARKER = '__enc_v1:';

/** Read a nested value from an object by dot-path. */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Write a nested value into a (shallow-cloned) object by dot-path. */
function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
}

/**
 * Encrypt sensitive fields in a settings object before storing.
 * Returns a plain-object copy safe to JSON-serialize to SQLite.
 */
async function encryptSensitiveFields(
  settings: AppSettings,
  password: string
): Promise<Record<string, unknown>> {
  const blob = JSON.parse(JSON.stringify(settings)) as Record<string, unknown>;
  for (const path of SENSITIVE_PATHS) {
    const value = getByPath(blob, path);
    if (typeof value === 'string' && value.length > 0) {
      const result = await encrypt(value, password);
      if (result.success && result.data) {
        setByPath(blob, path, MARKER + JSON.stringify(result.data));
      }
    }
  }
  return blob;
}

/**
 * Decrypt sensitive fields from a raw settings blob loaded from SQLite.
 * Plaintext values (pre-migration) are left as-is and will be encrypted on next save.
 */
async function decryptSensitiveFields(
  blob: Record<string, unknown>,
  password: string
): Promise<void> {
  for (const path of SENSITIVE_PATHS) {
    const value = getByPath(blob, path);
    if (typeof value === 'string' && value.startsWith(MARKER)) {
      try {
        const encData = JSON.parse(value.slice(MARKER.length));
        const result = await decrypt(encData, password);
        setByPath(blob, path, result.success ? (result.data ?? null) : null);
      } catch {
        setByPath(blob, path, null);
      }
    }
  }
}

/**
 * Load settings from the database.
 * If `password` is provided, sensitive fields are decrypted.
 * Without a password (pre-unlock), sensitive fields remain encrypted/null.
 */
export async function loadSettings(password?: string): Promise<AppSettings> {
  try {
    const value = await invoke<string | null>('get_setting', { key: SETTINGS_KEY });
    if (value) {
      const blob = JSON.parse(value) as Record<string, unknown>;
      if (password) {
        // Detect plaintext sensitive fields (written before encryption was introduced)
        // before decryptSensitiveFields overwrites them with their decrypted values.
        const hadPlaintext = SENSITIVE_PATHS.some((path) => {
          const raw = getByPath(JSON.parse(value) as Record<string, unknown>, path);
          return typeof raw === 'string' && raw.length > 0 && !raw.startsWith(MARKER);
        });
        await decryptSensitiveFields(blob, password);
        if (hadPlaintext) {
          // Re-save to encrypt the plaintext fields (fire-and-forget, non-blocking).
          const settings = { ...createDefaultSettings(), ...(blob as Partial<AppSettings>) };
          saveSettings(settings, password).catch(() => {});
        }
      } else {
        // Clear encrypted blobs so they don't leak as garbled strings to the UI
        for (const path of SENSITIVE_PATHS) {
          const v = getByPath(blob, path);
          if (typeof v === 'string' && v.startsWith(MARKER)) {
            setByPath(blob, path, null);
          }
        }
      }
      return { ...createDefaultSettings(), ...(blob as Partial<AppSettings>) };
    }
    return createDefaultSettings();
  } catch (error) {
    // "Session is locked" is expected when called pre-unlock; silently return defaults.
    if (!String(error).includes('Session is locked')) {
      logger.error('Failed to load settings:', { error: String(error) });
    }
    return createDefaultSettings();
  }
}

/**
 * Save settings to the database.
 * If `password` is provided, sensitive fields are encrypted before storing.
 */
export async function saveSettings(settings: AppSettings, password?: string): Promise<void> {
  try {
    let blob: Record<string, unknown>;
    if (password) {
      blob = await encryptSensitiveFields(settings, password);
    } else {
      blob = JSON.parse(JSON.stringify(settings)) as Record<string, unknown>;
    }
    await invoke('set_setting', {
      key: SETTINGS_KEY,
      value: JSON.stringify(blob),
    });
  } catch (error) {
    // "Session is locked" is expected when called pre-unlock; best-effort, don't rethrow.
    if (String(error).includes('Session is locked')) {
      return;
    }
    logger.error('Failed to save settings:', { error: String(error) });
    throw error;
  }
}

/**
 * Get the app version from the Rust backend
 */
export async function getAppVersion(): Promise<string> {
  try {
    return await invoke<string>('get_app_version');
  } catch (error) {
    logger.error('Failed to get app version:', { error: String(error) });
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
