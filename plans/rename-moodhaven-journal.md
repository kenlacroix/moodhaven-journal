<!-- /autoplan restore point: /home/ken/.gstack/projects/kenlacroix-moodhaven-journal/main-autoplan-restore-20260326-144859.md -->

# Plan: Rename App to MoodHaven Journal by Moodbloom

**Version:** v1.0 (reviewed)**
**Branch:** main
**Date:** 2026-03-26
**Status:** APPROVED — Ready to implement

---

## Context

The app is currently named "MoodBloom" throughout the codebase. The correct product name is
**MoodHaven Journal** by **Moodbloom** (the entity). Website: https://moodhaven.app/

This is a branding rename — not a feature change. All logic stays the same.

---

## Rename Mapping

| Was | Now | Where |
|-----|-----|-------|
| MoodBloom (product name) | MoodHaven Journal | UI strings, titles, metadata |
| moodbloom (package name) | moodhaven-journal | package.json `name` |
| com.moodbloom.app (identifier) | com.moodhaven.app | tauri.conf.json, Cargo.toml — SEE RISK |
| moodbloom.db (database file) | moodhaven.db | Rust constants — SEE RISK |
| "by Moodbloom" | "by Moodbloom" | taglines, About section |
| moodbloom.app (domain ref) | moodhaven.app | any hardcoded URL references |

---

## Scope

### In Scope
1. **Metadata** — `package.json` (name, description), `src-tauri/Cargo.toml` (name, description), `src-tauri/tauri.conf.json` (productName, title, window title)
2. **User-facing strings** — All UI text containing "MoodBloom" in `.tsx`, `.ts` components
   - WelcomeStep, LockScreen, BreakoutWriterApp, UpdatePanel, TutorialWizard, MicrophonePermissionModal, MicrophoneBlockedModal, SyncDetailsModal, etc.
3. **Notification/reminder strings** — `reminderService.ts` (notification titles)
4. **Documentation** — CLAUDE.md, README, CHANGELOG, SECURITY.md (non-code mentions)
5. **About / Settings page** — any displayed app name in SettingsPage

### Also In Scope (expanded — no public users, no migration needed)
- **App identifier** (`com.moodbloom.app` → `com.moodhaven.app`): Safe — no existing installs, no data to migrate.
- **Database filename** (`moodbloom.db` → `moodhaven.db`): Safe — no existing user databases.
- **mDNS service type** (`_moodbloom._tcp.local` → `_moodhaven._tcp.local`): Safe — no cross-version compat needed.
- **Sync protocol prefix** (`"moodbloom-sync-v1:"` → `"moodhaven-sync-v1:"`): Safe — all dev devices updated together.
- **Rust crate names** (`moodbloom` → `moodhaven-journal`, `moodbloom_lib` → `moodhaven_journal_lib`): Mechanical, in blast radius.

### Explicitly Out of Scope
- **Android gen files** (`src-tauri/gen/android/`): Generated artifacts, not hand-edited. Leave alone.
- **`.gstack/` reports**: Historical files, leave as-is.
- **Worktree files** (`.claude/worktrees/`): Leave as-is.

---

## Files to Touch (user-facing strings and metadata only)

### Metadata (3 files)
- `package.json` — `"name": "moodbloom"` → `"name": "moodhaven-journal"`
- `src-tauri/Cargo.toml` — `name = "moodbloom"` → `name = "moodhaven-journal"`, description update
- `src-tauri/tauri.conf.json` — `"productName": "MoodBloom"` → `"productName": "MoodHaven Journal"`, `"title": "MoodBloom"` → `"title": "MoodHaven Journal"`

