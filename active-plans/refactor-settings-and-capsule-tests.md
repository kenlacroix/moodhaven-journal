# Plan: SettingsPage Refactor + Time Capsule Rust Tests

**Branch:** main | **Created:** 2026-04-01 | **Author:** Ken LaCroix

## Problem Statement

Two independent but related code quality improvements:

1. **SettingsPage.tsx is a 2,239-line monolith.** It received 8 changes in one week from 5 different features (Privacy, AI, Sync, Health, About tabs). Every settings feature currently competes in the same file for state, effects, and render logic. The next feature will make this worse.

2. **Time capsule has zero Rust test coverage.** The seal/unseal round-trip is core business logic — if `sealed_until`, `capsule_type`, or `unsealed_at` break in migration or future changes, there's no test to catch it. The TypeScript service layer has 6 tests but the actual SQL commands in `time_capsule.rs` are untested.

---

## Proposed Approach

### Part 1: SettingsPage tab-scoped sub-components

Extract each tab panel into its own component under `src/components/settings/tabs/`:

| Component | Lines extracted | Current tab id |
|-----------|----------------|----------------|
| `GeneralTab.tsx` | ~450 (lines 755–1210) | `panel-general` |
| `PrivacyTab.tsx` | ~270 (lines 1211–1482) | `panel-privacy` |
| `SyncTab.tsx` | ~100 (lines 1483–1581) | `panel-sync` |
| `AITab.tsx` | ~170 (lines 1582–1749) | `panel-ai` |
| `HealthTab.tsx` | ~60 (lines 1750–1829) | `panel-health` |
| `DevicesTab.tsx` | ~8 (lines 1830–1836) | `panel-devices` |
| `ExportTab.tsx` | ~20 (lines 1837–1857) | `panel-export` |
| `AboutTab.tsx` | ~380 (lines 1858–2239) | `panel-about` |

`SettingsPage.tsx` keeps: tab nav, shared state that crosses tabs (activeTab, search), and tab routing. Each tab component owns its own local state, effects, and handlers.

**Shared state that must flow down:**
- `settings` + `updateSettings` from `settingsStore`
- `activeTab` / `setActiveTab` (for cross-tab navigation like "click AI link in About")
- Per-tab state currently in SettingsPage: export filters, log path, 2FA status, data stats, device identity, etc. — each migrates to the tab that owns it.

### Part 2: Rust `#[cfg(test)]` module in `time_capsule.rs`

Add a test module at the bottom of `src-tauri/src/commands/time_capsule.rs` covering:

1. **seal_entry** — sealing an entry sets `sealed_until` and `capsule_type` correctly
2. **unseal_entry** — unsealing clears `sealed_until`, sets `unsealed_at`
3. **get_due_capsules** — returns sealed entries past their unlock date, not future ones
4. **get_mood_delta** — returns correct avg and today's mood (or null if no data)

Test infrastructure: use `rusqlite::Connection::open_in_memory()`, create schema manually (matching `db/mod.rs` migrations for the columns used), insert fixture data, call the SQL logic directly (not through Tauri State — extract DB logic to testable functions if needed).

---

## Scope

**In scope:**
- `src/pages/SettingsPage.tsx` → decompose into tab components
- `src/components/settings/tabs/` → new directory, 8 new files
- `src-tauri/src/commands/time_capsule.rs` → add `#[cfg(test)]` module

**Not in scope:**
- Changing any Settings UI behavior (pure structural refactor)
- Adding new settings
- Adding TypeScript tests for SettingsPage (existing ones pass, structural tests are low-value for layout)
- Rust tests for other commands (separate initiative)

---

## Success Criteria

- `SettingsPage.tsx` drops below 300 lines (tab nav + routing only)
- All existing SettingsPage tests pass unchanged
- `npm run typecheck` passes
- 4+ Rust tests in `time_capsule.rs` passing via `cargo test`
- No behavior changes to settings UI

---

## Files Changed

