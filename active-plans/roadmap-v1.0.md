<!-- /autoplan restore point: /home/ken/.gstack/projects/kenlacroix-moodhaven-journal/fix-security-lock-gating-autoplan-restore-20260405-162332.md -->
# Roadmap: v0.8.3 → v1.0

**Target:** 1–2 months | **Status:** In Progress  
**Must-haves:** brand rename, SEC-DEFER-001, STT UI (F1), timeline virtual scrolling (F3)  
**Scope:** Android/Wear ships with v1.0. Browser mode ships as-is (no new web features).

---

## How to Use This Plan

### Starting a session
1. Scan the milestone table — find the first milestone with an unchecked gate.
2. Within that milestone, find the first unchecked task.
3. Read the **Pre-flight** list for that milestone before touching any code.
4. Use `TaskCreate` to break the session's work into discrete tracked steps.
5. Work top-to-bottom. Tasks marked `// parallel` can be done simultaneously.
6. Run the skills listed in each **Gate** section before marking the milestone done.

### Resuming mid-milestone
1. Check `git branch` — should match the milestone's `branch:` field.
2. Run `git status`, `npm run typecheck`, `cargo check` to see current state.
3. Run `TaskList` to see what was in progress from the previous session.
4. Re-read the pre-flight files (they may have changed).

### Making judgment calls
Record any non-obvious decisions in the **Decision Log** at the bottom of this file.  
Format: `[vX.Y.Z] decision made — rationale`

### When a milestone is done
1. Check all gate boxes including version bump.
2. Run `/review` then `/ship`.
3. Archive completed sub-plans from `active-plans/` to `docs/internal/plans/`.
4. Check off the milestone row in the overview table.

---

## Milestone Overview

| Version | Theme | Branch | Status |
|---------|-------|--------|--------|
| v0.8.4 | Housekeeping & quick security wins | `chore/v0.8.4-housekeeping` | [x] |
| ~~v0.8.5~~ | ~~Brand rename + lib restructure~~ | ~~`chore/v0.8.5-brand-and-structure`~~ | [x] COMPLETE (done early) |
| refactor/peer-sync-engine | Peer sync engine module split (standalone) | `refactor/peer-sync-engine` | [x] |
| fix/android-companion-polish | Android + Wear OS crash fixes + polish (standalone) | `fix/android-companion-polish` | [x] |
| fix/browser-mode-setup | Browser mode (web build) setup & unlock fix (standalone) | `fix/browser-mode-setup` | [x] |
| v0.9.0 | Security + logging + settings | `feat/v0.9.0-security-logging-settings` | [x] |
| v0.9.1 | Hotfix: unlock/reset regressions | `fix/lock-screen-unlock-reset` | [x] COMPLETE |
| v0.9.2 | Feature completeness | `feat/v0.9.2-features` | [x] |
| v0.9.3 | Polish & QoL | `feat/v0.9.3-polish` | [ ] |
| v0.9.4 | Android/v1.1 prep + website QA + design unification + brand rename | `feat/v0.9.4-android-design` | [ ] |
| v1.0.0 | Release prep + final audit (desktop only) | `chore/v1.0.0-release` | [ ] |
| v1.1.0 | Android companion + Play Store | `feat/v1.1.0-android` | [ ] |

> Milestones are **sequential** — each branches off `main` after the previous PR merges.
> Tasks marked `// parallel` within a milestone can be worked simultaneously.
>
> **[autoplan 2026-04-05] Structural changes:**
> - v0.8.5 rename MOVED to v0.9.3 (rename before SEC-DEFER-001 was risky)
> - Peer sync refactor extracted to standalone branch `refactor/peer-sync-engine`
> - Android decoupled from v1.0: ships as v1.1 after desktop v1.0 stabilizes
> - Android P1–P4 polish extracted to standalone branch `fix/android-companion-polish` — touches only `gen/android/`, can merge any time independently of desktop sequence; v1.1.0 retains only Play Store + store submission work

---

## v0.8.4 — Housekeeping

```
branch:   chore/v0.8.4-housekeeping
from:     main
risk:     low
depends:  nothing — start here
commits:  fix:, chore:
skills:   /health (baseline), /review + /ship (close out)
```

**Pre-flight:** Read `src/lib/recoveryKeyService.ts`, `src/components/settings/SettingsPage.tsx`, `src-tauri/src/commands/analytics.rs`.

**Session start:** `TaskCreate` items for each section below, then `git checkout -b chore/v0.8.4-housekeeping`.

### Security // parallel
- [x] **B1** (`src/lib/recoveryKeyService.ts`) — Replace `Math.random()` with `crypto.getRandomValues()`
- [x] **SEC-DEP-001** — Upgrade `vite` → v8, `vitest` → v4 (GHSA-67mh-4wv8-2f99 esbuild CORS vuln)
- [x] **UpdatePanel** (`src/components/settings/`) — Apply `DOMPurify` to `dangerouslySetInnerHTML` on GitHub release notes
- [x] **CI-PIN** — Pin all GitHub Actions to SHA hashes (`.github/workflows/build.yml`, `.github/workflows/test.yml`) — `tauri-apps/tauri-action@v0` runs with `TAURI_SIGNING_PRIVATE_KEY`; mutable tags are a supply chain risk

### Code Cleanup // parallel
- [x] **B3** (`src-tauri/src/commands/analytics.rs`) — Fix `get_overall_statistics` returning hardcoded 0 for streaks/mood
- [x] **B4** — Remove orphaned `AnalyticsPage` component (dead code; analytics merged into Insights)
- [x] **B5** (`src/components/settings/SettingsPage.tsx`) — Fix `setInterval` memory leak (missing `clearInterval` on unmount)

### Structural
- [x] **chore-plans-consolidation** — Rename `plans/` → `active-plans/`, update `.gitignore` + `CLAUDE.md` key files table
  > Plan: `active-plans/chore-plans-consolidation.md`

### Gate
- [x] `npm run typecheck` — zero errors
- [x] `cargo check` — zero errors
- [x] `npm test` — all tests pass
- [x] `cd src-tauri && cargo test` — all tests pass
- [x] `npm audit` — no new high/critical
- [x] `cargo audit` — no new high/critical
- [x] `npm run lint` — clean
- [x] Bump `0.8.4` in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
- [x] Update `CHANGELOG.md` — add v0.8.4 entry
- [x] Run `/review` — address findings
- [x] Run `/ship` → merge to `main`

---

## v0.8.5 — Brand Rename + Lib Restructure

```
branch:   chore/v0.8.5-brand-and-structure
from:     main (after v0.8.4 merged)
risk:     HIGH — 31 + 65+ files; typecheck is the safety net
depends:  v0.8.4 merged
commits:  chore:, refactor:
skills:   /health (baseline), /review + /ship (close out)
rollback: if peer sync breaks post-rename, "moodhaven-sync-v1:" in
          peer_sync_engine.rs is the likely culprit — verify reader + writer match
```

**Pre-flight:** Read `active-plans/rename-moodhaven-journal.md` (full 31-file list + atomic change order), `active-plans/chore-lib-restructure.md` (import category breakdown), `src-tauri/src/commands/peer_sync_engine.rs` (protocol prefix location), `src-tauri/Cargo.toml` (lib name).

**Session start:** `TaskCreate` for rename pass 1 (metadata), rename pass 2 (UI strings), rename atomics, lib restructure. Keep them as separate tasks — each is a distinct commit.

### rename-moodhaven-journal (31 files)
> Plan: `active-plans/rename-moodhaven-journal.md`  
> Commit order: metadata/config first → UI strings → atomic pairs last.

- [x] `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` — productName, identifier, DB filename
- [x] UI strings (~20 component files)
- [x] mDNS service type → `_moodhaven._tcp.local`
- [x] WebDAV directory name + file extension
- [x] `device.json` app identifier path
- [x] Test files referencing brand strings
- [x] **ATOMIC commit:** Sync protocol prefix `moodhaven-sync-v1:` — reader + writer together
- [x] **ATOMIC commit:** Format version strings — writer and reader together

### chore-lib-restructure
> Plan: `active-plans/chore-lib-restructure.md`  
> Separate commit from the rename on the same branch.

- [x] Move 32 service files → `src/lib/services/`
- [x] Move 7 utility files → `src/lib/utils/`
- [x] Update ~65 external `../lib/` imports → `../lib/services/` or `../lib/utils/`
- [x] Fix 5 intra-lib cross-subdir imports (e.g. `aiService.ts` → `./transcriptFormatter`)
- [x] Fix 22 `../types/` imports → `../../types/` (depth increased after move)
- [x] Fix 3 self-referential logger imports
- [x] Enforce: `utils/` must NOT import from `services/`

### Gate
- [x] `npm run typecheck` — zero errors
- [x] `npm test` — all 633+ tests pass
- [x] `npm run lint` — clean
- [x] `cargo check` — zero errors
- [x] `npm run dev:web` — browser build starts without errors
- [x] Dev build launches; app title reads "MoodHaven Journal"
- [x] Bump `0.8.5` in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
- [x] Update `CHANGELOG.md` — add v0.8.5 entry
- [x] Run `/review` — address findings
- [x] Run `/ship` → merge to `main`

---

## refactor/peer-sync-engine — Peer Sync Module Split (standalone)

```
branch:   refactor/peer-sync-engine
from:     main (after v0.8.4 merged — or any stable main)
risk:     MEDIUM — must not change wire format, transport key, or session sequence
depends:  nothing blocking; can merge to main independently
commits:  refactor:
skills:   /review + /ship (close out)
```

> Extracted from v0.9.0 to reduce that milestone's risk. **This branch has no SEC-DEFER-001 work.**
> If it reveals unexpected complexity, it does not block security work.

**Tasks:**
- [x] Read `src-tauri/src/commands/peer_sync_engine.rs` in full — map all responsibilities
- [x] Extract `connection.rs` — TCP accept loop, frame read/write, length-prefix + nonce
- [x] Extract `protocol.rs` — HELLO/MANIFEST/ENTRIES/DONE message types, serialization
- [x] Extract `crypto.rs` (sync-specific) — transport key derivation
- [x] Extract `conflict.rs` — LWW conflict resolution (`updated_at` comparison)
- [x] Keep `peer_sync_engine.rs` as orchestrator that imports the above
- [x] Add `pub mod` declarations in `src-tauri/src/commands/mod.rs`
- [x] Wire behavior test: two-instance sync before + after; entry counts must match

**Gate:**
- [x] `cargo check` — zero errors
- [x] `cd src-tauri && cargo test` — all tests pass
- [x] Wire format unchanged (two-instance sync test)
- [x] Run `/review` → `/ship` → merge to `main`

---

## fix/android-companion-polish — Android + Wear OS Polish (standalone)

```
branch:   fix/android-companion-polish
from:     main (any stable point — does not depend on desktop milestones)
risk:     MEDIUM for BreatheSession concurrency rewrite (needs manual physical device test)
          LOW for P1 bug fixes and P3/P4 mechanical changes
depends:  nothing blocking; can merge to main independently of desktop sequence
commits:  fix:, refactor:
skills:   /review + /ship (close out)
```

> All changes confined to `src-tauri/gen/android/`. No Rust, TypeScript, or Tauri config changes.
> Can be worked in parallel with any desktop milestone. Merge any time.

**Pre-flight:** Read `src-tauri/gen/android/app/src/main/java/com/moodbloom/app/WearListenerService.kt`, `WearPlugin.kt`, `BiometricPlugin.kt`; and `src-tauri/gen/android/wear/src/main/java/com/moodbloom/wear/BreatheSessionActivity.kt`, `SyncFragment.kt`, `MoodHistory.kt`.

**Plan:** `active-plans/feat-android-companion-polish.md`

### Phone App — P1 Bugs
- [x] **PHONE-P1-1** — Extract `AudioFrameParser` from `WearListenerService` + `WearPlugin` (single parse path for 4-byte-header framing protocol)
- [x] **PHONE-P1-2** — `WearPlugin` singleton: simplify `_instance volatile` → companion object (Tauri init is single-threaded)
- [x] **PHONE-P1-3** — `WearSignalBuffer`: validate JSON at `enqueue()` time; log and discard malformed entries (prevents bad JSON replaying in `drainBuffer()`)

### Phone App — P2 Hardening // parallel
- [x] **PHONE-P2-1** — `BiometricPlugin` lines 112, 174: `activity as FragmentActivity` → `activity as? FragmentActivity ?: return`
- [x] **PHONE-P2-2** — `BiometricPlugin`: empty `catch (_: Exception) {}` on KeyStore errors → `Log.w()`
- [x] **PHONE-P2-3** — `WearListenerService`: delete stale audio file in `voice_memos_incoming/` on bridge failure path
- [x] **PHONE-P2-4** — `WearListenerService`: add `byteArray.size > 1_048_576` guard before parsing metadata JSON

### Phone App — P3 Constants // parallel
- [x] **PHONE-P3-1** — New file `WearProtocol.kt`: centralize `/audio_channel`, `/signal`, `/feedback` path constants (scattered across `WearListenerService`, `WearPlugin`, `FeedbackService`, `RecordFragment`)
- [x] **PHONE-P3-2** — `MoodTileService` + `TileActionActivity`: replace `"com.moodbloom.app"` literals → `BuildConfig.APPLICATION_ID`

