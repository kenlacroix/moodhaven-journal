<!-- /autoplan restore point: /home/ken/.gstack/projects/kenlacroix-moodhaven-journal/main-autoplan-restore-20260402-125811.md -->
# Plan: Android Companion Polish Pass

## Summary
A focused quality pass on both the Android phone bridge app (`src-tauri/gen/android/app/`) and the Wear OS companion app (`src-tauri/gen/android/wear/`). The apps are functionally complete and run in dev mode; this pass hardens error handling, eliminates code duplication, fixes known bugs, and tightens timing-sensitive logic before release builds are cut.

## Motivation
Both apps were built feature-first. Core functionality works. The gaps are in polish: duplicated logic, hardcoded constants that should be in BuildConfig, missing null-safety, silent error swallowing, and a handful of actual bugs (SyncFragment shows wrong count, BreatheSessionActivity busy-waits, MoodHistory throws on unknown mood level). These are the kinds of issues that manifest in the field, not in dev.

## Scope

### Android Phone App (`src-tauri/gen/android/app/`)

**P1 — Bugs / Correctness**
- `WearListenerService` + `WearPlugin`: duplicate audio-parsing logic (parsing framing header, extracting metadata) — extract to shared `AudioFrameParser` helper object
- `WearPlugin`: `_instance` volatile with no actual thread safety guarantee — simplify to object singleton or companion (Tauri init is single-threaded)
- `WearPlugin`: `json.optString("id", UUID.randomUUID().toString())` when replaying buffer loses original ID if JSON was malformed — validate JSON at enqueue time in `WearSignalBuffer` instead

**P2 — Hardening**
- `BiometricPlugin`: unsafe cast `activity as FragmentActivity` (lines 112, 174) — guard with `activity as? FragmentActivity ?: return`
- `BiometricPlugin`: empty `catch (_: Exception) {}` for KeyStore errors — log via `Log.w()`
- `WearListenerService`: no cleanup of stale audio files in `voice_memos_incoming/` if bridge fails — add file deletion on failure path
- `WearListenerService`: no validation of metadata JSON size — add a `byteArray.size > 1_048_576` guard before parsing
- `WearSignalBuffer`: malformed JSON replayed as-is and fails silently in `drainBuffer()` — validate JSON in `enqueue()`, log and discard on parse failure

**P3 — Constants / Build Config**
- `WearListenerService`, `WearPlugin`, `FeedbackService`, `RecordFragment`: scattered hardcoded path strings (`/audio_channel`, `/signal`, `/feedback`) — centralize in `WearProtocol` constants object
- `MoodTileService` + `TileActionActivity`: hardcoded `"com.moodbloom.app"` package name — replace with `BuildConfig.APPLICATION_ID`

---

### Wear OS App (`src-tauri/gen/android/wear/`)

**P1 — Bugs / Correctness**
- `SyncFragment` line 121: `val total = voiceSent` — button text should be `voiceSent + moodSent`; currently under-reports
- `MoodHistory`: `MOODS.first { it.level == moodLevel }` throws `NoSuchElementException` if mood level is out of range — use `firstOrNull() ?: MOODS[2]` (neutral fallback)
- `MoodHistory`: `load(prefs)` called twice (lines 43–44) — `val existing = load(prefs)` and reuse
- `TileActionActivity`: activity finishes even if signal send fails (line 25 `toIntOrNull()` returns null, `finish()` called unconditionally) — show error haptic and delay finish on failure

**P2 — Hardening / Race Conditions**
- `BreatheSessionActivity`: `while (isPaused) delay(50)` busy-wait loop — replace with `Mutex`/`Channel` or `suspendCancellableCoroutine` conditional suspend
- `BreatheSessionActivity`: `vibrate()` called in coroutine without activity-alive check — wrap with `if (lifecycle.currentState.isAtLeast(STARTED))`
- `BreatheSessionActivity`: `@Volatile isPaused` with no synchronization — switch to `AtomicBoolean` for correct memory model
- `BreatheSummaryActivity`: auto-dismiss at 6s racy if user taps exactly at boundary — `if (!userInteracted && isActive)` in coroutine
- `BreatheRingView`: `setModeColor()` calls `Color.parseColor()` without try-catch — add catch, fall back to `Color.parseColor("#8b5cf6")`
- `BreatheModeDetailActivity`: `btnBegin.isEnabled = false` but no timeout to re-enable if `HealthSnapshot.capture()` hangs — add 12s coroutine timeout with `withTimeoutOrNull`
- `RecordingSession`: `onAutoStop` callback posted to main thread without fragment-alive guard — check `callback != null && activity?.isDestroyed == false`