```
src/pages/SettingsPage.tsx              (major reduction)
src/components/settings/tabs/GeneralTab.tsx     (new)
src/components/settings/tabs/PrivacyTab.tsx     (new)
src/components/settings/tabs/SyncTab.tsx        (new)
src/components/settings/tabs/AITab.tsx          (new)
src/components/settings/tabs/HealthTab.tsx      (new)
src/components/settings/tabs/DevicesTab.tsx     (new)
src/components/settings/tabs/ExportTab.tsx      (new)
src/components/settings/tabs/AboutTab.tsx       (new)
src/components/settings/tabs/index.ts           (new)
src-tauri/src/commands/time_capsule.rs          (add test module)
```

---

---

## Phase 1: CEO Review

### Premise Challenge

| Premise | Status | Evidence |
|---------|--------|----------|
| SettingsPage.tsx is causing real friction | CONFIRMED | 2,239 lines, 8 changes/week from 5 features verified by git log |
| Pure structural refactor (no behavior change) | CONFIRMED | Plan scope section explicitly excludes UI changes |
| Time capsule has zero Rust test coverage | CONFIRMED | No `#[cfg(test)]` in `time_capsule.rs`, 194 lines of untested SQL |
| `#[cfg(test)]` module is the right vehicle | CONFIRMED | Standard Rust pattern, `rusqlite` already in deps |
| Each tab component owns its own local state | **PARTIALLY WRONG** | See critical finding below — tab-switch effects must stay coordinated |

### Critical Finding: Tab-Switch Data Fetching

The `useEffect` at `SettingsPage.tsx:374–388` fires on `activeTab` changes and loads:
- `privacy` tab: `getDataStats()`, `get2FAStatus()`, `getBackupCodesCount()`
- `about` tab: `invoke('get_log_path')`
- `export` tab: `getDataStats()`, `invoke('get_book_tags')`

If these move into tab component mount effects, they fire on every mount/unmount (tabs render lazily or are conditionally rendered), not on tab switch. This causes redundant IPC calls and potential race conditions.

**Fix (auto-decided, P3 pragmatic):** Keep the tab-switch coordinator effect in `SettingsPage.tsx`. Pass the loaded data as props to each tab. Tab components own their interaction state (modals open/closed, form dirty state), not their data-loading.

### Critical Finding: `scrollToSection` Deep-Link Refs Will Break

`sttSectionRef` (line 914, inside what becomes `GeneralTab`) and `aiSectionRef` (line 1582, inside `AITab`) are created in `SettingsPage.tsx` at lines 194–195. The scroll effect at lines 347–372 calls `.scrollIntoView()` on these refs from `SettingsPage`. After extraction, the ref DOM targets live in child components but the refs must remain owned by `SettingsPage`.

**Fix (auto-decided, P5 explicit):** `SettingsPage` creates both `useRef` objects and passes them as `RefObject<HTMLDivElement>` props into `GeneralTab` and `AITab`. The tabs attach `ref={sttSectionRef}` to the correct `<div>`. The scroll effect stays in `SettingsPage`. No change in behavior.

### 10x Reframe

Not applicable. This is correct-sized housekeeping. The 2,239-line file is already causing pain; the refactor prevents a 3,000-line file next month. Not every plan is a strategy pivot.

### What Already Exists

| Sub-problem | Existing code |
|-------------|--------------|
| DevicesTab | Already a separate component: `import { DevicesTab } from '../components/peer-sync'` — panel wrapper only |
| SelectiveExportPanel | Already extracted: `src/components/settings/SelectiveExportPanel.tsx` |
| 2FA sub-components | Already extracted: `TotpSetup`, `HardwareKeySetup`, `BackupCodesDisplay` in `src/components/two-factor/` |
| OuraConnectionCard | Already extracted: `src/components/oura/OuraConnectionCard.tsx` |
| UpdatePanel | Already extracted: `src/components/updater/UpdatePanel.tsx` |

The remaining work is specifically the tab panel wrappers + their local state and effects.

### Dream State Delta

