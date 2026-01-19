/**
 * Two-Factor Authentication Types
 *
 * Types for TOTP, WebAuthn, and backup code authentication.
 */

/** Supported 2FA methods */
export type TwoFactorMethod = 'totp' | 'webauthn' | 'both' | null;

/** Current 2FA status from backend */
export interface TwoFactorStatus {
  enabled: boolean;
  method: TwoFactorMethod;
  has_backup_codes: boolean;
  enabled_date?: string;
}

/** TOTP setup data for QR code display */
export interface TotpSetupData {
  secret: string;        // Base32 secret for manual entry
  qr_code_url: string;   // otpauth:// URL for QR code
  issuer: string;        // "MoodBloom"
  account_name: string;  // User identifier
}

/** Backup codes returned after 2FA setup */
export interface BackupCodes {
  codes: string[];       // 10 plaintext codes (shown once)
  generated_at: string;  // ISO timestamp
}

/** WebAuthn credential stored in backend */
export interface WebAuthnCredential {
  id: string;            // Base64 credential ID
  public_key: string;    // Base64 public key
  created_at: string;    // ISO timestamp
}

/** WebAuthn registration options for navigator.credentials.create() */
export interface WebAuthnRegistrationOptions {
  challenge: Uint8Array;
  rp: {
    name: string;
    id: string;
  };
  user: {
    id: Uint8Array;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout: number;
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  attestation?: AttestationConveyancePreference;
}

/** WebAuthn assertion options for navigator.credentials.get() */
export interface WebAuthnAssertionOptions {
  challenge: Uint8Array;
  rpId: string;
  allowCredentials: {
    id: Uint8Array;
    type: 'public-key';
  }[];
  timeout: number;
  userVerification?: UserVerificationRequirement;
}

/** 2FA verification mode on lock screen */
export type TwoFactorVerifyMode = 'totp' | 'webauthn' | 'backup';