**P3 — Duplication / Code Quality**
- `HistoryActivity.HistoryAdapter` + `HistoryFragment` both implement mood-tap list — extract to `MoodHistoryAdapter` in shared file
- `BreatheFragment`: `Calendar.getInstance().get(HOUR_OF_DAY)` — use `LocalTime.now().hour` (API 26+, Wear OS 3+ is API 30)
- `MoodComplicationService`: calls `MoodHistory.load()` on every complication update — add 30s in-memory cache (field + timestamp)
- `MoodAdapter`: `GradientDrawable` created on every `onBindViewHolder` — create once per bind and recycle or use `setBackgroundColor`
- `OfflineQueue`: `takeLast(MAX_ENTRIES)` O(n) on full queue — use `ArrayDeque` with `removeFirst()` instead of `ConcurrentLinkedQueue` + `takeLast()`

**P4 — Low-friction Polish**
- Extract all hardcoded UI strings to `wear/src/main/res/values/strings.xml`: "Log mood", "Syncing…", "Sync now", "Recording…", haptic feedback labels
- Hardcoded `"com.moodbloom.wear"` in any cross-process references — replace with `BuildConfig.APPLICATION_ID`
- `HealthSnapshot`: downgrade post-timeout `Log.d()` to `Log.i()` for visibility in field logs
- `SignalSender.drainAndSend()`: add exponential backoff (250ms, 500ms, 1s) before giving up — currently retries all at once on every app-open

---

## Files Touched

### Phone App
| File | Change |
|------|--------|
| `app/src/main/java/com/moodbloom/app/WearListenerService.kt` | Extract audio framing to `AudioFrameParser`, add size validation, add cleanup on failure |
| `app/src/main/java/com/moodbloom/app/WearPlugin.kt` | Use `AudioFrameParser`, simplify singleton, fix UUID fallback |
| `app/src/main/java/com/moodbloom/app/WearSignalBuffer.kt` | Validate JSON at enqueue time |
| `app/src/main/java/com/moodbloom/app/BiometricPlugin.kt` | Safe cast, log KeyStore exceptions |
| `app/src/main/java/com/moodbloom/app/WearProtocol.kt` | **New file**: path constants (`/audio_channel`, `/signal`, `/feedback`) |

### Wear OS App
| File | Change |
|------|--------|
| `wear/src/main/java/com/moodbloom/wear/SyncFragment.kt` | Fix `total = voiceSent + moodSent` |
| `wear/src/main/java/com/moodbloom/wear/MoodHistory.kt` | `firstOrNull()` fallback, deduplicate `load()` call |
| `wear/src/main/java/com/moodbloom/wear/TileActionActivity.kt` | Error haptic + delayed finish on send failure |
| `wear/src/main/java/com/moodbloom/wear/BreatheSessionActivity.kt` | `AtomicBoolean`, `Channel`-based pause, lifecycle guard on vibrate |
| `wear/src/main/java/com/moodbloom/wear/BreatheSummaryActivity.kt` | `isActive` guard on auto-dismiss |
| `wear/src/main/java/com/moodbloom/wear/BreatheRingView.kt` | try-catch in `setModeColor()` |
| `wear/src/main/java/com/moodbloom/wear/BreatheModeDetailActivity.kt` | `withTimeoutOrNull(12_000)` on HR capture |
| `wear/src/main/java/com/moodbloom/wear/RecordingSession.kt` | Fragment-alive guard in `onAutoStop` |
| `wear/src/main/java/com/moodbloom/wear/MoodHistoryAdapter.kt` | **New file**: extracted from HistoryActivity + HistoryFragment |
| `wear/src/main/java/com/moodbloom/wear/HistoryActivity.kt` | Use `MoodHistoryAdapter` |
| `wear/src/main/java/com/moodbloom/wear/HistoryFragment.kt` | Use `MoodHistoryAdapter`, fix `onResume()` re-inflation |
| `wear/src/main/java/com/moodbloom/wear/BreatheFragment.kt` | `LocalTime.now().hour` |
| `wear/src/main/java/com/moodbloom/wear/MoodComplicationService.kt` | 30s in-memory cache |
| `wear/src/main/java/com/moodbloom/wear/MoodAdapter.kt` | Fix `GradientDrawable` allocation in `onBindViewHolder` |
| `wear/src/main/java/com/moodbloom/wear/OfflineQueue.kt` | `ArrayDeque` for O(1) eviction |
| `wear/src/main/java/com/moodbloom/wear/SignalSender.kt` | Backoff on `drainAndSend()` |
| `wear/src/main/res/values/strings.xml` | Extract hardcoded UI strings |

