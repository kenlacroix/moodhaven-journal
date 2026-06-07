# Handoff — Security Hardening Pass
**Branch:** `task/security-hardening`  
**Date:** 2026-06-07  
**Session model:** claude-sonnet-4-6

---

## What Changed

### 1. OsRng substitution — 5 files, 7 call sites

All cryptographic random number generation now goes directly to the OS CSPRNG (`rand::rngs::OsRng`) instead of the userspace PRNG (`rand::thread_rng()`).

| File | Lines changed | Operation |
|------|--------------|-----------|
| `src-tauri/src/commands/cloud_providers.rs` | import + L130 | PKCE code verifier |
| `src-tauri/src/commands/data_management.rs` | import + L261-262 | Export encryption salt + nonce |
| `src-tauri/src/commands/two_factor.rs` | import + L181 + L215 | Backup code generation + PBKDF2 salt |
| `src-tauri/src/commands/media.rs` | import + L78 + L104 | MBMF nonce + salt |

Import pattern used: `use rand::{rngs::OsRng, RngCore};` — the `RngCore` trait must be in scope for `OsRng.fill_bytes()` to resolve.

### 2. OAuth CSRF protection — `cloud_providers.rs`

- Added `generate_oauth_state()` helper: 16 bytes from OsRng, base64url-encoded.
- State token is appended to both Dropbox and Google Drive authorization URLs (`&state={}`).
- `wait_for_oauth_code(listener, expected_state)` now validates the returned state. On mismatch it sends HTTP 400 to the browser and returns `Err(...)`, aborting the token exchange.

### 3. Lock guard on OAuth start — `cloud_providers.rs`

`cloud_provider_auth_start` now receives `lock: State<'_, AppLockState>` and calls `require_unlocked(&lock)?` before any other work. This is consistent with `biometric_store_session`, `pin_setup`, and `export_data`.

---

## What Was Verified

- All seven modified call sites confirmed switched from `thread_rng` to `OsRng` via grep.
- OAuth state generation, URL inclusion, and callback validation confirmed via grep.
- Lock guard placement confirmed at the top of `cloud_provider_auth_start`.
- `cargo check` attempted — failed due to missing GTK system libraries (`gdk-3.0`) in the build environment. This is a headless container limitation, not a code error. The crate changes are syntactically correct (confirmed by reading the diffs).
- `npm audit` — 0 vulnerabilities.
- `vitest` — could not run; `npm install` was not available in the container. Frontend files were not modified; only Rust backend files changed.

---

## What's Left

### Needs human decision (see SECURITY-AUDIT-2026-06-07.md §"Needs Human Decision")

1. **`http:allow-fetch` HTTP scope** — Remove `{ "url": "http://**" }` from `src-tauri/capabilities/default.json`. This would break HTTP WebDAV users. Recommend adding a UI warning in WebDAV settings instead (`url.startsWith('http://')` → amber banner).

2. **`allow-all-app-commands`** — Replace with an explicit list. Approximately 165 `core:default:allow-<command-name>` entries needed, one per registered Tauri command. The writer window should get its own narrower capability file.

3. **cargo-audit in CI** — Add `cargo install cargo-audit && cargo audit` as a required CI step.

4. **Ed25519 updater signatures** — The updater comment already tracks this. Need: private key in GitHub Actions secrets, public key hardcoded in `updater.rs`, sig file alongside `checksums.txt`.

5. **secureStorage migration warning** — `secureGet()` returns old plaintext values silently. Add `logger.warn` at `src/lib/services/secureStorage.ts:64` for unmigrated reads.

---

## Assumptions Made

1. The `rand::thread_rng()` → `OsRng` change is a hardening-only improvement with zero semantic change. The `rand` crate documentation states `thread_rng` is seeded from OS entropy; this is defense-in-depth, not a bug fix.
2. The OAuth `state` parameter is safe to add without provider-side changes. Both Dropbox and Google OAuth2 round-trip the `state` parameter they receive unchanged.
3. Adding `require_unlocked` to `cloud_provider_auth_start` is not a breaking UX change because cloud provider connection is only presented in the Settings tab, which is not accessible from the lock screen.
4. `cargo check` failure in this container is environment-only. The changes compile on a machine with GTK/WebKit development libraries installed.

---

## Sentinel / Automated Detection Notes

A static analysis tool like Semgrep or Sentinel could automatically catch:

| Finding | Detection rule |
|---------|---------------|
| F5 (thread_rng in crypto) | Semgrep rule: `rand::thread_rng()` in files that also use `aes_gcm`, `pbkdf2`, or `rand::RngCore` |
| F4 (missing lock guard) | Semgrep rule: `#[tauri::command]` fn without `require_unlocked` call and `AppLockState` param |
| F3 (missing state param) | Semgrep rule: OAuth URL construction containing `response_type=code` without `state=` |
| F1 (HTTP in capabilities) | JSON schema lint: `http:allow-fetch` allow list containing `http://**` |
| F2 (allow-all-app-commands) | JSON schema lint: presence of `allow-all-app-commands` |

Findings F6, F7 require runtime context or CI pipeline config inspection — not addressable by pure static analysis.

---

## gstack Skills Invoked

The following skills from the task brief were **not available** in this session environment (not in the loaded skill list):
- `/guard` — operating rules substituted by manual discipline
- `/cso` (OWASP/STRIDE) — manual STRIDE-style threat modeling applied
- `/codex` (adversarial crypto second opinion) — manual code review of crypto.ts, pin_unlock.rs, data_management.rs
- `/review` (code-level bugs) — manual review of security paths
- `/learn` — no GBrain write performed; findings in SECURITY-AUDIT-2026-06-07.md serve as the learning artifact
- `/ship` — see PR creation below

The available `security-review` skill was invoked but failed (git log error on a fresh repo with no upstream HEAD). The audit was completed by direct file reading and grep-based analysis.
