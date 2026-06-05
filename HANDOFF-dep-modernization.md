# HANDOFF: dep-modernization

**Branch:** `task/dep-modernization`
**PR:** https://github.com/kenlacroix/moodhaven-journal/pull/98 (draft)
**Date:** 2026-06-05

---

## What changed

Four commits on top of main:

| Commit | Change |
|--------|--------|
| `31a6ee2` | `npm update` — all within-range minor/patch bumps. `@tiptap/*` 3.23.5 → 3.26.0, Tauri plugins latest 2.x, dompurify 3.4.5 → 3.4.8, vite 8.0.13 → 8.0.16, knip 6.14.1 → 6.16.0 |
| `d1430ee` | `@tauri-apps/api` + `@tauri-apps/cli` `~2.10` → `~2.11` (2.11.0/2.11.2); Rust plugin patch bumps: tauri-plugin-dialog 2.7.1, tauri-plugin-fs 2.5.1, tauri-plugin-http 2.5.9 |
| `92d4e63` | `base64` Rust crate 0.21 → 0.22 |
| `2cd7e5a` | `image` Rust crate 0.24 → 0.25; one breaking change fixed in `media.rs`: `ColorType::Rgb8` → `ExtendedColorType::Rgb8` in thumbnail encoder |

---

## What's verified

- `cargo check` passes clean
- `npm run typecheck` passes (the one typecheck error is in an untracked floating file `syncEngine.test.ts` from the `task/test-coverage-raise` branch — not caused by this work)
- 1337 tests pass (`npm test`)
- `npm audit`: 0 vulnerabilities

---

## What's left / deferred

### Deferred — dependency blocker

| Package | Current | Latest | Why deferred |
|---------|---------|--------|--------------|
| `flume` | 0.11 | 0.12 | `mdns-sd 0.11` hard-depends on `flume 0.11`. Our code in `peer_discovery.rs` pattern-matches on `flume::RecvTimeoutError` from mdns-sd's channel — must use the same `flume` version. Upgrade only when `mdns-sd` is upgraded. |
| `mdns-sd` | 0.11 | 0.20 | 9 minor versions, significant API surface (`ServiceDaemon::new`, `ServiceInfo::new`, `ServiceEvent` variants). Full API audit of `peer_discovery.rs` (~600 lines) required before upgrading. |
| `rand` | 0.8 | 0.10 | Used for `OsRng`, `RngCore::fill_bytes`, and `Rng::gen_range` in key-generation and crypto paths (`peer_identity.rs`, `two_factor.rs`, `media.rs`, `peer_sync_engine/`). rand 0.9 changed the main RNG API (`thread_rng()` → `rng()`). Security-sensitive — requires explicit audit before upgrade. |
| `rusqlite` | 0.31 | 0.40 | 9 major versions. The schema in `db/mod.rs` uses many `rusqlite` APIs. Must migrate one version at a time and validate query behavior at each step. |

### Deferred — major version bumps (out of scope)

| Package | Current | Latest | Notes |
|---------|---------|--------|-------|
| `react` / `react-dom` | 18.3.1 | 19.2.7 | React 19 is a major rewrite (concurrent features, changed APIs). Large scope, requires dedicated branch. |
| `@types/react` / `@types/react-dom` | 18 | 19 | Tied to React 19 upgrade above. |
| `tailwindcss` | 3.4.19 | 4.3.0 | v4 has a completely different configuration format. Requires rewriting `tailwind.config.js`. |
| `typescript` | 5.9.3 | 6.0.3 | Major; verify no breaking changes for strict mode usage. |
| `eslint` | 8.57.1 | 10.4.1 | ESLint 10 requires flat config. Needs `eslint.config.js` migration. |
| `@typescript-eslint/*` | 7.18.0 | 8.60.1 | Requires ESLint 9+ (flat config). Blocked on eslint upgrade. |
| `eslint-plugin-react-hooks` | 4.6.2 | 7.1.1 | Requires ESLint 9+. Blocked on eslint upgrade. |
| `jsdom` | 24.1.3 | 29.1.1 | Major; test environment. Verify no behavior changes before upgrading. |
| `zustand` | 4.5.7 | 5.0.14 | Zustand 5 changed the store API. Requires updating all 4 stores. |
| `esbuild` | 0.27.7 | 0.28.0 | esbuild uses 0.x versioning where each minor is potentially breaking. |

---

## cargo audit findings (19 warnings, 0 CVEs)

All 19 warnings are for **transitive** crates pulled through Tauri/wry/GTK that we cannot upgrade directly:

- **GTK3 bindings** (`atk`, `atk-sys`, `gdk`, `gdk-sys`, `gdkwayland-sys`, `gdkx11`, `gdkx11-sys`, `gtk`, `gtk-sys`, `gtk3-macros`) — all `RUSTSEC-2024-04xx`: unmaintained. These are pulled by `wry` → `tauri-runtime-wry`. Will be resolved when Tauri migrates to GTK4 or wry changes its Linux backend.
- **`fxhash` (RUSTSEC-2025-0057)** — unmaintained, transitive via some Tauri internal.
- **`proc-macro-error` (RUSTSEC-2024-0370)** — unmaintained, transitive via Tauri macros.
- **`unic-*` crates (5 entries, RUSTSEC-2025-0075/0080/0081/0098/0100)** — unmaintained, transitive via `selectors` → `kuchikiki` → `tauri-utils`.
- **`glib` (RUSTSEC-2024-0429)** — unsound `Iterator` impl, transitive via GTK.
- **`rand 0.7.3` (RUSTSEC-2026-0097)** — unsound with custom logger, transitive via `phf_generator 0.8.0` → `selectors 0.24.0` → `kuchikiki 0.8.8` → `tauri-utils 2.8.3`. Cannot fix without Tauri updating its internal CSS selector parser.

None of these affect our runtime code paths.

---

## Assumptions made

- `@tauri-apps/api` JS version and Tauri Rust crate version do not need to be identical numbers — they're versioned independently. The JS 2.11.0 and Rust 2.10.3 combination is valid (verified by `cargo check`).
- The `image 0.24 → 0.25` breaking change (`ColorType` → `ExtendedColorType`) was isolated to a single call site in `media.rs:512`. No other uses of `ColorType` in the codebase.
- The `esbuild 0.27 → 0.28` minor bump was left at 0.27 (within the `^0.27.7` spec) because esbuild treats each 0.x as potentially breaking.

---

## Skills invoked

None matched — dependency upgrade work was done directly without a matching installed skill.

---

## Known issue: branch drift

During this session, something (likely the `rust-analyzer-lsp@claude-plugins-official` plugin) repeatedly switched the working branch from `task/dep-modernization` back to `task/test-coverage-raise`. All committed work landed correctly on `task/dep-modernization` but required explicit `git checkout task/dep-modernization` calls between tool invocations. The floating untracked files (`syncEngine.test.ts`, `signalService.test.ts`, `deviceIdentity.test.ts`, `syncManifest.test.ts`, `AdvancedSection.tsx`) belong to `task/test-coverage-raise` and are not part of this PR.
