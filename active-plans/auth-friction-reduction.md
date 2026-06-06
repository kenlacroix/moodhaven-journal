# Auth Friction Reduction

**Status:** Item 2 (PIN unlock) done — PR #102 merged. Item 1 (desktop biometric) in progress.  
**Target:** v1.8.x (desktop) | v2.1.0 (iOS, see `ios-app-v2-0.md` Phase 5)

Reduces the unlock barrier without compromising the zero-knowledge encryption model. SSO (Google/Apple sign-in) was explicitly ruled out — it requires either a backend key escrow or abandoning the zero-knowledge guarantee. The items below deliver the same "frictionless" feel while keeping encryption intact.

---

## What's already done

- **Auto-lock timeout** — configurable in Settings → Privacy → Auto-Lock. No work needed.
- **Android biometric unlock** — `src/components/settings/tabs/PrivacyBiometric.tsx` exists and is wired for Android/Wear OS.

---

## Item 1 — Desktop Biometric Unlock (Windows Hello / Touch ID / polkit)

### How it works with the encryption model

The user's password is the encryption key. Biometric can't replace it — but it can *retrieve* it. The session bridge pattern already does this for the writer window (`store_session_password` / `retrieve_session_password`). The same idea applies here:

```
First unlock after launch:
  User enters password → app unlocks → password stored in OS credential store
                                         (encrypted by OS with biometric key)

Subsequent unlocks (until reboot / force-quit):
  User triggers biometric prompt → OS releases stored password → app unlocks normally
```

The password is never persisted to disk unprotected — it's stored in the OS keyring under biometric protection, cleared on lock.

### Rust implementation

Use `tauri-plugin-biometric` (official Tauri plugin, supports Windows Hello, macOS Touch ID, Linux polkit):

```toml
# src-tauri/Cargo.toml
tauri-plugin-biometric = "2"
```

New Tauri commands in `src-tauri/src/commands/biometric.rs`:

```rust
biometric_is_available  // → { available: bool, reason: Option<String> }
biometric_store_session // stores password in OS keyring under biometric key
biometric_retrieve_session // triggers biometric prompt → returns password or error
biometric_clear_session // called on lock / factory reset
```

Keyring storage key: `com.moodhaven.app / biometric_session`

### Frontend

`PrivacyBiometric.tsx` already exists but is Android-only. Extend it to render on desktop platforms too:

```typescript
// Show on: platform() === 'ios' || platform() === 'android' || isTauri (desktop)
// Hide on: browser/web build
```

`LockScreen.tsx` (or equivalent) gets a "Use Biometrics" button that appears after `biometric_is_available` returns true and the user has opted in.

### Settings opt-in

Settings → Privacy → Biometric Unlock toggle (off by default, same as Android pattern). First enable prompts for password confirmation before activating — ensures the user knows their password before delegating to biometrics.

### Files to touch

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `tauri-plugin-biometric` |
| `src-tauri/src/commands/biometric.rs` | New module (4 commands) |
| `src-tauri/src/commands/mod.rs` | `pub mod biometric` |
| `src-tauri/src/lib.rs` | Register 4 commands |
| `src-tauri/capabilities/default.json` | Add biometric permissions |
| `src/components/settings/tabs/PrivacyBiometric.tsx` | Extend to desktop platforms |
| Lock screen component (wherever unlock lives) | Add biometric prompt path |

### Acceptance criteria

- [ ] First unlock: password required (biometric not yet available as primary)
- [ ] After opt-in: subsequent unlocks via biometric prompt — no password entry
- [ ] Lock → biometric unlock restores full session (same as password unlock)
- [ ] Factory reset clears keyring entry
- [ ] If biometric fails 3x, falls back to password entry
- [ ] Web build: biometric option hidden entirely

---

## Item 2 — PIN Unlock ✅ DONE (PR #102)

### How it works with the encryption model

PIN unlocks a *key blob*, not the raw password. The flow:

```
Setup:
  User enables PIN → enters their password to confirm
  → app generates random 32-byte "PIN key" → encrypts it with AES-256-GCM(PBKDF2(PIN, salt))
  → stores encrypted PIN key blob in settings table under key `pin_key_blob`
  → also stores `pin_salt` (random, separate from password salt)

Unlock via PIN:
  User enters PIN → PBKDF2(PIN, pin_salt) → decrypt pin_key_blob → recover PIN key
  → use PIN key to decrypt a stored wrapped copy of the session password
  → unlock proceeds normally
```

The password itself is wrapped with the PIN key and stored as `pin_wrapped_password`. Changing the password invalidates the PIN (the wrapped copy is stale) and prompts to re-enter PIN to re-wrap.

### Why PBKDF2 on a PIN?

PINs have low entropy. Use aggressive PBKDF2 iterations (600k, same as master password) to resist offline brute force. A 6-digit PIN with 600k PBKDF2 iterations takes ~minutes per attempt on a modern GPU — not bulletproof but materially harder than a bare hash.

**Rate limit:** Apply the same `PasswordRateLimiter` (5 failures → 30s lockout, persisted) already used for master password. Files: `src-tauri/src/commands/data_management.rs`.

### PIN length

4–6 digits (user-configurable, default 6). Numeric only. No biometric-equivalent convenience — PIN is specifically for users who want something shorter than a passphrase but can't use biometrics.

### Rust

New commands in `src-tauri/src/commands/pin_unlock.rs`:

```rust
pin_setup(password: String, pin: String)   // wraps password, stores blob
pin_unlock(pin: String)                    // → decrypted password or rate-limit error
pin_disable()                              // clears blob + salt
pin_is_enabled()                           // → bool
```

Crypto all on Rust side: `pbkdf2` crate (already in tree), `aes-gcm` crate.

### Frontend

Settings → Privacy → PIN Unlock section (new, below Biometric). Lock screen shows PIN keypad when PIN is enabled. Falls back to full password on 5 failures (standard lock screen).

### Files to touch

| File | Change |
|------|--------|
| `src-tauri/src/commands/pin_unlock.rs` | New module (4 commands) |
| `src-tauri/src/commands/mod.rs` | `pub mod pin_unlock` |
| `src-tauri/src/lib.rs` | Register 4 commands |
| `src-tauri/capabilities/default.json` | Add pin_* permissions |
| `src/lib/pinUnlockService.ts` | IPC wrappers |
| `src/components/settings/tabs/PrivacyAutoLock.tsx` | PIN setup toggle + entry |
| Lock screen | PIN keypad path |

### Acceptance criteria

- [ ] PIN setup requires current password confirmation
- [ ] Correct PIN → unlocks app (same session as password unlock)
- [ ] 5 wrong PINs → 30s lockout (same as password rate limiter)
- [ ] After 5 lockout cycles, falls through to full password
- [ ] Changing master password invalidates PIN and prompts to re-setup
- [ ] Factory reset clears all PIN data
- [ ] PIN disabled → lock screen shows only password entry

---

## Sequencing

Both items are independent. Neither blocks the other.

Suggested order: **Biometric first** — it's the higher-impact unlock improvement for desktop users and reuses the existing `PrivacyBiometric.tsx` structure. PIN is useful for users whose hardware doesn't support biometrics.

Both can ship in a single v1.8.x PR if the scope is manageable, or separately.
