/**
 * Client-side encryption using WebCrypto API
 * Uses AES-256-GCM with PBKDF2 key derivation
 *
 * Security properties:
 * - AES-256-GCM: Authenticated encryption (confidentiality + integrity)
 * - PBKDF2: 600,000 iterations (OWASP 2023 recommendation)
 * - Random salt per key derivation
 * - Random IV per encryption
 */

// Constants
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 16; // 128 bits
const PBKDF2_ITERATIONS = 600_000; // OWASP 2023 recommendation

// Type definitions
export interface EncryptedData {
  ciphertext: string; // Base64 encoded
  iv: string; // Base64 encoded
  salt: string; // Base64 encoded
  version: number; // Schema version for future migrations
}

export interface CryptoResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Convert ArrayBuffer to Base64 string
 */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // Process in 32 KB chunks to avoid call-stack overflow on large buffers
  // while keeping overhead low for typical small ciphertext sizes.
  const CHUNK = 0x8000;
  let result = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    result += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return btoa(result);
}

/**
 * Convert Base64 string to ArrayBuffer
 */
function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

/**
 * Generate cryptographically secure random bytes
 */
function generateRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

// Session-scoped key cache: `base64(salt):base64(passwordToken)` → derived CryptoKey
// Avoids re-running 600k PBKDF2 iterations for the same (password, salt) pair.
// Cleared on lockJournal() via clearKeyCache().
//
// The cache key uses HMAC-SHA-256(sessionNonce, password) truncated to 128 bits.
// This avoids storing the plaintext password as a Map key AND avoids the
// 32-bit collision risk of the previous djb2 approach.  A fresh sessionNonce is
// generated once per JS module load (i.e. once per app session).
const sessionKeyCache = new Map<string, CryptoKey>();

// One-time session nonce — generated once at module load, never persisted.
// Used as the HMAC key so the cache token is session-scoped.
const SESSION_NONCE = crypto.getRandomValues(new Uint8Array(32));

/** Derive a 128-bit session token for the password using HMAC-SHA-256. */
async function passwordCacheToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    SESSION_NONCE,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(password));
  // Use only the first 16 bytes (128 bits) — more than sufficient for cache uniqueness.
  return bufferToBase64(sig.slice(0, 16));
}

/** Wipe the session key cache on lock so derived keys do not outlive the session. */
export function clearKeyCache(): void {
  sessionKeyCache.clear();
}

// Stable per-account PBKDF2 salt.
//
// When set, encrypt() uses this salt for *every* message instead of a fresh
// random salt per call.  Because deriveKey()'s session cache is keyed on
// (salt, password), a stable salt means only ONE PBKDF2-600k derivation runs
// per session — every subsequent encrypt reuses the cached key.  With a random
// per-call salt, every encrypt was a cache miss → a full 600k derivation.
//
// Security: this is safe.  The per-message IV is still random (see encrypt()),
// so AES-GCM never reuses a (key, nonce) pair.  PBKDF2 salt reuse across
// messages that share a key is standard and expected — the salt only needs to
// be unique per (password → key) derivation, not per message.
//
// decrypt() intentionally does NOT read this value: it reads each blob's own
// embedded `salt` field, so historical per-entry-salt data and entries synced
// from other devices (which may carry different salts) still decrypt correctly.
let accountSalt: Uint8Array | null = null;

/**
 * Set the stable per-account PBKDF2 salt used by encrypt().
 * @param saltBase64 - Base64-encoded salt; must decode to exactly SALT_LENGTH bytes.
 * @throws if the salt does not decode to SALT_LENGTH bytes.
 */
export function setAccountSalt(saltBase64: string): void {
  const bytes = new Uint8Array(base64ToBuffer(saltBase64));
  if (bytes.length !== SALT_LENGTH) {
    throw new Error(
      `Account salt must decode to ${SALT_LENGTH} bytes, got ${bytes.length}`
    );
  }
  accountSalt = bytes;
}

/** Clear the stable account salt (call alongside clearKeyCache() on lock). */
export function clearAccountSalt(): void {
  accountSalt = null;
}

/**
 * Constant-time string comparison to prevent timing-based hash oracle attacks.
 * Returns true only if a and b are equal in length and content.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) {
    diff |= ab[i] ^ bb[i];
  }
  return diff === 0;
}

/**
 * Derive an AES-256 key from password using PBKDF2.
 * Returns cached key if the same (salt, password) pair was used earlier this session.
 * Cache key uses HMAC-SHA-256(sessionNonce, password) to avoid storing plaintext.
 */
