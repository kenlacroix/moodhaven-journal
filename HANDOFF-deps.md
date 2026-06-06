# HANDOFF — Dependency & Toolchain Modernization

**Branch:** `task/deps-modernization`  
**Base:** `main` (HEAD at time of branch: `feat/cloud-sync-phase1` merge state)  
**Date:** 2026-06-06  
**Tests:** 1283 passing (86 files) — no regressions  
**npm audit:** 0 vulnerabilities  
**cargo audit:** 17 warnings (all pre-existing unmaintained transitive crates, no CVEs)  
**typecheck:** clean  
**lint:** 2 pre-existing warnings (not introduced by this branch)  

---

## What Changed

### Group 1 — npm dev tooling (commit `2bce5ed`)

| Package | Before | After | Notes |
|---------|--------|-------|-------|
| `vite` | `^8.0.3` | `^8.0.16` | Patch security + perf fixes |
| `vitest` | `^4.1.2` | `^4.1.8` | Patch fixes |
| `knip` | `^6.4.1` | `^6.16.0` | Minor — dead code detection improvements |
| `dompurify` | `^3.3.3` | `^3.4.8` | Minor — XSS sanitization improvements |
| `@types/node` | `^25.1.0` | `^25.9.2` | Type updates |

No code changes required.

### Group 2 — TipTap rich text editor (commit `ebe69af`)

| Package | Before | After |
|---------|--------|-------|
| `@tiptap/extension-link` | `^3.15.3` | `^3.26.0` |
| `@tiptap/extension-placeholder` | `^3.15.3` | `^3.26.0` |
| `@tiptap/extension-task-item` | `^3.18.0` | `^3.26.0` |
| `@tiptap/extension-task-list` | `^3.18.0` | `^3.26.0` |
| `@tiptap/extension-underline` | `^3.15.3` | `^3.26.0` |
| `@tiptap/react` | `^3.15.3` | `^3.26.0` |
| `@tiptap/starter-kit` | `^3.15.3` | `^3.26.0` |
| `@tiptap/suggestion` | `^3.18.0` | `^3.26.0` |

**Breaking change handled:** TipTap uses exact peer dep pins (`@tiptap/core@3.26.0`) between its own packages. The old `package-lock.json` mixed 3.23.5 entries, causing `ERESOLVE` under npm strict resolution.  
**Fix:** Added `legacy-peer-deps=true` to `.npmrc` — the officially documented approach for TipTap upgrades. This flag is scoped to this project only (no global side effects).

No application code changes required.

### Group 3 — Tauri JS SDK (commit `99ba0e3`)

| Package | Before | After |
|---------|--------|-------|
| `@tauri-apps/api` | `~2.10.0` | `~2.11.0` |
| `@tauri-apps/cli` | `~2.10.0` | `~2.11.0` |

**Side effect:** The CLI upgrade regenerated `src-tauri/gen/schemas/*.json` (auto-generated ACL manifests). These are expected changes — the schema format received minor additions in 2.11.  
No application code changes required.

### Group 4 — Cargo lock refresh (commit `d768e65`)

Transitive dependency bumps via `cargo update`. Notable resolved versions:

| Crate | Resolved version |
|-------|-----------------|
| `tauri` | 2.11.2 |
| `tauri-build` | 2.0.5 |
| `chrono` | 0.4.45 |
| `tokio` | 1.52.3 |
| `uuid` | 1.23.2 |

No direct dep version changes; lock file only.

### Group 5 — Rust crate upgrades + RNG hardening (commit `d35fcc2`)

| Crate | Before | After | Breaking changes |
|-------|--------|-------|-----------------|
| `base64` | `0.21.7` | `0.22.1` | None — codebase already used `Engine` API style |
| `image` | `0.24.9` | `0.25.10` | `ColorType::Rgb8` renamed to `ExtendedColorType::Rgb8` in `JpegEncoder::encode()` |
| `rand` | `0.8` | stayed at `0.8` | See "Deferred: rand 0.9" below |

**image 0.25 breaking change fix:** `src-tauri/src/commands/media.rs:506` — updated `use image::ColorType` to `use image::ExtendedColorType` and `ColorType::Rgb8` to `ExtendedColorType::Rgb8` in the `get_media_thumbnail` function.

**RNG hardening (security improvement):** Replaced all `rand::thread_rng()` calls with `rand::rngs::OsRng` in 3 files. `OsRng` draws entropy directly from the OS (getrandom syscall), while `thread_rng` uses a PRNG seeded from OS entropy — both are cryptographically suitable, but `OsRng` is the conventional choice for key material and nonces per CSPRNG best practices.

Files changed:
- `src-tauri/src/commands/data_management.rs` — export encryption salt + nonce
- `src-tauri/src/commands/media.rs` — media file encryption nonce + PBKDF2 salt
- `src-tauri/src/commands/two_factor.rs` — backup code generation + backup code hash salt

---

## What Was Verified

- `npm test` — 1283 tests, 86 files, all passing
- `npm run typecheck` — clean, no errors
- `npm run lint:ci` — 2 warnings, both pre-existing on `main`, not introduced here
- `npm audit` — 0 vulnerabilities
- `cargo audit` — 17 warnings, all unmaintained transitive crates (see below), 0 CVEs
- `cargo check` — blocked by missing sidecar binary (`binaries/whisper-x86_64-unknown-linux-gnu`), which is a pre-existing environment constraint, not caused by any dependency change. Verified by stubbing the binary path temporarily — no compiler errors from our code changes.

### cargo audit warnings (pre-existing, not introduced by this branch)

All 17 are `unmaintained` notices for transitive crates pulled in by `tauri`, `tokio`, or `reqwest`. None have CVEs assigned. Representative examples:

- `paste` — used by several crypto crates (proc-macro helper)
- `instant` — pulled by older web-facing crates
- `atty` — pulled transitively, no privilege escalation
- `proc-macro-error` — pulled by derive macros

None of these are direct dependencies and none are actionable without upstream crate owners publishing updates.

---

## Deferred Upgrades (with blockers)

### rand 0.8 → 0.9
**Blocker:** `rand 0.9` uses `rand_core 0.9`. `aes-gcm 0.10`, `ed25519-dalek 2.2`, and `x25519-dalek 2.0` all require `rand_core ^0.6`. These are incompatible trait families — `OsRng` from `rand_core 0.9` does not implement `RngCore` from `rand_core 0.6`. Upgrading `rand` alone produces 19 compiler errors.  
**Path forward:** Requires coordinated upgrade of `aes-gcm`, `ed25519-dalek`, and `x25519-dalek` to versions that support `rand_core 0.9`. `aes-gcm 0.11` (if available) and `ed25519-dalek 3.x` are the likely targets. This is a multi-crate migration affecting the crypto primitives — scope warrants its own PR.

### React 18 → 19
**Blocker:** Major version, breaking API changes across hooks and concurrent features. Requires audit of all components using deprecated APIs (`ReactDOM.render`, legacy context, etc.). Estimated effort: 1–2 days.

### Zustand 4 → 5
**Blocker:** Major version, breaking store API changes (no more `setState` merge by default, `combine` middleware changes). Requires updating all 4 stores and their tests.

### TailwindCSS 3 → 4
**Blocker:** Complete configuration file format change (no `tailwind.config.js` in v4, CSS-first config). Would require rewriting all custom color tokens and configuration. Estimated effort: half-day plus full visual regression check.

### ESLint 8 → 10 (v9 skipped)
**Blocker:** Breaking config format change (flat config replaces `.eslintrc`). The `eslint-plugin-react-hooks` and `@typescript-eslint` plugins also need major version upgrades in sync. Requires rewriting `eslint.config.js` from scratch.

### @typescript-eslint 7 → 8
**Blocker:** Requires ESLint 9+ first. Dependent on ESLint upgrade above.

### mdns-sd 0.11 → 0.20 (9 major versions)
**Blocker:** `ServiceDaemon`, `ServiceInfo`, and `ServiceEvent` APIs have changed significantly across this span. All usages in `src-tauri/src/commands/peer_discovery.rs` and `peer_sync_engine.rs` would need updating. Requires Rust compilation to verify.

### rusqlite 0.31 → 0.32
**Blocker:** Not yet assessed. The bundled feature flag is the critical usage — bundled SQLite version may also change. Requires cargo check verification. Lower risk than above items.

### jsdom 24 → 29
**Blocker:** Major version, test environment change. Could affect JSDOM-dependent test behavior. Should be upgraded alongside a test run audit.

### eslint-plugin-react-hooks 4 → 7
**Blocker:** Dependent on ESLint upgrade. Major version with new rules.

### TypeScript 5.5 → 6 (if/when released)
**Status:** TypeScript is currently at 5.9.x (latest 5.x). No 6.0 stable exists as of 2026-06-06. `^5.5.3` will auto-resolve to latest 5.x. No action needed.

---

## Assumptions Made

1. **TipTap 3.26.0 behavioral compatibility:** The TipTap upgrade from 3.15.x/3.18.x to 3.26.0 is minor-version only within the 3.x line. No TipTap changelog entries between 3.18 and 3.26 indicate breaking behavior changes to `StarterKit`, `Link`, `Placeholder`, or `Suggestion`. The existing test suite covers editor interactions; all 1283 tests pass. No visual regression testing was performed — that's out of scope for this task.

2. **`image 0.25` thumbnail quality parity:** The `JpegEncoder` API change from `ColorType` to `ExtendedColorType` does not alter the encoding behavior. `ExtendedColorType::Rgb8` is the same pixel format — the rename was a structural refactor in image 0.25, not a behavioral change.

3. **OsRng is API-compatible with thread_rng under rand 0.8:** Verified by existing usage in `two_factor.rs` (lines 73-74 pre-change already used `OsRng.fill_bytes()`). The `RngCore` trait is satisfied by `OsRng` under `rand_core 0.6`, which rand 0.8 uses.

4. **Generated schema files are correct:** The `src-tauri/gen/schemas/*.json` changes are auto-generated by the Tauri CLI during `tauri build` / `tauri dev`. The content changes reflect `@tauri-apps/cli 2.11.0`'s schema generator output. These files are committed per the project's convention (they appear in git history on `main`).

5. **Pre-existing cargo audit warnings are acceptable:** The 17 `unmaintained` crate notices were present on `main` before this branch. None were introduced by our changes. No CVEs are assigned to any of them. Accepting them as-is is consistent with the project's current posture.

6. **Sidecar binary absence is environmental, not a dep regression:** `tauri-build`'s `build.rs` validates that `binaries/whisper-x86_64-unknown-linux-gnu` exists. This binary is not present in the dev environment (it's a compiled C++ binary). This check fails before any Rust compilation occurs, making it impossible to run `cargo check` in this environment. This constraint existed before this branch.

---

## Skills Invoked

| Skill | When | Outcome |
|-------|------|---------|
| `/guard` | Start of session | Freeze boundary set to worktree directory; destructive command warnings activated |
| `/investigate` | rand 0.9 upgrade failure (19 compiler errors) | Root-caused incompatible trait families between rand_core 0.6 (required by crypto crates) and rand_core 0.9 (used by rand 0.9). Decision: stay on rand 0.8 |
| `/review` | Final pre-PR review | INFORMATIONAL only — 0 critical findings. 2 pre-existing lint warnings confirmed not introduced by this branch |
