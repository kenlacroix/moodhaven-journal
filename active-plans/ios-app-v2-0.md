# iOS App — v2.0 Plan

**Status:** Phase 1 (cloud sync) in progress on `feat/cloud-sync-phase1` | Phase 2 config in progress on `feat/ios-phase2-setup`  
**Target version:** v2.0.0  
**Approach:** Tauri v2 iOS target (decided)

---

## Why Tauri v2 iOS (not native SwiftUI)

- All ~150 Rust commands work immediately — encryption, SQLite, 2FA, time capsules, analytics, StillHaven
- Same AES-256-GCM + PBKDF2 encryption model across all platforms
- Same `.moodhaven` blob format — data portability between desktop and iOS is already solved
- React UI already runs in a browser (WebView) via the web build — mobile-responsive is an evolution, not a rewrite
- Single codebase to maintain
- Tauri v2 iOS is production-ready as of v2.0 (September 2024)

---

## Prerequisites for the developer machine

```bash
# Rust iOS targets
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios

# Xcode (from App Store) — required for iOS builds
# Apple Developer account — required for device deployment and TestFlight
#   (Simulator builds work without a paid account)

# Init the iOS Xcode project (run once)
npm run tauri ios init
```

---

## Work streams and sequencing

The iOS app needs a cloud sync story before it's useful (LAN peer sync won't be the iOS primary path). Ship the sync improvements first, then the iOS shell, then the UI responsiveness work.

```
Phase 1: Cloud sync (Dropbox + Google Drive)   ← IN PROGRESS (feat/cloud-sync-phase1)
Phase 2: Tauri iOS project setup               ← 1-2 days, mostly config
Phase 3: Mobile-responsive React UI            ← IN PROGRESS (BottomTabBar + useIsMobile foundation)
Phase 4: iOS-specific adaptations              ← feature scoping, flags, edge cases
Phase 5: iOS-only additions (v2.1+)            ← HealthKit, Face ID, Widgets
```

---

## Phase 1 — Cloud Sync: Dropbox + Google Drive

### Context

WebDAV is correct and should remain available. The gap: most users don't run a WebDAV server. Adding Dropbox and Google Drive gives users sync via services they already have, with zero infrastructure to manage. The encrypted blob format (`.moodhaven`) doesn't change — these providers are just new transport layers.

### Architecture

```
User authenticates with Dropbox / Google Drive
    ↓
OAuth PKCE flow (browser → redirect to moodhaven:// custom URL scheme)
    ↓
Rust receives auth code, exchanges for access + refresh tokens
    ↓
Tokens stored encrypted in SQLite settings table (same as other secrets)
    ↓
Upload: current encrypted blob → /Apps/MoodHaven/moodhaven-backup.moodhaven
Download: pull blob → decrypt and import (same path as WebDAV import)
```

### New Tauri command module: `src-tauri/src/commands/cloud_providers.rs`

```rust
// Commands to register in lib.rs:
cloud_provider_auth_start    // opens browser to OAuth URL, returns state token
cloud_provider_auth_complete // exchanges code for tokens, stores encrypted
cloud_provider_sync_upload   // upload current encrypted export blob
cloud_provider_sync_download // download and return blob for import
cloud_provider_status        // { provider: "dropbox"|"gdrive"|null, connected: bool, lastSync: Option<String> }
cloud_provider_disconnect    // clears stored tokens
```

### Custom URL scheme (OAuth redirect)

Add to `tauri.conf.json`:
```json
{
  "app": {
    "security": {
      "csp": "..."
    }
  },
  "bundle": {
    "iOS": {
      "minimumSystemVersion": "16.0"
    }
  }
}
```

Register `moodhaven://oauth` as a custom URL scheme in the iOS Info.plist (Tauri handles this via capabilities config).

On desktop (macOS/Linux/Windows), use `tauri-plugin-deep-link` or a localhost redirect (Dropbox and Google both support `http://localhost:PORT/oauth` for desktop apps — simpler than a custom scheme on desktop).

### Dropbox API

- App type: "Scoped access," scope: `files.content.write` + `files.content.read`
- Auth: OAuth 2.0 PKCE (`response_type=code`, `code_challenge_method=S256`)
- Upload endpoint: `POST https://content.dropboxapi.com/2/files/upload`
  - Header: `Dropbox-API-Arg: {"path": "/Apps/MoodHaven/moodhaven-backup.moodhaven", "mode": "overwrite"}`
- Download endpoint: `POST https://content.dropboxapi.com/2/files/download`
  - Header: `Dropbox-API-Arg: {"path": "/Apps/MoodHaven/moodhaven-backup.moodhaven"}`
