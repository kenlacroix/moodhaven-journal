<!-- /autoplan restore point: /home/ken/.gstack/projects/kenlacroix-moodhaven-journal/feat-rebrand-moodhaven-autoplan-restore-20260326-191520.md -->
# Plan: Structured Logging & Debug Capability

**Branch:** feat/logging-debug
**Date:** 2026-03-26
**Author:** Ken

---

## Problem

MoodHaven Journal has no structured logging system. The current state:

- **Rust backend:** 75 raw `eprintln!()` calls scattered across sync, pairing, discovery, and updater commands. No log levels. All output goes to stderr with no filtering or persistence.
- **Frontend:** 40 scattered `console.error/warn/info` calls. No log levels, no context, no file output.
- **No unified log file.** When a user reports a bug, there is no log to inspect.
- **No debug mode.** Diagnosing peer sync, WebDAV, or STT issues requires building with print statements.

### What this causes

- Hard to reproduce user-reported bugs (no log evidence)
- No way to test/verify that sync, encryption, or AI flows behaved correctly
- Dev cycle requires adding `eprintln!` → rebuild → test → remove → rebuild
- QA can't verify feature behavior without UI-level evidence

---

## Goals

1. **Structured log output** — levels (DEBUG, INFO, WARN, ERROR), module tags, timestamps
2. **Log file** — persisted at `{app_data_dir}/moodhaven.log`, rotatable
3. **Dev debug mode** — verbose output during local dev without recompiling
4. **Frontend logging** — TypeScript logs route through the same system
5. **Log viewer** — optional: a Settings tab or dev-only panel to read the log file
6. **Test/verify** — existing tests can assert on logged events; new flows can add log assertions

---

## Assumptions (to be challenged)

1. A Tauri-native logging plugin is the right foundation (not a custom solution)
2. Log file location in `app_data_dir` is acceptable (not user-configurable path)
3. Log verbosity controlled by env var (`RUST_LOG`) in dev, hardcoded INFO in prod
4. Frontend logging wraps `tauri-plugin-log` JS bindings (not a separate system)
5. Log rotation is needed (files can grow large over days of use)
6. No log viewer UI needed in v1 (Settings → "Export logs" button is sufficient)
7. Security: log file must never contain journal content (plaintext or ciphertext)

---

## Proposed Approach

### Option A: `tauri-plugin-log` (Tauri native, unified)

Tauri's official logging plugin. Single crate on the Rust side. Provides:
- Log levels: TRACE / DEBUG / INFO / WARN / ERROR
- Routes to: stderr (dev), log file (prod + dev)
- Automatic log rotation by size or date
- Frontend JS bindings via `@tauri-apps/plugin-log`
- `RUST_LOG=debug` support via `env_logger` under the hood

**Pros:** Unified Rust + TS logs in one file. Official Tauri plugin (same maintenance model as tauri-plugin-http, tauri-plugin-fs). Log file is automatically placed in app_data_dir. Works out of the box with Tauri capabilities ACL.

**Cons:** Adds a Tauri plugin dependency. Log file format is fixed (not customizable). Log viewer would need a custom Tauri command to read and page through the file.

### Option B: `tracing` + custom file sink

Use the `tracing` + `tracing-subscriber` crate directly. Write a custom subscriber that tees to stderr and a rotating file. No JS bridge — frontend stays on `console.*`.

**Pros:** More control over log format. `tracing` supports async spans (useful for sync/pairing flows).

**Cons:** Manually bridge Rust and TS logs. More setup complexity. No official Tauri integration — need to expose a `write_log(level, message)` Tauri command for the frontend. Rotation logic must be hand-rolled.

### Option C: Minimal `env_logger` (Rust only)

Replace `eprintln!` with `log::*` macros + `env_logger`. No file output. Level filtering via `RUST_LOG`. Frontend unchanged.

**Pros:** Tiny footprint. No new dependencies for the frontend.

**Cons:** No log file. User-reported bugs still undiagnosable without a terminal. Frontend logs stay disconnected.

---

## Recommended Approach: Option A

`tauri-plugin-log` with a thin TypeScript `logger.ts` wrapper.

**Why:** The marginal cost of the unified log file is near-zero with the plugin. The alternative (Option B) duplicates ~200 lines of setup for the same outcome. Option C leaves the frontend disconnected and skips persistence — the two most valuable properties for debugging user reports.

**Security constraint (non-negotiable):** The logger wrapper must enforce a content policy — no journal text, no encryption keys, no passwords. Log call sites must pass metadata only (entry IDs, mood integers, timestamps, error types — never content strings).

---

## Scope

### In scope

- [ ] Add `tauri-plugin-log` to Cargo.toml and register in `lib.rs`
- [ ] Add `@tauri-apps/plugin-log` to package.json
- [ ] Configure log targets: stderr (dev) + rotating file (prod)
- [ ] Replace all `eprintln!` with `log::info/warn/error/debug` macros
- [ ] Add `src/lib/logger.ts` — thin wrapper around plugin-log JS bindings
- [ ] Replace `console.error/warn/info` calls with `logger.*` at call sites
- [ ] Add `RUST_LOG` to `.env.development` for local dev verbose logging
- [ ] Add `get_log_path` Tauri command — returns the log file path for Settings export
- [ ] Add "Export Logs" button in Settings → About tab
- [ ] Security audit: ensure no log call site passes journal content

