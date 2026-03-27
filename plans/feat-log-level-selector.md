<!-- /autoplan restore point: /home/ken/.gstack/projects/kenlacroix-moodhaven-journal/feat-logging-debug-autoplan-log-level-restore-20260326-211335.md -->
# Plan: Log Level Selector in Settings

**Branch:** feat/logging-debug
**Date:** 2026-03-26
**Author:** Ken

---

## Problem

The logging system (shipped on this branch) hardcodes the log level:
- Production builds: INFO (via `LevelFilter::Info` in `lib.rs`)
- Debug builds: DEBUG (via `cfg!(debug_assertions)`)

Users and developers have no way to tune verbosity without recompiling. INFO is noisier than most users need. Power users or developers debugging in production need a way to turn verbosity up. The request is: expose log level as a setting, defaulting to something **less** verbose than INFO.

---

## Goals

1. Add a log level selector to Settings → About tab (4 options: Error, Warn, Info, Debug)
2. Default to `warn` (less verbose than current production INFO)
3. Persist the selection across restarts
4. Apply at runtime — both the frontend logger gating AND the Rust `log::set_max_level()`
5. Reflect the selection immediately (no restart required)

---

## Assumptions

1. `AppSettings` is the right storage (not a raw SQL key) — consistent with all other settings, survives migrations gracefully via JSON merge
2. The About tab is the right location — that's where the Log File row already lives
3. A simple `<select>` or button group is sufficient UI (no slider, no custom widget)
4. Frontend logger should also gate on level (avoids unnecessary IPC for filtered messages)
5. `log::set_max_level()` is sufficient to gate Rust-side logs at runtime

---

## Proposed Approach

### Storage
Add `logLevel: 'error' | 'warn' | 'info' | 'debug'` to `AppSettings` interface and `createDefaultSettings()` with default `'warn'`.

The `settingsStore` already handles JSON merge on load — new fields with defaults are safe to add without a migration.

### Runtime application
**Frontend:** `logger.ts` checks the current level (from settingsStore) before calling the plugin bridge. If `logger.debug()` is called and the stored level is `'warn'`, it returns early — no IPC call.

**Rust:** New `set_log_level(level: String)` Tauri command calls `log::set_max_level()`. This is called:
1. During `.setup()` in `lib.rs` to apply the stored preference at startup
2. From the frontend whenever the user changes the dropdown

**Plugin init:** Change `lib.rs` to init `tauri-plugin-log` at `LevelFilter::Debug` (not `cfg!(debug_assertions)`) so the runtime call to `log::set_max_level()` is the single source of truth for filtering.

### UI
Add a settings row to the About tab (below "Log File"):
```
Log Level    [Error ▾] [Warn] [Info] [Debug]   (segment control or select)
```

### Files
| File | Change |
|------|--------|
| `src/types/settings.ts` | Add `logLevel` to `AppSettings` + default `'warn'` |
| `src/stores/settingsStore.ts` | No change needed (JSON merge handles it) |
| `src/lib/logger.ts` | Add level gating before IPC calls |
| `src/pages/SettingsPage.tsx` | Add log level selector to About tab |
| `src-tauri/src/lib.rs` | Init plugin at Debug; apply stored level in setup() |
| `src-tauri/src/commands/data_management.rs` | Add `set_log_level` command |
| `src-tauri/permissions/app-commands.toml` | Add `set_log_level` |
| `src-tauri/gen/schemas/acl-manifests.json` | Auto-update (generated file) |

---

## Success Criteria

1. Settings → About shows a log level selector defaulting to Warn
2. Changing to Debug immediately causes `logger.debug()` calls to appear in devtools and the log file
3. Changing to Error suppresses warn/info/debug in both TS and Rust logs
4. Selection persists across app restarts
5. `npm test` passes (logger.ts mock not broken by level-gating logic)

---

## PHASE 1: CEO REVIEW

### Step 0A: Premise Challenge