- Token refresh: `POST https://api.dropboxapi.com/oauth2/token` with `grant_type=refresh_token`

### Google Drive API

- Scope: `https://www.googleapis.com/auth/drive.appdata` (restricted to app folder, no access to user files — best for privacy)
  - Or `https://www.googleapis.com/auth/drive.file` (files created by this app only)
- Auth: OAuth 2.0 PKCE
- Upload: multipart upload to `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`
- Download: `GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media`
- File management: create file on first sync, update on subsequent syncs (store file ID in settings)

### Settings UI changes

New sync provider picker in Settings → Sync tab (rename current "Cloud Sync" tab):

```
Sync Method
  ○ None
  ○ Dropbox        [Connect / Disconnect]  [Sync Now]
  ○ Google Drive   [Connect / Disconnect]  [Sync Now]
  ○ WebDAV         [URL / Username / Password fields]

Last synced: <timestamp>
```

### Files to touch

| File | Change |
|------|--------|
| `src-tauri/src/commands/cloud_providers.rs` | New module |
| `src-tauri/src/commands/mod.rs` | Declare `pub mod cloud_providers` |
| `src-tauri/src/lib.rs` | Register 6 new commands |
| `src-tauri/capabilities/default.json` | Add `core:default:allow-cloud-provider-*` |
| `src/lib/services/cloudProvidersService.ts` | New IPC wrappers |
| `src/components/settings/tabs/SyncTab.tsx` | Provider picker UI |
| `src/types/settings.ts` | Add `syncProvider: 'none' | 'dropbox' | 'gdrive' | 'webdav'` |

---

## Phase 2 — Tauri iOS Project Setup

### Done (on `feat/ios-phase2-setup`)

- [x] `bundle.iOS` config added to `tauri.conf.json` (`minimumSystemVersion: "16.0"`, `developmentTeam` placeholder)
- [x] `src-tauri/capabilities/ios.json` — iOS capability file with `platforms: ["iOS"]`; drops wear/window permissions not applicable to iOS
- [x] `usePlatform.ts` — adds `isIOS`, `isMobile`; iOS detection via WKWebView UA + `__TAURI_INTERNALS__` guard
- [x] `build.md` — iOS build section (prerequisites, `ios init` steps, Xcode capability config, Info.plist descriptions)

### Requires macOS + Xcode (next steps on a Mac)

```bash
# Add Rust iOS targets
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios

# Generate the Xcode project (run once)
npm run tauri ios init
# → creates src-tauri/gen/apple/

# Open in Xcode and:
# 1. Set Team ID (replaces REPLACE_WITH_APPLE_TEAM_ID in tauri.conf.json)
# 2. Add entitlements: Background Modes (fetch + processing), Push Notifications
# 3. Add Info.plist keys:
#    NSUserNotificationsUsageDescription = "Receive journaling reminders"
#    NSFaceIDUsageDescription = "Unlock MoodHaven with Face ID" (Phase 5)
#    NSMicrophoneUsageDescription = "Record voice journal entries" (Phase 5)

# Build and run
npm run tauri ios dev       # hot-reload to Simulator or connected device
npm run tauri ios build     # production .ipa
```

### Expected first-build issues

- `tauri-plugin-shell` sidecar spawning is blocked on iOS — STT mic button must be hidden via `usePlatform().isIOS` (Phase 4 work)
- `wear:allow-*` permissions in `default.json` will be inert on iOS (wear plugin not loaded) — harmless
- Minimum iOS version: 16.0+ covers ~95% of active iPhones as of 2026
- Bundle ID conflict: if any package uses `com.moodhaven.app` as a reserved prefix, rename to `com.moodhaven.app.ios`

---

## Phase 3 — Mobile-Responsive React UI

This is the largest work item. The current UI is sidebar-based with an 800px minimum width — it will not work on an iPhone screen.

### Layout architecture

**Current (desktop):**
```
<div class="flex h-screen">
  <Sidebar />              // 240px wide, always visible
  <main class="flex-1">
    <ActiveView />
  </main>
</div>
```

**New (mobile-aware):**
```
<div class="flex flex-col h-screen">
  <main class="flex-1 overflow-auto">
    <ActiveView />
  </main>
  {isMobile && <BottomTabBar />}
  {!isMobile && <Sidebar />}  // unchanged for desktop
</div>
```

### `useIsMobile()` hook

```typescript
// src/hooks/useIsMobile.ts
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}
```

Tauri also exposes the platform: `import { platform } from '@tauri-apps/plugin-os'` returns `'ios'` on iOS — can use this for iOS-specific logic beyond just screen size.

### BottomTabBar component (new)

