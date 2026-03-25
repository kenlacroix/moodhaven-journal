# Security Model

## Zero-Knowledge Architecture
- Keys derived from user password via PBKDF2 (600k iterations) — never stored
- All encryption/decryption happens client-side; backend never sees plaintext
- No master keys, admin passwords, or cloud recovery mechanisms
- Only a salted hash is stored for password verification

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
