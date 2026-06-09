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
import { listen } from '@tauri-apps/api/event';
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
 * Low-level invoke of the backend command with already-re-keyed blobs.
 *
 * Signals are stored as the full `JSON.stringify(EncryptedData)` envelope (see
 * `signalService.ts`), so the payload we send must be that whole JSON string — sending only
 * the ciphertext would drop the per-blob iv/salt and make every signal undecryptable.
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
    signals: params.signals.map((s) => ({ id: s.id, payload: JSON.stringify(s.encrypted) })),
    recoveryBlob: params.recoveryBlob ?? null,
  });
}

/** A raw entry blob (sealed entries included) returned by `get_entry_rekey_blobs`. */
interface EntryRekeyBlob {
  id: string;
  encrypted_content: EncryptedData;
}

/** A raw signal row returned by `list_signals` (payload is a JSON EncryptedData envelope). */
interface SignalRow {
  id: string;
  payload: string;
}

/** Generate a fresh base64 16-byte salt for the new outer SQLCipher key. */
function generateSaltB64(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** Progress while re-keying / re-encrypting, for the modal's progress bar. */
export interface ChangeProgress {
  phase: 'entries' | 'signals' | 'media' | 'done';
  done: number;
  total: number;
}

const REKEY_BATCH = 100;

/**
 * Orchestrate the whole change end-to-end: fetch every encrypted blob (entries — sealed
 * included — and signals), re-key them under the new password in bounded batches, then invoke
 * the backend to atomically re-encrypt media + TOTP, rekey the outer SQLCipher layer, update
 * the verifier, and invalidate stale convenience factors. Throws (before any backend mutation)
 * if the old password fails to decrypt a blob.
 *
 * Recovery key: a previously-enabled recovery key wraps the OLD password and becomes stale, so
 * the backend disables it; the returned `ChangeSummary` flags this for the re-setup checklist.
 */
export async function runChangePassword(
  oldPassword: string,
  newPassword: string,
  onProgress?: (p: ChangeProgress) => void
): Promise<ChangeSummary> {
  // 1. Fetch raw blobs (encrypted; no plaintext crosses IPC).
  const entryRows = await invoke<EntryRekeyBlob[]>('get_entry_rekey_blobs');
  const signalRows = await invoke<SignalRow[]>('list_signals', {});

  // 2. Re-key entries in bounded batches (memory-safe for large journals).
  const entries: ReKeyed[] = [];
  for (let i = 0; i < entryRows.length; i += REKEY_BATCH) {
    const slice = entryRows
      .slice(i, i + REKEY_BATCH)
      .map((r) => ({ id: r.id, encrypted: r.encrypted_content }));
    entries.push(...(await reKeyBatch(slice, oldPassword, newPassword)));
    onProgress?.({ phase: 'entries', done: entries.length, total: entryRows.length });
  }

  // 3. Re-key signals (payload is a JSON EncryptedData envelope).
  const signalTargets: ReKeyTarget[] = signalRows.map((r) => ({
    id: r.id,
    encrypted: JSON.parse(r.payload) as EncryptedData,
  }));
  const signals: ReKeyed[] = [];
  for (let i = 0; i < signalTargets.length; i += REKEY_BATCH) {
    const slice = signalTargets.slice(i, i + REKEY_BATCH);
    signals.push(...(await reKeyBatch(slice, oldPassword, newPassword)));
    onProgress?.({ phase: 'signals', done: signals.length, total: signalTargets.length });
  }

  // 4. Relay backend media-staging progress to the modal while the command runs.
  const unlisten = await listen<{ phase: string; done?: number; total?: number }>(
    'change-password-progress',
    (e) => {
      if (e.payload.phase === 'media') {
        onProgress?.({ phase: 'media', done: e.payload.done ?? 0, total: e.payload.total ?? 0 });
      }
    }
  );
  try {
    return await changeMasterPassword({
      oldPassword,
      newPassword,
      newSaltB64: generateSaltB64(),
      entries,
      signals,
    });
  } finally {
    unlisten();
  }
}