### Wear OS App — P1 Bugs
- [x] **WEAR-P1-1** — `SyncFragment` line 121: `val total = voiceSent` → `voiceSent + moodSent`
- [x] **WEAR-P1-2** — `MoodHistory`: `MOODS.first { it.level == moodLevel }` → `firstOrNull() ?: MOODS[2]` (neutral fallback; prevents `NoSuchElementException`)
- [x] **WEAR-P1-3** — `MoodHistory`: deduplicate double `load(prefs)` call (lines 43–44)
- [x] **WEAR-P1-4** — `TileActionActivity`: on send failure, show `tvStatus.text = "Not sent"` + red tint + error haptic + delayed `finish()` (currently finishes unconditionally)
- [x] **WEAR-P1-5** — `SyncFragment`: add transfer failure error state visible to user

### Wear OS App — P2 Hardening // parallel
- [x] **WEAR-P2-1** — `BreatheSessionActivity`: replace `while (isPaused) delay(50)` busy-wait → `Channel`-based conditional suspend
- [x] **WEAR-P2-2** — `BreatheSessionActivity`: `@Volatile isPaused` → `AtomicBoolean`
- [x] **WEAR-P2-3** — `BreatheSessionActivity`: wrap `vibrate()` with `if (lifecycle.currentState.isAtLeast(STARTED))`
- [x] **WEAR-P2-4** — `BreatheSummaryActivity`: `if (!userInteracted && isActive)` guard on 6s auto-dismiss coroutine
- [x] **WEAR-P2-5** — `BreatheRingView.setModeColor()`: add `try-catch` around `Color.parseColor()` with fallback `#8b5cf6`
- [x] **WEAR-P2-6** — `BreatheModeDetailActivity`: add `withTimeoutOrNull(12_000)` on `HealthSnapshot.capture()` (prevents stuck-disabled button)
- [x] **WEAR-P2-7** — `RecordingSession.onAutoStop`: guard callback with `activity?.isDestroyed == false`

### Wear OS App — P3 Duplication // parallel
- [x] **WEAR-P3-1** — New file `MoodHistoryAdapter.kt`: extract shared adapter from `HistoryActivity.HistoryAdapter` + `HistoryFragment`; update both callers
- [x] **WEAR-P3-2** — `BreatheFragment`: `Calendar.getInstance().get(HOUR_OF_DAY)` → `LocalTime.now().hour` (Wear OS 3+ is API 30)
- [x] **WEAR-P3-3** — `MoodComplicationService`: add 30s in-memory cache (field + timestamp) — currently calls `MoodHistory.load()` on every complication update
- [x] **WEAR-P3-4** — `MoodAdapter`: move `GradientDrawable` creation out of `onBindViewHolder` (alloc per scroll frame)
- [x] **WEAR-P3-5** — `OfflineQueue`: replace `ConcurrentLinkedQueue + takeLast(MAX_ENTRIES)` O(n) → `ArrayDeque` with `removeFirst()` eviction

### Wear OS App — P4 Polish // parallel
- [x] **WEAR-P4-1** — Extract all hardcoded UI strings to `wear/src/main/res/values/strings.xml`: "Log mood", "Syncing…", "Sync now", "Recording…", haptic labels
- [x] **WEAR-P4-2** — Replace `"com.moodbloom.wear"` cross-process literals → `BuildConfig.APPLICATION_ID`
- [x] **WEAR-P4-3** — `HealthSnapshot`: downgrade post-timeout `Log.d()` → `Log.i()`
- [x] **WEAR-P4-4** — `SignalSender.drainAndSend()`: add exponential backoff (250ms, 500ms, 1s) before giving up
- [x] **WEAR-P4-5** — Verify mood hex colors in `MoodPickerScreen.kt` match desktop tokens (`#10b981`, `#84cc16`, `#eab308`, `#f97316`, `#ef4444`); align if not

### Gate
- [x] `./gradlew :app:assembleDebug` — phone app builds clean
- [x] `./gradlew :wear:assembleDebug` — wear app builds clean
- [x] `SyncFragment` count shows `voiceSent + moodSent` correctly
- [x] `MoodHistory` does not throw on any mood level value (including out-of-range)
- [x] `BreatheSession` pause/resume: no stuck state, no busy-wait (verify on physical watch hardware if available)
- [x] `AudioFrameParser` is the single parse path — both `WearPlugin` and `WearListenerService` use it
- [x] No `"com.moodbloom.app"` or `"com.moodbloom.wear"` literals remaining in Kotlin source
- [x] Run `/review` → `/ship` → merge to `main`

---

## fix/browser-mode-setup — Browser Mode Setup & Unlock Fix (standalone)

```
branch:   fix/browser-mode-setup
from:     main (any stable point)
risk:     LOW to MEDIUM — IndexedDB backend only; no Rust changes
depends:  nothing blocking; can merge anytime independently
commits:  fix:
skills:   /investigate (root cause), /review + /ship (close out)
```

> All changes confined to `src/lib/backend/browser-invoke.ts`, `src/lib/backend/browser.ts`, and `src/lib/services/crypto.ts`. No Tauri command or Rust changes required.

**Problem:** Live web build at `journal.moodhaven.app` fails during:
- Initial setup (password creation)
- Unlock after setup ("An error occurred. Please try again.")
- "Failed to set up. Please try again." on Import Existing Data

No browser console errors. Root hypothesis: the v0.9.0 SEC-DEFER-001 change wired `LockScreen.tsx` to `invoke('verify_password')` (Tauri command), but `browser-invoke.ts` has no shim for that command name — it silently fails in browser mode.

**Pre-flight:** Read `src/lib/backend/browser-invoke.ts` (full routing table), `src/lib/backend/browser.ts` (`storePasswordHash`, `getPasswordHash`), `src/lib/services/crypto.ts` (`verifyPassword`), `src/components/LockScreen.tsx` (unlock call site post SEC-DEFER-001).

### Investigation + Fix
- [x] **BROWSER-001** — Check `browser-invoke.ts`: is `verify_password` routed? SEC-DEFER-001 wired `LockScreen.tsx` to `invoke('verify_password')` but the browser shim table may not have an entry → "An error occurred" on unlock
- [x] **BROWSER-002** — If missing: add browser shim for `verify_password` that calls `crypto.verifyPassword(password)` using the IndexedDB-stored hash (mirrors what `browser.getPasswordHash()` already returns)
- [x] **BROWSER-003** — Confirm `store_password_hash` and `get_password_hash` are routed correctly; fix any gaps
- [x] **BROWSER-004** — Check Import Existing Data path in browser-invoke: confirm the import command routes to `browser.importData()`
- [x] **BROWSER-005** — Full smoke test in browser mode (`npm run dev:web`): setup → lock → unlock → import

### Gate
- [x] `npm run dev:web` — browser build starts without errors
- [x] Browser: full setup flow completes (password set, first entry saved)
- [x] Browser: lock → correct password → unlocks
- [x] Browser: lock → wrong password → stays locked with error message
- [x] Browser: Import Existing Data flow completes without errors
- [x] `npm run typecheck` — zero errors
- [x] `npm test` — all existing tests pass
- [x] Run `/review` → `/ship` → merge to `main`

---

## v0.9.0 — Security + Logging + Settings

```
branch:   feat/v0.9.0-security-logging-settings
from:     main (after v0.8.4 merged; refactor/peer-sync-engine ideally merged first)
risk:     HIGH for SEC-DEFER-001 (wrong PBKDF2 params permanently lock users out)
          MEDIUM for settings refactor (coordination rules must hold)
depends:  v0.8.4 merged — peer sync refactor is standalone and can merge before/after
commits:  feat:, fix:, refactor:
skills:   /health (baseline), /investigate (if SEC-DEFER-001 parity fails),
          /review + /ship (close out)
```

**Pre-flight:** Read `src/components/LockScreen.tsx` (current unlock flow), `src-tauri/src/commands/journal.rs` (password hash storage), `src/lib/services/crypto.ts` (PBKDF2 params — iterations, hash, salt format), `src/components/settings/SettingsPage.tsx` (current tab structure), `active-plans/feat-logging-debug.md`, `active-plans/feat-log-level-selector.md`, `active-plans/refactor-settings-and-capsule-tests.md`.

**Session start:** `TaskCreate` for: security work, peer sync refactor, logging system, settings extraction (these four are independent and can be parallelized across sessions).

### Security — do first, gate independently before other work lands
- [x] **SEC-DEFER-001** — Move password verification to Rust
  > ⚠ RISK: Wrong PBKDF2 params lock users out permanently. Write and pass parity test BEFORE wiring the UI.
  - [x] Confirm exact params in `src/lib/services/crypto.ts`: 600k iterations, HMAC-SHA-256, salt encoding (`btoa/atob` standard base64, NOT URL-safe)
  - [x] Use `pbkdf2` crate (already in `Cargo.toml`) + `hmac` + `sha2` — NOT `ring` (ring is not in Cargo.toml)
  - [x] Add `verify_password(password: String) → Result<bool, String>` in `src-tauri/src/commands/journal.rs`
  - [x] Rust: `base64::decode(stored_salt)` BEFORE passing to `pbkdf2::derive` — critical; passing base64 string bytes directly will silently fail for ALL users
  - [x] Rust unit test vectors (hardcoded, generated from frontend):
    - Known vector (ASCII): `password="test123"`, `salt=<base64>` → assert exact base64 hash match
    - Unicode vector: `password="日記📝"`, `salt=<base64>` → assert exact base64 hash match (non-ASCII critical path)
    - Wrong password → `false`
    - Empty password → `Err("empty password")`, NOT `Ok(false)` or panic
    - Truncated/invalid base64 salt → `Err`, not panic
  - [x] Parity integration test: generate hash in frontend → store → invoke Rust `verify_password` → assert `true`; modify password → assert `false`
  - [x] Only after ALL test vectors pass: update `LockScreen.tsx` to `invoke('verify_password')`
  - [x] Register in `src-tauri/src/lib.rs` + `src-tauri/capabilities/default.json`
- [x] **A-14** (`src-tauri/src/commands/speech_to_text.rs`) — `stt_download_model` URL allowlist
  - [x] Allowlist: `ggml-tiny.en.bin`, `ggml-base.en.bin`, `ggml-small.en.bin`, `ggml-medium.en.bin`, `ggml-large-v3.bin`
  - [x] `Err("invalid model name")` before constructing Hugging Face URL (`model_url()` fn + tests)

### ~~Peer Sync Engine Refactor~~ → moved to `refactor/peer-sync-engine` standalone branch

### Logging System // parallel with settings refactor
> Plans: `active-plans/feat-logging-debug.md`, `active-plans/feat-log-level-selector.md`

- [x] Init `tauri-plugin-log` at `LevelFilter::Debug` (required for runtime gating — do not init lower)
- [x] Replace 75 `eprintln!()` calls in Rust with `log::*` macros
- [x] Add `src/lib/services/logger.ts` — structured wrapper; policy: no journal text, no keys, no passwords
- [x] Replace 40 `console.*` calls in frontend with `logger.*`
- [x] Add + register `get_log_path` command
- [x] Add + register `open_log_folder` command
- [x] Add + register `set_log_level` command
- [x] Settings → About tab: log level selector (Error / Warn / Info / Debug), default `warn`
- [x] Settings → About tab: "Open Log Folder" button
- [x] Debug option labelled with a warning (footgun guard)

### Settings Refactor // parallel with logging
> Plan: `active-plans/refactor-settings-and-capsule-tests.md`

- [x] Extract into `src/components/settings/tabs/`:
  - [x] `GeneralTab.tsx`
  - [x] `AppearanceTab.tsx`
  - [x] `PrivacyTab.tsx`
  - [x] `AITab.tsx`
  - [x] `HealthTab.tsx`
  - [x] `SyncTab.tsx`
  - [x] `DevicesTab.tsx` (lives in `src/components/peer-sync/` — imported by SettingsPage)
  - [x] `AboutTab.tsx` (receives log level selector from logging work above)
  - [x] `SpeechToTextTab.tsx` (scaffold only in v0.9.0; F1 populates it in v0.9.1)
- [x] Tab-switch data loading stays coordinated in `SettingsPage` — NOT per-tab `useEffect`s
- [x] `scrollToSection` refs owned by `SettingsPage`, passed as props
- [x] Add 6 Rust unit tests in `src-tauri/src/commands/time_capsule.rs`:
  - [x] `seal_entry` basic path
  - [x] `unseal_entry` basic path
  - [x] Double-seal guard (`Err` when already sealed)
  - [x] `get_due_capsules` returns entry when `sealed_until <= now`
  - [x] Anniversary exclusion (`includeAnniversary: false` skips month/day matches)
  - [x] `get_mood_delta` returns correct avg and today's mood

### Additional Lock Guards // parallel with security work
> Verified by autoplan eng review: these command files have no `require_unlocked` guard at all.
> Privacy-sensitive metadata is accessible while the app is locked.

