/**
 * biometricService — biometric / OS-keyring unlock bridge
 *
 * Android: calls the Kotlin BiometricPlugin via Tauri mobile plugin IPC.
 * Desktop: calls the Rust `biometric_*` commands which use the OS credential
 *          store (macOS Keychain / Windows Credential Manager / libsecret).
 *
 * Platform guards are applied inside each function so callers don't need them.
 */

import { invoke } from '@tauri-apps/api/core';

const IS_ANDROID =
  typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

const IS_BROWSER =
  typeof window !== 'undefined' && !window.__TAURI_INTERNALS__;

const IS_DESKTOP = !IS_ANDROID && !IS_BROWSER;

/** True when the device has strong biometrics enrolled (fingerprint / face). */
export async function biometricIsAvailable(): Promise<boolean> {
  if (!IS_ANDROID) return false;
  try {
    const result = await invoke<{ available: boolean }>('plugin:biometric|isAvailable');
    return result.available ?? false;
  } catch {
    return false;
  }
}

/** True when the app has already stored an encrypted password for this device. */
export async function biometricIsEnrolled(): Promise<boolean> {
  if (!IS_ANDROID) return false;
  try {
    const result = await invoke<{ enrolled: boolean }>('plugin:biometric|isEnrolled');
    return result.enrolled ?? false;
  } catch {
    return false;
  }
}

/**
 * Enroll biometric unlock.
 *
 * Shows a BiometricPrompt to confirm the user's identity, then encrypts the
 * provided master password and stores it in Android SharedPreferences protected
 * by an AndroidKeyStore key that requires biometric auth to use.
 *
 * Returns `true` on success, `false` if the user cancelled.
 * Throws on unexpected errors.
 */
export async function biometricEnroll(password: string): Promise<boolean> {
  if (!IS_ANDROID) return false;
  try {
    await invoke<{ success: boolean }>('plugin:biometric|enroll', { password });
    return true;
  } catch (e) {
    const msg = String(e);
    if (msg === 'CANCELLED') return false;
    throw new Error(msg);
  }
}

export type BiometricAuthResult =
  | { ok: true; password: string }
  | { ok: false; reason: 'cancelled' | 'invalidated' | 'error'; message?: string };

/**
 * Trigger the biometric unlock prompt.
 *
 * On success returns the decrypted master password so the caller can call
 * `unlock(password)` directly — identical to the password flow.
 *
 * `reason: 'invalidated'` means new biometrics were enrolled since setup —
 * the caller should show a re-enroll prompt.
 */
export async function biometricAuthenticate(): Promise<BiometricAuthResult> {
  if (!IS_ANDROID) return { ok: false, reason: 'error', message: 'Not on Android' };
  try {
    const result = await invoke<{ password: string }>('plugin:biometric|authenticate');
    return { ok: true, password: result.password };
  } catch (e) {
    const msg = String(e);
    if (msg === 'CANCELLED') return { ok: false, reason: 'cancelled' };
    if (msg === 'INVALIDATED') return { ok: false, reason: 'invalidated' };
    return { ok: false, reason: 'error', message: msg };
  }
}

/** Remove the stored encrypted password and delete the KeyStore key. */
export async function biometricUnenroll(): Promise<void> {
  if (!IS_ANDROID) return;
  try {
    await invoke('plugin:biometric|unenroll');
  } catch {
    // Best-effort
  }
}

// ── Desktop biometric (OS keyring) ────────────────────────────────────────────

export interface DesktopBiometricAvailability {
  available: boolean;
  reason: string | null;
}

/**
 * Check whether the OS credential store is accessible on this desktop platform.
 * Returns `{ available: false }` on Android and browser.
 */
export async function desktopBiometricIsAvailable(): Promise<DesktopBiometricAvailability> {
  if (!IS_DESKTOP) return { available: false, reason: 'Not running on desktop' };
  try {
    return await invoke<DesktopBiometricAvailability>('biometric_is_available');
  } catch {
    return { available: false, reason: 'OS credential store check failed' };
  }
}

/**
 * Store the session password in the OS credential store.
 * Must be called while the app is unlocked (requires a live session).
 * Throws on error.
 */
export async function desktopBiometricStoreSession(password: string): Promise<void> {
  if (!IS_DESKTOP) return;
  await invoke('biometric_store_session', { password });
}

/**
 * Retrieve the session password from the OS credential store.
 * Returns the password on success; throws if no credential is stored or on error.
 */
export async function desktopBiometricRetrieveSession(): Promise<string> {
  if (!IS_DESKTOP) throw new Error('Not running on desktop');
  return invoke<string>('biometric_retrieve_session');
}

/**
 * Remove the session password from the OS credential store.
 * Best-effort — does not throw if there is nothing to clear.
 */
export async function desktopBiometricClearSession(): Promise<void> {
  if (!IS_DESKTOP) return;
  try {
    await invoke('biometric_clear_session');
  } catch {
    // Best-effort
  }
}