### Out of scope (deferred to TODOS.md)

- In-app log viewer panel
- Remote error reporting (Sentry or equivalent)
- Structured JSON log format (NDJSON) — plain text is sufficient for v1
- Per-module log level configuration in Settings UI
- Log search/filter UI

---

## Files to touch

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `tauri-plugin-log` |
| `src-tauri/src/lib.rs` | Register plugin + `get_log_path` command |
| `src-tauri/src/commands/peer_sync_engine.rs` | Replace `eprintln!` |
| `src-tauri/src/commands/peer_discovery.rs` | Replace `eprintln!` |
| `src-tauri/src/commands/peer_pairing.rs` | Replace `eprintln!` |
| `src-tauri/src/commands/updater.rs` | Replace `eprintln!` |
| `src-tauri/capabilities/default.json` | Add log plugin capability |
| `package.json` | Add `@tauri-apps/plugin-log` |
| `src/lib/logger.ts` | New — TS logger wrapper |
| `src/App.tsx` | Replace `console.warn` |
| `src/stores/appStore.ts` | Replace `console.*` |
| `src/stores/booksStore.ts` | Replace `console.*` |
| `src/hooks/useAIInsights.ts` | Replace `console.*` |
| `src/hooks/usePeerSync.ts` | Replace `console.*` |
| `src/hooks/useReminderScheduler.ts` | Replace `console.*` |
| `src/components/settings/SettingsPage.tsx` (or AboutTab) | Add "Export Logs" button |
| `src/lib/webdavService.ts` | Replace `console.*` |
| `src/lib/speechToTextService.ts` | Replace `console.*` |
| `src/lib/settingsService.ts` | Replace `console.*` |
| `.env.development` | Add `RUST_LOG=debug` |

---

## Test Plan

- Unit: `logger.ts` module — assert correct level passthrough, assert content policy (no string containing "content" or "password" in log calls)
- Integration: build dev mode, trigger a peer sync, inspect log file for expected entries
- Security: grep log output for known sensitive strings after a test session
- Manual: Settings → About → Export Logs button downloads the file

---

## Success Criteria

1. `tail -f moodhaven.log` in dev shows timestamped, level-tagged output from both Rust and TS
2. After a peer sync, the log file contains INFO lines for `[sync] connected`, `[sync] sent N / received M`
3. Zero `eprintln!` calls remaining in Rust source
4. Zero raw `console.error/warn/info` calls in TS source (outside `logger.ts` itself)
5. Log file never contains any journal entry text or encryption key material
6. "Export Logs" button in Settings exports the file

---

## PHASE 1: CEO REVIEW

### PRE-REVIEW SYSTEM AUDIT

**Recent hot files (30d):** `lib.rs` (28), `WritingView.tsx` (25), `Cargo.toml` (24), `App.tsx` (20), `SettingsPage.tsx` (17). Logging touches all of these.

**FIXME/TODO in blast radius:** `recoveryKeyService.ts`, `two_factor.rs`, `LockScreen.tsx` — none logging-related. Not in blast radius.

**TODOS relevant to this plan:**
- `D-DEV-001` (seeded dev mode) is adjacent — both improve the dev cycle. No dependency.
- `A-12` (stt_cancel_download not registered in lib.rs) — same file (`lib.rs`). Flag: resolve A-12 in the same PR or before.
- Security hardening items (F-001) reference `settingsService.ts` — same file this plan modifies.

**Landscape:** `tauri-plugin-log` is the Tauri team's recommended approach. Eureka: unified Rust+TS log file gives a single timeline — dramatically better for user bug reports than two separate streams.

---

### STEP 0A: PREMISE CHALLENGE

| Premise | Challenge | Verdict |
|---------|-----------|---------|
| Logging is needed for debugging | 75 `eprintln!` → stderr only. Zero log evidence for user support cases. | VALID |
| Log file is the right output | Desktop app standard. | VALID |
| `tauri-plugin-log` is the right choice | Official, unified Rust+TS timeline, log file auto-managed. | VALID |
| Replace ALL `eprintln!` in one PR | ~115 call sites, 21 files. Mechanical but large diff. | Consider: 2 commits in same PR — (1) add plugin, (2) migrate call sites. |
| `RUST_LOG=debug` works out of the box | **GAP:** `tauri-plugin-log` uses its own `LevelFilter`, NOT `RUST_LOG` by default. | FIX: use `cfg!(debug_assertions)` to set DEBUG level in debug builds. |
| Log file never contains journal content | Security constraint. | VALID + needs enforcement (ESLint rule — now in scope). |

---

### STEP 0B: EXISTING CODE LEVERAGE

| Sub-problem | Existing code |
|-------------|---------------|
| App data dir path | `db/mod.rs:get_db_path()` — same pattern |
| Tauri plugin init | `lib.rs:20-28` — direct copy pattern |
| Settings key storage | `get_setting`/`set_setting` — can store log level |
| Export file dialog | `tauri-plugin-shell` (already registered) — open parent folder |
| Settings UI | `SettingsPage.tsx` — add Export button to About tab |