```
TODAY (SettingsPage.tsx: 2,239 lines)
  → THIS PLAN (SettingsPage: ~300 lines + 8 tab files + 6 Rust tests)
  → 12-MONTH IDEAL (each tab independently testable, new settings features land in <50 lines, Rust commands have baseline coverage)
```

### Alternatives Considered

- **React.lazy() for tabs**: Would help parse/render cost but doesn't fix the DX problem (all state still co-located). Deferred — not this plan's scope.
- **Extracting 2FA state machine as sub-feature**: High value but separate initiative. The `show2FASetup` state + 6 callbacks could become a `use2FASetup` hook. Auto-deferred to TODOS.md.

### NOT In Scope (CEO)

- React.lazy() tab loading
- 2FA state machine extraction to hook
- TypeScript tests for SettingsPage structural layout

### CEO Dual Voices

**CLAUDE SUBAGENT (CEO):**
- Critical: `scrollToSection` refs break silently after extraction
- High: tab-switch data fetching needs coordinator pattern, not per-tab effects
- High: `SettingsTabProps` interface must be defined before extraction begins
- Medium: dismissed alternatives (lazy loading, 2FA hook) without analysis
- Medium: Rust tests missing double-seal guard and anniversary exclusion

**CODEX:** Not available (single-reviewer mode).

```
CEO DUAL VOICES — CONSENSUS TABLE:
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Premises valid?                   Y       N/A    [subagent-only]
  2. Right problem to solve?           Y       N/A    [subagent-only]
  3. Scope calibration correct?        Y*      N/A    [subagent-only]
  4. Alternatives sufficiently explored?N      N/A    [subagent-only]
  5. Competitive/market risks covered? Y       N/A    N/A
  6. 6-month trajectory sound?         Y*      N/A    [subagent-only]
═══════════════════════════════════════════════════════════════
* Y with conditions — plan needs the ref and coordinator fixes to be sound
```

---

## Phase 2: Design Review

Skipped. This is a pure structural refactor with zero UI behavior change. No design decisions are being made. 18 UI-term matches are all references to existing components being reorganized, not new design choices.

---

## Phase 3: Eng Review

### Architecture

Updated architecture after incorporating CEO findings:

```
SettingsPage.tsx (~300 lines)
├── State owned here:
│   activeTab, searchQuery, saveStatus
│   sttSectionRef, aiSectionRef  ← refs owned here, passed as props
│   Tab-switch loaded data:
│     dataStats, twoFactorStatus, backupCodesCount  (passed to PrivacyTab)
│     logPath  (passed to AboutTab)
│     exportMatchCount, exportTags  (passed to ExportTab)
│   scrollToSection effect  ← stays here
│
├── Props interface (SettingsTabProps base):
│   settings: AppSettings
│   updateSettings: (patch: Partial<AppSettings>) => void
│   saveSettings: () => Promise<void>
│   activeTab: SettingsTab
│   setActiveTab: (tab: SettingsTab) => void
│   onClose: () => void
│
└── Tab components (tab-specific props added per tab):
    GeneralTab    ← +sttSectionRef: RefObject<HTMLDivElement>
    PrivacyTab    ← +dataStats, twoFactorStatus, backupCodesCount, refresh2FAStatus
    SyncTab       ← no extra props
    AITab         ← +aiSectionRef: RefObject<HTMLDivElement>
    HealthTab     ← no extra props
    DevicesTab    ← already exists (peer-sync component, just unwrap panel)
    ExportTab     ← +exportMatchCount, exportTags
    AboutTab      ← +logPath, handleLogLevelChange
```

### Code Quality

- `handleLogLevelChange` (lines 234–245) calls `saveSettings()` and `invoke('set_log_level')` — must be passed as a callback prop to `AboutTab`, not recreated there (it closes over `updateSettings`).
- `refresh2FAStatus` callback (line 391) — moves to `PrivacyTab` internally (it only mutates `twoFactorStatus` + `backupCodesCount` state that lives in that tab).
- STT hook calls (`checkModelStatus`, `downloadModel`, etc.) at top of `SettingsPage` — STT state machine should move to `GeneralTab` (where the STT panel renders at line 914). The `setSTTModelDownloaded`/`setSTTDownloadProgress` setters from `useSettingsStore` are already store-backed, not local state, so they don't need threading.