Five tabs: **Write** · **Timeline** · **Insights** · **Calendar** · **Settings**

- Fixed to bottom, `safe-area-inset-bottom` padding for iPhone home bar
- Active tab highlighted with mood accent color
- Each tab icon from the existing `EditorIcons.tsx` set or new SVG atoms
- File: `src/components/layout/BottomTabBar.tsx`

### Views needing responsive work

| View | Issue | Fix |
|------|-------|-----|
| `WritingView` | Sidebar-dependent width; toolbar wraps awkwardly | Full-width on mobile; toolbar scrolls horizontally or collapses to floating bar above keyboard |
| `TimelineView` | Entry cards are already list-like — mostly fine | Touch target sizing (min 44px height); remove hover states |
| `InsightsView` | AI cards are row-based flex — may overflow | Stack cards vertically on mobile |
| `CalendarPage` | Calendar grid cells may be too small | Larger cells on mobile; swipe to change month |
| `SettingsPage` | Tab strip at top may overflow | Tabs become a scrolling horizontal strip or a mobile-style section list |
| `SidebarBooks` | Books modal — fine on desktop | Full-screen sheet on mobile |

### Keyboard avoidance

On iOS, the on-screen keyboard pushes content up. TipTap inside a `position: fixed` layout needs explicit keyboard avoidance handling:
- Use `window.visualViewport` API to detect keyboard height
- Push the editor container up when keyboard is shown
- The iOS WKWebView handles some of this automatically if the body isn't fixed-height

### Remove desktop-only minimum window size

`tauri.conf.json` currently sets `"minWidth": 800, "minHeight": 600` — these are desktop-only constraints and don't affect iOS builds, but make sure mobile CSS doesn't rely on `min-width: 800px` media queries anywhere.

### Tailwind responsive breakpoints

MoodHaven already uses Tailwind. The convention for mobile-first responsive work:
- Default styles: mobile
- `md:` prefix: desktop (≥768px)
- Replace any `flex` / `grid` that assumes wide viewport with `flex-col md:flex-row` etc.

---

## Phase 4 — iOS-Specific Adaptations

### Feature scoping for iOS v1

| Feature | iOS v1 | Notes |
|---------|--------|-------|
| Core journaling (read/write/mood/tags) | ✅ Full | Works via WKWebView |
| Books, time capsules, search | ✅ Full | |
| Calendar heatmap, insights, analytics | ✅ Full | SVG charts work in WKWebView |
| AI insight cards | ✅ Full | Metadata-only, same Rust commands |
| 2FA (TOTP) | ✅ Full | TOTP works; hardware key N/A on iOS |
| WebDAV sync | ✅ Full | Rust HTTP client works on iOS |
| Dropbox / Google Drive sync | ✅ Full | Phase 1 work; works on all platforms |
| StillHaven bilateral audio | ✅ Full | Web Audio API works in WKWebView |
| Peer LAN sync (mDNS + TCP) | ⚠️ Degraded | Discovery unreliable in foreground; **hide pairing UI on iOS**; show "Use cloud sync on iOS" message |
| Speech-to-text (whisper.cpp sidecar) | ❌ Not in v1 | No sidecar processes on iOS; hide mic button; future: whisper-rs |
| Voice memo draft pipeline | ❌ Not in v1 | Wear OS companion is Android-only; hide draft cards on iOS |
| Hardware key (FIDO2) | ❌ N/A | iOS uses Face ID / Touch ID; show appropriate fallback |
| Writer window (breakout window) | ❌ N/A | iOS has no multi-window journal writing; hide option |
| Update checker (GitHub releases) | ❌ N/A | App Store handles updates; hide update panel |
| Log folder access | ❌ N/A | iOS sandbox; hide "Open Log Folder" button |

### Platform detection in the frontend

Use `platform()` from `@tauri-apps/plugin-os` to gate iOS-only code:

```typescript
import { platform } from '@tauri-apps/plugin-os';
const isIOS = platform() === 'ios';
```

Or extend the existing `usePlatform()` hook pattern to add `isIOS`.

### Peer sync UI on iOS

In `DevicesTab.tsx`, when `isIOS`:
- Replace the full peer sync UI with an informational card:
  > "Peer sync is available on the MoodHaven desktop app. On iOS, sync your journal using Dropbox or Google Drive."
- Hide `DevicesNearby`, `PairingModal`, pairing controls

### Hiding the mic button on iOS

In `EditorToolbar.tsx`, conditionally render `<MicButton>` only when `!isIOS` and STT is available.

### Tauri plugin iOS compatibility audit

Before the iOS build, verify each plugin has an iOS implementation:

| Plugin | iOS support? | Action |
|--------|-------------|--------|
| `tauri-plugin-fs` | ✅ Yes | No change |
| `tauri-plugin-http` | ✅ Yes | No change |
| `tauri-plugin-notification` | ✅ Yes | Add `NSUserNotificationUsageDescription` |
| `tauri-plugin-log` | ✅ Yes | No change |
| `tauri-plugin-shell` | ⚠️ Limited | Sidecar process spawning not available; guard STT commands |
| `tauri-plugin-dialog` | ✅ Yes | iOS file picker uses UIDocumentPickerViewController |
| `tauri-plugin-os` | ✅ Yes | Used for platform detection |

---

## Phase 5 — iOS-Only Additions (v2.1+)

These are post-launch; don't block v2.0.

**Face ID / Touch ID app lock:**
- Replace the password-only unlock for returning users with biometric prompt
- On success, retrieve the session from `retrieve_session_password` (the session bridge pattern already exists)
- Uses `tauri-plugin-biometric` — plugin will already be in the tree from the v1.8 desktop biometric work (see `active-plans/auth-friction-reduction.md`); iOS just needs the platform wiring enabled

**HealthKit integration:**
- Replaces Oura Ring for iOS users (most iPhone users don't have Oura; most do have HealthKit data)
- Pull: sleep score, HRV average, resting HR, step count — same fields as Oura
- Store in `oura_health_context` table (rename table or add `source` column)
- Requires a custom Swift Tauri plugin (`tauri-plugin-healthkit`)
- Would feed existing Oura health context badge and AI prompts

**iOS Widgets:**
- Lock screen widget: quick mood tap (1–5)
- Home screen widget: current streak + last entry date
- Requires a Swift widget extension — separate from the Tauri app but reads shared data

**whisper-rs for local STT:**
- `whisper-rs` crate (Rust bindings to whisper.cpp as a library) compiles whisper.cpp directly into the Rust binary — no sidecar process needed
- Models are still downloaded and cached locally
- Increases binary size significantly (~50MB+ for the library)
- Adds the full L1→L2→L3 STT pipeline back on iOS

---

## Data flow: iOS ↔ Desktop sync (via Dropbox/Google Drive)

```
iPhone (MoodHaven iOS)
    │
    │  User taps "Sync Now" (or auto-sync on foreground)
    │
    ↓
cloud_provider_sync_upload
    │  export_data() → encrypted .moodhaven blob
    │  PUT to Dropbox/Google Drive
    │
    ↓
[ Dropbox / Google Drive ]
    │
    ↓
cloud_provider_sync_download (on desktop)
    │  GET from Dropbox/Google Drive → encrypted blob
    │  import_data() → merge into local SQLite
    │
Desktop (MoodHaven desktop app)
```

Conflict resolution: same LWW (last-write-wins by `updated_at`) as peer sync. The `import_data` command already handles deduplication.

**Note:** This is manual sync in v2.0 (user-triggered). Auto-sync on app foreground is Phase 5.

---

## iOS App Store notes

- Bundle ID: e.g. `com.moodhaven.app.ios` (or `com.kennethlacroix.moodhaven`)
- Category: Productivity or Health & Fitness
- Privacy labels: no data collected (all local + user-controlled sync)
- Age rating: 4+ (no objectionable content; StillHaven disclaimer handles the wellness framing)
- Export compliance: uses AES-256 encryption → must declare but is not restricted (encryption is for data protection, not communication security)
- TestFlight for beta distribution before App Store submission

---

## Rough effort estimates

| Work stream | Estimated effort |
|-------------|-----------------|
| Phase 1: Dropbox + Google Drive sync | 2–3 weeks |
| Phase 2: Tauri iOS project setup | 1–3 days |
| Phase 3: Mobile-responsive React UI | 3–5 weeks |
| Phase 4: iOS-specific adaptations (feature gates, plugin audit) | 1 week |
| **Total to v2.0 ship** | **7–10 weeks** |

The mobile UI work is the long pole. Phase 1 (cloud sync) benefits all platforms immediately and can ship as v1.7 before iOS is ready.

---

## Suggested version sequencing

| Version | Content |
|---------|---------|
| v1.7.0 | SQLCipher + peer key (security fixes) + Dropbox/Google Drive sync |
| v1.8.0 | Mobile-responsive UI (also improves the existing web build) + desktop biometric unlock + PIN unlock (see `active-plans/auth-friction-reduction.md`) |
| v2.0.0 | iOS app launch (TestFlight → App Store) |
| v2.1.0 | Face ID / Touch ID (iOS), HealthKit — biometric plugin already landed in v1.8 |
| v2.2.0 | whisper-rs STT on iOS |