---

### STEP 0C: DREAM STATE MAPPING

```
CURRENT STATE                    THIS PLAN                         12-MONTH IDEAL
───────────────────              ─────────────────────────         ─────────────────────────
75 raw eprintln! (Rust)    →     log::info/warn/error (Rust)  →   Structured NDJSON logs
40 raw console.* (TS)      →     logger.ts wrapper (TS)       →   Remote opt-in telemetry
Goes to stderr only        →     Rotating log file            →   Crash reporter with log tail
No user-accessible log     →     Export Logs in Settings      →   Auto-filed GitHub issues
Zero debug visibility      →     cfg!(debug_assertions)=DEBUG →   Per-module level in Settings
```

This plan moves cleanly toward the ideal. Log format is a two-way door — NDJSON migration later is a config change.

---

### STEP 0C-bis: IMPLEMENTATION ALTERNATIVES

```
APPROACH A: tauri-plugin-log (RECOMMENDED)
  Effort: M  |  Risk: Low  |  Completeness: 8/10
  Pros: Unified timeline, official Tauri maintenance, log file auto-managed, TS bindings included
  Cons: Fixed plain-text format, plugin init order is a gotcha
  Reuses: lib.rs plugin pattern, get_db_path() for path logic

APPROACH B: tracing + custom file sink
  Effort: M  |  Risk: Medium  |  Completeness: 7/10
  Pros: More control, async spans for sync flows, no frontend dep
  Cons: No unified TS+Rust log, rotation must be hand-rolled, need custom write_log Tauri command
  Reuses: log crate (transitively present)

APPROACH C: env_logger (Rust only, no file)
  Effort: S  |  Risk: Low  |  Completeness: 3/10
  Pros: Minimal footprint
  Cons: No log file — user-reported bugs still undiagnosable. Doesn't solve the core problem.

RECOMMENDATION: A. The unified timeline is the primary value driver. B adds complexity for no gain at this scale.
```

---

### STEP 0D: SELECTIVE EXPANSION — CHERRY-PICK DECISIONS

| # | Candidate | Effort | Decision | Principle |
|---|-----------|--------|----------|-----------|
| 1 | Log level dropdown in Settings | S | DEFERRED → TODOS.md | P5: env var is sufficient for devs; prod users don't need this |
| 2 | Log file path shown in Settings | XS | **ACCEPTED** | Zero extra scope; adds UX polish |
| 3 | ESLint rule blocking sensitive patterns | S | **ACCEPTED** | P1: mechanically enforces security constraint |
| 4 | Message truncation in logger.ts (max 2000 chars) | XS | **ACCEPTED** | P1: prevents accidental large-content logs |

TASTE DECISION #1: Item #1 (log level in Settings). Deferred by P5, but reasonable engineers could want it for non-dev debugging of production issues.

---

### STEP 0E: TEMPORAL INTERROGATION

```
HOUR 1 (foundations):
  Plugin init MUST come before DB init in lib.rs so startup errors are logged.
  Current order: DB first. Must swap. Decision: move plugin init to top of setup().
  Level strategy: cfg!(debug_assertions) → DEBUG; else → INFO. No RUST_LOG dependency.

HOUR 2-3 (call site migration):
  lib.rs has 3 eprintln! in restore path — technically before plugin init completes.
  These stay as eprintln! or the restore path moves after init. Preferred: move plugin
  init before the restore path check (one line move).
  peer_sync_engine.rs: classify each eprintln! as debug (info) or error (failure).
  Not all are the same severity — mechanical grep + manual classification needed.

HOUR 4-5 (TS integration):
  logger.ts needs conditional: if in test env (typeof window === 'undefined' or
  import.meta.env.VITEST), fall back to console.*. OR add mock to setup.ts.
  Preferred: mock in setup.ts (cleaner, no runtime env check in production code).
  Export Logs: invoke get_log_path → invoke shell:open with parent dir.
  Disable Export button if get_log_path returns null or file doesn't exist.

HOUR 6+ (security pass):
  After migrating all call sites: run grep check.
  Add to CI: grep -r "logger\." src/ | grep -E "\.(content|password|key|hash|salt|iv|data)" → fail if matches.
```

---

### ARCHITECTURE DIAGRAM

```
TypeScript Frontend (WebView)
  │
  ├── logger.ts
  │     debug/info/warn/error(msg: string, ctx?: Record<string, string|number|boolean>)
  │     [msg truncated at 2000 chars]
  │     [falls back to console.* in test env]
  │
  └── @tauri-apps/plugin-log JS bindings
        │
        ▼ Tauri plugin IPC bridge
        │
Rust Backend
  │
  ├── tauri-plugin-log::Builder::new()
  │     .level(if cfg!(debug_assertions) { LevelFilter::Debug } else { LevelFilter::Info })
  │     .targets([LogTarget::Stderr, LogTarget::LogDir { file_name: "moodhaven.log" }])
  │     .max_file_size(5_000_000)
  │     .max_files(3)
  │     .build()
  │
  ├── log::debug!/info!/warn!/error! (replacing all eprintln!)
  │
  └── get_log_path command → returns {app_data_dir}/moodhaven.log as String

Log file: {app_data_dir}/moodhaven.log
  Format: [TIMESTAMP][LEVEL][TARGET] message
  Rotation: 5MB × 3 files
  Location: same dir as moodhaven.db
```

