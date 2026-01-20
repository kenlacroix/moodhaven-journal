/**
 * Hardware Key Service (Native FIDO2)
 *
 * This service uses native Rust FIDO2/CTAP2 libraries via Tauri commands,
 * NOT browser WebAuthn APIs (which fail in Tauri WebView).
 *
 * Security Model:
 * - Password → Argon2id → Primary encryption key
 * - Hardware key → Decrypts locally stored secondary secret
 * - Both are required when hardware key is enabled
 * - Password alone won't unlock if hardware key was enabled
 * - If password is lost → data unrecoverable (no backdoors)
 */

import { invoke } from '@tauri-apps/api/core';

// ============================================================================
// Types
// ============================================================================

export interface HardwareKeyStatus {
  enabled: boolean;
  device_name: string | null;
  registered_at: string | null;
}

export interface HardwareKeyDevice {
  name: string;
  available: boolean;
}

export interface HardwareKeyRegistration {
  success: boolean;
  device_name: string;
  credential_id: string;
}

// ============================================================================
// Device Detection
// ============================================================================

/**
 * Detect connected FIDO2 hardware keys
 * Uses native USB HID, not browser APIs
 */
export async function detectHardwareKeys(): Promise<HardwareKeyDevice[]> {
  return invoke<HardwareKeyDevice[]>('hardware_key_detect');
}

/**
 * Check if any hardware key is connected
 */
export async function isHardwareKeyConnected(): Promise<boolean> {
  try {
    const devices = await detectHardwareKeys();
    return devices.length > 0;
  } catch {
    return false;
  }
}

// ============================================================================
// Status
// ============================================================================

/**
 * Get current hardware key status
 */
export async function getHardwareKeyStatus(): Promise<HardwareKeyStatus> {
  return invoke<HardwareKeyStatus>('hardware_key_status');
}

/**
 * Check if hardware key verification is required for unlock
 */
export async function isHardwareKeyRequired(): Promise<boolean> {
  return invoke<boolean>('hardware_key_required');
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Register a new hardware key
 *
 * This will:
 * 1. Detect connected FIDO2 device
 * 2. Create a credential on the device
 * 3. Generate and encrypt a secondary secret
 * 4. Store the encrypted secret for future verification
 *
 * The user must touch the key twice (register + confirm)
 */
export async function registerHardwareKey(): Promise<HardwareKeyRegistration> {
  return invoke<HardwareKeyRegistration>('hardware_key_register');
}

// ============================================================================
// Verification
// ============================================================================

/**
 * Verify hardware key and get the decrypted secret
 *
 * This will:
 * 1. Prompt user to touch their hardware key
 * 2. Perform FIDO2 assertion
 * 3. Decrypt and return the stored secret
 *
 * The returned secret must be combined with the password-derived key
 * to complete unlock.
 */
export async function verifyHardwareKey(): Promise<string> {
  return invoke<string>('hardware_key_verify');
}

// ============================================================================
// Management
// ============================================================================

/**
 * Disable hardware key requirement
 * User must verify with the key one last time to disable
 */
export async function disableHardwareKey(): Promise<boolean> {
  return invoke<boolean>('hardware_key_disable');
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Parse hardware key errors into user-friendly messages
 */
export function getHardwareKeyErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    if (msg.includes('no hardware key')) {
      return 'No hardware key detected. Please insert your security key.';
    }
    if (msg.includes('registration failed')) {
      return 'Registration failed. Please try again and touch your key when it flashes.';
    }
    if (msg.includes('verification failed')) {
      return 'Verification failed. Please try again and touch your key when it flashes.';
    }
    if (msg.includes('decryption')) {
      return 'Key mismatch. Please use the same hardware key that was registered.';
    }

    return error.message;
  }

  return 'An unexpected error occurred with the hardware key.';
}
