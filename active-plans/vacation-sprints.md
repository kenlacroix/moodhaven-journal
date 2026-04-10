# MoodBloom — Vacation Sprints

**Purpose:** Paste this file into Claude web (claude.ai) with the instruction below. Claude works through each sprint, checks off tasks, and opens PRs. Ken reviews and merges after returning.

**Paste instruction:**
> "You are working on the MoodBloom repo at https://github.com/kenlacroix/moodhaven-journal. Read `active-plans/vacation-sprints.md` and `active-plans/roadmap-v1.0.md`. Work through each sprint in order, checking off tasks as you complete them. Each sprint ends with a PR. Stop after opening the PR and wait for the next sprint to be triggered."

---

## Pre-departure checklist (Ken does before leaving)

- [ ] Manual unlock test: correct password → app unlocks on `feat/v0.9.0-security-logging-settings`
- [ ] Manual unlock test: wrong password → stays locked with error
- [ ] Log file present at `{app_data}/logs/moodhaven.log` after first launch
- [ ] Log level change takes effect without restart
- [ ] Two-instance sync test: wire format unchanged
- [ ] All 9 settings tabs render; settings survive app restart
- [ ] Run `/review` on `feat/v0.9.0-security-logging-settings`
- [ ] Run `/ship` → v0.9.0 merged to `main`

---

## Sprint 1 — Browser Mode Fix

**Status:** [ ] not started | [ ] in progress | [ ] PR open | [ ] merged  
**Branch:** `fix/browser-mode-setup` (from `main`)  
**Depends on:** nothing — can run before v0.9.0 ships  
**Target PR title:** `fix(browser): add missing verify_password shim for browser mode`

### Context

The app runs in two modes: Tauri (native) and browser (IndexedDB). In browser mode,
`invoke()` is shimmed by `src/lib/backend/browser-invoke.ts` routing to
`src/lib/backend/browser.ts`.

**Problem:** The live web build fails with "An error occurred" on unlock and "Failed to set up"
on initial setup. Root hypothesis: v0.9.0 SEC-DEFER-001 wired `LockScreen.tsx` to
`invoke('verify_password')`, but `browser-invoke.ts` has no shim for that command name.

### Investigation

- [ ] Read `src/lib/backend/browser-invoke.ts` — map the full command routing table
- [ ] Read `src/components/LockScreen.tsx` — find all `invoke()` calls in the unlock path
- [ ] Read `src/lib/services/crypto.ts` — find `verifyPassword` function signature
- [ ] Read `src/lib/backend/browser.ts` — find `storePasswordHash`, `getPasswordHash`
- [ ] Identify: which commands in the unlock + setup path are missing browser shims?

### Tasks

- [ ] Add `verify_password` shim in `browser-invoke.ts`:
  - Call `crypto.verifyPassword(password)` using the IDB-stored hash
  - Return `true`/`false` matching the Rust command's return shape
- [ ] Confirm `store_password_hash` is shimmed; fix if missing
- [ ] Confirm `get_password_hash` is shimmed; fix if missing
- [ ] Check the Import Existing Data invoke path; fix any missing shims
- [ ] Add/update browser-invoke tests covering the new shims

### Gate

- [ ] `npm run typecheck` — zero errors
- [ ] `npm test` — all tests pass
- [ ] `npm run build:web` — browser build succeeds
- [ ] Browser mode smoke: setup → lock → unlock (correct password) → works
- [ ] Browser mode smoke: wrong password → stays locked with error
- [ ] Open PR to `main`

---

## Sprint 2 — STT UI Integration

**Status:** [ ] not started | [ ] in progress | [ ] PR open | [ ] merged  
**Branch:** `feat/v0.9.1-features` (from `main` after v0.9.0 merged)  
**Depends on:** v0.9.0 merged to `main`  
**Target PR title:** `feat(stt): F1 — STT mic button and recording UI in WritingView`

### Context

Read the full F1 spec in `active-plans/roadmap-v1.0.md` under "v0.9.1 — F1: STT UI Integration"
before starting. Hooks and Rust commands exist; this sprint wires the UI.