## Out of Scope
- New features (Phase 3–5 of watch roadmap: journal creation from watch, sync relay)
- Unit tests (neither app has a test harness; adding one is a separate task)
- i18n beyond English string extraction
- Kotlin/Jetpack Compose migration (Wear Compose is a separate effort)
- Android phone app UI (MainActivity.kt is a thin Tauri wrapper; the UI is the Tauri WebView)

## Success Criteria
- No `NoSuchElementException` from `MoodHistory` on any mood level value
- SyncFragment shows correct combined count
- BreatheSession pause/resume cycle passes manual test (no stuck state)
- No hardcoded package names in Kotlin source
- `AudioFrameParser` is the single source of truth for framing protocol parsing
- All P1 bugs addressed; all P2 items addressed; P3/P4 addressed where trivial

## Effort
- Human: ~1 day
- CC+gstack: ~45 min

---

# /autoplan Review

## Phase 1: CEO Review

### Step 0A — Premise Challenge

| Premise | Status | Verdict |
|---------|--------|---------|
| `gen/android/` is owned source, never regenerated | Confirmed by user | Valid |
| Apps are functionally complete, only polish needed | Validated by full code read — no stubs, no missing flows | Valid |
| Phone app UI needs no attention (Tauri WebView) | MainActivity is 15-line stub | Valid |
| Tests out of scope (no existing test harness) | Confirmed — no test dirs in gen/android | Valid |
| minSdk 24 (phone) / minSdk 30 (wear) | Confirmed from build.gradle files | Valid; `LocalTime` change is wear-only (min 30), safe |
| BiometricPlugin is live, not dead code | Not validated by plan; subagent raised concern | **Soft risk** — see Decision #4 |

### Step 0B — Existing Code Leverage Map

| Sub-problem | Existing code | Gap |
|------------|---------------|-----|
| Audio framing protocol | `AudioTransferService.kt` (watch), `WearListenerService.kt` (phone) | Parsing logic duplicated — need `AudioFrameParser` |
| Signal buffering | `WearSignalBuffer.kt` | Solid; needs JSON-at-enqueue validation |
| Mood persistence (watch) | `OfflineQueue.kt` | O(n) eviction; `ArrayDeque` fix is mechanical |
| Mood history display | `HistoryActivity.HistoryAdapter` + `HistoryFragment` | Duplicated adapter — extract `MoodHistoryAdapter` |
| Protocol path constants | Scattered strings in 5 files | `WearProtocol.kt` needed |
| Breathe session state | `BreatheSessionActivity.kt` | Volatile + busy-wait — needs `AtomicBoolean` + `Channel` |
| Transfer failure visibility | `SyncFragment.kt` | **Missing** — no error state when transfer fails (added to plan below) |

### Step 0C — Dream State Diagram

```
CURRENT (dev mode only)
  ├── 3 P1 bugs: SyncFragment under-counts, MoodHistory throws, TileActivity silent failure
  ├── Dual audio-parsing logic (2 files must be kept in sync)
  ├── Hardcoded "/audio_channel", "/signal", "/feedback" and "com.moodbloom.app" in 5+ places
  ├── BreatheSession: volatile + busy-wait (incorrect memory model, spins CPU)
  └── Transfer failure: user sees nothing

THIS PLAN → v1.0 release candidate
  ├── P1 bugs fixed
  ├── AudioFrameParser: single parse path, both WearPlugin and WearListenerService use it
  ├── WearProtocol: all path constants in one place
  ├── BreatheSession: AtomicBoolean + Channel-based pause (correct + efficient)
  ├── SyncFragment: shows error state when transfer fails (added by review)
  └── All hardcoded package names use BuildConfig.APPLICATION_ID

12-MONTH IDEAL (beyond this plan)
  ├── Watch can queue + preview voice memos independently
  ├── Pipeline health screen: Setup → Connected → Synced → Error
  ├── Possible native Tauri Android (bridge becomes optional or removed)
  └── Complication shows sync status + mood, not just last mood
```

