# Android 1.0 Play Store Readiness Review

> **Date:** 2026-04-08  
> **App version:** 0.8.5 (package.json) / 0.8.3.0 (VERSION)  
> **Branch:** `claude/android-1-0-review-L5F47`  
> **Scope:** Phone bridge app (`com.moodhaven.app`) + Wear OS companion (`com.moodbloom.wear`)

---

## 1. High-Level Assessment

The apps are **not yet 1.0-ready**, but they are close. The core pipeline works: voice recording → watch-to-phone transfer → Tauri bridge → journal creation. The companion polish plan (`feat-android-companion-polish.md`) addressed most of the known bugs. What remains is a cluster of **Play Store compliance gaps**, one **silent data-loss risk**, and a handful of **naming inconsistencies** that will cause maintenance confusion.

**Verdict:** 3–5 focused days of work to production-ready.

---

## 2. Architecture Overview

### Phone App (`com.moodhaven.app`)

| Layer | What it is |
|---|---|
| UI | Tauri WebView — React + TypeScript (the desktop app) |
| Native bridge | `WearPlugin` (Tauri plugin) + `WearListenerService` (WearableListenerService) |
| Biometrics | `BiometricPlugin` (Tauri plugin, AES-256-GCM key in AndroidKeyStore) |
| Storage | SQLite via rusqlite inside the Tauri process; WebCrypto in the WebView |
| Wear bridge | `WearSignalBuffer` (cold-start buffer) + `AudioFrameParser` (framing protocol) |

The phone app is architecturally a thin Tauri Android host. The entire journaling UI lives in the WebView; the Kotlin layer exists only to bridge Wear OS Data Layer events into Tauri events.

### Wear OS App (`com.moodbloom.wear`)

| Concern | Implementation |
|---|---|
| Recording | `RecordingSession` (MediaRecorder, 16 kHz AAC-LC) |
| Transfer | `AudioTransferService` + `AudioQueue` (persist-and-retry) |
| Mood taps | `SignalSender` + `OfflineQueue` (persist-and-retry with backoff) |
| Breathe feature | `BreatheSessionActivity` (AtomicBoolean + Channel pause) |
| Tiles/complications | `MoodTileService` + `MoodComplicationService` |

The Wear app is fully native Android (View-based). No Compose, no Tauri dependency. It's a standalone APK distributed through the `wearApp(project(":wear"))` dependency in the phone app's `build.gradle.kts`.

---

## 3. Top Risks — Prioritized

### P0 — Play Store Blockers

#### P0-1: `targetSdk = 34` on Wear app violates Google's policy
Google requires `targetSdk >= 35` for all new apps submitted after **August 2025**. The phone app is already at `targetSdk = 36`. The wear app is at 34.

```kotlin
// wear/build.gradle.kts — current
compileSdk = 34
targetSdk = 34

// Fix
compileSdk = 36
targetSdk = 36
```

**Risk:** Submission rejected.  
**Effort:** 30 min. After bumping, run a build and verify `AppCompatActivity` APIs still work (minSdk 30 means no backcompat shims are needed).

---

#### P0-2: `SCHEDULE_EXACT_ALARM` requires Play Store justification or runtime flow
`SCHEDULE_EXACT_ALARM` is a restricted permission since Android 12 (API 31). Google requires apps to either:
1. Declare the use case in the Data Safety form and handle `ACTION_REQUEST_SCHEDULE_EXACT_ALARM` at runtime, **or**
2. Switch to `setInexactRepeating` for non-time-critical reminders (which is fine for journal reminders)

The current manifest declares it without any runtime check or justification comment.

```xml
<!-- app/AndroidManifest.xml — current -->
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
```

**Risk:** Submission flagged or rejected. If the reminder feature tolerates ~15-minute window, switch to inexact. If not, add the `USE_EXACT_ALARM` permission (no user prompt required, API 33+) or add the runtime settings-page redirect.  
**Effort:** 1–2 hours depending on path chosen.

---

#### P0-3: No AAB (Android App Bundle) build path
Play Store requires AAB format for all new submissions. There is currently no `bundle` task configuration or CI step targeting AAB output. The build produces APKs by default.

**Fix:** In CI, replace `./gradlew assembleRelease` with `./gradlew bundleRelease`. The signing config already reads from env vars, so no changes needed there.

**Risk:** Cannot submit to Play Store.  
**Effort:** CI config change, 30 min.

---

#### P0-4: No privacy policy or Data Safety section assets
Play Store requires:
- A privacy policy URL accessible from the app and the store listing
- The Data Safety section completed accurately