async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const token = await passwordCacheToken(password);
  const saltKey = `${bufferToBase64(salt.buffer as ArrayBuffer)}:${token}`;
  const cached = sessionKeyCache.get(saltKey);
  if (cached) return cached;

  // Import password as raw key material
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive AES-256 key using PBKDF2
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    false, // Not extractable
    ['encrypt', 'decrypt']
  );

  sessionKeyCache.set(saltKey, key);
  return key;
}

/**
 * Encrypt plaintext using AES-256-GCM
 *
 * @param plaintext - The text to encrypt
 * @param password - User's password for key derivation
 * @returns Encrypted data with IV and salt, or error
 */
export async function encrypt(
  plaintext: string,
  password: string
): Promise<CryptoResult<EncryptedData>> {
  try {
    if (!plaintext || !password) {
      return { success: false, error: 'Plaintext and password are required' };
    }

    // Use the stable per-account salt when set so deriveKey()'s session cache
    // hits and only one PBKDF2-600k runs per session; otherwise fall back to a
    // fresh random salt (e.g. first-run/setup, before the account salt exists).
    // The IV is ALWAYS random per message so AES-GCM never reuses (key, nonce).
    const salt = accountSalt ?? generateRandomBytes(SALT_LENGTH);
    const iv = generateRandomBytes(IV_LENGTH);

    // Derive key from password
    const key = await deriveKey(password, salt);

    // Encrypt the plaintext
    const encodedText = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv: iv as BufferSource,
        tagLength: 128, // explicit: WebCrypto default, but stated clearly
      },
      key,
      encodedText
    );

    return {
      success: true,
      data: {
        ciphertext: bufferToBase64(ciphertext),
        iv: bufferToBase64(iv.buffer as ArrayBuffer),
        salt: bufferToBase64(salt.buffer as ArrayBuffer),
        version: 1,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Encryption failed',
    };
  }
}

/**
 * Decrypt ciphertext using AES-256-GCM
 *
 * @param encryptedData - The encrypted data object
 * @param password - User's password for key derivation
 * @returns Decrypted plaintext, or error
 */
export async function decrypt(
  encryptedData: EncryptedData,
  password: string
): Promise<CryptoResult<string>> {
  try {
    if (!password) {
      return { success: false, error: 'Password is required' };
    }

    // Decode Base64 values
    const ciphertext = base64ToBuffer(encryptedData.ciphertext);
    const iv = new Uint8Array(base64ToBuffer(encryptedData.iv));
    const salt = new Uint8Array(base64ToBuffer(encryptedData.salt));

    // Derive key from password using same salt
    const key = await deriveKey(password, salt);

    // Decrypt the ciphertext
    const decrypted = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv,
        tagLength: 128,
      },
      key,
      ciphertext
    );

    const plaintext = new TextDecoder().decode(decrypted);

    return { success: true, data: plaintext };
  } catch (error) {
    // GCM authentication failure means wrong password or tampered data
    if (error instanceof DOMException && error.name === 'OperationError') {
      return { success: false, error: 'Invalid password or corrupted data' };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Decryption failed',
    };
  }
}

/**
 * Verify if a password can decrypt the given data
 * Useful for password validation without exposing plaintext
 */
export async function verifyPassword(
  encryptedData: EncryptedData,
  password: string
): Promise<boolean> {
  const result = await decrypt(encryptedData, password);
  return result.success;
}

/**
 * Hash password for storage verification (not for encryption).
 * Uses PBKDF2 so the verifier has the same brute-force cost as a derived encryption key.
 * This hash is stored in SQLite; the plaintext password is never persisted.
 */
export async function hashPassword(
  password: string,
  salt?: Uint8Array
): Promise<{ hash: string; salt: string }> {
  const useSalt = salt || generateRandomBytes(SALT_LENGTH);

  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hashBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: useSalt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    256
  );

  return {
    hash: bufferToBase64(hashBits),
    salt: bufferToBase64(useSalt.buffer as ArrayBuffer),
  };
}

/**
 * Verify password against stored hash
 */
export async function verifyPasswordHash(
  password: string,
  storedHash: string,
  storedSalt: string
): Promise<boolean> {
  const salt = new Uint8Array(base64ToBuffer(storedSalt));
  const { hash } = await hashPassword(password, salt);
  return timingSafeEqual(hash, storedHash);
}