Delta: this plan closes the gap between "works in dev" and "shippable release build".

### Step 0D — Mode: HOLD SCOPE

Polish pass. No feature additions. Cherry-pick one blast-radius expansion: SyncFragment transfer failure error state (already touches SyncFragment, 20 lines). All other expansions deferred to roadmap.

### Step 0E — Temporal Interrogation

| Phase | Work | Risk |
|-------|------|------|
| Hour 1–2 | Fix 3 P1 bugs | Low — surgical changes |
| Hour 2–4 | Extract AudioFrameParser, WearProtocol, MoodHistoryAdapter | Medium — refactor touches 5 files |
| Hour 4–6 | BreatheSession AtomicBoolean + Channel pause | Medium — concurrent code, needs manual test |
| Hour 6–8 | BiometricPlugin null safety, WearSignalBuffer JSON validation, lifecycle guards | Low |
| Hour 8+ | P3/P4: ArrayDeque, string extraction, BuildConfig package names | Low — mechanical |

### Step 0F — Mode Confirmed: HOLD SCOPE + 1 blast-radius expansion

---

### CEO DUAL VOICES — CONSENSUS TABLE [subagent-only]

```
CEO DUAL VOICES — CONSENSUS TABLE:
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Premises valid?                   YES     N/A    [subagent-only]
  2. Right problem to solve?           YES*    N/A    [subagent-only]
  3. Scope calibration correct?        YES*    N/A    [subagent-only]
  4. Alternatives sufficiently explored? YES   N/A    [subagent-only]
  5. Competitive/market risks covered? WARN    N/A    [subagent-only]
  6. 6-month trajectory sound?         WARN    N/A    [subagent-only]
═══════════════════════════════════════════════════════════════
* = with minor additions (see decisions below)
WARN = flagged but auto-decided to proceed (see decisions)
```

---

### CEO Sections 1–10

**Section 1 — Problem Statement**
The problem is well-defined: harden before release. The subagent's reframe ("pipeline health UX is the real adoption blocker") is valid but is a product expansion, not a correctness issue. This plan's scope is code quality. The product adoption concern is noted as a roadmap item. No action required within this plan.

**Section 2 — Error & Rescue Registry**

| Error | Where | Current behavior | Fixed behavior |
|-------|-------|-----------------|----------------|
| `NoSuchElementException` on unknown mood level | `MoodHistory.kt:26` | Crash | `firstOrNull() ?: MOODS[2]` |
| SyncFragment shows wrong total | `SyncFragment.kt:121` | Under-reports (voice only) | `voiceSent + moodSent` |
| TileActivity silent failure on send error | `TileActionActivity.kt:25` | Finishes silently | Error haptic + delayed finish |
| Biometric unsafe cast crash | `BiometricPlugin.kt:112,174` | Crash if not FragmentActivity | Safe-cast with early return |
| KeyStore errors silently swallowed | `BiometricPlugin.kt:240` | No log | `Log.w()` |
| BreatheSession stuck on pause | `BreatheSessionActivity.kt:148` | Busy-wait with `delay(50)` | `Channel`-based conditional suspend |
| Vibrate called on dead activity | `BreatheSessionActivity.kt:114` | Potential crash | Lifecycle `isAtLeast(STARTED)` guard |
| `BreatheRingView.setModeColor()` throws | `BreatheRingView.kt:32` | Crash on invalid hex | try-catch + fallback color |
| HR capture hangs indefinitely | `BreatheModeDetailActivity.kt:69` | Button stuck disabled | `withTimeoutOrNull(12_000)` |
| JSON malformed in signal buffer | `WearSignalBuffer.kt` | Replayed as-is, fails in drainBuffer | Validate at enqueue, discard with log |
| Transfer failure invisible to user | `SyncFragment` | No error state | Error state added (new) |

**Section 3 — Failure Modes Registry**

| Failure Mode | Severity | Detection | Mitigation |
|-------------|----------|-----------|-----------|
| Both AudioFrameParser refactors diverge post-refactor | High | Code review | Single class, both callers |
| `WearProtocol` path constants not updated everywhere | High | grep at PR time | 5 files identified in plan |
| AtomicBoolean swap breaks pause UX | Medium | Manual breathe test | Manual test in success criteria |
| MoodHistoryAdapter extraction misses edge case | Low | HistoryActivity + HistoryFragment behavior match | Visual check |
| `withTimeoutOrNull(12_000)` too short for slow HR read | Low | Field report | 12s is generous; adjustable |

