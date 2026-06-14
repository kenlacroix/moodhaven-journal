# Android: from bridge to standalone app

> **Status (2026-06-11):** Phase 1 in progress (this branch). The mobile UI shell already
> exists — this plan reframes the Android app as a first-class, standalone ecosystem node
> (phone-first journaling), not just the Wear→desktop bridge it's been perceived as.

---

## Why this exists

The Tauri Android shell already runs the full React app, and the `android-foundation-stages-A1-to-A6`
commit (`c7dd2c4`, on `main`) shipped a mobile layout shell, mobile writing/timeline/calendar
adaptations, and touch-CSS polish. So the app is **not** actually a bridge — but it *feels* like one
because (a) a few desktop-only features render on Android where they can't work, (b) some real views
aren't reachable from the mobile nav, and (c) a handful of Rust commands lack Android `cfg` branches.

The owner's intent: a standalone phone app with **ecosystem tie-in** (cloud sync as the cross-device
glue, optional peer sync on LAN, watch capture), where the bridge is one capability among many — not
the product.

---

## Current state (what already works on Android)

**UI / navigation (already shipped):**
- `MobileLayout` + `MobileHeader` + `BottomTabBar` (5 tabs: Write · Journal · Insights · Calendar · More).
- App.tsx swaps `MainLayout` ↔ `MobileLayout` via `(isAndroid || isMobileViewport)`.
- Mobile-adapted: WritingView (responsive drawers, scrollable toolbar), CalendarPage (full-screen grid
  + slide-in day overlay), SettingsPage (list→detail flow). Timeline/OnThisDay/Insights/Lock/Setup are
  centered-`max-w` cards + responsive grids — acceptable on a phone, not custom-tuned.

**Rust / native (cross-platform, works on Android):**
- SQLite + SQLCipher at-rest, journal CRUD, analytics.
- Auth / 2FA / session lock / rate limiting.
- Peer sync engine (TCP) + pairing + identity; cloud sync (WebDAV + Dropbox/GDrive OAuth).
- Encrypted media + voice-memo storage; settings; logging.
- Native Android biometric unlock via `BiometricPlugin.kt` (Android KeyStore) — separate from the
  desktop keyring path.

**Per-screen mobile status**

| Screen | Status |
|---|---|
| Writing, Calendar, Settings | adapted (custom mobile layout) |
| Timeline, On This Day, Insights, Lock, Setup | acceptable-responsive (centered card / responsive grid) |
| StillHaven / Sessions, Journal overview | reachable only via desktop sidebar (nav gap → Phase 1) |

---

## Phase 1 — capability honesty + nav reachability (this PR, frontend-only)

Verifiable in the web build at a phone viewport + typecheck/vitest; no APK needed.

- **Mic button** (`EditorToolbar.tsx`): was gated `!isIOS`, so it rendered on Android where the
  whisper sidecar can't run. Now gated `isDesktop` (STT is desktop-only; absent on iOS/Android and the
  browser build). _Adopt the `canSTT` capability flag once the platform-detection refactor lands._
- **Self-update panel** (`AboutTab.tsx`): was `!isIOS`; Android `can_self_update` is always false.
  Now gated `isDesktop` (mobile is store/APK-distributed; browser can't self-update). Version/about
  info still shows everywhere.
- **Mobile nav reachability** (`BottomTabBar.tsx`): the "More" sheet now exposes **StillHaven** +
  **Sessions** when `VITE_FEATURE_STILL && wellness.stillhavenEnabled` (mirrors the desktop
  `SidebarNavigation` guard); `isMoreActive` updated so the More tab shows active on those views.

_Deferred within Phase 1:_ Books / `journalOverview` reachability on mobile (needs a book picker in
the sheet) — small follow-up.

---

## Phase 2 — native correctness (needs cargo/APK; owner-verified)

Each item is a runtime gap on Android that web testing can't catch.

- `commands/data_management.rs` `open_log_folder` (~L139) and `commands/media.rs`
  `open_media_attachment` (~L445): only `macos`/`windows`/`linux` arms → error on Android. Add an
  `target_os = "android"` branch (Android `ACTION_VIEW`/share intent via the declared FileProvider, or
  a graceful "not available" result). Media decrypts but currently can't be opened.
- `commands/cloud_providers.rs`: OAuth token key falls back to an on-disk `cloud_token_key.bin` on
  Android (the `keyring` crate is desktop-only) → weaker token-at-rest than desktop. Move to Android
  KeyStore (parity with `BiometricPlugin.kt`).
- `gen/android/app/src/main/AndroidManifest.xml`: add `CHANGE_WIFI_MULTICAST_STATE` and acquire a
  Wi-Fi `MulticastLock` so mDNS discovery works; today only direct TCP connect succeeds, so peer
  discovery is unreliable on Android.
- `tauri.conf.json`: add a `bundle.android` block (parity with the `iOS` block: min SDK, signing).
  `externalBin` (whisper) correctly never ships on Android.
- Export UX: `write_text_file` works (pure I/O) but there's no share/save-to-Downloads intent — exports
  land in app storage with no way to surface them. Add a share intent.

---

## Phase 3 — ecosystem tie-in (the "node, not bridge" story)

- **Cloud sync = primary cross-device path** and already works on Android with no gates — make it the
  headline sync story in onboarding/Settings on mobile.
- **Peer sync** lights up once Phase 2 multicast lands; the Devices/peer-sync UI is iOS-gated but not
  Android-gated, so it's already reachable.
- **Watch capture on standalone Android:** `useWearVoiceMemos` transcription is intentionally
  `!isAndroid`-gated (whisper is desktop-only). Decide: (a) keep raw memo for desktop transcription via
  sync, or (b) add a phone-side cloud STT path later. Mood-tap signals already flow through
  `WearListenerService` → `useWearSignals`.

---

## Phase 4 — distribution

- No self-update on Android (correct) — document the Play Store / sideload-APK channel.
- AAB SHA-256 checksums already emitted to `latest-release.json` (PR #58 / `scripts/`).
- Decide package/signing identity and min SDK before first public APK.

---

## Verification (Phase 1)

1. `npm run typecheck`, `npm run lint:ci`, `npm test` (vitest) — green.
2. `npm run dev:web` at a phone viewport (e.g. 390×844):
   - Writing toolbar: no mic button (web `isDesktop` false).
   - More sheet: StillHaven + Sessions appear when StillHaven is enabled in Settings; both navigate and
     the More tab shows active.
   - About: no self-update panel; version info still present.
3. Owner runs `npm run tauri android dev` on device/emulator to confirm on-device and to drive Phase 2.
