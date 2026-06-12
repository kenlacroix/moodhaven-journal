# Open-PR Merge Plan

> **Status:** living doc — update as PRs land or new ones open. Created 2026-06-12.
> **Rule:** nothing merges until the owner says go. More PRs are still incoming
> (e.g. #163 android voice-capture Slice 1 — not yet opened), so re-run the
> conflict check when new PRs appear.

Every open PR has an adversarial review verdict (subagent reviews ≈ `/review` +
`/cso` coverage). The remaining gap is **manual desktop QA** on the four
desktop-only flows (recovery-PDF #150, folder-sync #149, erase+relaunch #159,
change-password #155) — `/qa` drives the web build and can't exercise them.
`/health` not run (nothing flagged warrants it). CI covers tests/build.

---

## Verdict summary

| PR | Verdict | Note |
|---|---|---|
| #156 CodeQL | SAFE | **Merge before #157** (its commit is #157's tip). markdownUtils untested + O(n²) strip loop (not exploitable). |
| #140 checkout bump | SAFE | Clean pinned-SHA bump. |
| #143 advisory scan | SAFE | Cargo.lock only; **subset of #145** — merge one. |
| #147 migration E2E | SAFE | Real code path, deterministic. |
| #148 VT scanning | SAFE | Needs repo secret `VT_API_KEY` (no-ops if absent). |
| #151 docs unlock | SAFE | No conflict with #159 (disjoint LockScreen regions). |
| #158 web crash | SAFE | Isolated (settingsService deep-merge). |
| #157 platform detection | SAFE | Conflicts #161 on 2 test files; superset of #156. |
| #161 android Phase 1 | SAFE | Frontend-only; rebase test files after #157, adopt `canSTT`. |
| #160 writing UI | SAFE | EditorToolbar overlap with #161. |
| #159 factory-reset | SAFE | lib.rs / data_management / App.tsx / LockScreen. |
| #149 BYO-cloud | SAFE | Security PASS (ciphertext-only, path-guarded, lock-gated). |
| #150 recovery PDF | SAFE | Stacked on #149; ACL fix landed. |
| #153 scaffold | SAFE | No change needed; base of the change-pw stack. |
| #155 change-pw impl | SAFE | Blockers fixed 2026-06-12; `UNSTABLE` = non-required check. |
| #145 dep modernization | READY (was draft) | Superset of #143; lockfiles only. |
| #152 crash-replay harness | READY (was draft) | Base of #153/#155 stack. |
| #154 perf audit | NEEDS-WORK (draft, CONFLICTING) | Low logic risk; conflict magnet (App.tsx, vite.config). Rebase + merge last. |

---

## Pre-flight (before any merge)

1. **Un-draft** #152 + #145 — DONE. #154 stays draft until rebased.
2. **Decide #143 vs #145** (both edit `Cargo.lock`): merge #143 now (smaller, green)
   **or** keep the #145 superset and close #143. Don't merge both. Coordination
   notes posted on both.
3. **`VT_API_KEY`** repo secret is already configured. When #148 merges, **verify
   the virus-scan feature runs** (VT submit + the download-verification surface)
   instead of no-opping.
4. **#155 `UNSTABLE`** confirmed: no failing/pending checks — non-required check only.
5. **Rebase #154** onto current main (baseline stale: ~1,283 vs current ~1,512 tests).

---

## Merge order (waves)

**Between every merge:** rebase the remaining branches that touch the hot files —
`src/App.tsx`, `src-tauri/src/lib.rs`, `commands/data_management.rs`,
`src/stores/settingsStore.ts`, `src/pages/LockScreen.tsx`, `Cargo.lock`,
`package-lock.json`, and the two `*.test.tsx` (EditorToolbar/AboutTab) — and let
CI go green before the next merge.

### Wave 1 — infra / security / docs (independent)
`#156` → `#140` → `#143` → `#147` → `#148` → `#151`
- #156 first so #157's duplicate hunks drop out on rebase.

### Wave 2 — isolated fixes + platform refactor
`#158` → `#157` → `#161` → `#160` → `#159`
- #158 isolated (safe anytime). #157 after #156.
- #161 rebases the 2 test files after #157 and adopts `canSTT`.
- #160 rebase if EditorToolbar overlaps #161. #159 rebases the lib.rs registration block.

### Wave 3 — BYO-cloud stack
`#149` → `#150`
- After #149 lands, rebase #150 onto main, retarget its base to `main`, keep the
  PDF-only delta.

### Wave 4 — change-password stack (bottom-up)
`#152` → `#153` → `#155`
- Rebase lib.rs / data_management against everything merged earlier.

### Wave 5 — heavy, last
`#145` (if kept) → `#154`
- #154 last: rebase onto the settled tree, finish its 4 manual-QA items, refresh
  the test baseline, re-verify the web chunk split.

---

## "Don't merge both" pairs

- **#156 ⊂ #157** — merge #156, #157 rebases clean.
- **#143 ⊂ #145** — pick one.
- **#157 ↔ #161** — test-file conflict (EditorToolbar.test, AboutTab.test); rebase whichever lands second.

---

## 🚫 HELD — do NOT merge (owner-gated, android, needs on-device vetting)

- **#163** android on-device voice-memo capture (Slice 1) — `worktree-android-voice-capture`.
- **#164** voice-memo peer-sync phase / transcription round-trip (Slice 2) — `worktree-android-voice-sync`.

Both converted to **draft** and excluded from all waves until the owner verifies
them on-device. Do not slot into the merge order. Re-evaluate only on owner's say-so.

## Incoming PRs (slot on arrival)

- Any further android/iOS PRs beyond #163/#164: re-run the hot-file conflict check
  and place in the matching wave (or HOLD if owner-gated).

---

## Manual desktop QA owed (not automatable via `/qa`)

- #150 recovery-PDF: export → confirm the PDF opens and contains the recovery key.
- #149 folder-sync: sync to a folder → wipe → import (round-trip).
- #159 erase + relaunch: erase → app reopens into first-run.
- #155 change-password: change pw → re-unlock with new pw; verify recovery-key
  re-setup checklist; verify a concurrent write (writer window / peer) is refused
  during the change.