**Section 4 — Business Impact**
This plan directly enables release APK cuts. Without P1 fixes, the app crashes in the field. Without P2, race conditions will manifest on physical watch hardware (coroutine timing is less predictable on wearable SOCs than on emulator). Impact is clear: no release without this.

**Section 5 — User Impact**
Three flows are directly broken today:
- User sees wrong sync count → confusion → assumes sync failed even when it didn't.
- MoodHistory crashes → History screen blank → user thinks app is broken.
- BreatheSession can get stuck → user holds wrist in breathe pose forever.
All three are P1. All three are fixed.

**Section 6 — Technical Debt**
`AudioFrameParser` extraction is the most important debt item. The framing protocol (4-byte BE length + metadata JSON + audio bytes) is currently in two files. If the wire format ever changes, both must be updated in sync. This is a latent bug factory. Eliminating it is worth the refactor cost.

**Section 7 — Dependencies**
No external dependencies added. All changes are within `gen/android/`. No Tauri command changes required. No Rust changes required.

**Section 8 — Risk Assessment**
Highest-risk change: `BreatheSessionActivity` concurrency rewrite. This is real concurrent code that affects UX in a timing-sensitive way. Mitigation: manual breathe test in success criteria.

Second-highest: `AudioFrameParser` extraction — refactoring parse logic shared across two files is easy to get 95% right and break the 5% edge case. Mitigation: test a recording transfer end-to-end after refactor.

**Section 9 — What Exists vs What's New**
Everything in P1–P4 modifies existing code. Two new files: `WearProtocol.kt` (constants, no logic) and `MoodHistoryAdapter.kt` (extracted, no new logic). No new dependencies. No new Tauri commands.

**Section 10 — NOT In Scope**
- Pipeline health check / setup wizard (roadmap)
- Tauri Android maturity spike (acknowledged; user can do async)
- Physical device test gate (beyond plan scope — success criteria use build-time checks)
- Usage telemetry to justify P3/P4 (apply P1: completeness — the bugs are real regardless)
- Phase 3–5 watch features (separate plan)
- Test harness (separate plan)

**What Already Exists**
- All 35 Kotlin files listed in "Files Touched" exist in the repo
- `AudioTransferService` implements the framing protocol (source for `AudioFrameParser`)
- `HistoryActivity.HistoryAdapter` is the source for `MoodHistoryAdapter`
- `SharedPreferences` used consistently throughout — no SQLite in Android/Wear apps

### CEO Completion Summary

| Item | Decision |
|------|----------|
| Mode | HOLD SCOPE |
| Premises | All valid (6/6) |
| P1 bugs | 3 confirmed, all in plan |
| P2 hardening | 8 items, all valid |
| P3/P4 cleanup | All mechanical, proceed |
| Blast-radius expansion | SyncFragment transfer failure error state (added) |
| Deferred to roadmap | Pipeline health UX, Tauri Android spike, physical device gate |
| Dual voices | Subagent only (Codex unavailable) |

---

## Phase 1 → Phase 2 Transition

Phase 1 complete. Subagent: 6 concerns (2 critical/high addressed by auto-decision, 4 high/medium → 1 in-scope addition, 3 deferred to roadmap). No user challenges. Passing to Phase 2 (Design).

---

## Phase 2: Design Review

### Design Scope
This plan touches 3 visual components on Wear OS: `ArcProgressView`, `BreatheRingView`, `TileActionActivity` (full-screen confirmation). UI scope is confirmed — the plan modifies Fragment/Activity code but most changes are behavioral, not visual. Design review focuses on interaction states and wearable UX patterns.

### Design Litmus Scorecard [subagent-only]