### UI String Files (~20 files)
All `.tsx`/`.ts` files where "MoodBloom" appears as display text (not as an identifier or import):
- `src/components/setup/WelcomeStep.tsx`
- `src/components/setup/ImportStep.tsx`
- `src/components/setup/SourceStep.tsx`
- `src/components/setup/DevicesStep.tsx`
- `src/components/setup/SyncFromPeerStep.tsx`
- `src/components/breakout/BreakoutWriterApp.tsx`
- `src/components/stt/MicrophonePermissionModal.tsx`
- `src/components/stt/MicrophoneBlockedModal.tsx`
- `src/components/tutorial/TutorialWizard.tsx`
- `src/components/sync/SyncDetailsModal.tsx`
- `src/components/updater/UpdatePanel.tsx`
- `src/pages/LockScreen.tsx`
- `src/pages/SettingsPage.tsx`
- `src/lib/reminderService.ts`
- `src/lib/aiService.ts`
- `src/lib/webdavService.ts`
- `src/lib/cloudSyncService.ts`
- `src/lib/dataManagementService.ts`
- `src/lib/twoFactorService.ts`
- `src/lib/ouraService.ts`

### Documentation (~5 files)
- `SECURITY.md`
- `README.md` (if exists)
- `CLAUDE.md` (the AI assistant instructions)
- `TODOS.md`

---

## Approach

