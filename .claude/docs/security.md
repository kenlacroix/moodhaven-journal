# Security Model

## Zero-Knowledge Architecture
- Keys derived from user password via PBKDF2 (600k iterations) — never stored
- All encryption/decryption happens client-side; backend never sees plaintext
- No master keys, admin passwords, or cloud recovery mechanisms
- Only a salted hash is stored for password verification

## Encryption at Rest (SQLCipher)
- The whole database file is encrypted at rest with **SQLCipher** using a **raw 256-bit key** (no SQLCipher KDF over the key), applied as `PRAGMA key = "x'<hex>'"` on every read path to match the `ATTACH ... KEY "x'<hex>'"` form used to encrypt it.
- This is a *second* layer beneath the per-field application-layer AES-256-GCM (journal text, TOTP seed, credentials, OAuth tokens). It protects the columns that are stored without field-level encryption — mood, timestamps, tags, location/weather — when the file is read directly off disk.
- **Honest history:** this layer was **inert from v1.7.0 until v1.8.0**. The DB was encrypted with a raw key but every read path used `PRAGMA hexkey`, which decodes the hex then runs PBKDF2 — deriving a *different* key. The first-unlock verify always failed and the migration silently fell back to a **plaintext** `moodhaven.db` on every build/OS. PT8 found this; commit `e6fb416` switched the three read-path pragmas to `PRAGMA key "x'<hex>'"`. Backward-compatible (files were always raw-keyed), guarded by a new encrypt→reopen regression test, and **verified end-to-end on the installed Windows build** (on-disk bytes are ciphertext, not `SQLite format 3`).
- Pre-v1.8.0 on-disk copies (old backups, disk images) were never encrypted and remain plaintext — re-encryption applies going forward only.

## Two Unlock Paths
1. **Password (+2FA)** → decrypts data
2. **Erase & Start Fresh** → destroys all data, no password needed

## Optional Recovery Key
- 24-character code (XXXX-XXXX-XXXX-XXXX-XXXX-XXXX), shown once
- Encrypts a copy of the user's password (key escrow) — the ONLY recovery path
- Hardware keys do NOT bypass encryption; they're a second factor only

## Hardware Key (FIDO2 / YubiKey)
- Native Rust CTAP2/HID — NOT browser WebAuthn (doesn't work in Tauri WebView)
- Feature flag: `--features hardware-key`
- Linux runtime dep: `libudev1`; build dep: `libudev-dev`
- UI falls back to platform install instructions when feature absent or dep missing
- Files: `src-tauri/src/commands/hardware_key.rs`, `src/lib/hardwareKeyService.ts`

## Cloud Sync Security
- All backups AES-256-GCM encrypted client-side before upload
- WebDAV server only ever sees ciphertext
- Uses `tauri-plugin-http` (bypasses WebView CSP for user-configured URLs)
- Sync is manual only — user explicitly triggers each upload/download
- OAuth tokens (Dropbox / Google Drive) are AES-256-GCM encrypted at rest under a per-device key in the OS keyring (0600 file fallback) — v1.8.0+

## Full-DB Restore Consent Gate (peer sync, v1.8.0)
- A full-database restore to a new device is **not** authorized by device trust alone. The serving device only honors a `RestoreRequest` if the user has explicitly armed restore via Settings → Devices → "Set up a new device".
- The arm window is **one-shot** (consumed by the first restore), **time-limited** (5-minute TTL), and **cleared on lock** (`lock_app` disarms it). Unarmed requests are rejected and the connection is closed.
- Commands: `peer_arm_restore`, `peer_disarm_restore`, `peer_restore_is_armed` (all require an unlocked session). The requesting peer must still pass Ed25519 challenge/signature auth.
- **In progress:** the restore streams the SQLCipher DB file but does not yet transfer the `db_state.json` salt alongside it, and the recovery-key promote path does not yet re-verify the derived key against the stored hash. Both are tracked, not yet landed.

## Session Lock (default-deny, v1.8.0)
- The Rust session lock is **setup-aware**: a fresh install with no password hash starts unlocked (no data to protect); once a password exists, or if the DB is unreadable, it starts locked.
- Data-bearing commands across the IPC surface (activities, voice memos, peer pairing, cloud sync, peer sync, sync helpers, `get_data_stats`, `regenerate_backup_codes`) enforce `require_unlocked` server-side. The browser/PWA shim mirrors the same default-deny list.

## Tauri Capabilities (`src-tauri/capabilities/default.json`)
- `core:default` — standard commands
- `shell:allow-open` — open URLs in browser
- `notification:default` — reminders
- `http:default` — WebDAV sync (bypasses CSP)

## Security Checklist for New Features
- [ ] Sensitive data encrypted before storage
- [ ] No hardcoded secrets or keys
- [ ] User input sanitized (prevent injection)
- [ ] File paths validated (prevent path traversal)
- [ ] Error messages don't leak sensitive info
- [ ] Tauri commands use proper permission scopes

## Forbidden Patterns
```typescript
eval(userInput)                          // code injection
fs.readFile(userProvidedPath)            // path traversal
localStorage.setItem('key', password)    // unencrypted secrets
console.log(userData)                    // sensitive data in logs
```