| Premise | Challenge | Verdict |
|---------|-----------|---------|
| AppSettings is right storage | Consistent with all other settings; JSON merge handles new fields. | VALID |
| About tab is right location | Log File row is already there — natural grouping. | VALID (contested — see TASTE DECISION #2) |
| `log::set_max_level()` works at runtime | **GAP:** Only works if plugin was initialized at `LevelFilter::Debug` or Trace. If plugin was initialized at `LevelFilter::Info`, fern's internal `default_level` is Info and cannot be upgraded at runtime via `set_max_level()`. | FIX: Init plugin at `LevelFilter::Debug` always (not `cfg!(debug_assertions)`). `log::set_max_level()` then works bidirectionally. |
| Frontend logger gating adds value | Valid optimization — avoids IPC for suppressed calls. | VALID |
| Default should be `'warn'` | Reduces noise, matches user request "less verbose." | VALID |

**Fixed premise:** Plugin init MUST be `LevelFilter::Debug` (not `cfg!(debug_assertions)`), not as a "simpler approach" but as a technical requirement.

### Step 0B: Existing Code Leverage

| Sub-problem | Existing code |
|-------------|---------------|
| AppSettings add field | `src/types/settings.ts:204` — add to interface + `createDefaultSettings()` |
| Settings persistence | `settingsStore` JSON merge — safe, no migration needed |
| About tab UI | `SettingsPage.tsx:1816-1836` — Log File row is the direct template |
| Rust command pattern | `data_management.rs:get_log_path()` — direct copy pattern |
| SQL key read at startup | `ensure_settings_table()` + `get_setting()` pattern in every command |
| Frontend level registration | `logger.ts` — add `setLevel(level)` export |

### Step 0C: Dream State

```
CURRENT STATE            THIS PLAN                    12-MONTH IDEAL
─────────────────        ─────────────────────────    ─────────────────────
Hardcoded INFO (prod) →  User-selectable (4 levels) → Per-module level config
cfg!(debug_assertions) → Runtime-controlled gate    → Advanced Logging panel
No UI control         →  Settings → About selector  → WARN default + auto-escalate on error
```

### Step 0C-bis: Alternatives

```
APPROACH A: AppSettings + set_log_level command (RECOMMENDED)
  Effort: S | Risk: Low | Completeness: 9/10
  Full Rust + TS control. Persisted in existing infrastructure.

APPROACH B: Frontend-only (logger.ts gating, no Rust command)
  Effort: XS | Risk: Low | Completeness: 5/10
  Rust logs still at hardcoded level. Incomplete.

APPROACH C: CLI flag / env var (developer-only)
  Effort: XS | Risk: None | Completeness: 4/10
  Zero UI surface. Doesn't help non-dev users reduce noise.

RECOMMENDATION: A. User explicitly requested UI control.
```

### Step 0D: SELECTIVE EXPANSION

| # | Candidate | Effort | Decision | Principle |
|---|-----------|--------|----------|-----------|
| 1 | Per-module log level | L | DEFERRED | Out of scope |
| 2 | Warning label in UI for Debug mode | XS | ACCEPTED | P1: footgun guard |
| 3 | logLevel excluded from export_data restore | XS | ACCEPTED | P1: don't silently restore debug verbosity on import |
| 4 | `logger.setLevel()` instead of store read | XS | ACCEPTED | P5: explicit over clever; avoids dependency inversion |

### TASTE DECISION #1: Debug in Settings UI

CEO subagent raised: "Debug sitting in the UI next to Error normalizes high verbosity. A user accidentally leaves it on Debug and gets a privacy complaint."

Both approaches reasonable:
- **Include Debug:** complete control, user explicitly asked for it. Add warning label.
- **Exclude Debug (offer only Error/Warn/Info):** removes footgun, dev debugging done via env var.

RECOMMENDATION: Include Debug with a warning label in the UI. User's explicit request was for "select the log level" — omitting Debug is a silent reduction of scope. The warning label (< 10 chars: "verbose") mitigates the footgun.

### TASTE DECISION #2: About tab vs separate location

CEO subagent: "Persistent runtime config doesn't belong in About."

Both reasonable:
- **About tab:** Adjacent to Log File row. Cohesive. Users will look here.
- **Separate section:** Cleaner architectural separation.

RECOMMENDATION: Keep in About tab. The Log File and Log Level rows are a natural pair. Users who care about logging will look where the Log File row is.

### CEO DUAL VOICES — CONSENSUS TABLE

```
═══════════════════════════════════════════════════════════════
  Dimension                           Claude   Subagent  Consensus
  ──────────────────────────────────── ──────── ──────── ─────────
  1. Premises valid?                   Yes      Partial  DISAGREE (footgun, placement)
  2. Right problem to solve?           Yes      Partial  DISAGREE (audience framing)
  3. Scope calibration correct?        Yes      Yes      CONFIRMED
  4. Security enforcement sufficient?  Yes      Partial  DISAGREE (no footgun warning)
  5. Alternatives sufficient?          Yes      Partial  DISAGREE (CLI/env not mentioned)
  6. 6-month trajectory sound?         Yes      Risky    DISAGREE (log bloat at Debug)
═══════════════════════════════════════════════════════════════
Auto-decisions:
  Dim 1: footgun → warning label added (P1). Placement → About tab stays (P5).
  Dim 2: user request IS the evidence. Proceed (P6).
  Dim 4: warning label added (P1).
  Dim 5: CLI approach doesn't help non-dev users. UI approach stands.
  Dim 6: log file rotation already in place (5MB * 3). Not a real gap.
```

### CEO COMPLETION SUMMARY

| Dimension | Status | Key Finding |
|-----------|--------|-------------|
| Right problem | Yes | User explicitly requested this. Audience is user + developer. |
| Premises | Valid (1 critical fix) | Plugin init MUST be LevelFilter::Debug for runtime gating to work. |
| Scope | Small | 8 files, 2-3h implementation. |
| Architecture | Mostly clean | Frontend gating: use `logger.setLevel()` not store read. |
| Security | Clean + warning | Debug footgun addressed by warning label in UI. |
| 12-month | Sound | Upgrade path to per-module levels is clear. |

### NOT IN SCOPE (CEO)
- Per-module log level config
- CLI flag for log level
- Reset to default button
- Diagnostic Snapshot

---

## PHASE 2: DESIGN REVIEW

### Design Litmus Scorecard

```
Dimension                    Score  Issue
─────────────────────────── ──────  ──────────────────────────────────────
Information hierarchy          8    Log Level above Log File (level gates what's in the file)
Missing states                 7    Stale Zustand during hydration → default 'warn' explicitly
Specificity                    6    Use <select> not button group (fits 800px min width)
Accessibility                  7    aria-label="Log level" on <select>
Responsive                     9    <select> degrades cleanly at min window size
Motion/interaction             9    Immediate apply, no save button
```

**Auto-fixed:** <select> over button group. aria-label. Optimistic update on command failure.

### UI Specification (fixed)

```html
<!-- Log Level row — About tab, above Log File row -->
<div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-700">
  <div>
    <p className="text-slate-700 dark:text-slate-200">Log Level</p>
    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Debug is verbose — use only for troubleshooting</p>
  </div>
  <select
    aria-label="Log level"
    value={settings.logLevel}
    onChange={(e) => handleLogLevelChange(e.target.value as LogLevel)}
    className="px-3 py-1 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-0 cursor-pointer"
  >
    <option value="error">Error</option>
    <option value="warn">Warn</option>
    <option value="info">Info</option>
    <option value="debug">Debug</option>
  </select>
</div>
```

---

## PHASE 3: ENGINEERING REVIEW

### CRITICAL ENG FINDING

**`log::set_max_level()` bidirectionality requires plugin init at Debug.**

From source inspection of `tauri-plugin-log` (fern-based):
- `attach_logger(max_level, log)` calls `log::set_boxed_logger(log)` + `log::set_max_level(max_level)`.
- Fern's `Dispatch.default_level` is immutable after `into_log()`.
- `log::set_max_level()` controls the global pre-filter (fast path before fern is called).
- If plugin is initialized at `LevelFilter::Info`, calling `set_max_level(Debug)` at runtime lets records reach fern, but fern's internal `default_level` is still Info and blocks them.
- **Fix:** Init plugin at `LevelFilter::Debug`. This bakes a permissive internal default into fern. `log::set_max_level()` then works bidirectionally.
- **Cold start window:** Setup() reads the stored level early. In release builds without a stored preference, the window is Debug → Warn (brief, before DB read). Acceptable.

### Architecture (Final)

```
SettingsPage (About tab) onChange
    │
    ├──▶ settingsStore.setLogLevel(level)    // persisted to app_settings JSON
    │
    └──▶ invoke('set_log_level', { level })
              │
              ▼
        data_management.rs: set_log_level(level: String, db: State<Database>)
              ├── parse level → LevelFilter (allowlist: error/warn/info/debug, Err on unknown)
              ├── log::set_max_level(level_filter)   // immediate effect
              └── db.set_setting("log_level", &level) // persisted for next startup

logger.ts:
    let _level: LogLevel = 'warn'; // module-level var
    export function setLevel(l: LogLevel): void { _level = l; }
    // debug/info/warn/error: check _level before calling plugin bridge

lib.rs setup():
    ├── DB opened
    ├── read "log_level" setting (default "warn" if missing)
    └── log::set_max_level(parsed) // applied before other subsystems log

lib.rs plugin init:
    tauri_plugin_log::Builder::new()
        .level(LevelFilter::Debug) // ALWAYS Debug — runtime gate is set_max_level()
        ...
```

### Dependency Graph

```
logger.ts (module var: _level)
    └── @tauri-apps/plugin-log (leaf)

SettingsPage → logger.setLevel() + invoke('set_log_level')
settingsStore → logger.setLevel() on hydration

set_log_level cmd → log::set_max_level() + db.set_setting("log_level")
lib.rs setup() → db.get_setting("log_level") → log::set_max_level()
```

### Eng Dual Voices — Consensus Table

```
═══════════════════════════════════════════════════════════════
  Dimension                           Claude   Subagent  Consensus
  ──────────────────────────────────── ──────── ──────── ─────────
  1. Architecture sound?               Yes      Partial  DISAGREE (frontend coupling)
  2. Test coverage sufficient?         Partial  Partial  CONFIRMED (gaps found)
  3. Performance risks addressed?      Yes      Yes      CONFIRMED
  4. Security threats covered?         Partial  Partial  CONFIRMED (validation needed)
  5. Error paths handled?              Partial  Yes      CONFIRMED (stale Zustand)
  6. Deployment risk manageable?       Yes      Yes      CONFIRMED
═══════════════════════════════════════════════════════════════
Auto-decisions:
  Dim 1: logger.setLevel() avoids coupling (P5). FIXED.
  Dim 2: add tests for setLevel(), stale-default, validation. (P1) FIXED.
  Dim 4: allowlist parse in Rust command. (P1) FIXED.
  Dim 5: treat undefined logLevel as 'warn'. (P1) FIXED.
```

### Test Diagram

```
NEW UX FLOWS:
  - Settings → About → Log Level <select> → onChange applies immediately

NEW DATA FLOWS:
  - settings.logLevel → logger module var
  - invoke('set_log_level') → Rust LevelFilter + SQL key
  - startup: SQL "log_level" key → log::set_max_level()

NEW CODEPATHS:
  - logger.ts: setLevel(level) — module var update
  - logger.ts: debug/info/warn/error with level gating
  - data_management.rs: set_log_level (parse + set_max_level + db.set)
  - lib.rs setup(): read "log_level" setting → set_max_level()
  - SettingsPage: log level <select> render + onChange

NEW ERROR PATHS:
  - Unknown level string → Err from set_log_level
  - "log_level" key missing in DB → default "warn"
  - settingsStore not yet hydrated → logger defaults to 'warn'

Tests:
─────────────────────────────────────────────────────────────
src/lib/logger.test.ts (MODIFY)
  ✓ logger.setLevel('warn') — debug/info calls are no-ops, warn/error call through
  ✓ logger.setLevel('debug') — all 4 levels call through
  ✓ logger.setLevel('error') — only error calls through
  ✓ default level before setLevel() is 'warn' (not undefined)
  ✓ existing tests: all pass (setLevel('debug') in beforeEach to restore prior behavior)

src/pages/SettingsPage.tsx (MODIFY — existing test file or new)
  ✓ Log Level <select> renders in About tab
  ✓ default value is 'warn'
  ✓ onChange calls invoke('set_log_level', { level }) and settingsStore setter
─────────────────────────────────────────────────────────────
```

**2am test:** Existing `logger.test.ts` imports `logger.ts` — if `setLevel()` changes module state, tests could bleed into each other. Fix: call `logger.setLevel('warn')` in `afterEach` (or `beforeEach`) to reset state between tests.

### Security

| Threat | Mitigation |
|--------|-----------|
| Invalid level string from frontend | Allowlist parse in Rust (error/warn/info/debug only → Err) |
| logLevel 'debug' restored on import | On import: always override logLevel to 'warn' (never restore debug from backup) |
| Log file bloat at Debug | Already mitigated: 5MB * 3 files in plugin init |
| No new content exposure | Log level change doesn't touch journal content |

### Performance

- `setLevel()` is a module-var assignment — 1ns. No concern.
- `log::set_max_level()` is an atomic store. No concern.
- Startup: one SQL read for "log_level" key. ~1ms. No concern.

### UPDATED FILES TO TOUCH (Final)

| File | Change |
|------|--------|
| `src/types/settings.ts` | Add `logLevel: LogLevel` to AppSettings + default 'warn' |
| `src/lib/logger.ts` | Add `LogLevel` type, `setLevel()` export, level gating |
| `src/lib/logger.test.ts` | Add setLevel tests, add afterEach reset |
| `src/pages/SettingsPage.tsx` | Add log level <select> to About tab |
| `src-tauri/src/lib.rs` | Change plugin init to LevelFilter::Debug; read "log_level" in setup() |
| `src-tauri/src/commands/data_management.rs` | Add `set_log_level` command (allowlist parse + set_max_level + db.set) |
| `src-tauri/permissions/app-commands.toml` | Add `set_log_level` |
| `src-tauri/gen/schemas/acl-manifests.json` | Auto-generated — will update with cargo build |

**Removed from original:** `src/stores/settingsStore.ts` (JSON merge handles it, no code change needed — but settingsStore DOES need to call `logger.setLevel()` after hydration. This is 1 line in the existing hydration path.)

**Added:** `src/stores/settingsStore.ts` — 1-line change: call `logger.setLevel(settings.logLevel)` after settings load.

### Implementation Order (CRITICAL)

```
Step 1: Add LogLevel type + setLevel() to logger.ts (no side effects yet)
Step 2: Add setLevel tests to logger.test.ts — verify all pass
Step 3: Add logLevel to AppSettings + createDefaultSettings() = 'warn'
Step 4: Change plugin init to LevelFilter::Debug in lib.rs
Step 5: Add set_log_level command to data_management.rs (allowlist parse)
Step 6: Register set_log_level in lib.rs + app-commands.toml
Step 7: Add setup() read of "log_level" SQL key → set_max_level()
Step 8: Add log level <select> to SettingsPage About tab
Step 9: Call logger.setLevel(settings.logLevel) in settingsStore hydration
Step 10: Import guard: on import_data, don't restore logLevel if it's 'debug'
Step 11: cargo check && npm test
```

### NOT IN SCOPE (Eng)
- Per-module level config
- CLI flag
- `settingsStore.ts` refactor (only 1-line addition)

### ENG COMPLETION SUMMARY

| Dimension | Status | Key Finding |
|-----------|--------|-------------|
| Architecture | Fixed | Plugin must init at LevelFilter::Debug; logger.setLevel() avoids store coupling |
| Test coverage | Fixed | setLevel tests + afterEach reset added |
| Performance | Clean | All changes are nanosecond operations |
| Security | Fixed | Allowlist parse in Rust; import guard for Debug level |
| Error paths | Fixed | undefined → 'warn'; "log_level" missing → 'warn' |
| Deployment | Clean | Two-way door. Revert = remove 3 lines from lib.rs |

---

## DECISION AUDIT TRAIL

<!-- AUTONOMOUS DECISION LOG -->

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | CEO | Mode: SELECTIVE EXPANSION | P3 | Small feature enhancement | EXPANSION, REDUCTION |
| 2 | CEO | Include Debug in selector (with warning label) | P1 | User explicitly requested all levels | Omit Debug |
| 3 | CEO | Keep in About tab | P5 | Adjacent to Log File row — natural grouping | Separate section |
| 4 | CEO | logger.setLevel() not store read | P5 | Avoids dependency inversion; explicit over clever | Store read in logger |
| 5 | CEO | logLevel excluded from export_data restore | P1 | Never silently restore debug verbosity | Restore all settings |
| 6 | CEO | Warning label for Debug option | P1 | Footgun guard | No label |
| 7 | CEO | CLI flag alternative dismissed | P6 | Doesn't solve non-dev use case | CLI-only approach |
| 8 | Eng | Plugin init LevelFilter::Debug ALWAYS | P1 | Technical requirement: fern internal filter is immutable | cfg!(debug_assertions) |
| 9 | Eng | Allowlist parse in set_log_level | P1 | Input validation at system boundary | Trust frontend string |
| 10 | Eng | Treat undefined logLevel as 'warn' | P1 | Zustand stale during hydration; explicit safe default | undefined passes through |
| 11 | Eng | afterEach reset in logger.test.ts | P1 | Module-level state bleeds between tests | No reset |
| 12 | Design | <select> over button group | P5 | 800px min window width; 4 labels too wide | Button group |
| 13 | Design | aria-label on <select> | P1 | Accessibility requirement | No label |
| 14 | Design | Log Level above Log File in tab | P5 | Level controls what's in the file | Same order |

---

## CROSS-PHASE THEMES

**Theme: Plugin init must be Debug** — raised in CEO Phase (premise 3 gap) AND Eng Phase (critical finding from source inspection). High-confidence signal. Resolution: always init at Debug, use `log::set_max_level()` as runtime gate.

**Theme: Default to 'warn', not Info** — raised in CEO Phase (user request) AND Design Phase (default value in select). Consistent.

---

## DEFERRED TO TODOS.md

| Item | Reason |
|------|--------|
| Per-module log level config | Separate feature, significant scope |
| CLI flag for log level | Not needed with UI approach |
| Log level badge/indicator | Nice-to-have, not blocking |
| Advanced logging panel | Future if user base grows |

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | issues_open | 8 findings: footgun (warning label added), plugin premise (fixed), placement (taste #2), frontend coupling (fixed), CLI alt (dismissed), import guard (added) |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | unavailable | codex not installed |
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | issues_open | Critical: plugin init must be LevelFilter::Debug. High: stale Zustand, input validation, import guard. All fixed. |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | <select> vs button group (fixed), aria-label (fixed), warning label (added) |

**VERDICT:** APPROVED with fixes applied. 14 auto-decisions + 2 taste decisions for user gate. Critical architectural fix (plugin init) confirmed via source inspection. Implementation order specified. Ready to implement.