**Files to read first:**
- `src/features/writing/WritingView.tsx`
- `src/hooks/useSpeechToText.ts`
- `src/hooks/useAudioRecorder.ts`
- `src/components/transcript/TranscriptPreviewOverlay.tsx`
- `src/components/settings/tabs/SpeechToTextTab.tsx`

### Tasks

- [ ] **MicButton in TipTap toolbar** (`WritingView.tsx`)
  - Rightmost item, separated by divider
  - Outline mic → filled mic on record; `duration-200`
  - Hidden when STT disabled; disabled-with-tooltip when no model downloaded
  - `aria-label` toggles "Start recording" / "Stop recording"
- [ ] **Recording state indicator** (below toolbar)
  - Full-width strip, 40px height; MM:SS timer + stop button
  - 20 SVG amplitude bars, `duration-200`, `aria-hidden="true"`
  - Static bars when `prefers-reduced-motion`
- [ ] **Transcribing state** — spinner + "Transcribing..." on mic button until result or error
- [ ] **Result routing** — open `TranscriptPreviewOverlay.tsx` (NOT direct cursor insert)
- [ ] **Error states**
  - Permission denied → inline "Microphone access denied. Check System Settings."
  - Transcription failure → toast + mic returns to idle
  - Download failure → retry button + error in `SpeechToTextTab`
- [ ] **Model download UI in `SpeechToTextTab`**
  - Model list, file sizes, progress bar
  - On complete: toast "Speech-to-text ready — tap the mic in the editor"
  - B2: validate model on tab open; show download button if absent
- [ ] **Rust: B7** — `tokio::time::timeout` around download stream (`speech_to_text.rs`)
- [ ] **Rust: B8** — delete `.partial` file in error path (`speech_to_text.rs`)
- [ ] **Hook: B10** — fix `checkedRef` defeating memoization (`useSpeechToText.ts`)
- [ ] Add tests: mic button states (idle/recording/transcribing), permission denied error state, TranscriptPreviewOverlay routing

### Gate

- [ ] `npm run typecheck` — zero errors
- [ ] `npm test` — all tests pass
- [ ] `npm run lint` — clean
- [ ] Open PR to `main`

---

## Sprint 3 — Timeline Virtual Scroll + Small Features

**Status:** [ ] not started | [ ] in progress | [ ] PR open | [ ] merged  
**Branch:** `feat/v0.9.1-features` (same as Sprint 2, or new branch if Sprint 2 already merged)  
**Depends on:** v0.9.0 merged to `main` (can run in parallel with Sprint 2)  
**Target PR title:** `feat(timeline): F2/F3/F8/F9 — virtual scroll, tag browser, export date range, sync status`

### Context

Read F2, F3, F8, F9 specs in `active-plans/roadmap-v1.0.md` under "v0.9.1 — Feature Completeness".

### Tasks

**F3 — Timeline Virtual Scrolling** (do first)

- [ ] Read `src/features/timeline/TimelineView.tsx` in full — understand render loop, filter, pinned logic
- [ ] Implement virtual list: render visible rows only + 5-row overscan
- [ ] Use `position: absolute` + `Map<entryId, height>` + `ResizeObserver` — NO third-party library
- [ ] Recompute layout on height changes (filter/sort/media badge load)
- [ ] Day header rows have different height from entry rows — handle both
- [ ] Pinned entries always above the virtual window, never inside it
- [ ] All existing filter/sort/book/tag behavior preserved
- [ ] Tests: pinned above virtual window; row height updates after async change

**F2 — Hashtag Browser** (parallel)

- [ ] New `src/components/journal/TagCloud.tsx`
- [ ] Click tag → sets active tag filter in `TimelineView`
- [ ] Use `get_book_tags`; add `get_all_tags` Rust command only if needed

**F8 — Export Date-Range Selection** (parallel)

- [ ] Date range picker in export dialog (`DataManagementTab` or dedicated modal)
- [ ] Wire to `export_data` `filter.startDate` / `filter.endDate` — no new Rust commands

**F9 — Peer Sync Status Detail** (parallel)

- [ ] `src/components/settings/tabs/DevicesTab.tsx`: per-device last-sync timestamp
- [ ] "Sync now" button → `invoke('peer_sync_now', { peerDeviceId })`
- [ ] Use existing `peer_get_sync_states` + `peer_get_trusted`

