/**
 * biometricService - Android biometric unlock bridge
 *
 * Calls into the Kotlin BiometricPlugin via Tauri's mobile plugin IPC.
 * All functions return safe defaults on non-Android platforms so callers
 * don't need platform guards.
 */

import { invoke } from '@tauri-apps/api/core';

const IS_ANDROID =
  typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

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
