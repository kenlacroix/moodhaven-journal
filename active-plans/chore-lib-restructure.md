# Plan: src/lib/ Restructure

## Summary
Reorganise `src/lib/` from a flat 40-file directory into two subdirectories.
No behaviour changes. Imports only.

## Motivation
`src/lib/` currently has ~40 files. Services (IPC wrappers, stateful logic) and
pure utilities are mixed at the same level, making it hard to navigate and reason
about dependency direction. Splitting into `services/` and `utils/` enforces a
clean boundary: hooks may import from both; utils must NOT import from services.

## Target Layout

```
src/lib/
├── index.ts                   (barrel — updated exports)
├── services/                  (IPC wrappers + stateful modules)
│   ├── aiService.ts
│   ├── analyticsService.ts
│   ├── biometricService.ts
│   ├── booksService.ts
│   ├── cloudSyncService.ts
│   ├── crypto.ts
│   ├── dataManagementService.ts
│   ├── deviceIdentity.ts
│   ├── hardwareKeyService.ts
│   ├── journalService.ts
│   ├── locationWeatherService.ts
│   ├── logger.ts
│   ├── mediaService.ts
│   ├── ouraService.ts
│   ├── peerDiscoveryService.ts
│   ├── peerPairingService.ts
│   ├── peerSyncEngineService.ts
│   ├── rateLimitService.ts
│   ├── recoveryKeyService.ts
│   ├── reminderService.ts
│   ├── secureStorage.ts
│   ├── settingsService.ts
│   ├── signalService.ts
│   ├── speechToTextService.ts
│   ├── syncEngine.ts
│   ├── syncManifest.ts
│   ├── timeCapsuleService.ts
│   ├── twoFactorService.ts
│   ├── updaterService.ts
│   ├── voiceMemoService.ts
│   ├── webdavService.ts
│   └── windowUtils.ts
└── utils/                     (pure, stateless utilities)
    ├── chartUtils.ts
    ├── dateUtils.ts
    ├── journalTemplates.ts
    ├── markdownUtils.ts
    ├── metadataExtractor.ts
    ├── transcriptFormatter.ts
    └── writingUtils.ts
```

Co-located test files (`*.test.ts`) move with their source.

## Classification Notes
- `syncEngine.ts` + `syncManifest.ts`: not in original context prompt but exist in
  `src/lib/`. Both are service-tier (WebDAV sync orchestration) → `services/`.
- `crypto.ts`, `logger.ts`, `deviceIdentity.ts`, `secureStorage.ts`, `windowUtils.ts`:
  not `*Service.ts` by name but stateful / IPC-adjacent → `services/`.

## Steps

**Four import categories** need updating — all four must be addressed before typecheck will pass.

1. `mkdir src/lib/services src/lib/utils`
2. Move all files with `git mv` (preserves history); test files move with source
3. **Type 1 — External imports** (65 files outside `src/lib/`):
   Grep for `'../lib/'` and `'../../lib/'` across `src/`.
   Update each to add the correct subdir: `../lib/foo` → `../lib/services/foo` or `../lib/utils/foo`.
4. **Type 2 — Intra-lib cross-subdir** (5 files; missed by Type 1 grep, use `./foo` patterns):
   - `services/aiService.ts`: `./transcriptFormatter` → `../utils/transcriptFormatter`
   - `services/analyticsService.ts`: `./dateUtils` → `../utils/dateUtils`
   - `services/journalService.ts`: `./markdownUtils` → `../utils/markdownUtils`
   - `services/speechToTextService.ts`: `./transcriptFormatter` → `../utils/transcriptFormatter`
   - `index.ts` (root barrel): `./dateUtils` → `./utils/dateUtils`, etc.
5. **Type 3 — Parent-relative type imports** (22 files; `../types/foo` becomes `../../types/foo` after depth change):
   All these files are in `services/` or `utils/` after the move — the extra nesting level
   means `../types/` now resolves to `src/lib/types/` (wrong). Fix: `../types/` → `../../types/`.
   Files: `aiService.ts`, `aiService.test.ts`, `analyticsService.ts`, `booksService.ts`,
   `chartUtils.ts`, `cloudSyncService.ts`, `journalService.ts`, `locationWeatherService.ts`,
   `mediaService.ts`, `metadataExtractor.test.ts`, `metadataExtractor.ts`, `ouraService.ts`,
   `peerDiscoveryService.ts`, `peerPairingService.ts`, `reminderService.test.ts`,
   `reminderService.ts`, `settingsService.ts`, `signalService.ts`, `speechToTextService.ts`,
   `syncEngine.ts`, `twoFactorService.ts`, `webdavService.ts`
