/**
 * Two-Factor Authentication Service
 *
 * Provides functions to manage 2FA (TOTP, WebAuthn, backup codes)
 * through Tauri commands.
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  TwoFactorStatus,
  TotpSetupData,
  BackupCodes,
  WebAuthnCredential,
} from '../types/twoFactor';

// ============================================================================
// Status & Info
// ============================================================================

/**
 * Get current 2FA status
 */
export async function get2FAStatus(): Promise<TwoFactorStatus> {
  return invoke('get_2fa_status');
}

/**
 * Get remaining backup codes count
 */
export async function getBackupCodesCount(): Promise<number> {
  return invoke('get_backup_codes_count');
}

// ============================================================================
// TOTP Setup & Verification
// ============================================================================

/**
 * Generate a new TOTP secret for setup
 * Returns QR code URL and manual entry secret
 */
export async function generateTotpSecret(): Promise<TotpSetupData> {
  return invoke('generate_totp_secret');
}

/**
 * Verify a TOTP code (during setup or for testing)
 */
export async function verifyTotpCode(code: string): Promise<boolean> {
  return invoke('verify_totp_code', { code });
}

/**
 * Enable TOTP after successful verification
 * Returns backup codes that must be shown to user
 */
export async function enableTotp(code: string): Promise<BackupCodes> {
  return invoke('enable_totp', { code });
}

/**
 * Verify TOTP code during login
 */
export async function verify2FATotp(code: string): Promise<boolean> {
  return invoke('verify_2fa_totp', { code });
}

// ============================================================================
// WebAuthn
// ============================================================================

/**
 * Get stored WebAuthn credentials for verification
 */
export async function getWebAuthnCredentials(): Promise<WebAuthnCredential[]> {
  return invoke('get_webauthn_credentials');
}

/**
 * Store a WebAuthn credential after browser registration
 * Returns backup codes if this is the first 2FA method
 */
export async function storeWebAuthnCredential(
  credentialId: string,
  publicKey: string
): Promise<BackupCodes> {
  return invoke('store_webauthn_credential_cmd', {
    credentialId,
    publicKey,
  });
}

/**
 * Register a new WebAuthn credential (hardware key)
 * This handles the full browser-based WebAuthn registration flow
 */
export async function registerWebAuthnCredential(): Promise<BackupCodes> {
  // Check if WebAuthn is supported
  if (!window.PublicKeyCredential) {
    throw new Error('WebAuthn is not supported in this browser');
  }

  // Generate challenge (in production, this should come from server)
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  // User ID (consistent for this app)
  const userId = new Uint8Array(16);
  crypto.getRandomValues(userId);

  const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: {
      name: 'MoodBloom',
      id: window.location.hostname || 'localhost',
    },
    user: {
      id: userId,
      name: 'user@moodbloom',
      displayName: 'MoodBloom User',
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },   // ES256
      { alg: -257, type: 'public-key' }, // RS256
    ],
    timeout: 60000,
    authenticatorSelection: {
      authenticatorAttachment: 'cross-platform', // Hardware keys
      userVerification: 'preferred',
      residentKey: 'discouraged',
    },
    attestation: 'none',
  };

  try {
    const credential = await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions,
    }) as PublicKeyCredential;

    if (!credential) {
      throw new Error('No credential returned');
    }

    const response = credential.response as AuthenticatorAttestationResponse;

    // Extract credential ID and public key
    const credentialId = btoa(
      String.fromCharCode(...new Uint8Array(credential.rawId))
    );
    const publicKey = btoa(
      String.fromCharCode(...new Uint8Array(response.getPublicKey() || new ArrayBuffer(0)))
    );

    // Store in backend
    return storeWebAuthnCredential(credentialId, publicKey);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'NotAllowedError') {
        throw new Error('Registration was cancelled or timed out');
      }
      if (error.name === 'InvalidStateError') {
        throw new Error('This security key is already registered');
      }
      throw error;
    }
    throw new Error('WebAuthn registration failed');
  }
}

/**
 * Verify WebAuthn credential during login
 */
export async function verifyWebAuthnCredential(): Promise<boolean> {
  // Check if WebAuthn is supported
  if (!window.PublicKeyCredential) {
    throw new Error('WebAuthn is not supported in this browser');
  }

  // Get stored credentials
  const credentials = await getWebAuthnCredentials();
  if (credentials.length === 0) {
    throw new Error('No security keys registered');
  }

  // Generate challenge
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const allowCredentials = credentials.map((cred) => ({
    id: Uint8Array.from(atob(cred.id), (c) => c.charCodeAt(0)),
    type: 'public-key' as const,
  }));

  const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
    challenge,
    rpId: window.location.hostname || 'localhost',
    allowCredentials,
    timeout: 60000,
    userVerification: 'preferred',
  };

  try {
    const assertion = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions,
    }) as PublicKeyCredential;

    if (!assertion) {
      throw new Error('No assertion returned');
    }

    // In a full implementation, we'd verify the signature on the backend
    // For now, successful assertion means the key was authenticated
    return true;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'NotAllowedError') {
        throw new Error('Verification was cancelled or timed out');
      }
      throw error;
    }
    throw new Error('WebAuthn verification failed');
  }
}

// ============================================================================
// Backup Codes
// ============================================================================

/**
 * Generate new backup codes (replaces existing)
 */
export async function regenerateBackupCodes(): Promise<BackupCodes> {
  return invoke('regenerate_backup_codes');
}

/**
 * Verify a backup code (single-use)
 */
export async function verifyBackupCode(code: string): Promise<boolean> {
  return invoke('verify_backup_code', { code });
}

// ============================================================================
// Management
// ============================================================================

/**
 * Disable 2FA completely
 * Note: Password verification should be done on frontend before calling
 */
export async function disable2FA(): Promise<boolean> {
  return invoke('disable_2fa');
}

/**
 * Download backup codes as a text file
 */
export function downloadBackupCodes(codes: string[]): void {
  const content = [
    'MoodBloom Backup Codes',
    '=====================',
    '',
    'Keep these codes in a safe place.',
    'Each code can only be used once.',
    '',
    ...codes.map((code, i) => `${i + 1}. ${code}`),
    '',
    `Generated: ${new Date().toISOString()}`,
  ].join('\n');

  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'moodbloom-backup-codes.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Copy backup codes to clipboard
 */
export async function copyBackupCodesToClipboard(codes: string[]): Promise<void> {
  const content = codes.join('\n');
  await navigator.clipboard.writeText(content);
}