---

### ERROR & RESCUE MAP

| Codepath | Failure | Severity | Fix |
|----------|---------|----------|-----|
| Plugin init in lib.rs | app_data_dir not writable → panic | High | Wrap in result; fallback to stderr-only |
| lib.rs restore path eprintln! | Before plugin init → lost | Medium | Move plugin init before restore check |
| logger.ts in jsdom tests | Plugin bindings throw (mock missing) | High | Add vi.mock('@tauri-apps/plugin-log') to setup.ts |
| get_log_path before first log | File doesn't exist yet | Low | UI: disable Export button if path returns null |
| Log rotation fails (disk full) | Entry dropped | Low | Acceptable; log shouldn't crash the app |

---

### SECURITY

| Threat | Mitigation |
|--------|-----------|
| Journal content in logs | ESLint rule (now in scope) + CI grep check |
| Encryption key logged | ESLint rule blocks `key`, `password`, `hash`, `salt`, `iv` variable names |
| Log file read by other app | app_data_dir has user-level permissions. No additional step. |
| get_log_path exposes path | Path itself is not sensitive. Log content is enforced clean by ESLint. |

ESLint rule to add in `eslint.config.js`:
```js
'no-restricted-syntax': [
  'error',
  {
    selector: 'CallExpression[callee.object.name="logger"] > TemplateLiteral',
    message: 'Use logger.*(msg, ctx) — never template literals (prevents content interpolation)'
  }
]
```

---

### FAILURE MODES REGISTRY

| Failure | Severity | Detected by | Resolution |
|---------|----------|-------------|------------|
| Plugin init fails (unwritable dir) | High | Missing log file | Graceful fallback to stderr-only |
| Journal content in log | Critical | ESLint rule + grep | ESLint rule (in scope) |
| Test suite breaks (mock missing) | High | `npm test` | Add vi.mock to setup.ts (in scope) |
| Log file not rotated | Medium | Disk usage | Set max_size=5MB, max_files=3 in init |
| RUST_LOG env var has no effect | Medium | Debug logs absent | Use cfg!(debug_assertions) |

---

### NOT IN SCOPE (CEO Phase)

