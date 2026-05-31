# Wear OS Brand Alignment

**Status:** Phases A + B complete. Phase C (splash screen) landed. Phase D (companion app) queued.
**Scope:** Tactical polish pass, no office-hours design needed.

## Why

Wear OS companion app doesn't reflect the MoodHaven brand identity. Now that the website is the brand source of truth (warm cream, violet primary scale, regenerated logo), the watch app should match. Same reason the desktop app icons were regenerated from `website/public/logo-full.png` in commit fb1faa9.

## Findings from audit (2026-05-27)

- App label said **"MoodBloom"** in `res/values/strings.xml` — leftover from rebrand. Fixed in Phase A.
- Kotlin package is `com.moodbloom.wear` (gradle namespace too). **Not renamed** — would touch dozens of files and need migration testing. Acceptable as internal identifier.
- Activities used `@android:style/Theme.DeviceDefault` (system gray). No central `colors.xml` or `themes.xml`. Created in Phase A.
- 15+ layout XMLs use hardcoded hex colors throughout (backgrounds, text, accent badges like `#3B82F6` blue and `#8B9EFF` lavender — neither matches brand). Sweep deferred to Phase C.
- No splash screen. Default app-launch behavior. Phase D adds one.
- Launcher icons regenerated from `website/public/logo-full.png` via `tauri icon` earlier today, committed in fb1faa9.

## Phase A — landed ✓ (2026-05-27)

1. **Brand color palette as Android resources** — created `res/values/colors.xml` with brand violet scale (`brand_primary_50` through `brand_primary_950`), accent CTA orange, cream, mood scale (mirrors DESIGN.md), Wear surface neutrals (OLED-friendly black), and text scale. Single source of truth.
2. **MoodHaven theme** — created `res/values/themes.xml` with `Theme.MoodHaven` (inherits `Theme.DeviceDefault`, overrides `colorPrimary` / `colorAccent` / `windowBackground` / text colors to brand) and `Theme.MoodHaven.Translucent` for tile-action trampoline.
3. **App name fix** — `strings.xml`: "MoodBloom" → "MoodHaven" (label + tile label + complication label).
4. **Drawable XMLs** updated to reference `@color/*` instead of hex literals (`btn_outline.xml`, `circle_dot.xml`, `ic_record_btn.xml`).
5. **Manifest theme switched** — `android:theme="@android:style/Theme.DeviceDefault"` → `@style/Theme.MoodHaven` on the application, and `@style/Theme.MoodHaven.Translucent` on `TileActionActivity`.

## Phase B — complete ✅

Landed on branch `chore/codebase-cleanup`. 60+ hex color literals replaced with `@color/` references across all 13 layout XMLs. 13 new named color entries added to `colors.xml` (alpha white variants, surface cards, amber, mood_low_accent).

6. **Layout sweep.** Replace hardcoded hex colors in all 15 layout XMLs (`activity_*.xml`, `fragment_*.xml`, `item_*.xml`) with `@color/` references from the new palette. Key swap: any `#3B82F6` blue → `@color/brand_primary_500`, any `#8B9EFF` lavender → `@color/brand_primary_300`, the existing `#C4B5FD` is already brand and just needs the named reference. Mechanical change, high volume (~50-80 edits).
7. **Verify on device.** Build the Wear APK, install on a Pixel Watch or emulator, walk through every screen, screenshot before/after.

## Phase C — complete ✅

`Theme.MoodHaven.Splash` added to `themes.xml`; `androidx.core:core-splashscreen:1.0.1` added to `build.gradle.kts`; `MainActivity` launches with the splash theme; adaptive icon reused as splash icon via `windowSplashScreenAnimatedIcon`.

8. **Add splash dep** to `src-tauri/gen/android/wear/build.gradle.kts`:
   `implementation("androidx.core:core-splashscreen:1.0.1")`
9. **Add `Theme.MoodHaven.Splash`** inheriting `Theme.SplashScreen` with the regenerated logo as `windowSplashScreenAnimatedIcon` and the cream surface as the splash background (or deep black to match OLED ambient — designer call).
10. **Update manifest** so `.MainActivity` uses the splash theme on launch.
11. **Splash icon drawable.** Generate an adaptive icon variant of the logo at appropriate sizes; the existing launcher icon may already work via `mipmap-anydpi-v26/ic_launcher.xml`.
12. **Verify on device.** Splash duration, brand color appears correctly, no flash to gray theme.

## Phase D — companion app polish (separate scope)

13. The **phone companion app** at `src-tauri/gen/android/app/` likely has similar drift. Mirror Phase A/B/C there if not already done.

## Not in scope

- No new features
- No re-architecting of the recording pipeline
- No UI restructure beyond color/logo

## Effort

1–2 hours of focused work. Ship as its own PR with screenshots before/after.

## Dependencies

- The regenerated logo at `website/public/logo-full.png` is the canonical source.
- Brand palette is in both `tailwind.config.js` files and documented in `DESIGN.md`.