### Test Coverage

**Updated Rust test plan (6 tests, not 4):**

```
time_capsule.rs #[cfg(test)] mod tests
├── test_seal_entry_sets_columns
│     Insert entry → seal_entry(unlock_at: future, type: 'letter')
│     Assert: sealed_until = unlock_at, capsule_type = 'letter'
├── test_seal_entry_rejects_past_date
│     seal_entry(unlock_at: past) → should return Err (WHERE filters it)
├── test_seal_entry_double_seal_guard
│     Seal entry → try to seal again → second call returns Err (rows == 0)
├── test_unseal_entry_clears_columns
│     Sealed entry → unseal_entry → unsealed_at IS NOT NULL, sealed_until IS NULL
│     capsule_type defaults to 'anniversary' when was NULL
├── test_get_due_capsules_returns_past_due
│     Insert entry sealed_until = yesterday → get_due_capsules → returns it
├── test_get_due_capsules_anniversary_exclusion
│     Insert entry created today (M-D = today) → get_due_capsules →
│     NOT returned (excluded by strftime('%m-%d') filter)
```

**Test schema (in-memory SQLite):**
```sql
CREATE TABLE journal_entries (...14 columns with capsule fields...);
CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL);
CREATE TABLE entry_tags (entry_id TEXT, tag_id INTEGER, PRIMARY KEY (entry_id, tag_id));
```
Both `tags` and `entry_tags` required because `get_due_capsules` uses `LEFT JOIN entry_tags LEFT JOIN tags`. Without them: `sqlite error: no such table: entry_tags`.

**No Cargo.toml changes needed.** `rusqlite` is in `[dependencies]` (available to `#[cfg(test)]` modules). `tempfile` already in `[dev-dependencies]` (not needed for in-memory tests anyway).

### Performance

No performance regressions. The refactor is purely organizational — same render tree, same effect dependencies, same IPC call count.

### Two Most Likely CI Failures

1. **TypeScript typecheck** (`npm run typecheck`): STT callbacks referencing store setters that haven't been threaded correctly between SettingsPage and GeneralTab. Caught at compile time, not runtime.
2. **`cargo test`** failure if `entry_tags`/`tags` tables omitted from test schema — query returns sqlite error, not `Ok(None)`.

### Architecture Dependency Graph

```
SettingsPage
├── uses: settingsStore (Zustand)
├── uses: scrollToSection (settingsStore)
├── owns: sttSectionRef, aiSectionRef (passes to children)
├── owns: tab-switch coordinator effect
│
├── GeneralTab ← sttSectionRef, settings, updateSettings, saveSettings
├── PrivacyTab ← dataStats, twoFactorStatus, backupCodesCount, refresh2FAStatus
│   └── uses: TotpSetup, HardwareKeySetup, BackupCodesDisplay (already extracted)
├── SyncTab    ← settings, updateSettings, saveSettings
├── AITab      ← aiSectionRef, settings, updateSettings, saveSettings
├── HealthTab  ← settings, updateSettings, saveSettings
│   └── uses: OuraConnectionCard (already extracted)
├── DevicesTab ← (already exists in peer-sync, no new props)
├── ExportTab  ← exportMatchCount, exportTags, settings, saveSettings
│   └── uses: SelectiveExportPanel (already extracted)
└── AboutTab   ← logPath, handleLogLevelChange, settings
    └── uses: UpdatePanel (already extracted)
```

### Eng Dual Voices

**CLAUDE SUBAGENT (Eng):**
- Correct prop interface: settings/updateSettings/saveSettings/activeTab/setActiveTab/onClose base + per-tab data props
- scrollToSection: refs owned by SettingsPage, passed as RefObject props
- Rust test schema needs tags + entry_tags tables
- No Cargo.toml changes needed
- Two CI risks: typecheck (STT callbacks), cargo test (missing tables)