- [x] **LOCK-analytics** — Add `require_unlocked` to all 6 commands in `analytics.rs`: `get_mood_distribution`, `get_streak_stats`, `get_day_of_week_stats`, `get_monthly_mood_data`, `get_full_analytics_bundle`, `get_insights_metadata`
- [x] **LOCK-time-capsule** — Add `require_unlocked` to `seal_entry`, `get_due_capsules`, `unseal_entry`, `get_mood_delta` in `time_capsule.rs`
- [x] **LOCK-oura** — Add `require_unlocked` to `oura_save_pat`, `oura_disconnect`, `oura_get_status`, `oura_sync_today`, `oura_get_context`, `oura_get_history`, `oura_backfill` in `oura.rs`
- [x] **LOCK-get-setting** — Add `require_unlocked` to `get_setting` in `settings.rs` (currently unguarded; `openai_api_key` and `oura_pat` are readable while locked)

### Additional Fixes // parallel
- [x] **B6** — Device name trim + reject empty: `DevicesTab.tsx` + `src-tauri/src/commands/peer_identity.rs`
- [x] **B9** — Oura PAT trim on save + format hint in `OuraConnectionCard.tsx`

### Gate
- [x] Manual unlock: correct password → Rust `true` → app unlocks
- [x] Manual unlock: wrong password → Rust `false` → lock screen error, stays locked
- [x] Log file present at `{app_data}/logs/moodhaven.log` after first launch
- [x] Log level change takes effect without restart
- [x] All 9 settings tabs render (General, Appearance, Privacy, Sync, AI, Health, Devices, Export, Speech, About); all settings survive app restart
- [x] Peer sync refactor: wire format unchanged (verify with two-instance sync test)
- [x] `cd src-tauri && cargo test` — all Rust tests pass including 6 new time capsule tests
- [x] `npm test` — 641 tests pass
- [x] `npm run typecheck` — zero errors
- [x] `npm run lint` — clean (132 pre-existing warnings, 0 errors)
- [x] Bump `0.9.0` in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
- [x] Update `CHANGELOG.md` — add v0.9.0 entry
- [x] Run `/review` — address findings
- [x] Run `/ship` → merge to `main`

---

## v0.9.1 — Hotfix: Unlock / Reset Regressions

```
branch:   fix/lock-screen-unlock-reset
from:     main (after v0.9.0 merged)
status:   COMPLETE — shipped as PR #46
```

**What shipped:**
- Added 10 missing commands to `src-tauri/permissions/app-commands.toml` (root cause of unlock failure)
- `verify_password`, `unlock_app`, `lock_app` + 7 others were blocked by Tauri ACL
- Removed `require_unlocked()` guard from `factory_reset` (must work pre-auth)
- Fixed `rateLimitService.persistState` swallowing "Session is locked" into outer catch
- Fixed `settingsService` silently swallowing "Session is locked" errors (was logging as error)
- New `settingsService.test.ts` — 10 tests for locked-state behavior

---

## v0.9.2 — Feature Completeness

```
branch:   feat/v0.9.2-features
from:     main (after v0.9.1 merged)
risk:     medium — new components, uses src/lib/services/ paths from v0.8.5
depends:  v0.9.1 merged
commits:  feat:
skills:   /health (baseline), /review + /ship (close out)
```

**Pre-flight:** Read `src/features/writing/WritingView.tsx` (editor + toolbar structure), `src/hooks/useSpeechToText.ts`, `src/hooks/useAudioRecorder.ts`, `src/features/timeline/TimelineView.tsx` (render loop + filter logic), `src-tauri/src/commands/speech_to_text.rs` (download flow for B7/B8).

**Session start:** `TaskCreate` for F1 (STT UI), F3 (virtual scroll), then F2/F8/F9 as parallel tasks.

### F1: STT UI Integration (must-have) — do first

**Design spec (from autoplan Phase 2):**
- Mic button: rightmost TipTap toolbar item, separated by divider; outline mic icon at idle → filled mic when recording; `duration-200` transition
- When STT disabled: hide mic button entirely
- When STT enabled but no model downloaded: show disabled mic button with tooltip "Download a model in Settings → Speech to Text to enable dictation"
- Recording indicator: below TipTap toolbar, full-width strip, 40px height; MM:SS elapsed timer + stop button; waveform (20 SVG bars, amplitude-responsive, `duration-200`; static bars when `prefers-reduced-motion`)
- After recording stops: show "Transcribing..." spinner on mic button (not idle) until result returns
- Transcription result: route through existing `TranscriptPreviewOverlay.tsx` — DO NOT insert directly at cursor without preview
- On permission denied: inline error "Microphone access denied. Check System Settings."
- On model download success: toast "Speech-to-text ready — tap the mic in the editor"
- Accessibility: mic button `aria-label` toggles "Start recording" / "Stop recording"; waveform `aria-hidden="true"`; `prefers-reduced-motion`: static bars, no pulse

**Tasks:**
- [x] Animated mic button in TipTap toolbar in `WritingView.tsx` (rightmost, with divider)
- [x] Disabled-with-tooltip mic state when STT enabled but model not downloaded
- [x] Waveform visualization: 20 SVG amplitude bars, `duration-200`, `aria-hidden="true"`, static fallback for `prefers-reduced-motion`
- [x] Recording state indicator: below toolbar, 40px, elapsed timer (MM:SS), stop button
- [x] "Transcribing..." spinner state on mic button while `stt_transcribe` runs
- [x] Route transcription result through `TranscriptPreviewOverlay.tsx` (not direct cursor insert)
- [x] OS permission denied → inline error message in WritingView
- [x] STT model download UI in Settings → Speech to Text tab with progress bar (moves here from v0.9.0 tab split)
  > Hooks exist: `useSpeechToText`, `useAudioRecorder` — build UI on top, don't rewrite
- [x] Mic button hidden until STT enabled in settings AND model downloaded
- [x] **B2** — Validate model presence on Settings → Speech to Text tab open; if absent, show "download" button
- [x] **STT-ERR-1** — Transcription failure: toast notification + mic button returns to idle state
- [ ] **STT-ERR-2** — Model download failure: show retry button + error message
- [ ] **B7** (`src-tauri/src/commands/speech_to_text.rs`) — `tokio::time::timeout` around `reqwest` download stream
- [ ] **B8** (`src-tauri/src/commands/speech_to_text.rs`) — delete `.partial` file in error path
- [x] **B10** (`src/hooks/useSpeechToText.ts`) — fix `checkedRef` defeating hook memoization

### F3: Timeline Virtual Scrolling (must-have) // parallel with F2, F8, F9
- [x] Virtual list in `src/pages/TimelineView.tsx`
- [x] Render visible rows only + configurable overscan (5 rows recommended)
- [x] All existing filter/sort/book/tag behavior preserved
- [x] Pinned entries remain always-visible at top
- [x] No third-party library — `position: absolute` + measured row heights
- [x] Handle grouped-by-day layout: virtual window must include day header rows; header rows have different height from entry rows
- [x] Absolute positioning drift fix: on any mutation (filter change, media badge load, expand/collapse) → re-measure all affected rows and recompute offsets
- [ ] **VSCROLL-TEST** — Pinned entries always appear above virtual window (not inside it); test case required
- [ ] **VSCROLL-TEST-2** — Dynamic height: test that row heights update correctly after media badge loads (async height change)

### F2: Hashtag Browser // parallel
- [x] New `src/components/journal/TagCloud.tsx`
- [x] Click tag → sets active tag filter in `TimelineView.tsx`
- [x] Use `get_book_tags` if sufficient; add `get_all_tags` Rust command only if needed

### F8: Export Date-Range Selection // parallel
- [x] Date range picker in export dialog (in `SelectiveExportPanel.tsx`) — already implemented
- [x] Wire to `export_data` `filter.startDate` / `filter.endDate` — no backend changes needed

### F9: Peer Sync Status Detail // parallel
- [x] Per-device last-sync timestamp in `TrustedDevicesList.tsx` (loads from `peer_get_sync_states`)
- [x] "Sync now" button per device in `DevicesTab.tsx` `NearbyPeerRow` — already existed
- [x] No new Rust commands: use existing `peer_get_sync_states` + `peer_get_trusted`

### Gate
- [x] Mic button visible in editor → record → transcription inserted at cursor
- [x] Timeline with 500+ seeded entries scrolls smoothly
- [x] Tag cloud click filters timeline
- [x] Export with date range produces correct subset
- [x] Devices tab shows per-device last-sync timestamp; "Sync now" triggers sync
- [x] `npm test` — all tests pass (665)
- [x] `npm run typecheck` — zero errors
- [x] `npm run lint` — clean (warnings only, pre-existing)
- [x] Bump `0.9.2` in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
- [x] Update `CHANGELOG.md` — add v0.9.2 entry
- [ ] Run `/review` — address findings
- [ ] Run `/ship` → merge to `main`

---

## v0.9.3 — Polish & QoL

```
branch:   feat/v0.9.3-polish
from:     main (after v0.9.2 merged)
risk:     low — additive UI only
depends:  v0.9.2 merged
commits:  feat:, fix:
skills:   /health (baseline), /design-review (visual pass on new UI),
          /review + /ship (close out)
```

**Pre-flight:** Read `src/components/layout/Sidebar.tsx` (footer area for F4 sparkline), `src/features/timeline/TimelineView.tsx` (pinned section placement), `src/components/timecapsule/TimeCapsuleRevealModal.tsx` (modal structure for accessibility work).

**Session start:** `TaskCreate` one task per feature (F4–F10 are all independent).

### Privacy Transparency System (Warrant Canary) // parallel
> Context: `active-plans/warrant-canary.md` (merged — see Decision Log)  
> Goal: reinforce user trust via verifiable, human-readable privacy guarantees — not just claims.

**Scope for v0.9.3 (MVP — no signing key complexity):**
- [x] **PRIV-001** — Settings → Privacy: add "Transparency" section with static Privacy Guarantees card (human-readable bullet list: no cloud by default, no telemetry, LAN-only sync, AES-256-GCM encryption, no accounts)
- [x] **PRIV-002** — Settings → Privacy: "Current Privacy State" live panel (reads actual runtime state: `cloudSyncEnabled`, `aiEnabled`, `telemetryEnabled`, `externalConnections: []`) — machine-checkable snapshot the user can see
- [x] **PRIV-003** — Export privacy state as JSON (button: "Export Privacy Snapshot") — exports the live panel data to a `.json` file via `write_text_file` (existing command, no new Rust needed)
- [x] **PRIV-004** — First-run onboarding: add "Private by design" slide with the three core guarantees (local-only storage, optional LAN sync, no accounts required) before the password setup step
- [x] **PRIV-005** — `docs/TRANSPARENCY.md`: unsigned transparency manifest template (version, date, commit hash, statement of no telemetry/backdoors/cloud collection) — updated each release

**Deferred to post-v1.0 (signing complexity not worth it pre-launch):**
- Transparency signing key + GPG-signed manifest (`/docs/keys/transparency.asc`)
- `moodbloom verify-transparency` CLI command
- Automated canary renewal in CI
- In-app signature verification UI

### Features // all parallel
- [x] **F4** — 7-day mood sparkline in `Sidebar.tsx` footer (inline SVG, `get_mood_statistics`)
- [x] **F5** — Keyboard shortcuts in `WritingView.tsx`: `1–5` mood, `Ctrl+Shift+F` focus, `?` cheatsheet modal
- [x] **F6** — Pinned entries collapsible section at top of `TimelineView.tsx` (existing `pinned` column — no backend work) — was already implemented
- [x] **F7** — Streak celebration toasts at 7 / 30 / 100 day milestones (`get_streak_stats` on app load)
- [x] **F10** — On This Day in-app banner on app load when prior-year entries exist for today's date

### Accessibility
- [x] **TL-003** (`src/components/timecapsule/TimeCapsuleRevealModal.tsx`) — focus trap on open, ESC closes, `aria-modal="true"`, `role="dialog"`, initial focus on first interactive element — was already implemented

### Code Quality // parallel
- [x] **SETTINGS-001** — Extract `use2FASetup`: `PrivacyTab.tsx` → `src/hooks/use2FASetup.ts`
- [x] **D-003** — Voice memos empty state in `WritingView.tsx` (onboarding guidance when no memos exist)

### Gate
- [ ] Sparkline renders in sidebar with real data
- [ ] `1–5` keys set mood in WritingView; `?` opens cheatsheet; no TipTap key conflicts
- [ ] Pinned entries appear above unpinned; section collapsible
- [ ] Streak toast fires (verify with seeded 7-day streak)
- [ ] TimeCapsule modal: Tab cycles focus within modal, ESC closes, screen reader sees `dialog` role
- [ ] Run `/design-review` on the new UI additions — fix any findings
- [x] `npm test` — all tests pass
- [x] `npm run typecheck` — zero errors
- [x] `npm run lint` — clean
- [x] Bump `0.9.3` in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
- [x] Update `CHANGELOG.md` — add v0.9.3 entry
- [ ] Run `/review` → `/ship` → merge to `main`

---

## v0.9.4 — Website QA + Design Unification + Brand Rename

```
branch:   feat/v0.9.4-design-rename
from:     main (after v0.9.3 merged)
risk:     medium for design token sweep (visual regressions possible)
          medium for website QA (may surface scope beyond design debt list)
depends:  v0.9.3 merged
commits:  fix:, feat:, chore:
skills:   /health (baseline), /qa (website), /design-review (website visual pass),
          /review + /ship (close out)
```

> Android work moved to v1.1 (separate release). Brand rename and lib restructure COMPLETE (done prior to v0.9.3).

**Pre-flight:** Read `active-plans/design-unification.md` (Phase A/B/C scope), `tailwind.config.js` (current token set).