6. **Type 4 — Self-referential logger imports** (3 files use `'../lib/logger'` instead of `'./logger'`):
   These currently resolve correctly from `src/lib/` but will break from `src/lib/services/`.
   Fix: change to `'./logger'` in all three files:
   - `services/settingsService.ts`
   - `services/speechToTextService.ts`
   - `services/webdavService.ts`
7. Update `src/lib/index.ts` barrel — update all 5 re-export paths to include subdir prefix
8. `npm run typecheck` — must pass with 0 errors
9. `npm test` — must pass all 550 tests

## Out of Scope
- No changes to Rust backend
- No renaming of modules or functions
- No changes to test logic

## Success Criteria
- `npm run typecheck` exits 0
- `npm test` all 550 tests pass
- No import left pointing at old flat `src/lib/` paths (except `index.ts` barrel)

---

## CEO Review (Phase 1)

**Mode:** HOLD SCOPE (refactor — no expansion)

### Premises
- Premise 1: Flat 40-file dir causes navigation friction. **Valid** — confirmed by inspection.
- Premise 2: services/utils split enforces dependency direction. **Valid** — utils/ has zero service imports (verified).
- Premise 3: `crypto.ts`, `logger.ts`, `secureStorage.ts`, `windowUtils.ts`, `deviceIdentity.ts` belong in services/ despite not being `*Service.ts` files. **Reasonable** — all are IPC-adjacent or stateful. Document this rule in CLAUDE.md to prevent future misclassification.

### Dream State
```
CURRENT: 40 files flat — hard to navigate, no boundary signal
THIS PLAN: services/ (32) + utils/ (7) + index.ts at root
12-MONTH IDEAL: Same structure + CLAUDE.md documents the rule:
  "utils/ = pure functions, no IPC. services/ = IPC wrappers or stateful."
```

### Architecture
Dependency direction after restructure:
```
hooks/ ─────────────────────────┐
components/ ─────────────────── ▼
stores/ ──────────────► src/lib/services/ ──► src/lib/utils/
features/ ──────────────────────┘
              ▲
              └── src/lib/index.ts (barrel, stays at root)
```
Rule: utils/ MUST NOT import from services/. Verified: no violations in current code.

### Gaps Found
| # | Finding | Severity | Fix |
|---|---------|----------|-----|
| 1 | Step 3 grep misses 5 intra-lib cross-subdir `./foo` imports | HIGH | Added as Type 2 in Steps |
| 2 | Step 3 grep misses 22 files with `../types/` imports (depth change breaks them) | HIGH | Added as Type 3 in Steps |
| 3 | 3 files have pre-existing `../lib/logger` oddity that will break after move | MEDIUM | Added as Type 4 in Steps |
| 4 | `syncEngine.ts`, `syncManifest.ts` absent from original context prompt | MEDIUM | Added to services/; documented in Classification Notes |
| 5 | No CLAUDE.md rule for borderline files (crypto, logger, etc.) | LOW | Defer to follow-up |

### Error & Rescue
All errors are caught by the verification chain:
- Missed import → `npm run typecheck` exits non-zero
- Wrong path → same
- Test file separated from source → `npm test` fails with module not found

No runtime behavior changes — no new error paths.

### Security
No new attack surface. Zero net change to runtime behavior.

### Rollback
`git revert` of the commit restores all files and imports. Two-way door.

### NOT In Scope
- Updating CLAUDE.md with services/utils rule (low priority, separate commit)
- Adding barrel re-exports for all services/ files (not needed — direct imports work)
- Renaming any modules

---

## Eng Review (Phase 3)

### Scope Check
- Files touched: ~92 (65 external + 22 types + 5 intra-lib + 3 self-ref + 1 barrel + moved files)
- New classes/services introduced: 0
- New abstractions: 0
- This is pure mechanical change. Complexity check: passes.

### Architecture Diagram
```
BEFORE:
src/
├── lib/
│   ├── aiService.ts ─────── imports '../types/ai', './transcriptFormatter'
│   ├── transcriptFormatter.ts
│   ├── dateUtils.ts
│   ├── crypto.ts
│   └── [37 more files flat]
└── hooks/ ── imports '../lib/aiService', '../lib/dateUtils', ...

AFTER:
src/
├── lib/
│   ├── index.ts             (barrel: ./services/foo, ./utils/foo)
│   ├── services/
│   │   ├── aiService.ts ─── imports '../../types/ai', '../utils/transcriptFormatter'
│   │   ├── crypto.ts
│   │   └── [30 more]
│   └── utils/
│       ├── transcriptFormatter.ts
│       ├── dateUtils.ts
│       └── [5 more]
└── hooks/ ── imports '../lib/services/aiService', '../lib/utils/dateUtils', ...
              OR '../lib' (barrel, unchanged)

Rule enforced: utils/ has zero imports from services/ (verified by grep, 0 violations)
```

