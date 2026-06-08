# HANDOFF: dep-modernization

**Round 1 Branch:** `task/dep-modernization` | **PR #98:** merged 2026-06-06
**Round 2 Branch:** `task/dep-modernization-2026-06-08` | **Date:** 2026-06-08

---

## Summary across both rounds

| Round | Branch | PR | Status |
|-------|--------|----|--------|
| 1 (2026-06-05) | `task/dep-modernization` | #98 | **merged** |
| 2 (2026-06-08) | `task/dep-modernization-2026-06-08` | pending | open |

---

## Round 1 — What changed (PR #98, merged 2026-06-06)

| Commit | Change |
|--------|--------|
| `31a6ee2` | `npm update` — all within-range minor/patch bumps. `@tiptap/*` 3.23.5 → 3.26.0, Tauri plugins latest 2.x, dompurify 3.4.5 → 3.4.8, vite 8.0.13 → 8.0.16, knip 6.14.1 → 6.16.0 |
| `d1430ee` | `@tauri-apps/api` + `@tauri-apps/cli` `~2.10` → `~2.11` (2.11.0/2.11.2); Rust plugin patch bumps: tauri-plugin-dialog 2.7.1, tauri-plugin-fs 2.5.1, tauri-plugin-http 2.5.9 |
| `92d4e63` | `base64` Rust crate 0.21 → 0.22 |
| `2cd7e5a` | `image` Rust crate 0.24 → 0.25; one breaking change fixed in `media.rs`: `ColorType::Rgb8` → `ExtendedColorType::Rgb8` in thumbnail encoder |

---

## Round 2 — What changed (2026-06-08)

### Commit 1: `cargo update` — RUSTSEC advisory cleanup + patch bumps

**RUSTSEC advisories eliminated by this update:**

| Removed crate | Advisory | How it was pulled in |
|---------------|----------|---------------------|
| `rand v0.7.3` | RUSTSEC-2026-0097 (unsound with custom logger) | phf_generator 0.8.0 → selectors → kuchikiki → tauri-utils |
| `fxhash v0.2.1` | RUSTSEC-2025-0057 (unmaintained) | Tauri internals |
| `kuchikiki v0.8.8` | unmaintained | tauri-utils internal CSS selector |
| `html5ever v0.29.1` | unmaintained | → kuchikiki |
| `markup5ever v0.14.1` | unmaintained | → html5ever |
| `selectors v0.24.0` | unmaintained | → kuchikiki |
| `phf v0.8.0 / phf_generator v0.8.0` | unmaintained | → selectors |
| `proc-macro-hack v0.5.20+deprecated` | deprecated | Tauri macros |
| `proc-macro-error` | unmaintained | → Tauri macros |
| `wasi v0.9.0` | old bindings | no longer needed |

**Key crate updates:**

| Crate | Before | After | Notes |
|-------|--------|-------|-------|
| `tauri` | 2.11.0 | 2.11.2 | patch fix |
| `tauri-plugin` | 2.5.4 | 2.6.2 | minor |
| `reqwest` | 0.13.2 | 0.13.4 | patch |
| `rustls` | 0.23.38 | 0.23.40 | TLS patch |
| `tokio` | 1.52.1 | 1.52.3 | patch |
| `chrono` | 0.4.44 | 0.4.45 | patch |
| `bitflags` | 2.11.1 | 2.13.0 | minor |
| `serde_json` | 1.0.149 | 1.0.150 | patch |
| `data-encoding` | 2.10.0 | 2.11.0 | minor |
| `ctap-hid-fido2` | 3.5.9 | 3.5.11 | patch |
| `zbus` | 5.14.0 | 5.16.0 | minor |

### Commit 2: npm minor patches

| Package | Before | After |
|---------|--------|-------|
| `@types/node` | 25.9.1 | 25.9.2 |
| `@types/react` | 18.3.30 | 18.3.31 |
| `knip` | 6.16.0 | 6.16.1 |
| `package-lock.json` version field | 1.8.0 | 1.8.2 (correction) |

---

## What's verified (Round 2)

