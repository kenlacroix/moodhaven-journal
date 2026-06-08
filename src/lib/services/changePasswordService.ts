/**
 * Change master password — frontend orchestration (Approach A).
 *
 * See active-plans/change-password.md. The per-field AES-GCM keys for journal entries and
 * signals live only here in the frontend, so the frontend must re-encrypt those blobs:
 * decrypt each under the OLD password, re-encrypt under the NEW password, and hand the new
 * blobs to the Rust `change_master_password` command, which performs the irreversible work
 * (outer SQLCipher rekey, media + TOTP re-encryption, verifier update) atomically.
 *
 * SCAFFOLD STATUS: the pure batch transform below is implemented and unit-testable; the
 * `changeMasterPassword` call wires the IPC surface but the Rust side returns not-implemented
 * until the implementation pass, so this fails safely without mutating data.
 */
import { invoke } from '@tauri-apps/api/core';
import { decrypt, encrypt, type EncryptedData } from './crypto';

/** A stored blob to re-key: its id plus the current (old-password) ciphertext envelope. */
export interface ReKeyTarget {
  id: string;
  encrypted: EncryptedData;
}

/** Result of re-keying one blob: same id, new (new-password) ciphertext envelope. */
export interface ReKeyed {
  id: string;
  encrypted: EncryptedData;
}

/** Summary the backend returns so the UI can render the post-change re-setup checklist. */
export interface ChangeSummary {
  entriesReencrypted: number;
  signalsReencrypted: number;
  mediaReencrypted: number;
  pinDisabled: boolean;
  biometricCleared: boolean;
  recoveryKeyRegenerated: boolean;
}

/**
 * Re-encrypt a batch of blobs from `oldPassword` to `newPassword`. Pure: decrypts each
 * envelope under the old password and re-encrypts the plaintext under the new one. Throws on
 * the first failure (wrong old password or corrupt blob) so the caller aborts before any
 * backend mutation. Callers should stream in bounded batches for large journals (plan §4.2).
 */
export async function reKeyBatch(
  targets: ReKeyTarget[],
  oldPassword: string,
  newPassword: string
): Promise<ReKeyed[]> {
  const out: ReKeyed[] = [];
  for (const t of targets) {
    const dec = await decrypt(t.encrypted, oldPassword);
    if (!dec.success || dec.data === undefined) {
      throw new Error(`re-key decrypt failed for ${t.id}: ${dec.error ?? 'unknown error'}`);
    }
    const enc = await encrypt(dec.data, newPassword);
    if (!enc.success || !enc.data) {
      throw new Error(`re-key encrypt failed for ${t.id}: ${enc.error ?? 'unknown error'}`);
    }
    out.push({ id: t.id, encrypted: enc.data });
  }
  return out;
}

/**
 * Drive the full change: re-key entries + signals in the frontend, then invoke the backend
 * to commit the inner txn, re-encrypt media + TOTP, and rekey the outer SQLCipher layer.
 *
 * TODO(§4): generate the new outer-key salt and the regenerated recovery-key blob, and
 * stream `reKeyBatch` in bounded batches with progress for large journals.
 */
export async function changeMasterPassword(params: {
  oldPassword: string;
  newPassword: string;
  newSaltB64: string;
  entries: ReKeyed[];
  signals: ReKeyed[];
  recoveryBlob?: string;
}): Promise<ChangeSummary> {
  return invoke<ChangeSummary>('change_master_password', {
    oldPassword: params.oldPassword,
    newPassword: params.newPassword,
    newSaltB64: params.newSaltB64,
    entries: params.entries.map((e) => ({ id: e.id, encryptedContent: e.encrypted })),
    signals: params.signals.map((s) => ({ id: s.id, payload: s.encrypted.ciphertext })),
    recoveryBlob: params.recoveryBlob ?? null,
  });
}