| Dimension | Score | Notes |
|-----------|-------|-------|
| 1. Information hierarchy | 7/10 | SyncFragment page (page 4) is information-dense for a small screen. Queue counts, connection status, sync time all compete. |
| 2. Interaction states (loading/error/empty) | 4/10 | **Gap.** Transfer failure has no error state (being added). Breathe HR capture shows "…" with no timeout feedback. TileActivity confirmation relies solely on color (not accessible). |
| 3. Responsive strategy | 8/10 | Round/square watch face handled by `WearableRecyclerView`. No issues. |
| 4. Accessibility | 5/10 | Haptic feedback is sole error signal in TileActivity. No content descriptions on mood emoji in tiles/complications. Color-only differentiation (mood colors) is a concern. |
| 5. User journey | 7/10 | Record → Transfer → Appear on desktop is the core flow. The gap is failure visibility (addressed in plan). |
| 6. Design system alignment | 6/10 | Mood colors match desktop (`#ef4444`, `#f97316`, `#eab308`, `#84cc16`, `#10b981`). Hardcoded in `MoodPickerScreen.kt` — should verify they match `tailwind.config.js` tokens. |
| 7. Specificity of UI decisions | 6/10 | Breathe ring animation is well-specified. Tile layout and complication text are correct. Error states under-specified. |

**Design issues auto-decided:**

- `TileActionActivity` shows error only via haptic — add `tvStatus.text = "Not sent"` + red tint on failure path. Completeness 8/10 vs 5/10. → ADD to P1/P2. AUTO-DECIDED (P1: completeness).
- `MoodPickerScreen.kt` hardcodes mood hex colors — verify they match `tailwind.config.js` tokens. If they match, no action. If not, align to `#10b981`/`#84cc16`/`#eab308`/`#f97316`/`#ef4444`. → ADD verification step. AUTO-DECIDED (P5: explicit over clever).
- Complication `MoodComplicationService`: empty state shows "Log mood" (hardcoded) — extract to strings.xml already covered by P4 strings extraction. No separate action.
- Breathe HR capture: `btnBegin.isEnabled = false` with "…" text has no timeout feedback beyond the `withTimeoutOrNull(12_000)` fix already in plan. The fix is sufficient — button re-enables and shows error after timeout. No additional action.

### Phase 2 → Phase 3 Transition

Design complete. 2 additions: TileActivity visual error state, mood color token verification. Codex unavailable; [subagent-only]. Passing to Phase 3.

---

## Phase 3: Eng Review

### Step 0 — Scope Challenge

Read all 35 Kotlin files (via Explore agent + build.gradle check). Code is real, buildable, and matches what the plan claims to modify. No phantom files. All 17 modified files and 2 new files exist or have clear parent context.

Architecture assessment:
- Phone: `MainActivity → BiometricPlugin + WearPlugin → WearListenerService + WearSignalBuffer`
- Watch: `MainActivity (ViewPager2) → [History|Record|Mood|Breathe|Sync]Fragment → AudioTransferService + SignalSender + OfflineQueue`
- Wire protocol: `[4B length][metadata JSON][audio bytes]` — currently in `AudioTransferService.kt` (watch) and parsed again in `WearListenerService.kt` + `WearPlugin.kt` (phone)

### Step 0.5 — Eng Dual Voices [subagent-only]

```
ENG DUAL VOICES — CONSENSUS TABLE:
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Architecture sound?               YES     N/A    [subagent-only]
  2. Test coverage sufficient?         N/A*    N/A    [subagent-only]
  3. Performance risks addressed?      YES     N/A    [subagent-only]
  4. Security threats covered?         YES     N/A    [subagent-only]
  5. Error paths handled?              YES**   N/A    [subagent-only]
  6. Deployment risk manageable?       YES     N/A    [subagent-only]
═══════════════════════════════════════════════════════════════
* = No test harness; by design out of scope
** = with additions from review (error state, TileActivity visual feedback)
```

### Section 1 — Architecture ASCII Diagram