1. Grep every non-excluded file for `MoodBloom` (case-sensitive) and `moodbloom` (case-insensitive where it's a display string)
2. Apply replacements:
   - `MoodBloom` → `MoodHaven Journal` (product name in display contexts)
   - `MoodBloom` → `Moodbloom` (company name in "by Moodbloom" contexts — lowercase b)
3. Update metadata files directly
4. Do NOT touch identifiers, DB filename, protocol constants, generated files

---

## Tests

- `npm run typecheck` — should pass unchanged (no type changes)
- `cargo check` — should pass if Cargo.toml name changed correctly
- Existing test suite — should pass unchanged (tests don't assert app name strings)

---

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| App identifier change breaks existing installs | HIGH → deferred | Kept `com.moodbloom.app` for now |
| DB filename change loses existing data | HIGH → deferred | Kept `moodbloom.db` |
| Cargo crate rename breaks `lib.rs` | MEDIUM | Lib name `moodbloom_lib` → `moodhaven_journal_lib` only if safe |
| Missing a display-string occurrence | LOW | grep + manual review |
| Breaking a test that asserts a string | LOW | Test suite review |

---

---

## CEO Review — Phase 1

### 0A: Premise Challenge

| Premise | Status | Risk |
|---------|--------|------|
| P1: "MoodBloom" is wrong name; "MoodHaven Journal" is correct | Stated by user | None |
| P2: "Moodbloom" is company entity, "MoodHaven Journal" is product | Stated by user | None |
| P3: Defer app identifier change (was original) | **SUPERSEDED** — user confirmed no public users | Was valid for shipped apps; incorrect here |
| P4: Website is moodhaven.app | Stated by user | None |
| P5: "MoodHaven Journal by Moodbloom" is the correct compound name | Assumed | Length concern: 26 chars; OS docks truncate at ~15. Window title should use short form. |

### 0B: What Already Exists

| Sub-problem | Existing code |
|-------------|--------------|
| Display strings in UI | ~20 `.tsx`/`.ts` component files |
| Window title / productName | `tauri.conf.json` fields |
| App identifier | `tauri.conf.json` `"com.moodbloom.app"` |
| Database path | `db/mod.rs:468` `"moodbloom.db"` |
| mDNS service type | `peer_discovery.rs:26` `"_moodbloom._tcp.local."` |
| Sync protocol prefix | `peer_sync_engine.rs:241` `"moodbloom-sync-v1:"` |
| Restore pending files | `peer_sync_engine.rs:1037-1038`, `lib.rs:32` |
| Crate names | `Cargo.toml` `moodbloom`, `moodbloom_lib` |
| npm package name | `package.json` `"moodbloom"` |
| WebDAV directory + file ext | `webdavService.ts` `MOODBLOOM_DIR`, `.moodbloom` |
| Backup format version strings | `dataManagementService.ts` `moodbloom-encrypted-v1`, `moodbloom-full-v2` |
| Test assertions | `webdavService.test.ts`, `dataManagementService.test.ts` |
| Notification titles | `reminderService.ts:42,59` |

### 0C: Dream State Diagram

```
CURRENT STATE:
  GitHub repo: kenlacroix/moodhaven-journal ✓
  App display: "MoodBloom" ✗
  App identifier: com.moodbloom.app ✗
  Database: moodbloom.db ✗
  mDNS: _moodbloom._tcp.local ✗
  Sync protocol: "moodbloom-sync-v1:" ✗
  Crate: moodbloom / moodbloom_lib ✗
  WebDAV: /MoodBloom/ dir, .moodbloom extension ✗
  Export format: moodbloom-encrypted-v1 ✗
  Website: moodhaven.app ✓

THIS PLAN (expanded):
  All of the above corrected to moodhaven variants ✓
  Tests updated ✓
  typecheck + cargo check passing ✓

12-MONTH IDEAL:
  DESIGN.md exists (D-001 from TODOS)
  App published to stores with com.moodhaven.app identity
  No residual "moodbloom" references in source (excluding .gstack/ history)
```

### 0C-bis: Implementation Alternatives

| Approach | Effort | Risk | Completeness |
|----------|--------|------|------|
| A: Surface strings only (original plan) | CC: 10min | Low | 6/10 — identifier mismatch debt |
| **B: Full rename, no migration (THIS PLAN)** | **CC: 30min** | **Low — no real users** | **10/10** |
| C: Full rename + migration path for shipped apps | CC: 2h | Medium | 10/10 — but over-engineered for dev |

**Auto-decided: Option B** (P1 completeness + P2 boil lakes — user confirmed no public users).

### 0D: SELECTIVE EXPANSION — Scope Decisions

| Candidate | Blast Radius? | Decision | Principle |
|-----------|--------------|----------|-----------|
| App identifier rename | Yes — data dir | INCLUDE | P1, no users |
| DB filename rename | Yes — all DB ops | INCLUDE | P1, no users |
| mDNS service type | Yes — peer discovery | INCLUDE | P1, no users |
| Sync protocol prefix | Yes — peer sync key | INCLUDE | P1, no users |
| Restore file paths | Yes — peer sync restore | INCLUDE | P2, same files |
| Crate lib name | Yes — main.rs | INCLUDE | P2, mechanical |
| WebDAV dir + extension | Yes — cloud sync | INCLUDE | P1, no users |
| Format version strings | Yes — import logic | INCLUDE | P1, no users |
| Test file updates | Yes — CI | INCLUDE | P2, must stay green |
| TODOS.md / CLAUDE.md | Documentation | INCLUDE | P2, in blast radius |
| `.gstack/` reports | Historical records | EXCLUDE | Not source code |
| Android gen files | Build artifacts | EXCLUDE | Auto-generated |

### 0E: Temporal Interrogation

- **T+30min:** grep-replace all display strings across 20 UI files
- **T+45min:** Update metadata: package.json, Cargo.toml, tauri.conf.json
- **T+60min:** Update Rust technical identifiers: db path, mDNS, sync protocol, restore paths
- **T+75min:** Update WebDAV service + format version strings + all test files
- **T+90min:** `npm run typecheck` + `cargo check` + `npm test` — all green
- **T+120min:** PR created, reviewed, merged

### Error & Rescue Registry

| Error | Likelihood | Recovery |
|-------|-----------|----------|
| Cargo.toml lib name change breaks `main.rs` import | HIGH — easy to miss | Update `moodbloom_lib::run()` → `moodhaven_journal_lib::run()` in `main.rs` |
| Tauri capabilities JSON references old identifier | MEDIUM | Check `capabilities/default.json` for any `com.moodbloom` refs |
| Test assertions fail on old format strings | HIGH — confirmed in `dataManagementService.test.ts` | Update test strings in same PR |
| WebDAV test assertions fail on old dir/extension | HIGH — confirmed in `webdavService.test.ts` | Update test strings in same PR |
| Rustfmt or clippy flags lib name warning | LOW | Accept new name in Cargo.toml |
| Android build breaks (gen files still reference old id) | MEDIUM | Android gen files are regenerated by `tauri android init`; flag in PR notes |

### Failure Modes Registry

| Failure | Severity | Flag |
|---------|----------|------|
| Missing a "MoodBloom" occurrence in a UI file | Medium | Full grep audit before PR |
| Breaking a format version check (`moodbloom-encrypted-v1`) without updating importer logic | HIGH | `importData()` checks format string — must update both the writer and the reader |
| mDNS instance name still uses old prefix `moodbloom-{deviceId}` in `peer_discovery.rs:417` | Medium | Included in scope |
| `speech_to_text.rs` security test uses `"../../moodbloom.db"` — still valid after rename | Low | Test still passes (path traversal check doesn't depend on actual DB name), but update for clarity |

### NOT in scope (deferred)
- D-001 DESIGN.md creation (unrelated to rename)
- F-001 credential encryption (security hardening, unrelated)
- A-12, A-13, A-15, A-16 STT follow-ups (unrelated)
- Android gen files regeneration (build-time artifact)

### CEO Completion Summary

```
CEO REVIEW — FINAL SUMMARY
══════════════════════════════════════════════════════
  Scope decision:     FULL RENAME — no public users confirmed
  Critical issues:    1 (format version string needs reader+writer update)
  High issues:        2 (Cargo lib name → main.rs; test assertions)
  Medium issues:      2 (Android gen files; missing occurrence risk)
  Scope expansions:   9 (all auto-approved via P1/P2)
  Auto-decisions:     10
  Taste decisions:    0
  Status:             APPROVED (premise gate confirmed)
══════════════════════════════════════════════════════
```

---

## Design Review — Phase 2

### Step 0: Design Scope

DESIGN.md: Not present (D-001 outstanding).
Existing patterns inferred from codebase inspection.

UI impact of this rename:
- App name "MoodHaven Journal" (17 chars) vs "MoodBloom" (9 chars) — 89% longer
- Compound tagline "by Moodbloom" appears in WelcomeStep and About contexts
- Window title in OS taskbar/dock uses `productName`
- Notification title changes

Design litmus — scope rating: **6/10**
Plan covers what to change but doesn't specify:
- Whether short form ("MoodHaven") should be used in space-constrained contexts
- How "by Moodbloom" is typeset (same size? muted? separate line?)
- Whether notification title uses "MoodHaven Journal" or "MoodHaven"

### Pass 1: Information Hierarchy

**Rating: 7/10.** "MoodHaven Journal" establishes clear product identity. "by Moodbloom" correctly subordinates the company name. The longer product name may cause truncation in system contexts (dock labels ~12 chars on macOS, taskbar on Windows).

**Finding:** `productName` in `tauri.conf.json` affects the OS-level app name. "MoodHaven Journal" (17 chars) will be truncated to "MoodHaven Jour…" in macOS dock. **Recommendation: Use `"productName": "MoodHaven"` for OS identity** and reserve "MoodHaven Journal" for in-app display (welcome screen, about page). Auto-decided (P5 explicit).

### Pass 2: Missing States

**Rating: 8/10.** The rename doesn't introduce new states — it's a text swap. No loading states, empty states, or error states are affected. No gaps found.

### Pass 3: User Journey

**Rating: 8/10.** First-run wizard WelcomeStep uses the app name as heading — "MoodHaven Journal" reads naturally and is more descriptive than "MoodBloom". Lock screen ("Unlock MoodHaven Journal") is slightly verbose but acceptable.

**Finding:** `BreakoutWriterApp.tsx` header currently says "MoodBloom Writer" → "MoodHaven Journal Writer" (22 chars) in a compact header `h1`. Consider "MoodHaven Writer" for the breakout window. Auto-decided: use "MoodHaven Writer" in the breakout window only (P5 explicit over verbose). TASTE: user may want "MoodHaven Journal Writer" for consistency.

### Pass 4: Specificity

**Rating: 7/10.** The plan lists files to touch but doesn't specify the short-form vs full-form rule. This gap is now explicit.

**Recommendation added to plan:**
- OS-level (productName, window title, notifications): `"MoodHaven"` (short)
- In-app display text (headings, welcome, about): `"MoodHaven Journal"`
- Company attribution: `"by Moodbloom"` (lowercase b on "by", lowercase b on Bloom)

### Pass 5–7: Aesthetic / Motion / Accessibility

**Rating: N/A for this change.** No visual design, color, spacing, or motion changes. The rename is copy-only. Accessibility unaffected (no aria-label changes required — labels reference function, not brand name).

### Design Litmus Scorecard

```
DESIGN DUAL VOICES — CONSENSUS TABLE:
═══════════════════════════════════════════════════════════════
  Dimension                        Claude  Codex   Consensus
  ─────────────────────────────── ─────── ──────── ──────────
  1. Name length in OS contexts    RISK     N/A    FLAGGED→FIXED
  2. Short vs full form rule       MISSING  N/A    ADDED
  3. Breakout writer header        VERBOSE  N/A    FIXED
  4. Notification copy             OK       N/A    OK
  5. Company attribution style     UNCLEAR  N/A    CLARIFIED
  6. Missing states                OK       N/A    CONFIRMED OK
  7. Accessibility                 OK       N/A    CONFIRMED OK
═══════════════════════════════════════════════════════════════
Codex unavailable — single-model review.
```

### Design Completion Summary

```
DESIGN REVIEW — FINAL SUMMARY
══════════════════════════════════════════════════════
  Critical:    0
  High:        1 (OS productName length → use "MoodHaven")
  Medium:      1 (Breakout writer header → use "MoodHaven Writer")
  Auto-decided: 2
  Taste:       1 (breakout header: "MoodHaven Writer" vs full name)
  Status:      APPROVED with 2 auto-fixes applied to plan
══════════════════════════════════════════════════════
```

---

## Engineering Review — Phase 3

### Step 0: Scope Challenge

Reading actual code. Blast radius:

```
COMPONENT DEPENDENCY MAP:
══════════════════════════════════════════════════════════════
  package.json (name)
      └── npm publish / vite build reference (internal)
  Cargo.toml (name = "moodbloom")
      └── src-tauri/src/main.rs: moodbloom_lib::run()
  Cargo.toml (name = "moodbloom_lib")
      └── src-tauri/src/lib.rs (crate root)
  tauri.conf.json (productName, identifier, title)
      └── OS: window title, app data dir path, bundle identifier
  db/mod.rs:468 ("moodbloom.db")
      └── ALL database read/write operations
  peer_discovery.rs:26 (SERVICE_TYPE)
      └── mDNS broadcast + discovery listeners
  peer_discovery.rs:417 (instance name prefix)
      └── mDNS registration record
  peer_sync_engine.rs:241 ("moodbloom-sync-v1:")
      └── Transport key derivation (ALL sync sessions)
  peer_sync_engine.rs:266 ("moodbloom-sync-v2:")
      └── Transport key derivation v2
  peer_sync_engine.rs:1037-1038, lib.rs:32 (restore paths)
      └── Peer full restore flow
  webdavService.ts (MOODBLOOM_DIR, .moodbloom)
      └── All WebDAV backup/restore file paths
  dataManagementService.ts (format version strings)
      └── Export writer AND import reader (format verification)
  cloudSyncService.ts (backup filename generator)
      └── WebDAV backup filenames
══════════════════════════════════════════════════════════════
```

### Section 1: Architecture

No architectural changes — this is a pure rename. The dependency graph above shows which modules each identifier touches. All changes are surgical: find-and-replace with awareness of semantic vs. display contexts.

**Critical path:** `Cargo.toml` lib name → `main.rs` import — must be changed atomically in the same edit.

**Critical path 2:** `dataManagementService.ts` format string — reader AND writer must be updated together. If only the writer changes, newly exported files can't be re-imported (or vice versa). Both `ENCRYPTED_EXPORT_VERSION` and `FULL_EXPORT_VERSION` constants plus the import check at line 67 must all change in the same commit.

```
ASCII Dependency: dataManagementService.ts format strings
  exportData() → writes format: 'moodhaven-encrypted-v1'  ← MUST MATCH
  importData() → checks format === 'moodhaven-encrypted-v1' ← MUST MATCH

  Tests: dataManagementService.test.ts
    line 35: toBe('moodbloom-encrypted-v1')  ← UPDATE
    line 68: format: 'moodbloom-encrypted-v1'  ← UPDATE
    line 90: format: 'moodbloom-encrypted-v1'  ← UPDATE
```

### Section 2: Code Quality

- No DRY violations introduced by this change.
- `MOODBLOOM_DIR` constant in `webdavService.ts` should become `MOODHAVEN_DIR` — rename the constant, not just the string value.
- `ENCRYPTED_EXPORT_VERSION` and `FULL_EXPORT_VERSION` — the constant names are fine (not branded), just update their string values.
- Rust: the `moodbloom_lib` crate rename is the only naming convention change; `moodhaven_journal_lib` follows Rust crate naming (underscores). Could also use `moodhaven_lib` (shorter). Auto-decided: `moodhaven_journal_lib` (P1 completeness, aligns with npm package name pattern).

### Section 3: Test Review — FULL ANALYSIS

**Test diagram — changed code → test coverage:**

| Changed Item | Test File | Existing Coverage | Gap? |
|-------------|-----------|------------------|------|
| webdavService.ts `MOODBLOOM_DIR` | `webdavService.test.ts:54-124` | Yes — asserts `'MoodBloom'` dir and `.moodbloom` ext | UPDATE required |
| dataManagementService.ts format strings | `dataManagementService.test.ts:35,68,90` | Yes — asserts `'moodbloom-encrypted-v1'` | UPDATE required |
| reminderService.ts notification title | `reminderService.test.ts` | Check needed | Likely no string assertion |
| cloudSyncService.ts backup filename | `cloudSyncService.test.ts` | Check needed | Likely no string assertion |
| UI component strings | Component test files | No — tests use renders/queries | No update needed |
| Rust identifiers | None (no Rust tests in scope) | N/A | N/A |
| speech_to_text.rs security test | `src-tauri/src/commands/speech_to_text.rs:794` | Security path traversal test uses `"../../moodbloom.db"` | Update string for clarity but test still passes |

**Test files confirmed needing updates:**
1. `src/lib/webdavService.test.ts` — 20+ assertions on directory name and file extension
2. `src/lib/dataManagementService.test.ts` — 3 assertions on format version string

**New tests needed:** None — this is a rename, not a behavior change. All existing test assertions will be valid after the string updates.

**CI risk:** If tests are run before the string updates, they will fail on `webdavService.test.ts` and `dataManagementService.test.ts`. Tests must be updated in the same PR as the source changes.

### Section 4: Performance

No performance implications — pure string constants, no runtime computation changes.

### Failure Modes Registry (Eng additions)

| Failure Mode | Severity | Mitigation |
|-------------|----------|-----------|
| `main.rs` still calls `moodbloom_lib::run()` after crate rename | CRITICAL | Atomic edit: Cargo.toml + main.rs in same step |
| dataManagementService format string writer/reader mismatch | HIGH | Same: update both constants + the import check at line 67 |
| webdavService.test.ts not updated | HIGH | Part of scope |
| `peer_sync_engine.rs:266` has `moodbloom-sync-v2:` (less common path) | MEDIUM | Included in scope; note it's a second protocol version |
| Tauri capabilities JSON has no identifier refs (confirmed clean) | N/A | Verified — `capabilities/default.json` uses command identifiers, not app identifier |
| Android gen files still reference `com.moodbloom.app` | LOW | Build-only, flag in PR notes; regenerated by `tauri android init` |

### Eng Completion Summary

```
ENG REVIEW — FINAL SUMMARY
══════════════════════════════════════════════════════
  Critical:     2 (main.rs crate name; format version atomicity)
  High:         2 (test files must be updated; peer_sync_engine v2 prefix)
  Medium:       1 (Android gen files)
  Low:          1 (speech_to_text.rs security test string)
  Test gaps:    0 (all covered — updates required, not new tests)
  Auto-decisions: 4
  Taste decisions: 0
  Status:       APPROVED with critical path documented
══════════════════════════════════════════════════════

ENG DUAL VOICES — CONSENSUS TABLE:
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Architecture sound?               YES      N/A    YES
  2. Test coverage sufficient?         YES*     N/A    YES* (updates needed)
  3. Performance risks addressed?      N/A      N/A    N/A
  4. Security threats covered?         OK       N/A    OK
  5. Error paths handled?              FLAGGED  N/A    FLAGGED→FIXED
  6. Deployment risk manageable?       LOW      N/A    LOW
═══════════════════════════════════════════════════════════════
Codex unavailable — single-model review.
```

---

## Cross-Phase Themes

**Theme: Atomicity is the main risk.** Flagged independently in CEO and Eng phases.
- CEO: writer and reader for format version string must change together.
- Eng: Cargo.toml crate rename + main.rs import must change atomically.
- Both point to the same implementation discipline: change interrelated pairs in the same edit, not sequentially.

**Theme: No public users = full rename.** The CEO premise gate confirmed zero risk for the expanded scope. The Eng phase confirmed zero migration complexity as a result.

---

## Implementation File List (Complete)

### Round 1 — Metadata + OS identity (do first, sets crate name)
1. `src-tauri/Cargo.toml` — `name = "moodhaven-journal"`, `name = "moodhaven_journal_lib"`, description
2. `src-tauri/src/main.rs` — `moodhaven_journal_lib::run()` **(atomic with Cargo.toml)**
3. `src-tauri/tauri.conf.json` — `productName: "MoodHaven"`, `identifier: "com.moodhaven.app"`, `title: "MoodHaven"`
4. `package.json` — `name: "moodhaven-journal"`, description

### Round 2 — Rust technical identifiers
5. `src-tauri/src/db/mod.rs` — `"moodhaven.db"`
6. `src-tauri/src/commands/peer_discovery.rs` — `"_moodhaven._tcp.local."`, `"moodhaven-{}"` instance name
7. `src-tauri/src/commands/peer_sync_engine.rs` — `"moodhaven-sync-v1:"`, `"moodhaven-sync-v2:"`, restore file paths
8. `src-tauri/src/lib.rs` — `"moodhaven_restore.pending"`

### Round 3 — Frontend technical (WebDAV + data management) **(atomic pairs)**
9. `src/lib/webdavService.ts` — `MOODHAVEN_DIR = 'MoodHaven'`, `.moodhaven` extension
10. `src/lib/webdavService.test.ts` — update all assertions **(atomic with #9)**
11. `src/lib/dataManagementService.ts` — `ENCRYPTED_EXPORT_VERSION = 'moodhaven-encrypted-v1'`, `FULL_EXPORT_VERSION = 'moodhaven-full-v2'`, import check at line 67, file extension filter, backup filename pattern
12. `src/lib/dataManagementService.test.ts` — update assertions **(atomic with #11)**
13. `src/lib/cloudSyncService.ts` — backup filename if hardcoded

### Round 4 — UI display strings
14. `src/lib/reminderService.ts` — notification titles → `"MoodHaven"`
15. `src/components/setup/WelcomeStep.tsx` — `"MoodHaven Journal"`
16. `src/components/setup/ImportStep.tsx`
17. `src/components/setup/SourceStep.tsx`
18. `src/components/setup/DevicesStep.tsx`
19. `src/components/setup/SyncFromPeerStep.tsx`
20. `src/components/breakout/BreakoutWriterApp.tsx` — use `"MoodHaven Writer"` (short form in compact header)
21. `src/components/stt/MicrophonePermissionModal.tsx`
22. `src/components/stt/MicrophoneBlockedModal.tsx`
23. `src/components/tutorial/TutorialWizard.tsx`
24. `src/components/sync/SyncDetailsModal.tsx`
25. `src/components/updater/UpdatePanel.tsx`
26. `src/pages/LockScreen.tsx`
27. `src/pages/SettingsPage.tsx`
28. `src/lib/aiService.ts`
29. `src/lib/twoFactorService.ts`
30. `src/lib/ouraService.ts`

### Round 5 — Documentation
31. `CLAUDE.md` — all "MoodBloom" references
32. `TODOS.md` — all "MoodBloom" references
33. `SECURITY.md` — all "MoodBloom" references

---

## Design Decisions Applied

| Context | Use |
|---------|-----|
| `productName` (OS dock, taskbar) | `MoodHaven` |
| `title` (window title bar) | `MoodHaven` |
| Notification title | `MoodHaven` |
| In-app headings / welcome | `MoodHaven Journal` |
| About / attribution | `MoodHaven Journal by Moodbloom` |
| Breakout writer window header | `MoodHaven Writer` |
| Notification reminders | `MoodHaven` |

---

## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | CEO | Expand scope to full rename | P1+P2 | User confirmed no public users — zero migration risk | Surface-only rename |
| 2 | CEO | Include DB filename rename | P1 | Dev only — `moodhaven.db` is clean | Defer |
| 3 | CEO | Include mDNS service type rename | P1 | Dev only — all instances updated together | Defer |
| 4 | CEO | Include sync protocol prefix rename | P1 | Dev only — no cross-version compat needed | Defer |
| 5 | CEO | Include restore file path rename | P2 | Same files, mechanical | Defer |
| 6 | CEO | Include format version strings rename | P1 | Dev only — no existing backup files to import | Keep old strings |
| 7 | CEO | Include crate lib name rename | P2 | In blast radius, mechanical | Defer |
| 8 | CEO | Include WebDAV dir + extension rename | P1 | Dev only — no existing cloud backups | Defer |
| 9 | CEO | Include test file updates | P2 | Tests must stay green | Defer |
| 10 | Design | `productName`/title use short form "MoodHaven" | P5 | OS truncation at ~12-15 chars | Full product name |
| 11 | Design | Breakout window uses "MoodHaven Writer" | P5 | Compact header — full name is 22 chars | "MoodHaven Journal Writer" |
| 12 | Eng | `moodhaven_journal_lib` crate name | P1 | Aligns with npm pattern | `moodhaven_lib` (shorter) |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/autoplan` | Scope & strategy — premise gate | 1 | clean | 10 scope expansions auto-approved (no public users); 0 taste decisions |
| Claude Subagent (CEO) | auto | Independent strategic voice | 1 | issues_open→resolved | Flagged half-measure plan; resolved by expanding scope |
| Design Review | `/autoplan` (UI scope detected) | Name length in OS contexts | 1 | clean | 2 auto-decided: `productName="MoodHaven"` (short); breakout header = "MoodHaven Writer" |
| Eng Review | `/autoplan` | Architecture, atomicity, test coverage | 1 | clean | 2 critical paths documented; 2 test files requiring updates identified |

**VERDICT:** APPROVED — 12 auto-decisions, 0 taste decisions, 1 premise gate confirmed by user. Ready for `/ship` after implementation.