**CODEX:** Not available (single-reviewer mode).

```
ENG DUAL VOICES — CONSENSUS TABLE:
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Architecture sound?               Y*      N/A    [subagent-only]
  2. Test coverage sufficient?         Y*      N/A    [subagent-only]
  3. Performance risks addressed?      Y       N/A    [subagent-only]
  4. Security threats covered?         Y       N/A    [subagent-only]
  5. Error paths handled?              Y*      N/A    [subagent-only]
  6. Deployment risk manageable?       Y       N/A    [subagent-only]
═══════════════════════════════════════════════════════════════
* Y with conditions — plan needs ref ownership + test schema clarifications
```

---

## Updated Scope (Post-Review)

### Files Changed (revised)

```
src/pages/SettingsPage.tsx                          (major reduction, ~300 lines)
src/components/settings/tabs/GeneralTab.tsx         (new)
src/components/settings/tabs/PrivacyTab.tsx         (new)
src/components/settings/tabs/SyncTab.tsx            (new)
src/components/settings/tabs/AITab.tsx              (new)
src/components/settings/tabs/HealthTab.tsx          (new)
src/components/settings/tabs/ExportTab.tsx          (new)
src/components/settings/tabs/AboutTab.tsx           (new)
src/components/settings/tabs/index.ts               (new)
src/components/settings/tabs/types.ts               (new — SettingsTabProps interface)
src-tauri/src/commands/time_capsule.rs              (add 6-test module)
```

Note: `DevicesTab.tsx` is NOT new — `DevicesTab` already exists in `src/components/peer-sync/`. `SettingsPage` just removes the `<div id="panel-devices">` wrapper and renders `<DevicesTab />` directly.

### TODOS.md Additions

- [ ] `use2FASetup` hook: extract 2FA state machine (show2FASetup, backupCodes, isDisabling2FA, 6 callbacks) from PrivacyTab into a reusable hook
- [ ] `React.lazy()` tab loading: deferred optimization, lower priority than structural refactor

---

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|---------|
| 1 | CEO | Add SettingsTabProps interface file | Mechanical | P5 explicit | Prop contract before extraction prevents drift | Inline types per-file |
| 2 | CEO | Tab-switch data loading stays in coordinator | Mechanical | P3 pragmatic | Moving to tab mounts causes redundant IPC calls on render | Move to tab mount effects |
| 3 | CEO | Refs owned by SettingsPage, passed as props | Mechanical | P5 explicit | Refs must be owned where the effect lives | Use store/context for refs |
| 4 | CEO | Lazy loading deferred | Mechanical | P3 pragmatic | Different problem (DX vs perf), separate initiative | Include in this PR |
| 5 | CEO | 2FA hook extraction deferred | Mechanical | P3 pragmatic | Higher value but separate concern; TODOS.md | Include in this PR |
| 6 | Eng | 6 Rust tests instead of 4 | Mechanical | P1 completeness | Double-seal guard + anniversary exclusion are real edge cases | 4 tests (happy path only) |
| 7 | Eng | Include tags+entry_tags in test schema | Mechanical | P1 completeness | get_due_capsules fails at sqlite level without them | Stub the query differently |
| 8 | Eng | DevicesTab: no new file | Mechanical | P4 DRY | Already exists in peer-sync, avoid duplication | New file in tabs/ |
| 9 | Design | Phase 2 skipped | Mechanical | P3 pragmatic | Zero design decisions — pure structural refactor | Run full design review |

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | issues_open | 2 critical, 2 high fixed in plan |
| Codex Review | unavailable | Outside voice | 0 | single-reviewer | — |
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | issues_open | Ref ownership, test schema, 6 tests |
| Design Review | skipped (no design decisions) | — | 0 | skipped | — |

**VERDICT:** Plan updated with all findings. Ready for approval gate.