**Session start:** `TaskCreate` for: website QA + fixes, design unification, README + wiki (all parallelizable).

### ~~Brand Rename~~ — COMPLETE

### ~~Lib Restructure~~ — COMPLETE

### README Revamp + Wiki Migration // parallel with rename
> Context: merged from `readme-revamp-wiki.md` + `v.8.5.1.md` (see Decision Log)  
> Goal: make README user-facing and discovery-friendly; move technical depth to GitHub Wiki.

**README rewrite (user-focused, landing-page style):**
- [ ] Replace current technical README with: purpose/benefits, core features, trust statement, beta program, links to wiki
- [ ] Tone: calm, trustworthy, non-technical for first paragraph; technical links available but not front-and-center
- [ ] Add: "Free and open source. No account, no subscription, no cloud required." above the fold
- [ ] Add: `VITE_DEV_MODE=bypass npm run dev:web` one-liner to Quick Start for browser dev (DX gap from Phase 3.5)
- [ ] Add badges: build status, license, GitHub stars
- [ ] Generate user-friendly Changelog highlights for v0.8.4 → v0.9.x cycle (concise; wiki link for full technical diff)

**GitHub Wiki creation:**

| Source Content | Wiki Page | Notes |
|----------------|-----------|-------|
| Encryption/security architecture | `Wiki/Security` | AES-256-GCM, PBKDF2, zero-knowledge, password/recovery |
| Peer sync protocol | `Wiki/Peer-Sync` | Device identity, pairing, LAN-only, conflict resolution |
| Watch/Phone companion | `Wiki/Wear-OS-Companion` | Architecture, voice memos, mood taps, health snapshots |
| Build from source | `Wiki/Build` | Node.js, Rust, OS deps, dev workflow, hardware key |
| Keyboard shortcuts | `Wiki/Shortcuts` | Shortcut table, usage tips |
| Full tech stack | `Wiki/Tech-Stack` | Frontend, backend, state, peer discovery, 2FA, charts, testing |
| Beta testing | `Wiki/Beta-Testing` | Desktop + Wear OS workflows, edge cases, feedback channels |
| Dev setup | `Wiki/Development` | Dev commands, testing, typecheck, Cargo, architectural rules |
| Changelog | `Wiki/Changelog` | Table or highlights linking to `CHANGELOG.md` |

- [ ] Create all 9 wiki pages (copy technical content from README and docs/)
- [ ] Add back-links in each wiki page: "For general overview → [README](README.md)"
- [ ] Update internal doc cross-links: CONTRIBUTING.md, CLAUDE.md key files table

### Website QA + Improvement // parallel with rename
> Goal: the website should feel like it was made by the same team as the app — same visual language,
> same tone, same level of polish. Run QA first to find issues, then fix them.

**Pre-flight audit findings (2026-04-12) — confirmed in code:**

| ID | File | Issue | Priority |
|----|------|-------|----------|
| WQA-001 | `components/HomeClient.tsx:71` | "Free to download. Pro features coming soon." — contradicts FOSS positioning | P0 |
| WQA-002 | `app/faq/page.tsx` — "Is MoodHaven free?" | References "Pro tier for AI insights and future cloud features" — must be rewritten | P0 |
| WQA-003 | `app/faq/page.tsx` — "Community vs future versions" | Implies paid tiers; remove or reframe as "all features free and open source" | P0 |
| WQA-004 | `components/HomeClient.tsx:44` | Hero subtitle names "Day One or Notion" — competitive framing, revisit tone | P1 |
| WQA-005 | `components/WaitlistModal.tsx` | Formspree waitlist endpoint (`xeogkzgz`) still wired — conflicts with "just download it" positioning | P1 |
| WQA-006 | `components/HomeClient.tsx:30` | Hero uses `hero-rain.jpg` — blue rain photo, no relation to app brand (DESIGN-DEBT-001) | P1 |
| WQA-007 | `components/HomeClient.tsx` | No FOSS statement above the fold (DESIGN-DEBT-005) | P1 |
| WQA-008 | Homepage | No GitHub star badge anywhere (DESIGN-DEBT-004) | P2 |
| WQA-009 | `components/CommunityCallout.tsx` | Newsletter carousel position — likely above product proof (DESIGN-DEBT-002) | P2 |

**Token audit:** `tailwind.config.js` colors match app — violet `primary`, orange `accent.cta`, mood palette aligned. No token work needed.

- [ ] Fix WQA-001 — strip "Pro features coming soon" from hero
- [ ] Fix WQA-002 + WQA-003 — rewrite FAQ pricing answers to reflect FOSS reality
- [ ] Fix WQA-004 — revise hero subtitle (drop competitor names, lead with local-first + privacy)
- [ ] Fix WQA-005 — audit `WaitlistModal` usage; remove or replace with download CTA
- [ ] Fix WQA-007 — add FOSS statement above the fold in hero (DESIGN-DEBT-005)
- [ ] Fix WQA-008 — add GitHub star badge to homepage (DESIGN-DEBT-004)
- [ ] Fix WQA-006 — replace blue rain hero photo (DESIGN-DEBT-001)
- [ ] Fix WQA-009 — move newsletter carousel below product proof (DESIGN-DEBT-002)
- [ ] Run `/qa` on the website — capture any remaining functional bugs, broken links, layout issues
- [ ] Fix all remaining P0/P1 findings from QA pass
- [ ] Run `/design-review` on the website — visual audit against app design language
  > Look for: color mismatches vs. app mood palette, typography inconsistency, spacing/alignment,
  > animation quality, mobile responsiveness, hero hierarchy, CTA clarity
- [ ] Fix all design-review findings (within scope of existing site structure)
- [ ] **Phase B** (design-unification) — Tokens: sweep 4 components + 5 static pages for any remaining off-token colors
- [ ] **Phase C** (design-unification) — Hero: subtitle leading with local-first + AI insights + privacy
- [ ] **DESIGN-DEBT-003** — Convert value props to proof-based modules (concrete evidence)
- [ ] **D-001** — Create `DESIGN.md`: color tokens, typography scale, spacing, motion, component vocabulary
- [ ] Final `/design-review` pass on website after all changes — confirm cohesion with app

### Gate
- [ ] `npm run typecheck` — zero errors
- [ ] `npm test` — all 633+ tests pass (brand string renames in test files)
- [ ] `npm run lint` — clean
- [ ] `cargo check` — zero errors
- [ ] `npm run dev:web` — browser build starts without errors
- [ ] App DB migration: existing `moodhaven.db` users can upgrade without data loss
- [ ] Website `/qa` report: zero P0/P1 issues remaining
- [ ] Website `/design-review` report: consistent with app visual language
- [ ] No "Pro", "subscription", or "pricing" language anywhere on website
- [ ] `DESIGN.md` exists with all token categories covered
- [ ] Bump `0.9.4` in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
- [ ] Update `CHANGELOG.md` — add v0.9.4 entry
- [ ] Run `/review` → `/ship` → merge to `main`

---

## v1.1.0 — Android Companion + Play Store

```
branch:   feat/v1.1.0-android
from:     main (after v1.0.0 tagged + stable)
risk:     HIGH for WEAR-002 applicationId (Play Store pairing — atomic across both modules)
depends:  v1.0.0 shipped and stable; v0.9.4 rename merged (DB filename finalized)
commits:  fix:, feat:, chore:
skills:   /health (baseline), /qa (phone + wear apps), /design-review (wear visual pass),
          /review + /ship (close out)
```

> Android decoupled from v1.0 so a WEAR-002 slip can't delay the desktop release.

**Pre-flight:** Confirm `fix/android-companion-polish` is merged (P1–P4 bugs fixed). Read both Android `build.gradle` files.

> P1–P4 Android polish (crash fixes, concurrency hardening, code cleanup) moved to standalone branch `fix/android-companion-polish`. This milestone is Play Store submission + final QA only.

### Play Store (ATOMIC — do first)
- [ ] **WEAR-002** — Align `applicationId` in phone + wear `build.gradle` (ATOMIC commit — Play Store pairing requirement)
- [ ] **PS-004** — Add SHA-256 checksums for AAB artifacts to `latest-release.json`

### Final QA + Polish
- [ ] Run `/qa` on phone + wear apps; fix all P0/P1 findings
- [ ] Run `/design-review` on wear app — colors, spacing, animation quality
- [ ] Final `/design-review` pass after fixes

### Gate
- [ ] Both `build.gradle` show `applicationId = "com.moodhaven.app"`
- [ ] Wear + phone `/qa` reports: zero P0/P1 issues
- [ ] Wear + phone `/design-review` reports: consistent with desktop
- [ ] Android E2E: voice memo record on watch → transfer to phone → transcription on desktop
- [ ] Bump `1.1.0` in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
- [ ] Update `CHANGELOG.md` — add v1.1.0 entry
- [ ] Run `/review` → `/ship` → merge to `main`

---

## v1.0.0 — Release Preparation

```
branch:   chore/v1.0.0-release
from:     main (after v0.9.4 merged)
risk:     low — no logic changes; docs, version bumps, release artifacts only
depends:  ALL prior milestones merged
commits:  chore:, docs:
skills:   /health (final baseline), /document-release (docs sync),
          /review + /ship (close out)
```

**Pre-flight:** Run `npm test`, `cargo test`, `npm run typecheck`, `cargo check` on `main` before branching. The release branch must start from a clean, passing state.

**Session start:** `TaskCreate` for: security audit, documentation, final QA matrix, release artifacts.

### Final Security Audit
- [ ] `npm audit` — zero high/critical
- [ ] `cargo audit` — zero high/critical
- [ ] End-to-end SEC-DEFER-001: create entry → lock → unlock via Rust verify → content decrypts correctly
- [ ] Spot-check log at `info` level — no journal text, no keys, no passwords visible
- [ ] Review `src-tauri/capabilities/default.json` — no excess permissions vs. what's actually used

### Documentation
- [ ] Run `/document-release` — syncs README, ARCHITECTURE, CONTRIBUTING against the full diff
- [ ] `CHANGELOG.md` — complete entries for v0.8.4 through v1.0.0
- [ ] `docs/tauri-commands.md` — add `verify_password`, `get_log_path`, `open_log_folder`, `set_log_level`, and any others added this cycle
- [ ] `SECURITY.md` — note SEC-DEFER-001 resolved (password verification now in Rust)
- [ ] Archive to `docs/internal/plans/`: all 8 active plan files + `roadmap-v1.0.md`

### Final QA
- [ ] `npm test` — 700+ tests pass (from current 633)
- [ ] `cd src-tauri && cargo test` — all Rust tests pass
- [ ] Smoke: Linux AppImage installs + launches
- [ ] Smoke: Linux .deb installs + launches
- [ ] Smoke: Windows .msi installs + launches
- [ ] Smoke: macOS .dmg installs + launches
- [ ] `npm run build:web` — browser build succeeds, IndexedDB backend functional
- [ ] Android E2E: voice memo record on watch → transfer to phone → transcription on desktop

### Release
- [ ] Bump `1.0.0` in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
- [ ] `git tag v1.0.0`
- [ ] GitHub release: AppImage, .deb, .msi, .dmg + SHA-256 checksums
- [ ] Update `latest-release.json` — version, asset names, checksums, release URL
- [ ] Website latest-version pointer updated
- [ ] Run `/review` → `/ship` → merge to `main`

---

## Deferred (post-1.0)

- **WP-001–004** — Web port Phase 2+: LAN sync bridge daemon, whisper.wasm STT, WebAuthn in browser
- **LOG-001/002** — Per-module log level configuration; debug-on indicator badge in About tab
- **SETTINGS-002** — `React.lazy()` per-tab code splitting (pending bundle analysis)
- **Watch Phase 5** — AI enrichment, smart prompts, mood inference from watch signals

---

## Decision Log

> Record non-obvious judgment calls made during execution so future sessions don't re-derive them.  
> Format: `[vX.Y.Z] <what was decided> — <why>`