### Gate

- [ ] `npm run typecheck` — zero errors
- [ ] `npm test` — all tests pass including virtual scroll tests
- [ ] `npm run lint` — clean
- [ ] Timeline with 100+ entries scrolls without rendering all rows
- [ ] Open PR to `main`

---

## Sprint 4 — Polish + Privacy Transparency

**Status:** [ ] not started | [ ] in progress | [ ] PR open | [ ] merged  
**Branch:** `feat/v0.9.2-polish` (from `main` after v0.9.1 merged)  
**Depends on:** v0.9.1 merged to `main`  
**Target PR title:** `feat(polish): v0.9.2 — sparkline, keyboard shortcuts, pinned entries, streak toasts, privacy transparency`

### Context

Read the full v0.9.2 section in `active-plans/roadmap-v1.0.md` before starting.
All features below are independent and can be committed separately.

### Tasks

**F4 — 7-day mood sparkline** (`Sidebar.tsx`)

- [ ] Inline SVG; `get_mood_statistics` invoke; height 24px; above `CloudSyncChip`
- [ ] Uses 5 mood color tokens: `#10b981 #84cc16 #eab308 #f97316 #ef4444`
- [ ] Static when `prefers-reduced-motion`

**F5 — Keyboard shortcuts** (`WritingView.tsx`)

- [ ] `1–5` set mood (only when no text node focused)
- [ ] `Ctrl+Shift+F` toggles focus mode
- [ ] `?` opens cheatsheet modal (editor focused, cursor not in text)
- [ ] Add `aria-keyshortcuts` to editor container

**F6 — Pinned entries collapsible section** (`TimelineView.tsx`)

- [ ] Expanded by default; collapse state in `localStorage` key `mb_pinned_expanded`

**F7 — Streak celebration toasts**

- [ ] `get_streak_stats` on app load; toast at 7/30/100 day milestones
- [ ] Respect `prefers-reduced-motion` (instant appear, no bounce)

**F10 — On This Day banner**

- [ ] Show on load when prior-year entries exist for today
- [ ] Dismiss button; dismissed state in `localStorage` key `mb_otd_dismissed_<YYYY-MM-DD>`; once per day

**TL-003 — TimeCapsuleRevealModal accessibility** (`TimeCapsuleRevealModal.tsx`)

- [ ] Focus trap on open; ESC closes; `aria-modal="true"`; `role="dialog"`; initial focus on first interactive element

**SETTINGS-001 — Extract `use2FASetup`**

- [ ] Move 2FA setup logic from `PrivacyTab.tsx` → `src/hooks/use2FASetup.ts`

**D-003 — Voice memos empty state** (`WritingView.tsx`)

- [ ] Onboarding guidance when no memos exist

**Privacy Transparency (PRIV-001 to PRIV-005)**

- [ ] **PRIV-001** — Settings → Privacy: "Transparency" section with static Privacy Guarantees card (no cloud, no telemetry, LAN-only sync, AES-256-GCM, no accounts)
- [ ] **PRIV-002** — "Current Privacy State" live panel: reads actual runtime state (`cloudSyncEnabled`, `aiEnabled`, `telemetryEnabled`, `externalConnections`)
- [ ] **PRIV-003** — "Export Privacy Snapshot" button → JSON via `write_text_file` (no new Rust command)
- [ ] **PRIV-004** — First-run onboarding: "Private by design" slide before password setup step
- [ ] **PRIV-005** — `docs/TRANSPARENCY.md`: unsigned transparency manifest template (version, date, commit hash, no-telemetry statement)

### Gate

- [ ] `npm run typecheck` — zero errors
- [ ] `npm test` — all tests pass
- [ ] `npm run lint` — clean
- [ ] Run `/design-review` on new UI additions; fix all findings
- [ ] Open PR to `main`

---

## Sprint 5 — README + Wiki + Website Polish

