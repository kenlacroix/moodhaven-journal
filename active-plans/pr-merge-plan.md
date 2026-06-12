# Open-PR Merge Plan

> **Status:** living doc — updated 2026-06-12. **Scope: PRs #140–#162 only.**
> **Hard rule:** do NOT merge until the owner says go. **Do NOT touch anything
> after #162** (#163/#164 android voice slices are HELD/draft, owner-vetting; any
> later PR is out of scope here).

All of #140–#162 have been through adversarial review (subagent ≈ `/review` +
`/cso`); the four web-testable PRs also got a **live headless QA** pass, the UI
PRs a `/design-review`, and the repo a `/health` baseline (main = **9.7/10**).

---

## Coverage matrix (gstack tasks run per PR)

`R`=review/cso · `Q`=live web QA · `D`=design-review · `✱`=fix pushed this round

| PR | R | Q | D | Verdict | Notes |
|----|---|---|---|---------|-------|
| #140 checkout bump | ✓ | — | — | SAFE | clean SHA bump |
| #143 advisory scan | ✓ | — | — | SAFE | Cargo.lock; **subset of #145** |
| #145 dep modernization | ✓ | — | — | SAFE (un-drafted) | superset of #143; lockfiles only |
| #147 migration E2E | ✓ | — | — | SAFE | real code path |
| #148 VT scanning | ✓ | — | — | SAFE | `VT_API_KEY` set; VT runs in build.yml on tag/dispatch (not PRs) — verify at merge |
| #149 BYO-cloud | ✓ | — | — | SAFE | ciphertext-only, path-guarded, lock-gated |
| #150 recovery PDF | ✓ | — | — | SAFE | stacked on #149; ACL fix landed ✱ |
| #151 docs unlock | ✓ | — | ✓ | SAFE | LOW: hint contrast (posted) |
| #152 crash-replay harness | ✓ | — | — | SAFE | standalone on main; no test.yml conflict w/ #156/#140; 2 LOW nits |
| #153 scaffold | ✓ | — | — | SAFE | no change needed |
| #154 perf audit | ✓ | — | — | NEEDS-WORK (draft, CONFLICTING) | conflict magnet; rebase + merge last |
| #155 change-pw impl | ✓✓ | — | — | SAFE ✱ | 4 blockers fixed + crash-matrix extended (222 tests) |
| #156 CodeQL | ✓ | — | — | SAFE | **merge before #157** |
| #157 platform gating | ✓ | ✓ | — | SAFE ✱ | STT tab + Updates panel now gated to desktop ✱ |
| #158 web crash | ✓ | ✓ | — | SAFE | **prod build confirmed: editor renders, 0 errors** |
| #159 factory-reset | ✓ | — | ✓ | SAFE ✱ | hold-to-erase now keyboard-accessible ✱ |
| #160 writing UI | ✓ | ✓ | ✓ | SAFE ✱ | aria-keyshortcuts restored ✱; toggle/tag-chips verified live |
| #161 android Phase 1 | ✓ | ✓ | ✓ | SAFE | mobile mic-absence + nav verified; conflicts #157 test files |
| #162 privacy-checkup link | ✓ | — | — | SAFE | **merge before #157** (overlaps Sidebar/Privacy/Settings) |

`/health`: run once on main (9.7/10) — CI runs typecheck/lint/test/rust per branch.
Desktop-only flows (#149/#150/#155/#159) can't be reached by web `/qa` — owner
manual desktop QA owed (see bottom).

**QA gotcha (recorded):** `dev:web` runs React **StrictMode** (dev) → double-invokes
effects → false `editor.getHTML()` null-schema crash (`commitDoubleInvokeEffectsInDEV`).
QA the **production** build (`build:web` + `vite preview`), not the dev server.

---

## Pre-flight (before any merge)

1. **Un-draft** #152 + #145 — DONE. #154 stays draft until rebased.
2. **Decide #143 vs #145** (both edit `Cargo.lock`): merge one. Coordination notes posted on both.
3. **`VT_API_KEY`** is configured; at #148 merge, verify the VT scan + download-verification surface actually run (build.yml via tag/`workflow_dispatch`).
4. **#155 `UNSTABLE`** = non-required check only (no failing/pending).
5. **Rebase #154** onto current main (baseline stale ~1,283 vs ~1,512 tests).

---

## Merge order (waves)

Between every merge, rebase the remaining branches touching the hot files —
`App.tsx`, `lib.rs`, `data_management.rs`, `settingsStore.ts`, `LockScreen.tsx`,
`SidebarPrompts.tsx`, `PrivacyTab.tsx`, `SettingsPage.tsx`, `Cargo.lock`,
`package-lock.json`, the two `*.test.tsx` — and let CI go green.

### Wave 1 — infra / security / docs (independent)
`#156` → `#140` → `#143` → `#147` → `#148` → `#151`
- #156 first so #157's duplicate hunks drop out.

### Wave 2 — frontend fixes + platform refactor
`#158` → `#162` → `#157` → `#161` → `#160` → `#159`
- **#162 and #156 both before #157** (each overlaps it); #157 rebases.
- #161 rebases the 2 test files after #157 (adopt `canSTT`).

### Wave 3 — BYO-cloud stack
`#149` → `#150` (rebase #150 onto main, retarget base to `main`, keep PDF delta).

### Wave 4 — change-password stack (bottom-up)
`#152` → `#153` → `#155`.

### Wave 5 — heavy, last
`#145` (if kept) → `#154` (rebase onto settled tree; finish its 4 manual-QA items; refresh baseline).

---

## "Don't merge both" / ordering pairs
- **#156 ⊂ #157** — merge #156, #157 rebases clean.
- **#143 ⊂ #145** — pick one.
- **#162 before #157** — overlaps SidebarPrompts/PrivacyTab/SettingsPage.
- **#157 ↔ #161** — EditorToolbar.test / AboutTab.test conflict; rebase second.

---

## 🚫 OFF-LIMITS (do not touch)
- **#163** android voice-capture Slice 1, **#164** voice-sync Slice 2 — HELD (draft), owner on-device vetting. Excluded from all waves.
- Anything opened after #162 — out of scope for this plan.

---

## Fixes pushed this round (all pre-merge, on their branches)
- #150 `1037f48` — ACL fix (`read_text_file`) + restacked on #149 (PDF-only delta).
- #155 `f262589`+`d8c4fc8` — peer-sync gate, lock_app race, metadata gates, B1 marker-preserve, B2 fsync, crash-matrix +2 tests.
- #159 `86f285d` — keyboard-accessible hold-to-erase (a11y).
- #160 `dc542d5` — aria-keyshortcuts on appearance toggle (a11y).
- #157 `b8861ca` — gate STT tab + Updates panel to desktop.

---

## Manual desktop QA owed (not reachable via web `/qa`)
- #150 recovery-PDF: export → PDF opens + contains the key.
- #149 folder-sync: sync to folder → wipe → import (round-trip).
- #159 erase + relaunch: erase → app reopens into first-run (relaunch is desktop-only).
- #155 change-password: change pw → re-unlock w/ new pw; sealed entry + media decrypt; concurrent write (writer/peer) refused during the change; old pw rejected; recovery/PIN/biometric re-setup checklist.