<!-- decisions go here -->
[autoplan 2026-04-05] Rename moved from v0.8.5 to v0.9.3 — both CEO review models flagged rename-before-SEC-DEFER-001 as risky; git history coherence for crypto debugging
[autoplan 2026-04-05] Peer sync refactor extracted to standalone branch `refactor/peer-sync-engine` — reduces v0.9.0 risk; plan already suggested this; peer sync refactor cannot block SEC-DEFER-001
[autoplan 2026-04-05] Android decoupled to v1.1 — WEAR-002 slip must not delay desktop v1.0 release; both models agreed; user accepted the recommendation
[autoplan 2026-04-05] CI action pins added to v0.8.4 — tauri-apps/tauri-action@v0 runs with signing key in env; high risk; <1h fix
[autoplan 2026-04-05] DB filename migration required in v0.9.3 — rename changes moodhaven.db filename; existing users need migration or they lose data silently
[autoplan 2026-04-05] STT error states (transcription failure + download error) added to v0.9.1 F1 — missing UX states identified in CEO review Section 11
[2026-04-08] Android P1–P4 polish extracted to standalone branch `fix/android-companion-polish` — merged from `feat-android-companion-polish.md` plan on branch `claude/android-1-0-review-L5F47`; touches only `gen/android/`, no desktop dependency; v1.1.0 retains only WEAR-002 + Play Store submission work
[2026-04-09] `fix-website.md` merged → new standalone section `fix/browser-mode-setup`; root hypothesis: `verify_password` missing from browser-invoke.ts shim after SEC-DEFER-001 change
[2026-04-09] `warrant-canary.md` merged → v0.9.2 Privacy Transparency System (PRIV-001–005); signing/CLI deferred post-v1.0 (complexity not worth it pre-launch)
[2026-04-10] v0.9.1 version number consumed by hotfix (PR #46) — 10 missing ACL commands + factory_reset guard removal + settingsService locked-state fixes; planned "Feature Completeness" work renumbered to v0.9.2, cascade: Polish → v0.9.3, Android/design → v0.9.4
[2026-04-09] `readme-revamp-wiki.md` + `v.8.5.1.md` merged → v0.9.3 README Revamp + Wiki Migration section; 9 wiki pages planned; user-focused README rewrite with technical content in wiki
[2026-04-09] All work through v0.8.5.1 (v0.8.4, android polish, peer sync refactor, browser fix) marked complete
[2026-04-09] Brand rename and lib restructure confirmed complete ahead of v0.9.3; v0.9.3 risk downgraded from HIGH to MEDIUM; Sprint 5 scope reduced to README/wiki/website only

---

# /autoplan Review — 2026-04-05

**Branch:** fix/security-lock-gating | **Commit:** 925b412 | **Mode:** SELECTIVE EXPANSION

---

## Phase 3: Eng Review

### Architecture ASCII Diagram (v1.0 target state)

```
Frontend (React / TypeScript)
  ├─ WritingView.tsx
  │    └─ STT: MicButton → WaveformViz → RecordingIndicator → TranscriptPreviewOverlay
  ├─ features/timeline/TimelineView.tsx
  │    └─ VirtualList: Map<id,height> + ResizeObserver + position:absolute
  ├─ components/settings/tabs/ (9 tabs: General/Appearance/Privacy/AI/Health/Sync/Devices/About/SpeechToText)
  ├─ LockScreen.tsx → invoke('verify_password') [Rust, not WebCrypto]
  └─ src/lib/services/ (32 files) + src/lib/utils/ (7 files)

Tauri IPC (~107 commands post v0.9.0)
  New: verify_password, get_log_path, open_log_folder, set_log_level, stt allowlist guard

Rust Backend
  ├─ journal.rs + verify_password() [pbkdf2 crate, PBKDF2_HMAC_SHA256]
  ├─ peer_sync_engine.rs (orchestrator)
  │    ├─ connection.rs (TCP frame I/O)
  │    ├─ protocol.rs (HELLO/MANIFEST/ENTRIES/DONE)
  │    ├─ sync_crypto.rs (transport key SHA-256)
  │    └─ conflict.rs (LWW updated_at)
  ├─ analytics.rs + time_capsule.rs + oura.rs + settings.rs [NOW LOCKED]
  └─ logging: tauri-plugin-log, LevelFilter::Debug init, runtime set_log_level
```

### Test Diagram (new codepaths → test coverage)

| New Codepath | Test Type | Exists? | Gap? |
|-------------|-----------|---------|------|
| `verify_password` ASCII vector | Rust unit | Planned | Add Unicode vector |
| `verify_password` Unicode vector | Rust unit | GAP | Add non-ASCII test |
| `verify_password` base64 salt decode | Rust unit | GAP | Add invalid-base64 error test |
| `verify_password` empty password | Rust unit | GAP | Add explicitly |
| Parity: frontend hash → Rust verify | Integration | Planned | Strengthen: both pass/fail |
| LOCK guards: analytics, time_capsule, oura, get_setting | Rust unit | GAP | Add one test each |
| STT TranscriptPreviewOverlay from mic | Component | GAP | Add routing test |
| STT transcribing state (spinner) | Component | GAP | Add state machine test |
| STT mic permission denied | Component | GAP | Add error state test |
| Virtual scroll: pinned above window | Unit | GAP | Added to plan |
| Virtual scroll: dynamic height update | Unit | GAP | Added to plan |
| Virtual scroll: grouped day headers | Unit | GAP | Add height-varies test |
| Settings 9 tabs render | Component | Needs update | Verify SpeechToTextTab |
| lib restructure: no broken imports | Build gate | Planned | npm run build:web |

**Test count path to 700+:** Current 633 + 5 Rust lock-guard tests + 5 Rust SEC-DEFER tests + 6 time capsule Rust tests + ~20 STT UI tests + ~15 virtual scroll tests + ~15 settings tab split tests = ~699. Borderline. Add Unicode crypto vector and it clears 700.

### SEC-DEFER-001 Critical Path

1. `cargo check` with `pbkdf2` crate (already in `Cargo.toml`) — no new dependencies
2. Rust must call `base64::decode(stored_salt)` before `pbkdf2::derive` — this is the #1 silent failure mode
3. Password bytes: `password.as_bytes()` in Rust = `TextEncoder.encode(password)` in JS for ASCII; for Unicode, `String` in Rust uses UTF-8 which matches `TextEncoder` encoding. Compatible.
4. Parity test must use a hardcoded triple generated by the frontend: `(password, base64-salt, base64-hash)` — not generated by the test itself
5. Unicode test vector: password with emoji/CJK characters, generated from frontend first

### NOT in scope (from Eng review)

- HKDF for peer sync transport key (SHA-256 is sufficient for current threat model)
- Per-module log level configuration (LOG-001 — deferred)
- Watch Phase 5 AI enrichment

### What already exists

- `pbkdf2` crate v0.12, `hmac`, `sha2`, `base64` — all in `Cargo.toml`
- `require_unlocked()` helper function in `settings.rs:12` — copy pattern to other files
- `TranscriptPreviewOverlay.tsx` — existing component, reuse for STT F1
- `AppLockState` — existing state type, import pattern established

### Failure Modes Registry

| Mode | Severity | Impact | Mitigation |
|------|---------|--------|------------|
| SEC-DEFER-001 wrong base64 decode | Critical | All users locked out permanently | Unicode parity test vector before any UI wiring |
| `analytics.rs` unguarded | High | Mood patterns readable while locked | LOCK-analytics added to v0.9.0 |
| `time_capsule.rs` unguarded | High | Capsule metadata readable while locked | LOCK-time-capsule added to v0.9.0 |
| `get_setting` unguarded | High | API keys readable while locked | LOCK-get-setting added to v0.9.0 |
| Virtual scroll drift on height change | Medium | Timeline renders incorrectly after filter or media load | ResizeObserver + remeasure strategy |
| Lib restructure breaks browser build | Medium | `npm run build:web` fails in CI | `npm run build:web` added to v0.9.3 gate |
| Peer sync type visibility creep | Medium | External modules bypass orchestrator | `grep` gate added to peer sync refactor |

### Eng Completion Summary

| Category | Finding | Auto-Decision |
|----------|---------|---------------|
| SEC-DEFER-001 encoding | base64 salt decode critical; Unicode vector required | Added to v0.9.0 SEC-DEFER-001 task |
| Missing lock guards | analytics, time_capsule, oura, get_setting | Added as LOCK-* tasks in v0.9.0 |
| Virtual scroll dynamic heights | Fixed heights break for grouped rows | Updated F3 to use measured heights + ResizeObserver |
| Lib restructure Vite risk | Browser build may fail on transitive imports | Added `npm run build:web` to v0.9.3 gate |
| Peer sync module API surface | Type visibility creep from extraction | Added grep gate to refactor/peer-sync-engine |

**PHASE 3 COMPLETE.** Codex: 4 concerns (encoding, vscroll heights, test quality, Vite risk). Claude subagent: 6 issues (encoding, parity test, 4 unguarded command sets). Consensus: 5/6 confirmed, 1 disagreement (vscroll — subagent missed it). Passing to Phase 3.5.

---

## Phase 3.5: DX Review

### DX Scope Confirmed
This is a Tauri app (developer-facing command API, npm scripts, CI pipeline) plus a product roadmap that ships new Tauri commands. Developer users include: contributors reading CLAUDE.md, engineers using the Tauri command API, CI/CD maintainers.

### Developer Journey Map

| Stage | Developer Action | Current Experience | Gap |
|-------|-----------------|-------------------|-----|
| 1. Clone | `git clone + npm install + npm run tauri dev` | Works, documented in CLAUDE.md | — |
| 2. First run | `VITE_DEV_MODE=seeded npm run dev:web` | Works (learned: bypass flag needed) | No README note |
| 3. Add command | Follow CLAUDE.md 5-step pattern | Clear, works | — |
| 4. Test | `npm test` | Fast, works | — |
| 5. Build | `npm run tauri build` | Works on Linux; needs apt packages | Build.md covers it |
| 6. Debug prod | Log file at `get_log_path()` | v0.9.0 adds this | Before v0.9.0: no structured logs |
| 7. Upgrade | `cargo audit`, `npm audit` | Per-release gate | SEC-DEP-001 vite upgrade is pending |

**TTHW (time to hello world for a new contributor): ~15 minutes.** Target: <10 min.

### DX Scorecard

| Dimension | Score | Key Finding |
|-----------|-------|-------------|
| Getting started (<5 min) | 7/10 | `npm install && npm run dev:web` works; VITE_DEV_MODE bypass not documented in README |
| API/CLI naming guessable | 8/10 | Tauri commands follow clear snake_case pattern; all documented in tauri-commands.md |
| Error messages actionable | 6/10 | v0.9.0 logging improves this significantly; currently `eprintln!` is the only signal |
| Docs findable | 8/10 | CLAUDE.md + tauri-commands.md are thorough; tauri-commands.md will be stale after v0.9.0 adds new commands |
| Upgrade path safe | 7/10 | Per-milestone PRs; SEC-DEP-001 (vite major bump) is a breaking upgrade with no migration guide yet |
| Dev environment friction | 6/10 | Linux needs apt packages; no Nix/devcontainer. CI pins @v0 (supply chain risk, now fixed in v0.8.4) |
| Error path transparency | 6/10 | After v0.9.0 logging: much better. Before: eprintln! in prod = no signal |
| Contributor onboarding | 8/10 | CLAUDE.md is the best project doc I've seen for AI-assisted contribution |

**Overall DX: 7/10.** TTHW: ~15 min → target 10 min.

### DX Gaps Auto-Decided

| Gap | Fix | Added where |
|-----|-----|-------------|
| `VITE_DEV_MODE=bypass` not in README | Add one-liner to README "Quick Start for browser dev" | v0.9.3 `/document-release` |
| `tauri-commands.md` will be stale after v0.9.0 (+verify_password, +log commands) | Add to v1.0.0 documentation task | Already in v1.0.0 Documentation section |
| SEC-DEP-001 (vite v8 major bump): no migration notes | Add a note: "check vitest.config.ts + vite.config.ts for breaking changes" in v0.8.4 task | Added inline |
| Logging before v0.9.0 is silent in prod | Known gap; v0.9.0 fixes it. No action needed for current milestone | — |

### DX Implementation Checklist

- [ ] (v0.8.4) SEC-DEP-001: document breaking change risks in CHANGELOG entry (vitest setup, vite plugin config)
- [ ] (v0.9.0) Tauri commands reference update for verify_password, log commands, STT allowlist
- [ ] (v0.9.3) `/document-release` will catch README, ARCHITECTURE, CONTRIBUTING gaps
- [ ] (v1.0.0) tauri-commands.md: add all new commands from v0.9.0 cycle

**PHASE 3.5 COMPLETE.** DX overall: 7/10. TTHW: 15 min → target 10 min. 4 small gaps, all auto-decided. Passing to Phase 4.

---

## Cross-Phase Themes

**Theme 1: SEC-DEFER-001 encoding risk** — flagged in Phase 1 (CEO, critical), Phase 3 (Eng, critical). Both models independently identified the base64 salt decode as the top silent-failure vector. **High-confidence: the Unicode parity test vector is load-bearing.**

**Theme 2: Unguarded Tauri commands** — flagged in Phase 1 (CEO, Section 3 security), Phase 3 (Eng, lock guards). Four command files (`analytics.rs`, `time_capsule.rs`, `oura.rs`, `get_setting`) leak metadata while locked. Added as LOCK-* tasks in v0.9.0.

**Theme 3: v0.9.0 scope** — flagged in Phase 1 by both models (too much in one branch). Resolved: peer sync refactor extracted, Android moved to v1.1. v0.9.0 is now correctly scoped.

---

## Phase 2: Design Review

### Design Scope: 5/10
The plan covers what to build but rarely specifies how it should look, feel, or behave under edge conditions. A 10 would specify interaction states, visual anchors, animation intent, and accessibility for each new UI surface.

**No DESIGN.md exists.** Proceeding with universal principles. D-001 (create DESIGN.md) is in the plan for v0.9.3 — correct.

### Existing Design Leverage
- `prefers-reduced-motion` check pattern: `src/App.tsx` (existing), must propagate to new components
- `animate-pulse-soft`, `animate-mood-pop`: existing animation classes — reuse for waveform/toasts
- `duration-200` / `duration-300` conventions: locked in
- `src/components/transcript/TranscriptPreviewOverlay.tsx`: existing preview component — F1 STT should route through this, not duplicate

### DESIGN CODEX/SUBAGENT CONSENSUS: see above litmus scorecard

---

### Pass 1: Information Hierarchy

**Finding 1 (HIGH): STT mic button position unspecified**
Plan: "animated mic button in TipTap toolbar." No position, no icon state (outline vs. filled), no visual weight vs. other toolbar items.
Auto-decision (P5 explicit): Add to F1 spec — rightmost toolbar item, separated by divider, uses outline mic → filled mic on active, `duration-200` state change.

**Finding 2 (HIGH): Speech to Text tab missing from settings tab list**
v0.9.0 settings refactor lists 8 tabs: General, Appearance, Privacy, AI, Health, Sync, Devices, About. F1 requires "Settings → Speech to Text tab." This tab is either missing from the v0.9.0 list or should be the 9th tab. The plan is inconsistent.
Auto-decision (P1 completeness): Add `SpeechToTextTab.tsx` as the 9th settings tab in v0.9.0. It receives the model download UI from F1 (v0.9.1).

**Finding 3 (MEDIUM): Sparkline position ambiguous vs. CloudSyncChip**
Sidebar footer currently has CloudSyncChip. F4 adds a 7-day sparkline. Visual stacking is unspecified.
Auto-decision (P5 explicit): Add to F4 spec — sparkline renders above CloudSyncChip in sidebar footer; height 24px; uses 5 mood color tokens (not a single-color line).

---

### Pass 2: Missing States

**Critical: STT transcription in-progress state (2-10s)**
Between "stop recording" and "text inserted," `stt_transcribe` runs. On the base model, this takes 2-10 seconds. The plan has no spec for this state. A silent frozen mic button looks like a crash.
Auto-decision (P1 completeness): Add to F1 spec — after recording stops, mic button shows a spinner/loading state with "Transcribing..." label until result returns or error fires.

**Critical: STT first-time discovery**
Mic button is hidden until model downloaded. New users have no way to know STT exists from the editor. No nudge, no empty state hint, no settings shortcut.
Auto-decision (P1 completeness): Add to F1 spec — when STT is enabled in settings but no model is downloaded, show a disabled mic button with tooltip "Download a model in Settings → Speech to Text to enable dictation." When STT is entirely disabled, show nothing (current behavior correct).

**High: prefers-reduced-motion missing for F1 waveform, F4 sparkline, F7 toasts**
Three new animated components with no accessibility spec. Design system states "always respect prefers-reduced-motion."
Auto-decision (P1 completeness): Add to each task — F1 waveform static bars, F4 static sparkline (no animation), F7 toasts respect reduced-motion (no bounce/pop, instant appear).

**Medium: Virtual scroll empty-filtered state**
All filters active but zero results — what does the user see?
Auto-decision (P5 explicit): Reuse existing empty state component. No new UI needed; confirm in gate.

**Medium: STT partial download recovery**
B8 deletes `.partial` file on error. But what does the user see after a mid-download app close?
Auto-decision (P1): On next settings tab open, B2 validates model presence → if model absent, show "download" button as if never downloaded. The `.partial` is cleaned by the next download attempt or by B8. This is the correct behavior; add a note to B2.

---

### Pass 3: User Journey Coherence

**STT emotional arc (the critical path for v0.9.1):**

```
FIRST TIME USER:
1. Opens WritingView — mic button is INVISIBLE (model not downloaded)
   GAP: User doesn't know STT exists
   FIX: Disabled mic button + tooltip (added above)

2. Opens Settings → Speech to Text tab
   FIX: Tab exists (added above in Pass 1)
   GAP: No progressive disclosure — user sees model list without context

3. Taps Download → progress bar shows
   OK: Plan has this

4. Download completes → navigates back to WritingView
   GAP: No confirmation that mic is now available
   FIX: Toast "Speech-to-text ready — tap the mic in the editor"

5. Taps mic button → permission prompt
   GAP: No spec for OS permission denial
   FIX: If permission denied, show inline error "Microphone access denied. Check System Settings."

6. Records → waveform plays → stops
   GAP: 2-10s silent wait
   FIX: "Transcribing..." spinner (added above)

7. Text inserted at cursor
   GAP: No preview — could insert 200 words at wrong position
   FIX: Route through TranscriptPreviewOverlay.tsx (already exists)
       Add to F1 spec: after transcription, open TranscriptPreviewOverlay, not direct insert
```

Auto-decision (P1 completeness): Add to F1 spec — transcription result must open `TranscriptPreviewOverlay.tsx` before insertion. This component already exists (from the STT transcript formatting pipeline). Reuse it. Do NOT do a direct insert without preview for mic recordings.

---

### Pass 4: Specificity

Auto-decided gaps to add to the plan:

| Gap | Where | Fix (auto-added) |
|-----|-------|-----------------|
| Waveform spec | F1 | 20 bars, SVG, amplitude-responsive, `duration-200` transitions; static fallback for reduced-motion |
| Recording indicator position | F1 | Below TipTap toolbar, full-width, 40px height; shows elapsed timer (MM:SS) + stop button |
| Keyboard shortcuts conflict table | F5 | `1-5` mood keys: only active when no text node is focused; `Ctrl+Shift+F` focus: safe (TipTap doesn't use this combo); `?` cheatsheet: only when editor is focused but cursor is not in text |
| Pinned section default state | F6 | Expanded by default; user collapse state stored in localStorage key `mb_pinned_expanded` |
| On This Day banner dismiss | F10 | Dismiss button required; dismissed state stored in localStorage key `mb_otd_dismissed_<YYYY-MM-DD>`; banner shows max once per day |

---

### Pass 5: Design System Alignment

- Sparkline (F4): Uses 5 mood color tokens, not a single line. Auto-decided (P1).
- Waveform (F1): Uses `duration-200` for amplitude animation. Auto-decided (P5).
- Toasts (F7): Use existing toast component if one exists; if not, use `bg-violet-600 text-white rounded-lg px-4 py-2` to match brand. Auto-decided (P5).
- `prefers-reduced-motion`: All three new animated components must respect it. Auto-decided (P1). Already added in Pass 2.

---

### Pass 6: Responsive / Window Size

Minimum window: 800×600. Checked for new surfaces:
- Recording indicator (40px height below toolbar): safe at 600px height — writing area is still usable
- Settings 9 tabs: at 800px width, tabs may overflow. Existing tab bar uses horizontal scroll. No new issue.
- Sidebar sparkline: 24px height at bottom of sidebar — safe at 600px

No issues requiring plan changes.

---

### Pass 7: Accessibility

- **TimeCapsule modal (TL-003)**: Already in plan for v0.9.2. Focus trap, ESC, `aria-modal`, `role="dialog"`. Correct.
- **Mic button**: needs `aria-label="Start recording"` / `aria-label="Stop recording"` toggle. Add to F1 spec.
- **Keyboard shortcuts (F5)**: `?` opens cheatsheet — must be discoverable via keyboard. Add `aria-keyshortcuts` to the editor container.
- **Waveform**: decorative (audio feedback only) — should be `aria-hidden="true"`.

Auto-decided (P1 completeness): Added to F1 and F5 specs.

### Design Completion Summary

| Pass | Score | Key Findings | Auto-decisions |
|------|-------|-------------|----------------|
| 1. Hierarchy | 5/10 | Mic position, missing STT tab, sparkline stacking | 3 spec additions |
| 2. States | 3/10 | Transcribing state, first-time discovery, reduced-motion | 5 spec additions |
| 3. Journey | 4/10 | STT arc broken at discovery + wait + insertion | TranscriptPreviewOverlay reuse |
| 4. Specificity | 4/10 | Waveform, recording indicator, keyboard shortcuts | 5 spec table rows |
| 5. Design system | 6/10 | Mood colors not applied to sparkline; motion timing | 4 spec additions |
| 6. Responsive | 8/10 | No issues at 800×600 | None |
| 7. Accessibility | 5/10 | Mic button aria-labels, waveform aria-hidden | 2 additions to F1/F5 |

**PHASE 2 COMPLETE.** Codex: 3 gaps (anchors, layout primitives, motion intent). Claude subagent: 2 critical (STT wait state, discovery), 3 high. Consensus: 5/7 confirmed, 1 disagreement on section-has-one-job. Passing to Phase 3.

---

## Phase 1: CEO Review

### 0A. Premise Challenge

Premises in the plan (stated and assumed):

| # | Premise | Status | Issue |
|---|---------|--------|-------|
| P1 | Brand rename (v0.8.5) must precede security work (v0.9.0) | **ASSUMED** | No stated rationale. Rename touches 65+ files and increases blast radius for any concurrent bug. |
| P2 | v0.9.0 can bundle SEC-DEFER-001 + peer sync refactor + logging + settings | **ASSUMED** | Plan itself flags "if this starts blocking... split it" but doesn't actually split. Two HIGH-risk workstreams in one branch. |
| P3 | Android ships with v1.0 | **STATED** | One milestone before release cutoff. WEAR-002 (applicationId mismatch) is a P2 blocker. If v0.9.3 slips, Android either delays v1.0 or ships broken. |
| P4 | Sequential milestones are the right structure | **STATED** | Reasonable for a solo dev. Some parallel work is safe (logging + settings are already marked parallel within v0.9.0). |
| P5 | FOSS, no Pro tier | **STATED** | Codex flags this as a business model risk. However, this is user's explicit choice (confirmed in memory). Not challenging this. |

**Both models agree: P1 and P2 are the highest-risk premises. P3 is a USER CHALLENGE (both models recommend decoupling Android from v1.0 gate).**

### 0B. Existing Code Leverage

| Sub-problem | Existing code | Notes |
|-------------|---------------|-------|
| SEC-DEFER-001 (Rust PBKDF2) | `src/lib/services/crypto.ts` (params), `src-tauri/src/commands/journal.rs` (password storage) | `ring` crate is already in Cargo.toml; same PBKDF2_HMAC_SHA256 family |
| Peer sync refactor | `src-tauri/src/commands/peer_sync_engine.rs` (full 625-LOC file) | Logic is all there — this is extract-module work, not net-new |
| Settings refactor | `src/pages/SettingsPage.tsx` (existing tabs, scroll refs) | Pure structural split — no new state machines |
| Logging system | `src/lib/services/logger.ts` already exists (v0.8.3 shipped) | `get_log_path`, `open_log_folder`, `set_log_level` are NEW commands |
| STT UI (F1) | `useSpeechToText`, `useAudioRecorder` hooks already exist | Build UI on top — hooks are done |
| Virtual scroll (F3) | `TimelineView.tsx` + existing filter logic | Pure rendering optimization; no backend changes |
| Website design | `tailwind.config.js`, `website/` directory | Token sweep is additive |

Nothing here requires rebuilding from scratch. All v0.9.x work is additive on existing foundations.

### 0C. Dream State

```
CURRENT STATE (v0.8.3)          THIS PLAN (v1.0)               12-MONTH IDEAL
─────────────────────────────   ─────────────────────────────   ────────────────────────────
Password verify in frontend     Password verify in Rust          Rust owns all auth surfaces
65 eprintln! in Rust            Structured logging system        Full observability per-module
Oversized peer_sync_engine.rs   Split into 4 focused modules     Clean module boundaries
No STT model download UI        Full STT flow in WritingView     STT is first-class input mode
Timeline rerender all entries   Virtual scroll                   Sub-16ms at 5000 entries
Brand strings inconsistent      Full rename + lib restructure    One canonical identity
Android applicationId mismatch  Aligned + Play Store AAB         Watch companion in Play Store
Website misaligned with app     Design token sweep, QA passes    Website converts at ≥3% CTR
```

Delta from this plan → 12-month ideal: logging depth (per-module), more Rust ownership
of sensitive surfaces, and CTR data.

### 0C-bis. Implementation Alternatives

```
APPROACH A: Current sequential roadmap (as written)
  Summary: Seven milestones, each building on the prior. Rename before security.
  Effort:  XL
  Risk:    HIGH — rename + security in adjacent milestones; Android coupling to v1.0
  Pros:    Clean git history per milestone; atomic rollback per version
           Rename makes v0.9.x history coherent
  Cons:    65-file rename right before SEC-DEFER-001 (critical crypto work) is bad timing
           Android hard-coupled to v1.0 gate
           Peer sync refactor + SEC-DEFER-001 in same milestone
  Reuses:  All existing code

APPROACH B: Security-first, rename deferred
  Summary: v0.8.4 → v0.9.0 (security-only, isolated) → v0.9.1+ (features) → v0.8.5 rename
           folded into v0.9.3 or deferred to post-v1.0. Peer sync refactor gets own branch.
  Effort:  XL (same total work, different order)
  Risk:    MEDIUM — SEC-DEFER-001 is isolated; no rename pollution during crypto work
  Pros:    SEC-DEFER-001 gets focused attention with no adjacent rename distraction
           If rename slips, nothing else slips with it
           Peer sync refactor can merge independently
  Cons:    v0.9.x history has mixed naming until rename lands
           Slightly harder to scope each milestone (rename needs to land somewhere)
  Reuses:  All existing code

APPROACH C: Desktop-only v1.0, Android as v1.1
  Summary: Same as A/B but Android ships separately as v1.1 after v1.0 desktop release
  Effort:  XL (same work, different release gates)
  Risk:    LOW for v1.0; WEAR-002 failure can't delay desktop release
  Pros:    v1.0 trust story is complete on desktop before Android complicates it
           WEAR-002 can be fixed without time pressure
  Cons:    Website and marketing need to explain "Android coming in v1.1"
           Codex flags this explicitly; user may want to keep Android in v1.0
  Reuses:  All existing code
```

**RECOMMENDATION (auto-decided, SELECTIVE EXPANSION mode, P3 pragmatic + P5 explicit):**
Approach B with Android coupling decision presented at gate (USER CHALLENGE).

### 0D. Mode Analysis (SELECTIVE EXPANSION — HOLD SCOPE baseline)

**Complexity check:** v0.9.0 touches 10+ files, introduces 3 new Rust modules, and has two HIGH-risk workstreams. Smell. Fix: extract peer sync refactor to standalone branch (plan already notes this as an option).

**Minimum set for core objective:** v0.8.4 + SEC-DEFER-001 (isolated) + must-have features (F1 STT, F3 virtual scroll) = defensible v1.0. Everything else is QoL or platform work.

**Cherry-pick candidates (auto-decided per 6 principles):**
- Extract peer sync refactor to its own branch → **AUTO-APPROVE** (plan already suggests it; reduces risk in v0.9.0; P2 lake within blast radius)
- Move rename (v0.8.5) to v0.9.3 "design unification" milestone → **TASTE DECISION** (both models flag it; user may have reasons for the current order)

### 0E. Temporal Interrogation

```
HOUR 1 (foundations):    SEC-DEFER-001 — implementer needs exact PBKDF2 params from
                          crypto.ts before writing a single line of Rust. Params: 600k
                          iterations, HMAC-SHA256, base64-encoded salt. What is the
                          exact encoding used for the stored hash? `btoa()`? `toBase64()`?
                          This must match exactly.

HOUR 2-3 (core logic):   Rename — commit order matters. peer_sync_engine.rs contains
                          the literal string "moodhaven-sync-v1:" which is the wire
                          protocol prefix. Renaming this breaks all existing clients.
                          The ATOMIC commit requirement is correct but easy to miss.

HOUR 4-5 (integration):  Logging — 75 `eprintln!()` replacements. Some may be in hot
                          paths (peer sync loop). Replacing with `log::*` has no perf
                          impact, but the log level filtering must be initialized BEFORE
                          any log macros fire. Init order in lib.rs matters.

HOUR 6+ (polish/tests):  Virtual scroll — "measure actual card height first" is
                          underspecified. Cards vary by content length. Need to decide:
                          fixed height (simpler, some visual padding) or dynamic
                          measurement (correct, more complex). This should be decided
                          before implementation starts.
```

### 0F. Mode: SELECTIVE EXPANSION confirmed.

---

### CEO Dual Voices

**CODEX SAYS (CEO — strategy challenge):**
1. v1.0 is a packaging milestone, not a market-validity milestone. Builds breadth (Android, website, rename, polish) around an unproven core job.
2. Infrastructure is overfunded vs. trust — SEC-DEFER-001 is existential risk and gets bundled with many other things.
3. Platform expansion (Android + sync) before proving desktop core, in a FOSS product with no Pro tier, maximizes support burden and minimizes leverage.

**CLAUDE SUBAGENT (CEO — strategic independence):**
1. Rename before security is wrong ordering. Should flip.
2. SEC-DEFER-001 needs isolated branch with parity test suite before any UI wiring.
3. Android coupling to v1.0 gate is risky. If v0.9.3 slips, v1.0 slips.
4. Peer sync refactor should be standalone branch (plan already allows this).

**CEO DUAL VOICES — CONSENSUS TABLE:**
```
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Premises valid?                   WEAK    WEAK   DISAGREE (rename timing)
  2. Right problem to solve?           PARTIAL PARTIAL DISAGREE (v1.0 definition)
  3. Scope calibration correct?        NO      NO     CONFIRMED: v0.9.0 oversized
  4. Alternatives sufficiently explored? NO    NO     CONFIRMED: peer sync standalone
  5. Competitive/market risks covered? YES     YES    CONFIRMED: trust is moat
  6. 6-month trajectory sound?         RISKY   RISKY  CONFIRMED: needs reorder
═══════════════════════════════════════════════════════════════
```

---

### Section 1: Architecture Review

**Component dependency graph (current → after v1.0):**

```
CURRENT                                    AFTER V1.0
───────────────────────────────────────    ──────────────────────────────────────────
React Frontend                             React Frontend (reorganized)
  └─ src/pages/SettingsPage.tsx (large)      └─ src/components/settings/tabs/
  └─ src/lib/*.ts (flat)                     └─ src/lib/services/ + src/lib/utils/
  └─ src/pages/LockScreen.tsx                └─ src/pages/LockScreen.tsx
       └─ crypto.ts verifyPassword()              └─ invoke('verify_password') [Rust]

Tauri IPC                                  Tauri IPC
  └─ ~100 commands                           └─ ~103 commands (+verify_password,
                                                +get_log_path, +set_log_level,
                                                +open_log_folder, +stt allowlist)

Rust Backend                               Rust Backend
  └─ peer_sync_engine.rs (625 LOC)           └─ peer_sync_engine.rs (orchestrator)
                                             └─ connection.rs (TCP frame I/O)
                                             └─ protocol.rs (message types)
                                             └─ sync_crypto.rs (transport key)
                                             └─ conflict.rs (LWW resolution)
  └─ journal.rs (password hash cmds)         └─ journal.rs + verify_password()
  └─ speech_to_text.rs                       └─ speech_to_text.rs + URL allowlist
```

**Happy/shadow paths for SEC-DEFER-001:**
```
INPUT: password (String)
  │
  ├─ Happy path: PBKDF2(pw, stored_salt, 600k iters) → compare → bool
  ├─ Nil path: empty string → Rust validates, returns Err("empty password")
  ├─ Empty path: salt missing from DB → Err("no password set") → check_password_exists first
  └─ Error path: ring crate panic → propagated as Err(String) → LockScreen shows error

RETURN: Result<bool, String>
  ├─ Ok(true) → unlock
  ├─ Ok(false) → wrong password, stay locked
  └─ Err(msg) → internal error, log + show generic error, stay locked
```

**Coupling concerns (new):**
- `verify_password` in `journal.rs` couples password logic to journal module. Medium concern — it was already there (password hash storage). Acceptable.
- Settings tab split: tabs receive `scrollToSection` props from SettingsPage — correct pattern, low coupling.
- Logging system: `tauri-plugin-log` initialized in `lib.rs`. Init order matters — must come before any log macro fires. Flag for `lib.rs` reviewer.

**Security architecture for new surfaces:**
- `verify_password`: receives password in plaintext over IPC. Since IPC is local to the machine, acceptable. Password is not stored, only compared against stored hash.
- `stt_download_model` URL allowlist: 4 hardcoded filenames; Rust rejects anything outside the list before URL construction. Good.
- `require_unlocked` guard (already shipped in v0.8.3) applied to all sensitive commands.

**Rollback posture:** Git revert per milestone. SEC-DEFER-001 is additive (new Rust command + UI wiring) — rollback is possible by reverting LockScreen.tsx change without losing the backend command.

**No issues found in architecture that aren't already flagged in other sections.**

---

### Section 2: Error & Rescue Map

| Method/Codepath | What can go wrong | Exception class |
|----------------|-------------------|-----------------|
| `verify_password` (Rust) | Wrong PBKDF2 params (wrong iterations, wrong encoding) | Logic error — returns `Ok(false)` forever; users can never unlock |
| `verify_password` (Rust) | `ring` crate UnspecifiedError | Propagated as `Err(String)` |
| `verify_password` (Rust) | `get_password_hash` returns None (no password set) | Should call `check_password_exists` first |
| `stt_download_model` | Model name outside allowlist | `Err("invalid model name")` — GOOD, already in plan |
| `stt_download_model` | Network timeout (no `tokio::timeout`) | Hangs indefinitely — B7 in plan |
| `stt_download_model` | `.partial` file left on error | Disk pollution — B8 in plan |
| Peer sync refactor | Module extraction changes interface | Wire protocol unchanged if done correctly |
| Settings tab split | `scrollToSection` refs not passed correctly | Scroll-to-section stops working — easy to catch in manual test |
| Log level init | `set_log_level` called before plugin init | Panic or no-op depending on plugin version |

| Exception | Rescued? | Rescue action | User sees |
|-----------|----------|---------------|-----------|
| verify_password wrong params | N ← **CRITICAL GAP** | — | Cannot unlock ever |
| verify_password ring error | Y (as Err string) | Stay locked + show generic error | Generic error, logged |
| stt_download_model timeout | N ← GAP (B7) | Hang indefinitely | Spinner forever |
| stt_download_model .partial | N ← GAP (B8) | Stale .partial on disk | Next download may fail |
| log level init ordering | N ← potential GAP | Silent no-op or panic | Logging silently broken |

**Critical:** The PBKDF2 parity test (Rust unit test with known password + stored hash) in the plan is the mitigation for the "wrong params" gap. Plan includes this requirement. **The plan's parity test requirement is load-bearing — it MUST not be skipped.**

---

### Section 3: Security & Threat Model

| Threat | Likelihood | Impact | Mitigation in plan? |
|--------|-----------|--------|---------------------|
| SEC-DEFER-001 wrong PBKDF2 params → permanent lockout | Low (if parity test passes) | Critical | YES — parity test required |
| STT model URL injection (malicious model name) | Low | High | YES — URL allowlist in A-14 |
| Log file leaks journal content | Medium | High | YES — logger policy: no journal text, no keys |
| CI unpinned third-party actions (from learnings) | Medium | High | NOT in plan — **GAP** |
| `dangerouslySetInnerHTML` in UpdatePanel | Low | Medium | YES — DOMPurify in v0.8.4 |
| Peer sync transport key: SHA-256 not HKDF | Low | Medium | NOT in plan (acceptable — SHA-256 preimage resistance sufficient for this threat model) |

**CI unpinned actions gap:** `.github/workflows/build.yml` uses mutable tags (`@v0`, `@stable`) for actions including `tauri-apps/tauri-action` which runs with `TAURI_SIGNING_PRIVATE_KEY`. This is high risk and not in the roadmap. Should be added to v0.8.4 or as a standalone chore before v1.0.

**Auto-decided (P2 lake in blast radius, <1d CC):** Add "Pin CI actions to SHA" as a task in v0.8.4 Security section. Logged in decision audit.

---

### Section 4: Data Flow & Edge Cases

**SEC-DEFER-001 data flow:**
```
LockScreen: user enters password (String)
    │
    ├─ [nil] empty password field → frontend validation before invoke? → CHECK
    ▼
invoke('verify_password', { password })
    │
    ▼
Rust: PBKDF2(password, stored_salt, 600k iters, SHA256)
    │
    ├─ [match] Ok(true) → unlock, key derived in frontend from same password
    ├─ [no match] Ok(false) → wrong password
    └─ [error] Err(msg) → internal error
```

**Edge cases for SEC-DEFER-001:**
- Empty password: must return `Ok(false)` or `Err`, never `Ok(true)`. Frontend should pre-validate non-empty before invoke.
- Unicode password: if user set password with emoji/CJK, Rust `String` handles UTF-8 natively. Ring accepts `&[u8]`. Encoding must match frontend (`TextEncoder.encode(password)`).
- Password with trailing whitespace: stored hash was created with whitespace included. Rust must not trim.

**Virtual scroll edge cases:**
- 0 entries: render empty state, not crash
- 1 entry: no scroll needed, don't virtualize (flickers)
- 10,000 entries: target case — verify scroll position preserved on filter change
- Pinned entries always visible at top — must not be inside virtual window

**Interaction edge cases for STT recording:**
- User navigates away mid-recording: `useAudioRecorder` cleanup handles (A-04 already fixed)
- Recording stops at 0 words: must not attempt transcription
- Model not downloaded when mic button appears: plan says mic button hidden until model downloaded (correct)

---

### Section 5: Code Quality Review

**DRY check:**
- `crypto.ts` `verifyPassword()` will remain for the transition period. Plan says "only after tests pass: update LockScreen.tsx." During the interim, two implementations exist. This is intentional and time-bounded. Acceptable.
- Virtual scroll: plan says "no third-party library" — consistent with existing pattern of no charting library.
- Settings tabs: coordinator pattern (scroll refs owned by SettingsPage, passed as props) is explicitly stated. Good.

**Naming quality:**
- `verify_password` is clear. `require_unlocked` guard (already shipped) is clear.
- New modules `connection.rs`, `protocol.rs`, `sync_crypto.rs`, `conflict.rs` are well-named.

**Under-engineering check:**
- B6 (device name trim + reject empty) is listed as a fix but the Rust command validation is not specified in detail. Should reject empty string AND strings exceeding a reasonable max length (e.g., 64 chars).
- Virtual scroll: "configurable overscan (5 rows recommended)" — who configures it? If it's a constant, name it clearly.

**No critical code quality issues beyond those already in the plan.**

---

### Section 6: Test Review

**New UX flows:**
- STT: record → transcription → insert at cursor
- STT settings: model download with progress bar
- Virtual scroll: timeline with 500+ entries scrolls smoothly
- TimeCapsule reveal (6 new Rust unit tests in v0.9.0)

**New codepaths:**
- `verify_password` Rust command (parity test required — in plan)
- Peer sync 4 new modules (wire behavior test — in plan)
- Virtual scroll rendering pipeline

**Gaps:**
- Parity integration test for SEC-DEFER-001: frontend encrypts entry → Rust `verify_password` → frontend decrypts. This is explicitly in the plan. LOAD-BEARING.
- Virtual scroll: no test specified for "pinned entries always at top" behavior. Should be added.
- STT: no test specified for "mic button hidden until model downloaded" state machine. Should be added.
- Logging init order: no test for "log level effective before first log line." Hard to test in Rust unit tests; add as manual gate criterion.

**Target tests at v1.0: 700+ (from 633 current).** The plan states this. ~67 new tests needed.
- 6 Rust time capsule tests (v0.9.0)
- Rust verify_password unit + integration (v0.9.0) = ~3
- New React component tests for STT UI, virtual scroll, settings tabs = ~40+
- This leaves ~18 tests to cover remaining new codepaths. Feasible.

---

### Section 7: Performance Review

**N+1 queries:**
- Virtual scroll: reads all entry metadata for manifest but renders only visible rows. No N+1 if `get_all_journal_entries` is called once. Correct.
- Peer sync: N+1 queries were already fixed in v0.8.3 (`perf(peer-sync): batch N+1 queries`). No new N+1 introduced.

**Memory:**
- Virtual scroll overscan of 5 rows at ~2KB per card = ~10KB rendered at any time. Fine.
- STT: base64 WAV in memory during transcription. Base model: 142MB file, ~30s audio = ~1MB WAV. Fine.

**DB indexes:**
- Virtual scroll queries by `book_id`, `created_at`. Both indexed already (from existing schema).

**No new performance concerns beyond those already addressed.**

---

### Section 8: Observability & Debuggability

**Logging system (v0.9.0):**
- 75 Rust `eprintln!()` → `log::*`: good. Policy enforced by human review + logger.ts wrapper.
- `set_log_level` runtime change: enables targeted debugging without restart. Well-designed.
- Gap: no structured log schema defined. `logger.ts` adds structure but without a schema, log parsing is ad-hoc. Low priority.

**Peer sync refactor:**
- Extracting to modules makes each concern independently observable. Connection errors vs. protocol errors vs. conflict resolution are now distinguishable in logs.

**For new admin tooling:** no new admin UI is needed given local-first model. Log folder open button is sufficient.

---

### Section 9: Deployment & Rollout

**Migration safety:**
- All DB changes are additive `ALTER TABLE ... ADD COLUMN` migrations (existing pattern). Safe.
- `verify_password` is additive Tauri command — old builds without it still work (LockScreen falls back to frontend verify during transition period).

**Feature flags:**
- No feature flags in this stack (correct for local-first desktop app). Release is the feature flag.

**Rollback plan:**
- Per milestone: git revert the milestone PR. Each milestone is a clean PR from main.
- SEC-DEFER-001 specifically: revert `LockScreen.tsx` to use frontend `verifyPassword()` without removing the Rust command. Safe rollback path.

**Cross-platform build gates are in v1.0.0:** Linux AppImage + .deb, Windows .msi, macOS .dmg all tested. Browser build. Android E2E. This is correct and thorough.

---

### Section 10: Long-Term Trajectory

**Technical debt introduced:**
- Peer sync refactor reduces debt (splits oversized module).
- Settings tab split reduces debt (reduces SettingsPage.tsx size).
- Logging system: adds tauri-plugin-log as a new dependency. Low risk — active, well-maintained.

**Reversibility:**
- Rename (v0.8.5): 1/5 — hard to reverse. DB filename, mDNS service type, file extensions are external state. Once users update, rollback requires data migration.
- SEC-DEFER-001: 4/5 — additive command, rollback via LockScreen.tsx revert.
- Virtual scroll: 5/5 — pure rendering, no data change.

**The 1-year question:**
- The peer sync refactor makes the engine readable for new contributors.
- The settings tab split makes each tab independently reviewable.
- The logging system makes the app debuggable in the field.
- v1.0 tag gives contributors a stable release to fork from.

**Path dependency concern:** The rename changes the SQLite DB filename. Existing users upgrading must have their data migrated. The plan mentions the rename in `tauri.conf.json` (identifier + productName) but does NOT mention a data migration for existing users who have `moodhaven.db` and need it renamed/moved. **GAP — must verify DB filename migration is handled before v0.8.5 ships.**

**Auto-decided (P1 completeness, P2 lake):** Add "verify DB migration for existing users on rename" to v0.8.5 gate checklist.

---

### Section 11: Design & UX Review (UI scope confirmed)

**Interaction state coverage:**

| Feature | Loading | Empty | Error | Success | Partial |
|---------|---------|-------|-------|---------|---------|
| STT recording | ✓ (recording state) | ✓ (D-003 empty state in plan) | ? (transcription failure?) | ✓ (text inserted) | ? (partial transcription?) |
| STT model download | ✓ (progress bar in plan) | N/A | ? (download error?) | ✓ (model downloaded) | ✓ (download progress) |
| Virtual scroll | N/A | ✓ (empty state preserved) | N/A | ✓ | N/A |
| Settings tabs | ✓ (tab-switch data loading) | N/A | ? (settings load failure?) | ✓ | N/A |

**Gap:** STT transcription failure state is not specified in the plan. If `stt_transcribe` returns an error, what does the user see? Should be: toast notification + mic button returns to idle state.

**Gap:** STT model download error state is not specified. If download fails (network error), should show retry button and error message.

**DESIGN.md:** D-001 is in the plan (v0.9.3). Required before the v1.0 design unification work. Confirmed in plan.

**Keyboard shortcuts (F5):** Plan says "verify shortcuts don't conflict with TipTap bindings." This is a pre-implementation step, not a post-implementation fix. Correct process.

**Auto-decided (P1 completeness):** Add STT error state specification to F1 task in v0.9.1.

---

### NOT in scope (deferred)

- WP-001/002/003/004: Web port Phase 2+ features
- LOG-001/002: Per-module log level configuration
- SETTINGS-002: `React.lazy()` per-tab splitting
- Watch Phase 5: AI enrichment
- SEC: Peer sync transport key upgrade to HKDF (not needed for current threat model)

---

### What already exists

- `ring` crate dependency (for SEC-DEFER-001 Rust PBKDF2)
- `useSpeechToText`, `useAudioRecorder` hooks (for F1 STT UI)
- `peer_sync_engine.rs` module structure (for refactor)
- `src/components/settings/tabs/` pattern precedent: `PrivacyTab.tsx` et al. already exist in component form — the split is formalizing existing directory structure
- `get_book_tags` Tauri command (for F2 hashtag browser)
- `get_mood_statistics` (for F4 sparkline)
- `get_streak_stats` (for F7 streak toasts)

---

### Dream State Delta

After v1.0, we are still missing: per-module log levels, HKDF transport key, Delta WebDAV sync, Web STT via WASM, and Android E2E automation. All deferred — none block v1.0.

---

### CEO Completion Summary

| Category | Finding | Severity | Auto-Decision |
|----------|---------|----------|---------------|
| P1 rename timing | Rename before SEC-DEFER-001 is risky | High | TASTE DECISION: present at gate |
| P2 bundled v0.9.0 | Peer sync refactor + SEC-DEFER-001 in same milestone | High | APPROVED: extract to standalone per existing plan option |
| P3 Android coupling | Android hard-coupled to v1.0 gate | High | USER CHALLENGE: present at gate |
| SEC-DEFER-001 parity test | Load-bearing; must not be skipped | Critical | Add explicit note in v0.9.0 |
| CI unpinned actions | @v0 tags on signing workflow | High | AUTO-ADD to v0.8.4 gate |
| DB rename migration | No migration specified for existing users | Medium | AUTO-ADD to v0.8.5 gate |
| STT error states | Transcription failure + download error unspecified | Medium | AUTO-ADD to v0.9.1 F1 |
| Virtual scroll pinned test | No test specified for pinned-always-at-top | Low | AUTO-ADD to v0.9.1 F3 gate |

---

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|----------|
| 1 | CEO | Extract peer sync refactor to standalone branch | Mechanical | P3 pragmatic | Plan already notes this option; reduces v0.9.0 risk with zero downside | Stay bundled |
| 2 | CEO | Add "Pin CI actions to SHA" to v0.8.4 | Mechanical | P1 completeness | High-risk gap (TAURI_SIGNING_PRIVATE_KEY exposure); <1h to fix | Defer |
| 3 | CEO | Add "DB migration for existing users" to v0.8.5 gate | Mechanical | P1 completeness | Rename changes DB filename; existing users silently lose data without migration | Defer |
| 4 | CEO | Add STT error states to v0.9.1 F1 | Mechanical | P1 completeness | Standard UX: error + retry for failed transcription and failed download | Defer |
| 5 | CEO | Add virtual scroll pinned-at-top test to v0.9.1 F3 gate | Mechanical | P1 completeness | Missing test for explicit requirement (pinned entries always at top) | Skip |
| 6 | CEO | v0.8.5 rename move timing | Taste | P3 pragmatic | Both models flag rename-before-security as risky; but user may have ordering reasons | Stay in v0.8.5 slot |
| 7 | CEO | Android coupling to v1.0 | User Challenge | — | User accepted recommendation: Android → v1.1 | Stayed in v1.0 |
| 8 | Design | STT transcription-in-progress state | Mechanical | P1 completeness | 2-10s silent gap looks like crash; spinner required | None |
| 9 | Design | Route STT result through TranscriptPreviewOverlay | Mechanical | P1 completeness | Existing component, direct insert drops 200-word monologue at wrong cursor | Direct insert |
| 10 | Design | Disabled-with-tooltip mic state when model not downloaded | Mechanical | P1 completeness | Mic hidden = user thinks feature doesn't exist; tooltip is 5 lines | Hide entirely |
| 11 | Design | Add SpeechToTextTab.tsx to v0.9.0 settings split | Mechanical | P1 completeness | Tab missing from list; F1 needs a home in settings | Nest in GeneralTab |
| 12 | Design | prefers-reduced-motion for waveform/toasts/sparkline | Mechanical | P1 completeness | Design system requirement; 3 new animated components all missing this | — |
| 13 | Design | Sparkline uses 5 mood color tokens not single line | Mechanical | P5 explicit | Semantic color data lost with single violet line | Single color |
| 14 | Eng | Use pbkdf2 crate not ring for SEC-DEFER-001 | Mechanical | P5 explicit | ring not in Cargo.toml; pbkdf2+hmac+sha2 already there | ring |
| 15 | Eng | base64::decode salt before PBKDF2 | Mechanical | P1 completeness | Critical: passing base64 bytes to PBKDF2 locks out all users silently | — |
| 16 | Eng | Add Unicode test vector for SEC-DEFER-001 | Mechanical | P1 completeness | ASCII-only parity test passes while emoji/CJK passwords fail permanently | ASCII-only |
| 17 | Eng | Add LOCK-analytics/time_capsule/oura/get_setting | Mechanical | P1 completeness | 4 command files verified unguarded; mood patterns + API keys readable while locked | Defer |
| 18 | Eng | Virtual scroll: measured heights + ResizeObserver | Mechanical | P1 completeness | Fixed heights break for grouped day headers + async media badges | Fixed heights |
| 19 | Eng | Add grep gate for peer sync module API surface | Mechanical | P5 explicit | Type visibility creep bypasses orchestrator pattern | Skip |
| 20 | DX | SEC-DEP-001 CHANGELOG notes for breaking changes | Mechanical | P5 explicit | vite v8 + vitest v4 are major bumps; breaking change warnings in docs | None |

---

## GSTACK REVIEW REPORT

**Generated:** 2026-04-05 | **Branch:** fix/security-lock-gating | **Skill:** autoplan

### Pipeline Summary

| Phase | Findings | Auto-resolved | User decisions |
|-------|----------|---------------|----------------|
| CEO Review (P1) | Structural risks: rename timing, Android coupling, peer sync bundling | 5 auto-adds (CI-PIN, DB migration, STT errors, pinned test, peer sync branch) | 3 user challenges |
| Design Review (P2) | STT UX gaps: transcribing state, preview overlay routing, hidden mic discovery | 6 auto-adds | 0 |
| Eng Review (P3) | SEC-DEFER-001 encoding risk, 4 unguarded command files, virtual scroll height | 7 auto-adds | 0 |
| DX Review (P3.5) | CHANGELOG notes for breaking dep bumps, lib restructure browser-build gate | 2 auto-adds | 0 |

**Total auto-decisions:** 20 | **User decisions:** 3 (all approved recommendations)

### Structural Changes Applied

- v0.8.5 rename **moved to v0.9.3** (rename before SEC-DEFER-001 was risky; user accepted)
- Peer sync refactor **extracted to standalone branch** `refactor/peer-sync-engine` (reduces v0.9.0 risk)
- Android **decoupled from v1.0** → ships as v1.1 after desktop stabilizes (user accepted)

### Critical Issues Resolved

1. **SEC-DEFER-001 encoding trap** — Rust must call `base64::decode(stored_salt)` before PBKDF2; skip = all users locked out silently
2. **4 unguarded Tauri commands** — `analytics.rs`, `time_capsule.rs`, `oura.rs`, `get_setting` — mood patterns and API keys readable while app locked
3. **STT transcription silent gap** — 2-10s between stop recording and text insert looked like crash; spinner + preview overlay routing added

### Verdict

Plan approved as-is. 20 decisions made, 0 overrides by user. Ready to execute v0.8.4.