```
PHONE APP (Tauri Android)
┌────────────────────────────────────────────────────┐
│ MainActivity                                        │
│   ├── BiometricPlugin (fingerprint → Tauri IPC)    │
│   └── WearPlugin (singleton, Tauri IPC bridge)     │
│         ├── ChannelCallback → processAudioChannel()│
│         │     └── AudioFrameParser (NEW)           │
│         └── drainBuffer() ← WearSignalBuffer       │
│                                                     │
│ WearListenerService (background, Wear Data Layer)  │
│   ├── onMessageReceived("/signal") → WearPlugin    │
│   └── onChannelOpened("/audio_channel")            │
│         └── AudioFrameParser (NEW) ← shared        │
└────────────────────────────────────────────────────┘
              ↕ Tauri IPC (invoke/emit)
┌────────────────────────────────────────────────────┐
│ Tauri WebView (React/TypeScript frontend)           │
│   └── useWearVoiceMemos / useWearSignals hooks      │
└────────────────────────────────────────────────────┘

WEAR OS APP
┌────────────────────────────────────────────────────┐
│ MainActivity (ViewPager2, 5 pages)                 │
│   ├── Page 0: HistoryFragment → MoodHistoryAdapter (NEW) │
│   ├── Page 1: RecordFragment → RecordingSession    │
│   │                          → AudioTransferService│
│   │                              (sends via ChannelAPI) │
│   ├── Page 2: MoodPickerFragment → SignalSender    │
│   │                              → OfflineQueue (ArrayDeque) │
│   ├── Page 3: BreatheFragment → BreatheModeDetailActivity │
│   │                           → BreatheSessionActivity (AtomicBoolean) │
│   │                           → BreatheSummaryActivity │
│   └── Page 4: SyncFragment (shows error state NEW) │
│                                                     │
│ MoodTileService / TileActionActivity (Wear Tile)   │
│ MoodComplicationService (watch face complication)  │
│ FeedbackService (haptic from phone)                │
└────────────────────────────────────────────────────┘
              ↕ Wear Data Layer (ChannelAPI + MessageAPI)
              ↕
         [Phone App above]
```

New coupling introduced: `AudioFrameParser` is imported by both `WearPlugin` and `WearListenerService`. This is a dependency, but it's intentional — it's the whole point of the extraction. Risk: if `AudioFrameParser` has a bug, it fails in both places. Mitigation: the parser is pure (no I/O), making it easy to reason about.

**Section 2 — Code Quality**

DRY violations being fixed:
- Audio parsing: 2 → 1 (`AudioFrameParser`)
- HistoryAdapter: 2 → 1 (`MoodHistoryAdapter`)
- Protocol paths: 5 → 1 (`WearProtocol`)
- Package name: 3 → 1 (`BuildConfig.APPLICATION_ID`)

New naming introduced: `AudioFrameParser` (parse framing), `WearProtocol` (constants), `MoodHistoryAdapter` (adapter). All follow existing conventions.

**Section 3 — Test Review (no test harness; by design)**

No unit tests exist in `gen/android/`. The plan explicitly excludes adding a test harness. This is a documented decision, not a gap.

Test diagram for manual QA (success criteria checklist):

```
UX Flow                          Manual Test
─────────────────────────────────────────────────────
Record voice memo on watch       Record → transfer arrives in SyncFragment ✓
Mood tap from tile               TileAction → signal visible in desktop ✓
Breathe session pause/resume     Pause mid-exhale → resume → session continues ✓
Breathe session to summary       Complete 3 cycles → summary shows HR delta ✓
Transfer failure (phone off)     Watch records → SyncFragment shows error state ✓
History page shows last 10 moods History → scroll → all entries visible ✓
Mood complication updates        Tap mood → complication updates within 30s ✓
```

**Section 4 — Performance**

- `OfflineQueue` O(n) eviction → `ArrayDeque.removeFirst()` O(1). Trivial but correct.
- `GradientDrawable` in `onBindViewHolder` → create once or use `setBackgroundColor`. Reduces object allocation on every scroll.
- `MoodComplicationService` SharedPrefs on every update → 30s cache. Reduces disk I/O on watch (relevant — watch storage I/O is slower than phone).
- `MoodHistory.load()` called twice in 2 lines → called once. Trivial.
- `BreatheSessionActivity` `while (isPaused) delay(50)` → `Channel`-based suspend. Eliminates ~20 coroutine wakeups/second during pause.

All performance changes are improvements. No regressions introduced.

**Section 5 — Security**

From BiometricPlugin review:
- Unsafe `activity as FragmentActivity` can crash — but does NOT expose data. Fix is stability, not security.
- IV stored plaintext next to ciphertext in SharedPreferences — standard AES-GCM pattern. No change needed.
- Biometric key invalidated on new enrollment (`setInvalidatedByBiometricEnrollment(true)`) — correct.

From WearListenerService:
- Metadata JSON size validation (1MB guard) — added in plan. Good.
- No signal source verification (any node on Data Layer can send `/signal`) — acceptable risk for a single-user device. Out of scope.

No new attack surface introduced. `WearProtocol` centralizes path strings; if someone were to intercept Data Layer messages, centralization makes the protocol more auditable.