**Status:** [ ] not started | [ ] in progress | [ ] PR open | [ ] merged  
**Branch:** `feat/v0.9.3-design-rename` (from `main` after v0.9.2 merged)  
**Depends on:** v0.9.2 merged to `main`  
**Note:** Brand rename and lib restructure are already complete.  
**Target PR title:** `docs(v0.9.3): README revamp, GitHub wiki, website QA and design polish`

### Context

Read the full v0.9.3 section in `active-plans/roadmap-v1.0.md`. Two parallel tracks: README/wiki (low risk) and website QA + design (medium risk).

### Tasks

**README Revamp**

- [ ] Read current `README.md` in full
- [ ] Rewrite to user-facing landing page: purpose, benefits, features, trust, beta program, wiki links
- [ ] Add above the fold: "Free and open source. No account, no subscription, no cloud required."
- [ ] Add Quick Start: `VITE_DEV_MODE=bypass npm run dev:web`
- [ ] Add badges: build status, license, GitHub stars
- [ ] Concise Changelog highlights for v0.8.4 → v0.9.x (wiki link for full diff)

**GitHub Wiki (9 pages)**

- [ ] `Wiki/Security` — encryption, PBKDF2, zero-knowledge, password/recovery
- [ ] `Wiki/Peer-Sync` — device identity, pairing, LAN-only, conflict resolution
- [ ] `Wiki/Wear-OS-Companion` — architecture, voice memos, mood taps, health snapshots
- [ ] `Wiki/Build` — Node.js, Rust, OS deps, dev workflow, hardware key
- [ ] `Wiki/Shortcuts` — shortcut table and tips
- [ ] `Wiki/Tech-Stack` — frontend, backend, state, peer discovery, 2FA, charts, testing
- [ ] `Wiki/Beta-Testing` — desktop + Wear OS workflows, edge cases, feedback channels
- [ ] `Wiki/Development` — dev commands, testing, typecheck, Cargo, architectural rules
- [ ] `Wiki/Changelog` — table linking to `CHANGELOG.md`
- [ ] Add back-link in each wiki page: "For general overview → README"
- [ ] Update cross-links in `CONTRIBUTING.md` and `CLAUDE.md` key files table

**Website QA + Design**

- [ ] Run `/qa` on website; fix all P0/P1 findings
- [ ] Run `/design-review` on website; fix findings
- [ ] Phase A: update FAQ, add FOSS statement, remove "Pro"/"subscription" language
- [ ] Phase B: violet-700 primary, orange accent, mood color scale in `tailwind.config.js`; sweep components
- [ ] Phase C: hero subtitle — lead with local-first + AI insights + privacy
- [ ] DESIGN-DEBT-001: replace blue rain hero photo
- [ ] DESIGN-DEBT-002: remove/demote newsletter carousel
- [ ] DESIGN-DEBT-003: convert value props to proof-based modules
- [ ] DESIGN-DEBT-004: add GitHub star badge to homepage
- [ ] DESIGN-DEBT-005: add FOSS statement to homepage
- [ ] D-001: create `docs/DESIGN.md` (color tokens, typography, spacing, motion, components)
- [ ] Final `/design-review` pass after all changes

### Gate

- [ ] `npm run typecheck` — zero errors
- [ ] `npm test` — all tests pass
- [ ] `npm run lint` — clean
- [ ] Website `/qa` report: zero P0/P1 issues
- [ ] No "Pro", "subscription", or "pricing" language anywhere
- [ ] `docs/DESIGN.md` exists with all token categories
- [ ] Open PR to `main`

---

## Sequencing Summary

| Sprint | Status | Can start when | Branch | Risk |
|--------|--------|---------------|--------|------|
| 1 — Browser Fix | [ ] | Anytime | `fix/browser-mode-setup` | Low |
| 2 — STT UI | [ ] | v0.9.0 on main | `feat/v0.9.1-features` | Medium |
| 3 — Virtual Scroll + Features | [ ] | v0.9.0 on main (parallel w/ S2) | `feat/v0.9.1-features` | Medium |
| 4 — Polish + Privacy | [ ] | v0.9.1 merged | `feat/v0.9.2-polish` | Low |
| 5 — README + Wiki + Website | [ ] | v0.9.2 merged | `feat/v0.9.3-design-rename` | Low–Medium |