### Test Diagram
```
This is a file-move refactor — no new logic, no new codepaths.
Existing 550 tests serve as the full verification suite.

Test file moves (19 test files, co-located with source):
  services/aiService.test.ts ──► tests aiService.ts ✓
  services/analyticsService.test.ts ──► tests analyticsService.ts ✓
  services/cloudSyncService.test.ts ──► tests cloudSyncService.ts ✓
  services/crypto.test.ts ──► tests crypto.ts ✓
  services/dataManagementService.test.ts ──► tests dataManagementService.ts ✓
  services/journalService.test.ts ──► tests journalService.ts ✓
  services/logger.test.ts ──► tests logger.ts ✓
  services/rateLimitService.test.ts ──► tests rateLimitService.ts ✓
  services/recoveryKeyService.test.ts ──► tests recoveryKeyService.ts ✓
  services/reminderService.test.ts ──► tests reminderService.ts ✓
  services/secureStorage.test.ts ──► tests secureStorage.ts ✓
  services/timeCapsuleService.test.ts ──► tests timeCapsuleService.ts ✓
  services/webdavService.test.ts ──► tests webdavService.ts ✓
  utils/chartUtils.test.ts ──► tests chartUtils.ts ✓
  utils/dateUtils.test.ts ──► tests dateUtils.ts ✓
  utils/journalTemplates.test.ts ──► tests journalTemplates.ts ✓
  utils/metadataExtractor.test.ts ──► tests metadataExtractor.ts ✓
  utils/transcriptFormatter.test.ts ──► tests transcriptFormatter.ts ✓
  utils/writingUtils.test.ts ──► tests writingUtils.ts ✓

Test discovery: vitest `include: ['src/**/*.test.{ts,tsx}']` — glob covers subdirs ✓
Coverage: `src/lib/**` — covers services/ and utils/ ✓

New tests needed: NONE — any import error is a compile-time failure, not runtime
```

### Code Quality
- DRY: no violations introduced
- The `../lib/logger` oddity in 3 files is fixed as part of this PR (Type 4) — this is a cleanup win
- 20 untested files: pre-existing gap, not introduced here

### Performance
No runtime change. Zero performance impact.

### Failure Modes
| Failure | Detection | Recovery |
|---------|-----------|---------|
| Missed import of any type | `npm run typecheck` fails | Fix the import, re-run |
| Test file not moved with source | `npm test` fails (module not found) | Move the file |
| Wrong subdir classification | Type error if utils imports services | Fix the import |
| git mv loses file | Unlikely; git mv is atomic | `git status` shows the issue |

### Eng Completion Summary
- Architecture: 2/2 gaps resolved (intra-lib + type imports — both fixed in Steps)
- Code quality: 1 improvement (../lib/logger oddity fixed)
- Tests: existing 550 tests are the verification; no new tests needed
- Deployment: frontend-only, no build changes, no Rust changes
- Risk: LOW — all errors are compile-time, typecheck is the gate

---

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | CEO | HOLD SCOPE — no expansion | P3 (pragmatic) | Refactor default per skill rules | Expansion (not applicable) |
| 2 | CEO | syncEngine.ts + syncManifest.ts → services/ | P5 (explicit) | Both are WebDAV sync orchestration — service-tier | utils/ (wrong: they're IPC-adjacent) |
| 3 | CEO | Physical subdirs over TS path aliases | P5 (explicit) | Aliases are hidden magic; new contributors won't know to look in tsconfig | Alias approach (deceptive) |
| 4 | CEO | Flag Type 3 (../types/) gap as HIGH in plan | P5 (explicit) | 22 files would have silent broken imports without explicit callout | Silent fix during impl |
| 5 | CEO | Flag Type 4 (../lib/logger) as fix | P1 (completeness) | Pre-existing oddity becomes a bug after the move; fix it in the same PR | Leave as-is (creates bugs) |
| 6 | Eng | No new tests required | P3 (pragmatic) | All errors are compile-time; 550 existing tests are sufficient | New tests (nothing new to test) |

---

## GSTACK REVIEW REPORT

| Review | Trigger | Runs | Status | Findings |
|--------|---------|------|--------|----------|
| CEO Review | /autoplan Phase 1 | 1 | clean | 5 gaps found + resolved |
| Design Review | skipped (no UI scope) | 0 | — | — |
| Eng Review | /autoplan Phase 3 | 1 | clean | 2 critical gaps + resolved |
| Codex Review | unavailable | 0 | — | single-model mode |

**VERDICT:** APPROVED — all gaps resolved in plan. Ready for implementation.
