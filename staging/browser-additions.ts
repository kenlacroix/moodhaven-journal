/**
 * browser.ts — additions for SEC-DEFER-001 / Sprint 1 browser-mode fix
 *
 * These are the NEW / FIXED functions to merge into browser.ts.
 * They implement the password management commands that were missing from the
 * browser shim layer, causing "An error occurred" on unlock and
 * "Failed to set up" on initial setup in the web build.
 *
 * ── What was missing ────────────────────────────────────────────────────────
 * SEC-DEFER-001 wired LockScreen.tsx (and the journalService unlock path) to
 * invoke('verify_password', { password }) but browser-invoke.ts had no case
 * for that command name. store_password_hash and get_password_hash were also
 * absent, breaking the setup path as well.
 *
 * ── IDB schema for password data ────────────────────────────────────────────
 * Store name : "password_hash"
 * Key        : "current"   (single record — only one password at a time)
 * Value      : { hash: string, salt: string }
 */

import { getDb } from './browserDb'; // re-export your existing IDB open helper
import { hashPassword, verifyPasswordHash } from '../crypto';

// ---------------------------------------------------------------------------
// IDB constants
// ---------------------------------------------------------------------------

const PASSWORD_STORE = 'password_hash';
const PASSWORD_KEY   = 'current';

// ---------------------------------------------------------------------------
// check_password_exists
// ---------------------------------------------------------------------------

/**
 * Returns true when a password hash record exists in IDB.
 * Mirrors the Rust `check_password_exists` command.
 */
export async function browserCheckPasswordExists(): Promise<boolean> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(PASSWORD_STORE, 'readonly');
    const req = tx.objectStore(PASSWORD_STORE).get(PASSWORD_KEY);
    req.onsuccess = () => resolve(req.result != null);
    req.onerror   = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// store_password_hash
// ---------------------------------------------------------------------------

/**
 * Persists the PBKDF2 hash + salt for the user's password.
 * Mirrors the Rust `store_password_hash` command.
 *
 * Called by journalService.setupPassword() during initial setup.
 */
export async function browserStorePasswordHash(
  hash: string,
  salt: string
): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(PASSWORD_STORE, 'readwrite');
    const store = tx.objectStore(PASSWORD_STORE);
    const req   = store.put({ hash, salt }, PASSWORD_KEY);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// get_password_hash
// ---------------------------------------------------------------------------

/**
 * Retrieves the stored { password_hash, password_salt } record from IDB,
 * or null if no password has been set up yet.
 *
 * Mirrors the Rust `get_password_hash` command.
 * NOTE: field names match the Rust struct — password_hash / password_salt —
 * so journalService.verifyUserPassword() works without modification.
 */
export async function browserGetPasswordHash(): Promise<{
  password_hash: string;
  password_salt: string;
} | null> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(PASSWORD_STORE, 'readonly');
    const req = tx.objectStore(PASSWORD_STORE).get(PASSWORD_KEY);
    req.onsuccess = () => {
      if (req.result == null) {
        resolve(null);
        return;
      }
      // IDB record uses { hash, salt }; map to the Rust struct field names
      resolve({
        password_hash: req.result.hash as string,
        password_salt: req.result.salt as string,
      });
    };
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// verify_password   ← THE KEY MISSING SHIM (SEC-DEFER-001)
// ---------------------------------------------------------------------------

/**
 * Verifies a plaintext password against the PBKDF2 hash stored in IDB.
 * Returns true on match, false on mismatch or when no password is stored.
 *
 * Mirrors the Rust `verify_password` command added in SEC-DEFER-001.
 *
 * Implementation:
 *   1. Fetch { hash, salt } from IDB (reuses browserGetPasswordHash).
 *   2. Delegate to the WebCrypto-based verifyPasswordHash() from crypto.ts —
 *      identical PBKDF2 parameters as the Rust side — so the comparison is
 *      consistent regardless of which mode the app runs in.
 */
export async function browserVerifyPassword(password: string): Promise<boolean> {
  const stored = await browserGetPasswordHash();
  if (!stored) {
    // No password stored yet — cannot verify
    return false;
  }
  return verifyPasswordHash(password, stored.password_hash, stored.password_salt);
}