Given MoodHaven's zero-knowledge architecture, the Data Safety answers are:
- No data collected from users (journal content never leaves device)
- No data shared with third parties
- Data encrypted in transit (Wear OS ChannelAPI) and at rest (AES-256-GCM)
- Users can delete data via factory reset

**Risk:** Submission incomplete.  
**Effort:** Writing the privacy policy: ~2 hours. Completing the Play Console form: 30 min.

---

### P1 — Should Fix Before 1.0

#### P1-1: Voice memos are silently dropped during cold start
When the phone app is not running and the watch transfers audio, `WearListenerService.onChannelOpened()` saves the file and calls:

```kotlin
WearPlugin.getInstance()?.bridgeVoiceMemo(…) 
    ?: Log.w(TAG, "WearPlugin not ready — voice memo ${frame.id} saved but not bridged yet")
```

The file lands in `voice_memos_incoming/` but is **never bridged** to the Tauri layer. The `WearSignalBuffer` handles this for mood-tap signals, but there is no equivalent for voice memos. The user opens the app and the memo never appears.

**Fix:** Add a `WearVoiceMemoBuffer` (SharedPreferences-backed, parallel to `WearSignalBuffer`) and drain it in `WearPlugin.init`. Pattern is identical to signal buffering, ~80 lines.

**Risk:** Silent data loss in the most common real-world usage pattern (recording while phone app is closed).  
**Effort:** 2–3 hours.

---

#### P1-2: Wear app namespace still uses old brand `moodbloom`
The wear app's Kotlin package and Gradle namespace are `com.moodbloom.wear`. The phone app uses `com.moodhaven.app`. The wear `applicationId` is correctly `com.moodhaven.app` (required for companion app pairing), but:

- All Kotlin source files use `package com.moodbloom.wear`
- `SyncStats`, `AudioQueue`, `OfflineQueue` SharedPreferences names reference `moodbloom_*`
- `MoodTileService` comment says "Add tile → MoodBloom Mood"
- `WearPlugin.getInstance()` sends `EVENT_CONNECTION = "wear://connection"` but internally logs as `MoodBloomWear`

This isn't a runtime bug, but it will cause persistent confusion whenever both apps are open in Android Studio and creates a rebrand-debt that grows with each new file.

**Fix:** Rename package `com.moodbloom.wear` → `com.moodhaven.wear` across all 28 source files. Update SharedPreferences keys (add a one-time migration in `MainActivity` to copy old keys to new names before deleting them). Update tile/complication user-facing strings to "MoodHaven".

**Effort:** ~2 hours with IDE refactor + migration shim.

---

#### P1-3: Wear `versionName` default fallback is `"0.5.0"`
```kotlin
// wear/build.gradle.kts
versionName = tauriProperties.getProperty("tauri.android.versionName", "0.5.0")
```

The phone app defaults to `"1.0"`. If `tauri.properties` is absent (e.g., fresh checkout without a Tauri build), the wear APK reports version 0.5.0. Play Store will reject an AAB where the embedded wear APK has a lower version than the phone APK if they share an applicationId.

**Fix:** Change fallback to `"1.0"` to match the phone app.  
**Effort:** 1 line.

---

#### P1-4: No crash reporting for production builds
There is no crash reporting integration. `tauri-plugin-log` provides structured logging to a rotating file, but crashes in the native Kotlin layer (OOMs, uncaught exceptions, ANRs) are invisible without a crash reporter.

For a privacy-first app, Firebase Crashlytics is a reasonable choice because:
- It collects stack traces and device metadata, not user content
- No journal data ever reaches it (crash happens before or after WebView interactions)

Alternatively, use Android's built-in `Thread.setDefaultUncaughtExceptionHandler` to write crash logs to `filesDir` and surface them on next launch.

**Risk:** Production crashes are invisible until users report them.  
**Effort:** Firebase: 2–3 hours. Local crash log: 1 hour.

---

#### P1-5: No Android unit tests
Neither app has a test harness. The polish plan explicitly deferred this. Two classes are prime candidates because they are pure logic with no Android framework dependencies:

| Class | What to test |
|---|---|
| `AudioFrameParser` | Parse valid frames, frames too short, invalid metadata length, missing `id` field, id sanitization |
| `OfflineQueue` | Enqueue/drain cycle, max capacity eviction, malformed SharedPreferences recovery |
| `SignalSender.buildEnvelope` | JSON structure of mood tap envelope |

These would give confidence in the wire protocol and offline behavior before shipping.

**Effort:** ~3 hours to add a JUnit test module and write ~30 tests.

---

### P2 — Hardening (High-value, Low-risk)