- `npm run typecheck` passes clean
- **1512 tests pass** (`npm test` — 106 test files)
- 0 npm vulnerabilities
- `cargo check` not runnable in container (GTK system deps absent — same constraint as Round 1)

---

## What's left / deferred

### Deferred — Rust crates with API breaks (require dedicated migration branches)

| Crate | Current | Latest | Blocker |
|-------|---------|--------|---------|
| `mdns-sd` | 0.11 | 0.20 | 9 minor versions; `ServiceDaemon::new`, `ServiceInfo::new`, `ServiceEvent` variants all changed. Full API audit of `peer_discovery.rs` (~600 lines) required. |
| `flume` | 0.11 | 0.12 | Hard-tied to `mdns-sd 0.11`. `peer_discovery.rs` pattern-matches on `flume::RecvTimeoutError` from mdns-sd's channel. Must upgrade together. |
| `rand` | 0.8 | 0.10 | Touches `OsRng`, `RngCore::fill_bytes`, `Rng::gen_range` in crypto/key-gen paths (`peer_identity.rs`, `two_factor.rs`, `media.rs`, `peer_sync_engine/`). Security-sensitive; requires explicit audit. rand 0.9 renamed `thread_rng()` → `rng()`. |
| `rusqlite` | 0.31 | 0.40 | 9 major versions. The schema in `db/mod.rs` uses many rusqlite APIs. Must migrate one version at a time. |

### Deferred — npm major version bumps (out of scope for this task)

| Package | Current | Latest | Notes |
|---------|---------|--------|-------|
| `eslint` | 8.57.1 | 10.4.1 | Requires flat config (`eslint.config.js`) migration. |
| `@typescript-eslint/*` | 7.18.0 | 8.60.1 | Requires eslint 9+ first. |
| `eslint-plugin-react-hooks` | 4.6.2 | 7.1.1 | Requires eslint 9+ first. |
| `esbuild` | 0.27.7 | 0.28.0 | esbuild uses 0.x for breaking changes; changelog audit needed before bump. |
| `jsdom` | 24.1.3 | 29.1.1 | Test environment major; verify no behavior changes. |
| `react` / `react-dom` | 18.3.1 | 19.2.7 | Major; concurrent features, changed APIs. Large dedicated branch. |
| `@types/react` / `@types/react-dom` | 18 | 19 | Tied to React 19 upgrade. |
| `tailwindcss` | 3.4.19 | 4.3.0 | Complete config rewrite; requires `tailwind.config.js` migration. |
| `typescript` | 5.9.3 | 6.0.3 | Verify no strict-mode breakage. |
| `zustand` | 4.5.7 | 5.0.14 | Breaking store API change; requires updating all 4 stores. |

---

## Remaining cargo audit warnings (reduced from 19 → ~10)

Round 2's `cargo update` removed the previously listed advisories for `rand 0.7.3`, `fxhash`, `kuchikiki`/`html5ever`/`selectors` chain, and `proc-macro-error`. Remaining warnings are **GTK3 bindings only**:

- `atk`, `atk-sys`, `gdk`, `gdk-sys`, `gdkwayland-sys`, `gdkx11`, `gdkx11-sys`, `gtk`, `gtk-sys`, `gtk3-macros` — all `RUSTSEC-2024-04xx` (unmaintained). Pulled by `wry` → `tauri-runtime-wry`. Resolves when Tauri migrates to GTK4.
- `glib` (RUSTSEC-2024-0429) — unsound Iterator impl, transitive via GTK.

These are unavoidable without a Tauri GTK4 backend upgrade, which is on Tauri's roadmap.

---

## Skills invoked

- `/code-review` (equivalent): manual diff review before committing
- `/ship` equivalent: tests + typecheck verified before push
- gstack CLI / GBrain: not available in remote execution environment

---

## Notes

- The `chore/advisory-scan-2026-06-08` branch (1 commit, no PR) addressed 2 of the same advisories that `cargo update` in Round 2 already handles. Round 2's cargo update is a superset; the advisory-scan branch is now redundant.
- `cargo check` cannot run in this container due to missing GTK system headers. This is an environment constraint, not caused by any change here — the same limitation existed in Round 1.