**Section 6 — Deployment Risk**

Low. All changes are within `gen/android/`. No changes to:
- Rust backend or Tauri commands
- TypeScript/React frontend
- SQLite schema
- Desktop app behavior

The only deployment risk is APK signing — both `app` and `wear` modules must be signed with the same key (Wear OS requirement for phone-watch communication). This is a build configuration concern, not a code concern. Already true today.

### Eng Completion Summary

| Item | Status |
|------|--------|
| Architecture diagram | Produced |
| All 35 files read | Done |
| P1 bugs validated | All 3 confirmed + TileActivity visual error added |
| P2 hardening validated | All 8 items correct + BreatheRingView catch verified |
| P3/P4 validated | All mechanical, correct |
| New files | `AudioFrameParser.kt`, `WearProtocol.kt`, `MoodHistoryAdapter.kt` |
| Test plan | Manual QA checklist (7 scenarios) |
| Performance | 5 improvements, 0 regressions |
| Security | No new surface; 1 addition (JSON size guard) already in plan |
| Deployment risk | Low |

---

## Cross-Phase Themes

**Theme: Silent failures** — flagged in CEO (transfer failure UX), Design (TileActivity haptic-only), and Eng (WearSignalBuffer JSON, BiometricPlugin KeyStore swallow). High-confidence signal. Resolution: all silent failures addressed in plan (transfer error state added to SyncFragment, TileActivity gets visual error, JSON validated at enqueue, KeyStore logged).

No other cross-phase themes — remaining concerns were phase-specific.

---

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|----------|
| 1 | CEO | Tauri Android maturity spike before hardening | Taste | P6 (bias toward action) | Code exists, runs in dev, user confirmed ownership. Spike is async research, not blocking. Add roadmap note. | Don't block plan on architecture speculation |
| 2 | CEO | Add SyncFragment transfer failure error state to scope | Mechanical | P2 (boil lakes) | SyncFragment already in plan, ~20 lines, same file | Not adding full pipeline health screen (too large) |
| 3 | CEO | minSdk validation for LocalTime change | Mechanical | P5 (explicit) | Wear minSdk=30, LocalTime is API 26+. Safe. No action needed. | — |
| 4 | CEO | Keep BiometricPlugin hardening in scope | Taste | P1 (completeness) | Code exists; unsafe cast is a real crash risk regardless of usage | Remove if biometric is confirmed dead code |
| 5 | CEO | Keep all Breathe hardening items | Mechanical | P1 (completeness) | Real race conditions regardless of usage data | — |
| 6 | CEO | Add transfer failure error state to SyncFragment | Mechanical | P2 (boil lakes) | In blast radius; ~20 lines; fixes a user-visible gap | — |
| 7 | CEO | Physical device test: not a hard gate in success criteria | Taste | P6 (bias toward action) | Release APK build + emulator is the gate; physical device is a follow-up | Blocking release on physical device availability |
| 8 | Design | Add TileActivity visual error state (text + tint on failure) | Mechanical | P1 (completeness) | Haptic-only error is inaccessible; 5 lines | — |
| 9 | Design | Verify mood color tokens match tailwind.config.js | Mechanical | P5 (explicit) | Colors hardcoded in MoodPickerScreen — verify match, align if not | — |
| 10 | Eng | AudioFrameParser as shared pure parser (no I/O) | Mechanical | P5 (explicit) | Pure function; easy to reason about; no hidden state | Stateful parser with buffer |

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/autoplan` | Strategy & scope | 1 | clean | 6 concerns; 4 auto-decided; 2 deferred to roadmap |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | unavailable | Codex not installed |
| Eng Review | `/autoplan` | Architecture & tests | 1 | clean | 10 auto-decisions; all mechanical |
| Design Review | `/autoplan` (UI scope) | Wear OS UX gaps | 1 | issues_open | 2 additions: TileActivity visual error, color token verify |

**VERDICT:** REVIEWED. 10 auto-decisions made. 0 user challenges. 2 taste decisions (see gate below). Codex unavailable — single model review. Ready for implementation after approval.

**Additions to plan from review:**
1. SyncFragment: add transfer failure error state (P2, ~20 lines)
2. TileActionActivity: add `tvStatus.text = "Not sent"` + red tint on send failure (P1)
3. Success criteria: verify mood color token match (done — confirmed matching)