#### P2-1: `SignalSender.trySend()` calls `Tasks.await()` on a coroutine thread
`trySend()` is called from `withContext(Dispatchers.IO)` but uses blocking `Tasks.await()` inside. This is technically safe on IO dispatcher threads, but if the coroutine is cancelled mid-await, the blocking call won't unblock. Switch to `Tasks.await()` → `task.await()` (suspending extension from `kotlinx-coroutines-play-services`, already a dependency).

**Risk:** Potential hang under high-load or slow GMS.  
**Effort:** 30 min.

---

#### P2-2: `CAMERA` and `ACCESS_FINE_LOCATION` need runtime permission request UI
Both permissions are declared in the manifest but there's no evidence of runtime request flows in the Kotlin code (the QR pairing and location features likely run in the WebView). Verify:
- Camera permission is requested before QR scanning is triggered
- Location permission has a rationale dialog explaining why (geolocation for weather context)
- Both handle denial gracefully (features degrade, not crash)

The Tauri permission system may handle this; verify the behavior on a real device.

**Effort:** 1–2 hours to audit and test.

---

#### P2-3: Keystore file written to project root during CI build
```kotlin
// app/build.gradle.kts
val f = rootProject.file("keystore-app.jks")
f.writeBytes(Base64.getDecoder().decode(keystoreBase64))
```

The decoded keystore is written to disk at `src-tauri/gen/android/keystore-app.jks` and never deleted. On ephemeral CI runners this is fine; on persistent runners it accumulates keystore files. Add cleanup:

```kotlin
gradle.buildFinished { f.delete() }
```

**Effort:** 5 min.

---

#### P2-4: `BreatheModeDetailActivity` missing `withTimeoutOrNull` on HR capture
From the polish plan: `HealthSnapshot.capture()` can hang indefinitely if heart rate sensor is unavailable. The `btnBegin.isEnabled = false` guard blocks the UI forever with no recovery.

Add `withTimeoutOrNull(12_000)` around the capture call and re-enable the button if it times out.

**Effort:** 30 min.

---

#### P2-5: Google Fonts loaded from network in WebView
`index.html` loads Inter from `fonts.googleapis.com`. On Android, this works when online but causes FOUC (flash of unstyled content) on first load and fails offline.

