# Plan: plans/ Directory Consolidation

## Summary
Clarify the two-plans-directory situation by renaming `plans/` → `active-plans/`.
One rename, one gitignore comment, one CLAUDE.md line update.

## Current State
```
plans/                    — git-tracked, 3 active in-flight plans
  feat-logging-debug.md
  feat-log-level-selector.md
  rename-moodhaven-journal.md

docs/internal/plans/      — gitignored, 3 completed/archived plans
  db-performance.md
  settings_refactor.md
  writingview.md
```

The name `plans/` gives no signal about status (active vs archived). A new contributor
sees two directories with no obvious distinction.

## Chosen Option: A — Rename root plans/ → active-plans/

**What changes:**
1. `git mv plans/ active-plans/` (preserves git history on the 3 plan files)
2. `.gitignore`: update comment on `ceo-plans/` line or add a note clarifying
   `active-plans/` is tracked, `docs/internal/plans/` is not
3. `CLAUDE.md` Key Files table: no current entry for `plans/` — add
   `active-plans/` row referencing it as the active plan location

**What stays the same:**
- `docs/internal/plans/` remains gitignored (no change)
- Plan file contents untouched
- No redirect or alias needed

## Options Considered
| Option | Effort | Disruption | Clarity |
|--------|--------|------------|---------|
| A) Rename plans/ → active-plans/ | 5 min | None | High |
| B) Unify into docs/internal/plans/ | 15 min | Loses git tracking | Medium |
| C) Do nothing | 0 | None | Low |

Option A chosen: minimal change, maximum signal.

## Steps
1. `git mv plans/ active-plans/`
2. Update `.gitignore`: add comment clarifying `active-plans/` is tracked
3. Update `CLAUDE.md`: add `active-plans/` to Key Files table
4. Commit as `chore: rename plans/ → active-plans/ for clarity`

## Success Criteria
- `git ls-files active-plans/` shows 3 files
- `git ls-files plans/` is empty
- `.gitignore` comment updated
- `CLAUDE.md` Key Files table references `active-plans/`

---

## CEO Review (Phase 1)

**Mode:** HOLD SCOPE (chore rename)

### Premises
- Premise 1: `plans/` naming is ambiguous. **Valid** — `docs/internal/plans/` exists simultaneously with no status signal.
- Premise 2: Preserving git tracking on active plans is worth the two-dir split. **Valid** — reviewers can see in-flight plans in PR diffs.
- Premise 3: Option A (rename) is lower risk than Option B (unify). **Valid** — Option B silently removes git tracking.

### Dream State
```
CURRENT: plans/ (tracked) and docs/internal/plans/ (ignored) — confusing
THIS PLAN: active-plans/ (tracked, explicit) and docs/internal/plans/ (ignored, archived)
12-MONTH IDEAL: Same. Every new plan goes into active-plans/. CLAUDE.md points there.
```

### Architecture
No code changes. Pure filesystem + config operation.

### Gaps Found
| # | Finding | Severity | Fix |
|---|---------|----------|-----|
| 1 | CLAUDE.md Key Files table has no current `plans/` entry | LOW | Step 3 adds it — add `active-plans/` row |
| 2 | `.gitignore` has `ceo-plans/` (gitignored gstack dir) but no mention of `active-plans/` being intentionally tracked | LOW | Add a one-line comment in .gitignore clarifying `active-plans/` is tracked |

### Error & Rescue
- `git mv` preserves history on all 3 plan files.
- If any tool (e.g. a script) references `plans/` by hardcoded path, it will break. Check: no scripts reference `plans/` (confirmed: `scripts/` dir removed in prior cleanup).

### Rollback
`git mv active-plans/ plans/` restores the original state. Two-way door.

### NOT In Scope
- Moving `docs/internal/plans/` contents (stay archived/gitignored)
- Updating any CI/CD references (none exist)

---

## Eng Review (Phase 3)

### Scope Check
Files touched: 3 (`.gitignore`, `CLAUDE.md`, and the `git mv` which tracks 3 plan files).
No new code. No new logic. No complexity.

### Architecture Diagram
```
BEFORE:
  plans/                    [tracked]
    feat-logging-debug.md
    feat-log-level-selector.md
    rename-moodhaven-journal.md
  docs/internal/plans/      [gitignored]
    db-performance.md
    settings_refactor.md
    writingview.md

AFTER:
  active-plans/             [tracked — explicit status signal]
    feat-logging-debug.md
    feat-log-level-selector.md
    rename-moodhaven-journal.md
  docs/internal/plans/      [gitignored — no change]
    db-performance.md
    settings_refactor.md
    writingview.md
```

### Test Diagram
No tests needed. This is a git mv + 2 text file edits.
Verification: `git ls-files active-plans/` returns 3 files.

### Failure Modes
| Failure | Detection | Recovery |
|---------|-----------|---------|
| `plans/` not in gitignore and accidentally re-created | `git status` shows untracked | Add to .gitignore |
| CLAUDE.md edit introduces typo | Visual inspection | Fix the line |

### Eng Completion Summary
- Clean — no risks, no new tests, no code changes.

---

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | CEO | HOLD SCOPE — Option A (rename) | P3 (pragmatic) | One rename, zero disruption | B (loses git tracking), C (no change) |
| 2 | CEO | Add `active-plans/` to CLAUDE.md Key Files | P1 (completeness) | Without it, new contributors don't know where plans go | Skip CLAUDE.md update |
| 3 | Eng | Add .gitignore clarifying comment | P5 (explicit) | The current .gitignore is silent on why active-plans/ is tracked | No comment |

---

## GSTACK REVIEW REPORT

| Review | Trigger | Runs | Status | Findings |
|--------|---------|------|--------|----------|
| CEO Review | /autoplan Phase 1 | 1 | clean | 2 minor gaps + resolved |
| Design Review | skipped (no UI scope) | 0 | — | — |
| Eng Review | /autoplan Phase 3 | 1 | clean | 0 findings |
| Codex Review | unavailable | 0 | — | single-model mode |

**VERDICT:** APPROVED — trivial chore, no risks.