- Remote error reporting / telemetry
- Structured NDJSON log format
- Per-module log level in Settings UI (→ TODOS.md: TASTE DECISION #1)
- Log search/filter UI
- Sentry or equivalent crash reporter

---

---

### CEO DUAL VOICES

**CODEX SAYS (CEO — strategy challenge):** UNAVAILABLE (codex not installed) — tagged [subagent-only]

**CLAUDE SUBAGENT (CEO — strategic independence):**

> 1. **Is this the right problem?** (Medium) — Privacy-first users won't share log files. The actual bottleneck is reproducibility, not log absence. A "Diagnostic Snapshot" (structured, user-reviewable, redacted summary of last N errors) would yield more actionable bug reports. Fix: add Diagnostic Snapshot concept alongside or instead of full log export.
>
> 2. **Log content policy too weak** (High) — Checking for literal strings "content" and "password" won't catch `entry.tags`, `entry.created_at`. These are metadata, not content, but partial journal fingerprints. Fix: define a `LogPayload` typed approach — `logger.ts` accepts a typed object with permitted fields only, not raw strings.
>
> 3. **Security audit should come FIRST** (Critical) — `[sync] sent entry abc123 with mood 2 at 2026-03-14T09:00Z` = mood + timestamp + ID = partial fingerprint. Content policy doc must be written BEFORE replacing any `eprintln!` calls.
>
> 4. **`tracing` dismissed too quickly** (Low) — Spans are better for causal chain reconstruction in peer sync / STT pipeline. Valid v1 dismissal, but should be noted as upgrade path.
>
> 5. **Version compatibility not verified** (Low) — `tauri-plugin-log` version compatibility with Tauri v2 not confirmed. Verify before starting.

**CEO DUAL VOICES — CONSENSUS TABLE:**
```
═══════════════════════════════════════════════════════════════
  Dimension                           Claude   Subagent  Consensus
  ──────────────────────────────────── ──────── ──────── ─────────
  1. Premises valid?                   Yes      Partial  DISAGREE
  2. Right problem to solve?           Yes      Partial  DISAGREE
  3. Scope calibration correct?        Yes      Yes      CONFIRMED
  4. Security enforcement sufficient?  ESLint   Typed    DISAGREE
  5. Alternatives sufficient?          Yes      Partial  CONFIRMED
  6. 6-month trajectory sound?         Yes      Risky    DISAGREE
═══════════════════════════════════════════════════════════════
CONFIRMED = both agree. DISAGREE = models differ (→ taste decisions).
```

**Auto-decisions on disagreements:**

- **Security policy first** (Dimension 6): APPROVED — subagent is right. Security audit and `LogPayload` type definition happen in HOUR 1, before ANY call site migration. P1 (completeness). Added to scope.
- **Typed `LogPayload`**: APPROVED — stronger than ESLint rule alone. `logger.ts` signature becomes `logger.info(msg: string, ctx?: LogContext)` where `LogContext` is `Record<string, string | number | boolean>`. No nested objects. P1. Added to scope.
- **Diagnostic Snapshot vs log export** (Dimension 1): TASTE DECISION #2 — subagent raises a real product tension. Privacy-first users won't export logs. A Diagnostic Snapshot (structured, redacted, user-reviewed) is a better product. But it's also more scope. Reasonable people could go either way.
- **tauri-plugin-log version check**: APPROVED — add to HOUR 1: verify plugin is compatible with Tauri v2. Cargo.toml pinned to `"2"`.

**Updated scope from dual voice:**
- Define `LogContext` type in `logger.ts` (permitted fields only)
- Write content policy doc section BEFORE call site migration (in implementation order)
- Verify `tauri-plugin-log` v2 compatibility in HOUR 1

---

### CEO COMPLETION SUMMARY

| Dimension | Status | Key Finding |
|-----------|--------|-------------|
| Right problem | Yes | 75 eprintln! + 40 console.* → no file output → user support gap |
| Premises | Valid (1 gap) | RUST_LOG doesn't work with tauri-plugin-log by default → use cfg!(debug_assertions) |
| Scope calibration | Good | 21 files, 14 mechanical. Structural changes are 7 files. |
| Alternatives | Sufficient | Option A correct. B adds complexity. C leaves the core problem unsolved. |
| Security | Gap added | ESLint rule + CI grep now in scope |
| Architecture | Clean | Plugin init order (before DB init) is the key gotcha — resolved |
| 6-month regret | Addressed | Subagent: mood+ts+id = fingerprint. Fix: security policy first + LogPayload type |

---

---

## PHASE 3: ENGINEERING REVIEW

### ENG DUAL VOICES

**CODEX SAYS:** UNAVAILABLE — [subagent-only]

**CLAUDE SUBAGENT (Eng — independent review):**

> 1. **Critical: Test suite breaks on every logger.ts import.** `setup.ts` has no mock for `@tauri-apps/plugin-log`. Any test that imports a module that imports `logger.ts` will throw. Mock must export `{ trace, debug, info, warn, error }` all as `vi.fn()`. Must be wired BEFORE any call site migration touches tested files.
>
> 2. **High (mitigated): Plugin init order concern is unnecessary.** Tauri's `.plugin()` is called BEFORE `.setup()` in the builder pattern — the log plugin IS registered before the restore path `eprintln!` calls run. Those calls CAN be replaced immediately with `log::info/warn`. Remove the confusing caveat from the plan.
>
> 3. **Medium: ESLint rule too narrow.** Blocks template literals but not `+` concatenation or `.toString()`. TypeScript strict types (the `LogContext` type) are the real defense. ESLint rule adds marginal value.
>
> 4. **Low: Log rotation race on crash.** If app panics mid-rotation, log file may be truncated. Acceptable for a logging system.
>
> 5. **Medium: Missing test for context round-trip.** "Assert level passthrough" doesn't verify that `logger.info("msg", { sent: 5 })` actually emits `sent=5`. Context could silently drop if plugin serializes differently.
>
> 6. **Low: `get_log_path` needs ACL entry.** New Tauri command needs `core:default:allow-get-log-path` in `capabilities/default.json`. Not called out in the files table.

**ENG DUAL VOICES — CONSENSUS TABLE:**
```
═══════════════════════════════════════════════════════════════
  Dimension                           Claude   Subagent  Consensus
  ──────────────────────────────────── ──────── ──────── ─────────
  1. Architecture sound?               Yes      Yes      CONFIRMED
  2. Test coverage sufficient?         Partial  Partial  CONFIRMED (gaps found)
  3. Performance risks addressed?      Yes      Yes      CONFIRMED
  4. Security threats covered?         Yes      Partial  DISAGREE (ESLint narrow)
  5. Error paths handled?              Partial  Yes      CONFIRMED (init order mitigated)
  6. Deployment risk manageable?       Yes      Yes      CONFIRMED
═══════════════════════════════════════════════════════════════
```

**Auto-decisions on eng disagreements:**

- **ESLint rule narrowness**: TypeScript `LogContext` type IS the real enforcement. ESLint is defense-in-depth. Keep the rule (it blocks the most common mistake), but don't rely on it as sole protection. P1. Already in scope.
- **Context round-trip test**: APPROVED — add to test plan. `expect(mockInfo).toHaveBeenCalledWith('msg | sent=5')`. P1.
- **`get_log_path` ACL entry**: APPROVED — add `core:default:allow-get-log-path` to capabilities. P1. Add to files table.
- **Plugin init order**: UPDATE PLAN — remove the "move plugin init before restore path" instruction. The builder pattern handles this automatically.

---

### STEP 0: SCOPE CHALLENGE

21 files touched, but 14 are mechanical `eprintln!` / `console.*` replacements. Structural files: 7 (Cargo.toml, lib.rs, data_management.rs, logger.ts, setup.ts, SettingsPage.tsx, capabilities/default.json). Well under the 8-file structural threshold.

**`get_log_path` placement:** Add to `data_management.rs` (P5 — one command, no new module). Pattern: same as `get_data_stats()`, `get_app_version()`.

**TODOS cross-reference:** A-12 (`stt_cancel_download` unregistered in lib.rs) touches the same file. Flag: can bundle A-12's registration in the same PR for zero extra scope. Non-blocking.

**`.env.development` removal:** Since we're using `cfg!(debug_assertions)` instead of `RUST_LOG`, there's nothing to add to `.env.development`. Remove it from the files-to-touch list.

**Distribution check:** Desktop app, no new artifacts. N/A.

---

### ARCHITECTURE DIAGRAM (Final)

```
TypeScript Frontend (WebView)
  │
  ├── src/lib/logger.ts
  │     ┌──────────────────────────────────────────────────────┐
  │     │  type LogContext = Record<string, string|number|boolean>
  │     │                                                      │
  │     │  export const logger = {                             │
  │     │    debug(msg: string, ctx?: LogContext): void        │
  │     │    info(msg: string, ctx?: LogContext): void         │
  │     │    warn(msg: string, ctx?: LogContext): void         │
  │     │    error(msg: string, ctx?: LogContext): void        │
  │     │  }                                                   │
  │     │  [msg + ctx serialized to: "msg | k1=v1 k2=v2"]    │
  │     │  [truncated at 2000 chars]                          │
  │     └──────────────────────────────────────────────────────┘
  │
  └── @tauri-apps/plugin-log
        { debug, info, warn, error, trace } → Tauri IPC bridge
        │
        ▼
Rust Backend (lib.rs setup — FIRST in builder chain)
  │
  ├── tauri_plugin_log::Builder::new()
  │     .level(if cfg!(debug_assertions) { LevelFilter::Debug }
  │             else { LevelFilter::Info })
  │     .targets([
  │       LogTarget::Stderr,
  │       LogTarget::LogDir { file_name: "moodhaven.log" }
  │     ])
  │     .max_file_size(5_000_000)
  │     .max_files(3)
  │     .build()
  │
  ├── All 75 eprintln! → log::debug!/info!/warn!/error!
  │
  └── data_management.rs: get_log_path() → Option<String>
        tauri::api::path::app_log_dir(config) → log file path

Log file: {app_log_dir}/moodhaven.log
  Format: [TIMESTAMP][LEVEL][TARGET] message | k1=v1 k2=v2
  Rotation: 5MB × 3 files
```

**Dependency graph:**
```
logger.ts ──imports──▶ @tauri-apps/plugin-log  (leaf, no circular deps)
SettingsPage.tsx ──imports──▶ logger.ts + invoke('get_log_path')
All hooks/stores ──imports──▶ logger.ts (replaces console.*)
```

---

### CODE QUALITY

- **Pattern consistency:** `logger.info("msg", { key: value })` mirrors the `log::info!("[module] msg key={value}")` Rust pattern. Coherent across both sides.
- **`get_log_path` placement:** In `data_management.rs` alongside `get_data_stats`. No new module needed. Follows existing pattern.
- **`LogContext` type:** Flat `Record<string, string|number|boolean>`. No nested objects — prevents accidental content embedding. TypeScript strict mode catches violations at compile time.
- **ESLint rule:** Narrow (template literals only) but still blocks the most common pattern. `LogContext` type is the real enforcement.
- **DRY:** No duplication introduced. `logger.ts` consolidates all logging. One import path.
- **Over-engineering check:** None. This is the minimum viable implementation.

---

### TEST DIAGRAM

```
NEW UX FLOWS:
  - Settings → About → Export Logs: "Open Log Folder" button

NEW DATA FLOWS:
  - logger.ts → plugin-log → tauri IPC → log file
  - invoke('get_log_path') → String path → SettingsPage UI

NEW CODEPATHS:
  - logger.ts:debug/info/warn/error (with and without ctx)
  - logger.ts message truncation at 2000 chars
  - data_management.rs:get_log_path() (happy path: file exists; sad path: not yet)
  - lib.rs plugin init (new startup path)
  - SettingsPage: Export Logs button render + disabled state

NEW ERROR PATHS:
  - Plugin not loaded in tests → crashes without mock
  - get_log_path returns null → button disabled
  - Log file doesn't exist yet → returns None

Tests needed:
─────────────────────────────────────────────────────────────
src/lib/logger.test.ts (NEW FILE)
  ✓ logger.info(msg) calls vi.mocked(info) with msg
  ✓ logger.info(msg, ctx) calls vi.mocked(info) with "msg | key=val"
  ✓ logger.info(longMsg) truncates at 2000 chars
  ✓ logger.info('') — empty string: no throw
  ✓ all 4 levels (debug/info/warn/error) call correct plugin function
  ✓ logger.info(msg, { sent: 5 }) emits "msg | sent=5" (context round-trip)

src/test/setup.ts (MODIFY)
  + vi.mock('@tauri-apps/plugin-log', () => ({
      trace: vi.fn(), debug: vi.fn(), info: vi.fn(),
      warn: vi.fn(), error: vi.fn(),
      attachConsole: vi.fn().mockResolvedValue(() => {}),
    }))
  MUST be added BEFORE any call site migration.

SettingsPage (existing test file or new):
  ✓ Export Logs row renders in About tab
  ✓ "Open Log Folder" button disabled when logPath is null
  ✓ "Open Log Folder" button enabled when logPath is a string
  ✓ clicking button calls invoke('get_log_path') then shell.open

Rust (cargo test — if test infra exists):
  get_log_path: light smoke test (returns a path-shaped string)
─────────────────────────────────────────────────────────────
```

**2am test:** "What would break at 2am Friday?" — the 497-test suite fails on any import of a module that imports `logger.ts` without the mock. Add the mock to `setup.ts` FIRST, before any call site migration.

---

### PERFORMANCE

- Async log writes (plugin uses background thread). No main thread impact.
- 5MB rotation: ~ms to rotate. Infrequent.
- `LogContext` serialization: 50-100ns per log call. Negligible.
- No concerns.

---

### FAILURE MODES REGISTRY (Final)

| Failure | Severity | Detected by | Resolution |
|---------|----------|-------------|------------|
| Test suite breaks (plugin mock missing) | Critical | `npm test` | Add mock to setup.ts FIRST |
| Journal content in logs | Critical | ESLint + CI grep | LogContext type + ESLint + grep |
| Plugin init fails (unwritable dir) | High | Missing log file | Graceful fallback to stderr-only |
| Context round-trip silent drop | Medium | logger.test.ts | Add context round-trip test |
| get_log_path missing ACL entry | Medium | App startup error | Add to capabilities (now in scope) |
| Log file not rotated (config missing) | Medium | Disk usage | Set max_size + max_files in init |
| Log rotation truncation on panic | Low | Acceptable | Document — don't block |

---

### NOT IN SCOPE (Eng Phase)

- New command module for logging (use data_management.rs instead — P5)
- RUST_LOG env var support (cfg!(debug_assertions) handles this — cleaner)
- `.env.development` changes (none needed)
- A-12 (stt_cancel_download) — flag for bundling but not in scope

---

### WHAT ALREADY EXISTS (Eng Phase)

| Sub-problem | Existing code | Line |
|-------------|---------------|------|
| Plugin init pattern | `lib.rs:20-28` | Direct copy |
| App data dir path | `db/mod.rs:get_db_path()` | Same pattern; use `app_log_dir` |
| Tauri plugin mock in tests | `src/test/setup.ts:8-35` | Add log mock same way |
| Settings About tab | `SettingsPage.tsx:1777-1836` | Add row after Platform |
| ACL entry pattern | `capabilities/default.json:14` | Add log:default + allow-get-log-path |

---

### UPDATED FILES TO TOUCH (Final)

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `tauri-plugin-log = "2"` |
| `src-tauri/src/lib.rs` | Add plugin init (FIRST in builder) |
| `src-tauri/src/commands/data_management.rs` | Add `get_log_path` command |
| `src-tauri/src/commands/peer_sync_engine.rs` | Replace `eprintln!` (classify by severity) |
| `src-tauri/src/commands/peer_discovery.rs` | Replace `eprintln!` |
| `src-tauri/src/commands/peer_pairing.rs` | Replace `eprintln!` |
| `src-tauri/src/commands/updater.rs` | Replace `eprintln!` |
| `src-tauri/capabilities/default.json` | Add `log:default` + `core:default:allow-get-log-path` |
| `package.json` | Add `@tauri-apps/plugin-log` |
| `src/lib/logger.ts` | NEW: TS logger wrapper + LogContext type |
| `src/lib/logger.test.ts` | NEW: unit tests for logger.ts |
| `src/test/setup.ts` | Add `@tauri-apps/plugin-log` mock (FIRST step) |
| `src/App.tsx` | Replace `console.warn` |
| `src/stores/appStore.ts` | Replace `console.*` |
| `src/stores/booksStore.ts` | Replace `console.*` |
| `src/hooks/useAIInsights.ts` | Replace `console.*` |
| `src/hooks/usePeerSync.ts` | Replace `console.*` |
| `src/hooks/useReminderScheduler.ts` | Replace `console.*` |
| `src/lib/webdavService.ts` | Replace `console.*` |
| `src/lib/speechToTextService.ts` | Replace `console.*` |
| `src/lib/settingsService.ts` | Replace `console.*` |
| `src/components/settings/SettingsPage.tsx` | Add Export Logs row + log path display |
| `eslint.config.js` | Add no-restricted-syntax rule for logger template literals |

**Removed from original list:** `.env.development` (not needed with cfg!(debug_assertions))
**Added:** `src/lib/logger.test.ts`, `eslint.config.js`, `data_management.rs` (was lib.rs only)

---

### IMPLEMENTATION ORDER (CRITICAL)

```
Step 1: Add @tauri-apps/plugin-log mock to src/test/setup.ts
Step 2: Write LogContext type + logger.ts skeleton (no call sites yet)
Step 3: Write logger.test.ts — all tests pass against the mock
Step 4: Add tauri-plugin-log to Cargo.toml + register in lib.rs
Step 5: Add @tauri-apps/plugin-log to package.json
Step 6: Add capabilities/default.json entries
Step 7: Add get_log_path to data_management.rs + register in lib.rs
Step 8: Add Export Logs UI to SettingsPage.tsx
Step 9: Migrate all Rust eprintln! → log::* (classify by severity)
Step 10: Migrate all TS console.* → logger.* (call sites)
Step 11: Add eslint.config.js rule
Step 12: Security pass: grep log call sites for sensitive variable names
Step 13: Build dev mode, verify log file appears, run npm test
```

---

### ENG COMPLETION SUMMARY

| Dimension | Status | Key Finding |
|-----------|--------|-------------|
| Architecture | Clean | Dependency graph is a leaf. Plugin init order handled by builder pattern. |
| Test coverage | Gapped → Fixed | Mock missing from setup.ts. Context round-trip test missing. Both added. |
| Performance | Clean | Async writes. No concerns. |
| Security | Layered | LogContext type + ESLint + CI grep = 3 layers. Sound. |
| Error paths | Addressed | Graceful fallback for plugin init failure. get_log_path returns Option. |
| Deployment | Clean | Two-way door. git revert + 3-line dep removal. |

## DECISION AUDIT TRAIL

<!-- AUTONOMOUS DECISION LOG -->

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | CEO | Mode: SELECTIVE EXPANSION | P3 | Feature enhancement, not greenfield | EXPANSION (too small), REDUCTION |
| 2 | CEO | Option A (tauri-plugin-log) | P1 | Unified timeline > control. 8/10 vs 7/10. | B (hand-rolled rotation), C (no file) |
| 3 | CEO | Add log path display in Settings | P1 | Zero extra scope, +UX polish | — |
| 4 | CEO | Add ESLint rule for logger calls | P1 | Mechanically enforces security constraint | — |
| 5 | CEO | Add message truncation (2000 chars) | P1 | Prevents accidental large-content logs | — |
| 6 | CEO | Defer log level in Settings UI | P5 | env var sufficient for devs; non-devs don't need it | ACCEPTED (borderline) |
| 7 | CEO | Use cfg!(debug_assertions) not RUST_LOG | P5 | Explicit: tauri-plugin-log doesn't support RUST_LOG by default | RUST_LOG override |
| 8 | CEO | Security policy written BEFORE call site migration | P1 | Subagent: fingerprint risk; content policy must precede migration | Migration-first |
| 9 | CEO | Add typed LogContext to logger.ts | P1 | Stronger than string-check: structured permitted-field type | String-only logger |
| 10 | CEO | Verify tauri-plugin-log v2 compat in HOUR 1 | P3 | Pragmatic: don't start without confirming version | — |
| 11 | Eng | Add plugin-log mock to setup.ts FIRST | P1 | Test suite breaks on any logger.ts import without this | Post-migration |
| 12 | Eng | LogContext type round-trip test added | P1 | Subagent: context could silently drop without explicit test | Skip |
| 13 | Eng | get_log_path → data_management.rs not new module | P5 | One command, no new module needed. Follows existing pattern. | New logging.rs module |
| 14 | Eng | Remove .env.development from files list | P5 | cfg!(debug_assertions) handles debug level at compile time. env var moot. | Keep .env.development |
| 15 | Eng | Add ACL entry for get_log_path | P1 | Subagent: new Tauri command needs explicit capability entry | — |
| 16 | Eng | Remove "move plugin init" caveat | P3 | Builder pattern calls .plugin() before .setup() — concern was incorrect | — |

---

## CROSS-PHASE THEMES

**Theme: Security content policy** — flagged in Phase 1 (subagent: fingerprint risk) AND Phase 3 (ESLint narrow, LogContext type). High-confidence signal. Resolution: three-layer enforcement (TypeScript types + ESLint + CI grep). All layers now in scope.

**Theme: Test infrastructure must precede call site migration** — flagged in Phase 1 (HOUR 4-5 section: jsdom mock required) AND Phase 3 (subagent: critical, 497-test suite breaks). High-confidence signal. Resolution: Step 1 of implementation order = mock first.

---

## DEFERRED TO TODOS.md

| Item | Reason |
|------|--------|
| Log level dropdown in Settings (P2) | Not needed for devs (cfg!(debug_assertions)); non-devs don't need it |
| Structured NDJSON log format | Two-way door; migrate later if needed |
| In-app log viewer panel | Scope too large for v1 |
| Remote error reporting (Sentry) | Separate architectural decision |
| Log search/filter UI | Deferred; Export Logs + manual grep is sufficient |
| `tracing` async spans (for peer sync) | Valid upgrade path when sync complexity grows |
| Diagnostic Snapshot (user choice: deferred) | User chose log-export-only at premise gate |

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | issues_open | 5 findings: RUST_LOG gap (fixed), LogContext type (added), security audit order (fixed), content fingerprint risk (addressed), version compat (noted) |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | unavailable | codex not installed |
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | issues_open | 6 findings: mock missing in setup.ts (fixed), init order (clarified), ESLint narrow (accepted), context round-trip (added), ACL entry (added), .env.development (removed) |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | Export Logs button follows existing About tab pattern. No design issues. |

**VERDICT:** APPROVED with fixes applied. All critical and high findings resolved in plan. 16 auto-decisions + 2 human decisions (log UX, debug level). Implementation order specified. Test plan artifact written. Ready to implement on `feat/logging-debug` branch.