```html
<!-- index.html — current -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

**Fix:** Bundle Inter as a local asset. Vite can inline woff2 files. The font is ~60 KB compressed.

**Effort:** 1 hour.

---

### P3 — Post-1.0 Backlog

| Item | Notes |
|---|---|
| Standalone watch mode (`standalone="true"`) | Requires watch app to manage its own data storage |
| Media attachment sync over Wear OS | Planned in phase roadmap |
| Jetpack Compose migration for Wear | View-based is fine for 1.0; Compose is preferred for new features |
| i18n beyond English string extraction | Low priority until user demand exists |
| Wear OS watchface complication data freshness | Currently updates every 30 min; could be smarter |

---

## 4. 1.0 Readiness Checklist

### Play Store Submission Requirements

- [ ] **P0-1** Wear `targetSdk` bumped to 35 or 36
- [ ] **P0-2** `SCHEDULE_EXACT_ALARM` handled: inexact alarms or runtime consent flow
- [ ] **P0-3** CI produces AAB (`bundleRelease`) not APK
- [ ] **P0-4** Privacy policy written and hosted at a stable URL
- [ ] **P0-4** Data Safety section completed in Play Console
- [ ] App icons at all densities: `mipmap-mdpi` through `mipmap-xxxhdpi` + adaptive icon (`ic_launcher_foreground.xml` + `ic_launcher_background.xml`)
- [ ] Wear app icon at all watch densities (`mipmap-hdpi`, `mipmap-xhdpi`)
- [ ] Phone app store screenshots (min 2, max 8, at least one phone + one tablet if targeting tablet)
- [ ] Wear OS store screenshots (min 1)
- [ ] Feature graphic (1024 × 500 px)
- [ ] Short description (≤ 80 chars) + full description
- [ ] Content rating questionnaire completed (journal app → no mature content)
- [ ] Signing keystore backed up securely (not just CI env vars)
- [ ] `versionCode` and `versionName` are consistent between phone and wear APKs
- [ ] `wearApp(project(":wear"))` confirmed to trigger auto-install on paired watch

### Runtime Behavior

- [ ] **P1-1** Voice memo buffer: memos received during cold start are not lost
- [ ] **P1-3** Wear versionName default changed from `"0.5.0"` to `"1.0"`
- [ ] POST_NOTIFICATIONS permission requested at runtime (Android 13+, API 33+)
- [ ] CAMERA permission requested before QR pairing is triggered
- [ ] ACCESS_FINE_LOCATION requested with rationale before weather feature activates
- [ ] READ_MEDIA_IMAGES requested before media attachment browser opens
- [ ] All permissions: graceful degradation when denied (feature disabled, not crash)
- [ ] `usesCleartextTraffic="false"` in release build (already correct in manifest template)
- [ ] App correctly handles: rotation, process kill during recording, background/foreground transitions
- [ ] Wear: recording correctly stops when watch screen turns off mid-session

### Security

- [ ] BiometricPlugin invalidated-key path tested on real device (new fingerprint enrollment)
- [ ] ProGuard keeps Tauri plugin classes (`@TauriPlugin`, `@Command` annotations)
- [ ] ProGuard keeps `WearListenerService`, `FeedbackService`, `MoodTileService`, `MoodComplicationService` (all are accessed by GMS via reflection)
- [ ] No debug logs in release build that could expose session state

### Quality

- [ ] **P1-5** JUnit tests for `AudioFrameParser` and `OfflineQueue`
- [ ] **P1-4** Crash reporting integrated (Firebase or local crash log)
- [ ] Manual test pass on: low-end device (minSdk 24), flagship, Pixel Watch 3+ (Wear OS 4)
- [ ] Battery drain acceptable during extended recording session
- [ ] Wear app tile correctly updates after mood tap (complication cache cleared)

---

## 5. Optional Quick Wins

These are high-impact, low-effort changes that can be done in a single sitting:

| Win | File | Effort |
|---|---|---|
| Fix `versionName` default on wear | `wear/build.gradle.kts` line 15 | 1 line |
| Bump wear `compileSdk` + `targetSdk` to 36 | `wear/build.gradle.kts` lines 20–21 | 2 lines |
| Add keystore cleanup in `gradle.buildFinished` | `app/build.gradle.kts` | 5 min |
| Bundle Inter font locally (remove Google Fonts CDN) | `index.html` + Vite config | 1 hour |
| Add `WearVoiceMemoBuffer` (parallel to `WearSignalBuffer`) | New file + `WearPlugin.init` + `WearListenerService` | 2–3 hours |
| Rename wear package `moodbloom` → `moodhaven` via IDE refactor | 28 `.kt` files | 2 hours |
| Add `withTimeoutOrNull(12_000)` in `BreatheModeDetailActivity` | `BreatheModeDetailActivity.kt` | 30 min |
| Switch `SignalSender.trySend` to suspending `task.await()` | `SignalSender.kt` | 30 min |

---

## 6. Structural Observations

### What's already solid

- **Framing protocol**: `AudioFrameParser` is a clean, testable object with good validation (metadata size cap, id sanitization, empty-audio guard). This was the right call.
- **Wire protocol constants**: `WearProtocol` centralizes all path strings and limits. No scattered magic strings.
- **Offline resilience**: Both `AudioQueue` and `OfflineQueue` use `ArrayDeque` with O(1) eviction and validated serialization. They will behave correctly across app restarts.
- **Breathe session**: `AtomicBoolean` + `Channel`-based pause is correct for the concurrent memory model. No busy-wait.
- **Release signing**: CI reads from env vars; local builds fall back silently. Good pattern — no keystore checked into source.
- **BiometricPlugin**: Safe cast (`as? FragmentActivity`), AndroidKeyStore key generation, invalidation handling. This is production quality.
- **cleartext traffic**: Disabled in release manifest template. Only the debug build enables it for local development.

### Tight coupling to note

- The phone app's Wear bridge (`WearPlugin`) is tightly coupled to `WearSignalBuffer` (a companion object), which creates a hidden initialization dependency. The `init` block drains the buffer synchronously; if the buffer is large, this could delay `WearPlugin` initialization and delay the first Tauri event. This is unlikely to be a practical problem (buffer max is likely small) but worth noting.
- The Wear app has no dependency injection. Every component reaches for `context.getSharedPreferences(...)` directly. This is fine for the current scale but will complicate testing if the test suite grows.

### No broad restructuring needed

The architecture is appropriate for the problem. The Tauri WebView + thin Kotlin bridge is a correct pattern for a desktop app adapting to Android. The Wear app is the right size for what it does. No rewrites are indicated.

---

## 7. Summary

| Category | Status | Blockers |
|---|---|---|
| Play Store compliance | ❌ Not ready | targetSdk, AAB build, privacy policy, SCHEDULE_EXACT_ALARM |
| Core pipeline correctness | ⚠️ Mostly ready | Voice memo cold-start loss (P1-1) |
| Security | ✅ Solid | Minor keystore file cleanup |
| Code quality | ✅ Solid | Naming inconsistency is cosmetic |
| Testing | ⚠️ Minimal | No Android unit tests |
| Performance | ✅ Solid | Google Fonts CDN is a minor FOUC risk |

Fix the four P0 items and P1-1 (voice memo buffer) and this is shippable.
