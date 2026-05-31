# Changelog

All notable changes to MoodHaven Journal are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

## [1.3.0] — 2026-05-31

### Added
- **Word count tracking** — `word_count` column added to `journal_entries` via additive DB migration. `JournalEntry.wordCount` exposed on the TypeScript type; populated from `countWords()` on every save and import. Displayed below tags in the Timeline entry cards.
- **`session_id` on journal entries** — `session_id` column links an entry to the StillHaven session it was written after. Surfaced in the TypeScript type and populated by `link_journal_entry_to_session`.
- **Session badge in Timeline** — lazy hover on a session-linked entry loads activation delta via `still_get_session_brief`.
- **`WellbeingCard`** — morning context card shown once per day in the Timeline; collapses after 5 words of journaling. Driven by `useWellbeingContext` hook.
- **Three new Rust commands**: `still_get_wellbeing_context`, `still_get_session_brief`, `still_get_journal_brief_for_session`.

### Fixed
- `map_entry_row` column-index bug: `status`, `session_id`, and `word_count` were reading wrong SQLite column indices since `status` was added after the original comment.
- Peer sync `db_get_entries_full` SELECT: `status`, `session_id`, `word_count` columns and tag index 16 corrected.
- `data_management.rs` import: `word_count` field now populated from backup JSON during import.

---

## [1.1.0.1] — 2026-05-31

### Removed
- Deleted dead components with zero imports: `CloudSyncChip`, `JournalPage`, `stillhaven/types.ts`
- Removed unused npm packages: `react-router-dom`, `@tiptap/extension-bubble-menu`, `playwright`
- Deleted dead barrel files (`types/index.ts`, `lib/index.ts`, `settings/index.ts`) and inlined their imports

### Changed
- Split `RichTextEditor.tsx` (1 424 lines) into `EditorToolbar`, `EditorRecording`, `EditorLinkDialog`, `EditorIcons`, and `EditorStyles.css` — orchestrator now ~320 lines
- Split `Sidebar.tsx` (514 lines) into `SidebarHeader`, `SidebarNavigation`, `SidebarBooks`, `SidebarPrompts`
- Split `DevicesTab.tsx` (578 lines) into `DeviceIconSet`, `DevicesThisDevice`, `DevicesNearby`, `DevicesSyncOptions`
- Split `PairingModal.tsx` (629 lines) into `PairingHooks`, `PairingUIComponents`, `PairingShowCodeTab`, `PairingEnterCodeTab`
- Split `PrivacyTab.tsx` (660 lines) into `PrivacyAutoLock`, `PrivacyBiometric`, `PrivacyTwoFactor`, `PrivacyDataManagement`, `PrivacyTransparency`
- Archived completed StillHaven plan from `active-plans/` to `docs/internal/plans/`
- Removed `export` from four unused constants (`slashCommandItems`, `TRANSCRIPT_FORMAT_PROMPTS`, `MILESTONES`, `ENGINE_DEFAULTS`)

---

## [1.2.0] — 2026-05-31

### Added
- **Voice memo draft pipeline (Phase 5)** — watch recordings now surface as reviewable draft cards in the Timeline before being published to the journal. Each draft shows transcription preview, inferred mood, biometric context chip, and hashtag suggestions. Full TipTap editor with `MoodSelector` for editing before publish.
  - `VoiceMemoDraftCard` — compact Timeline card with duration, context, 2-line preview, mood dots, Review/Discard CTAs
  - `VoiceDraftEditor` — full-screen editor with hashtag suggestion pills; encrypts on publish
  - `useVoiceMemoDrafts` hook — draft list state, `publishDraft`, `discardDraft`
  - `useWearVoiceMemos` — post-transcription mood inference via local `scoreContentMood`
  - 5 new Tauri commands: `patch_voice_memo_context/mood`, `publish_voice_memo_draft`, `discard_voice_memo_draft`, `list_pending_drafts`
  - DB: `context`, `inferred_mood`, `book_id`, `reviewed` columns on `voice_memos`
- **Wear OS Phase 2e polish** — Record page labeled shortcut row `[😊 Mood] [🧘 Breathe]`; ambient mood wash from last logged mood; double-tap haptic on mood confirm; fade+scale `ViewPager2` `PageTransformer`
- **Wear OS Phase 5a** — `HealthSnapshot` expanded to capture step count delta and coarse activity classification (`still` / `walking` / `running`); health JSON now includes `steps` and `activity` fields
- **Wear OS Phase B brand sweep** — all hardcoded hex color literals replaced with `@color/` references across 13 layout XMLs; 13 new named entries in `colors.xml` (alpha white variants, surface cards, amber, `mood_low_accent`)
- **Wear OS Phase C splash screen** — `Theme.MoodHaven.Splash` theme using `androidx.core:core-splashscreen`; adaptive icon reused as splash icon; OLED-black background
- **Writing appearance drawer** — inline Day One-style customization surface for `WritingView`: font family (Inter, Source Serif, JetBrains Mono, OpenDyslexic, System), size, line height, paragraph spacing, background tint (5 presets), writing width, focus mode, text scale, high contrast, reduced motion, dyslexia profile. Persisted via `useSettingsStore`; CSS variables on `[data-writing-prefs]` ancestor; zero impact on typing path

### Changed
- `HealthSnapshot.capture()` return schema extended: `{"hr":N,"steps":N,"activity":"still|walking|running"}`

---

## [1.1.0] — 2026-05-26

### Added
- **StillHaven** — somatic companion module built into all desktop and browser builds. Uses bilateral audio stimulation (alternating left-right tones, 0.5–2.0 Hz) to help settle the nervous system before journaling. Opt-in: enable in Settings → Health to unlock.
  - **Check-in screen**: protocol picker (General Grounding, Fake Danger Reset), activation dial (1–10), "Begin session" gating.
  - **Live session**: real-time bilateral audio engine (`BilateralEngine`), pause/resume, session timer, `isAdapting` indicator when Oura or watch data is active.
  - **Check-out screen**: post-activation dial, optional manual HRV entry, free-text note.
  - **Summary screen**: activation delta, formatted duration, "Write about it" → journal handoff, "New session" restart.
  - **Journal handoff**: pre-fills the writing view with a structured HTML template — protocol used, duration, activation delta, HRV (if recorded), and post-session note. Includes a hidden `data-still-session-id` marker for future linking.
  - **Session history view** (`stillSessions`): total sessions, avg activation drop, favourite protocol, 30-day trend chart, recent sessions list with time-of-day bucketing.
  - **Bio-adaptive engine** (Tier A): pulls today's Oura HRV and readiness score at check-in mount; blends into starting engine speed via `biometricToSpeed()`. Graceful fallback when Oura is not connected.
  - **Bio-adaptive engine** (Tier B): `useStillBioFeedback` hook listens for live `health_snapshot` signals from the Wear OS watch during a session; adjusts engine speed via exponential smoothing; reverts to base speed if no signal arrives within 3 minutes.
  - **Abandoned session detection**: on mount, checks for a session with `completed_at = null, abandoned_at = null`; prompts resume or discard.
  - **First-visit welcome card** with safety disclaimer.
  - **Browser/web support**: full IndexedDB shim covers all 6 `still_*` commands; feature works in the browser app identically to desktop.
- **`VITE_FEATURE_STILL`** baked into all builds via `vite.config.ts` define — no longer a manual build-time opt-in. The in-app toggle (Settings → Health) remains off by default.

### Fixed
- **Session duration in journal handoff** showed "0 seconds" because `sessionRowRef.current` stored the initial DB create row (duration_seconds: 0). Fixed by spread-overriding with the computed duration at summary time.

### For contributors
- New files: `src/modules/stillhaven/` (module root, engine, environments, components), `src/lib/stillService.ts`, `src/stores/stillStore.ts`, `src/hooks/useStillBioFeedback.ts`, `src/modules/stillhaven/engine/bioMapping.ts`
- New Rust commands: `still_create_session`, `still_record_activation`, `still_complete_session`, `still_abandon_session`, `still_list_sessions`, `still_get_session_with_samples`, `link_journal_entry_to_session` (7 commands, registered in `src-tauri/src/lib.rs`)
- New IndexedDB stores: `still_sessions`, `still_activation_samples` (in `browser.ts`)
- `ViewType` union extended: `'still' | 'stillSessions'`

---

## [1.0.0] — 2026-05-24

First stable release. MoodHaven Journal is out of pre-release and ready for daily use across Linux, macOS, and Windows.

### What 1.0.0 means
- **Zero-knowledge encryption is production-ready**: AES-256-GCM content encryption with a PBKDF2-derived key (600k iterations). The backend never sees plaintext. Password verification runs in native Rust (SEC-DEFER-001 closed in v0.9.0) — the hash never leaves the backend.
- **Local-first by default**: All data stays on-device in an encrypted SQLite database. No accounts, no mandatory cloud. Optional WebDAV sync and LAN peer sync are both opt-in, both end-to-end encrypted.
- **Cross-platform parity**: Builds pass on Ubuntu, macOS (Intel + Apple Silicon), and Windows. AppImage/.deb/.msi/.dmg bundles ship from the same tagged release.
- **FOSS positioning**: MIT-licensed, no paid tier, no analytics, no telemetry. BYOK for OpenAI; Ollama works fully offline.

### Security
- **dompurify** 3.3.3 → 3.4.0 (GHSA-39q2-94rc-95cp).
- **Supported-versions policy** in `SECURITY.md` bumped to 0.9.x baseline; SEC-DEFER-001 resolution note added.
- **Semgrep suppressions** added to confirmed false positives (`journal.rs:377` test fixture, `booksStore.ts:81` tombstone UUIDs) with inline justifications.
- **npm audit clean**; GitHub Actions all SHA-pinned; CSP strict (`script-src 'self'`).

### Docs
- `SECURITY.md`, `CLAUDE.md`, `docs/architecture.md`, `docs/tauri-commands.md`, `wiki/Home.md` synced — Tauri command count corrected (~127 actually registered), test count refreshed (702 across 48 files).
- Shipped plans (v0.9.0–v0.9.4 vacation sprints) archived to `docs/internal/plans/` (gitignored).
- Roadmap milestones v0.9.3 + v0.9.4 marked shipped.

### Cumulative feature set (v0.8.4 → v1.0.0)
- **Speech-to-text**: whisper.cpp sidecar with 4 Whisper models, live recording strip in the editor, 3-layer formatting pipeline (local → Ollama → OpenAI with explicit consent).
- **Peer sync**: mDNS discovery + PIN pairing + Ed25519 identity + AES-256-GCM transport; per-device last-sync timestamps in Settings → Devices.
- **Time capsules**: seal an entry until a future date; anniversary auto-reveals; mood-delta chip on reveal.
- **Analytics**: mood distribution, streak stats, day-of-week patterns, calendar heatmap, trend sparkline in sidebar.
- **AI insights**: opt-in, metadata-only prompts; BYOK OpenAI or local Ollama; per-feature toggles and consent gate.
- **Oura integration**: health context badge, PAT validated before save.
- **Wear companion**: Phase 1 complete — voice memo capture, mood taps via Wear OS.
- **Timeline virtual scroll**: `position: absolute` + `ResizeObserver` — no third-party library.
- **TagCloud**, **MoodSelector**, **TemplateSelector**, **SearchModal** (Ctrl+K), **keyboard shortcuts** (`1`–`5`, `?`).
- **DESIGN.md**: color tokens, typography scale, spacing, motion, and component vocabulary — single source of truth for visual design.
- **Website overhaul** (v0.9.4): 7 blog posts, OG card generation, newsletter signup, trust badges, SEO overhaul.

### Tests
- 702 tests across 48 files (includes VSCROLL-TEST + VSCROLL-TEST-2 coverage for TimelineView virtual scroll layout). Coverage tables in `.claude/docs/testing.md`.

---

## [0.9.4] — 2026-04-13

### Added (website)
- **Blog — 7 new posts**: Hydrated the blog from Substack with posts covering the origin story, encryption model, privacy philosophy, AI insights architecture, self-hosting rationale, build reflections, and mobile alpha — each with unique hero images.
- **OG card generation**: Branded 1200×630 Open Graph cards generated per blog post via `next/og` (edge-compatible, Cloudflare Pages compatible).
- **Newsletter signup**: Email capture component on the home page and blog index, pre-filling Substack subscribe URL.
- **Founder card**: About page now includes a founder bio card with headshot, links to personal site and GitHub.
- **Blog post CTAs**: Each blog post ends with a download/browser CTA block to convert readers to users.
- **Announcement chip**: Hero section now shows the latest version with a pulsing dot and "See what's new" link.
- **Trust badge strip**: Inline badges in the hero showing version, test count, license, and build-in-public status.
- **Android sideload instructions**: Download page now includes a collapsible step-by-step Android sideload guide.
- **SEO overhaul**: Title templates, canonical URLs, per-page Open Graph metadata, enhanced JSON-LD (Organization + SoftwareApplication schemas with `sameAs` refs).

### Fixed (website)
- **Design system consistency**: Privacy and Terms pages migrated from `text-gray-*` to `text-neutral-*` tokens.
- **Stale blog content**: Removed Substack-specific artifacts (P.S. sections, mid-article subscribe CTAs, Coming Soon callouts, old version numbers) from all existing posts.
- **Hero**: Replaced `hero-rain.jpg` with on-brand violet gradient + app screenshot.
- **Pro/waitlist language**: All references to Pro tier, pricing, and the Formspree waitlist removed; replaced with FOSS positioning.
- **FAQ**: Pricing and tier questions rewritten to reflect fully free and open-source reality.
- **Cloudflare Pages build**: OG image route marked `runtime = 'edge'`; post metadata extracted to `lib/post-static-meta.ts` to avoid `fs` in Workers runtime.

### Added (app)
- **`DESIGN.md`**: Color tokens, typography scale, spacing system, motion guidelines, and component vocabulary — single source of truth for visual design decisions.

---

## [0.9.3] — 2026-04-12

### Added
- **F4 — Mood sparkline**: A 7-day inline SVG sparkline appears in the sidebar (desktop only) showing recent mood trend with mood-colored dots and a connecting path. Silent on no data.
- **F5 — Keyboard shortcuts**: Press `1`–`5` outside the editor to set mood level; press `?` or `/` to toggle a shortcut cheatsheet overlay. Guards against intercepting editor keypresses via `isContentEditable` check.
- **F7 — Streak milestone toasts**: A dismissible violet toast fires once per unlock session when the user hits a 7-, 30-, or 100-day writing streak.
- **F10 — On This Day banner**: A dismissible card appears in the bottom-right corner once per session when past entries exist for today's date. Shows entry count and oldest year; links to the On This Day view.
- **D-003 — Watch memo panel**: A `WearVoiceMemoPanel` section in WritingView surfaces incoming Wear OS voice memos with timestamps, durations, transcription status, "Use" (insert into editor), and delete buttons. Shows a first-run empty state with Wear OS onboarding copy.
- **SETTINGS-001 — `use2FASetup` hook**: Extracted all 2FA setup state and handlers out of `PrivacyTab` (was ~70 lines inline) into `src/hooks/use2FASetup.ts`. Reduces PrivacyTab to a pure layout component for that flow.
- **PRIV-001 — Privacy Guarantees card**: Static checklist in Settings → Privacy → Transparency section listing all data handling commitments.
- **PRIV-002 — Live privacy state panel**: Real-time panel showing current storage backend, cloud sync, AI, peer sync, STT formatting, telemetry, and account status — colour-coded green/amber.
- **PRIV-003 — Export Privacy Snapshot**: Button in Transparency section exports a JSON snapshot of the current privacy state and opens the log folder. Uses `get_log_path` + `write_text_file` + `open_log_folder`.
- **PRIV-004 — "Private by design" onboarding**: A green callout card in the setup wizard Welcome step summarises the three core privacy commitments before the user creates their first journal.
- **PRIV-005 — `docs/TRANSPARENCY.md`**: Unsigned transparency manifest documenting all data flows, what leaves the device, telemetry (none), and AI/STT behaviour.
- **`get_entries_on_this_day` Rust command**: On This Day entries now use a dedicated SQL command (`strftime('%m-%d')` filter) instead of fetching and filtering all entries in JS — avoids decrypting the full journal on every unlock.
- **26 new tests** across 4 files: `TagCloud.test.tsx` (5), `useAppBanners.test.ts` (9), `use2FASetup.test.ts` (6), `browser-invoke.test.ts` (+9 cases including voice memo stubs and `get_entries_on_this_day`).

### Fixed
- **`write_text_file` param names**: `PrivacyTab` was calling with `{ filePath, content }` instead of the correct `{ path, contents }` — the privacy snapshot export was silently failing.
- **Windows path separator**: `lastIndexOf('/')` returned -1 on Windows paths from `get_log_path`. Now detects the separator from the path string.
- **Stale backup codes flash**: `use2FASetup.handleRegenerateBackupCodes` now clears `backupCodes` before awaiting, preventing stale codes from displaying while new ones load.
- **IPC waterfall in `useAppBanners`**: Streak and On This Day checks were sequential; now run in parallel via `Promise.allSettled`.
- **`matchMedia` per-render call**: `window.matchMedia('prefers-reduced-motion')` was called inside `WaveformBars` on every render; moved to module-level constant.
- **`checkAvailability` memoization**: `isAvailableState` was listed in the `useCallback` dependency array, causing the callback to re-create on every status change. Removed — `checkedRef` already guards the early-return path.
- **Voice memo browser stubs**: `browser-invoke.ts` was logging "unhandled command" warnings for voice memo commands in browser mode; added no-op stubs.

---

## [0.9.2] — 2026-04-11

### Added
- **STT recording strip**: A live recording indicator now appears below the editor toolbar while dictating — waveform bars, MM:SS elapsed timer, Stop and Cancel buttons. Uses `prefers-reduced-motion` for the waveform fallback.
- **STT model management UI**: The Speech to Text settings tab now shows all four Whisper models with download progress bars, cancel support, delete, and model selection. B2 fix: model statuses are validated on tab open.
- **TagCloud component**: Extracted the tag filter chips into a reusable `TagCloud` component (`src/components/journal/TagCloud.tsx`). Wired into `TimelineView` with click-to-filter behaviour unchanged.
- **TrustedDevicesList last-sync timestamps**: Each paired device in Settings → Devices now shows when it was last synced, loaded from `peer_get_sync_states`.

### Fixed
- **B10** (`useSpeechToText`): `checkedRef` was blocking the availability check from causing a re-render. Replaced with `isAvailableState` (useState) so the mic button appears/disappears correctly when a model is downloaded or the setting changes.
- **STT-ERR-1**: Transcription errors now surface as a dismissible amber toast in the editor rather than silently failing.
- **Virtual scroll height tracking** (`TimelineView`): `heightVersion` (counter) is now the `useMemo` dependency for layout recomputation, not the `forceUpdate` setter (which never changes).

### Changed
- **Timeline virtual scrolling**: `TimelineView` now renders only visible rows plus overscan via `position: absolute` + `ResizeObserver`-measured heights. Handles variable-height rows (date headers vs entry cards) and async height changes (media badge loads). No third-party library.

---

## [0.9.1] — 2026-04-10

### Fixed
- **Unlock blocked on first launch (v0.9.0 regression)**: `verify_password`, `unlock_app`, and `lock_app` were registered in `invoke_handler!` but missing from `app-commands.toml`. Tauri's ACL blocked them before the Rust code ran, producing "An error occurred. Please try again." every time a user tried to unlock. Ten other commands were also missing from the ACL and are now added.
- **Factory reset blocked from lock screen (v0.9.0 regression)**: `factory_reset` had a `require_unlocked()` guard, which prevented the "Erase & Start Fresh" escape hatch from working on the lock screen — the one place it must work.
- **Wrong password error showed "An error occurred" instead of attempt count (v0.9.0 regression)**: `set_setting` now requires unlock, but `persistState` in `rateLimitService` called it unconditionally. The resulting "Session is locked" error propagated to the lock screen's outer catch and replaced the intended "Incorrect password" message. Rate-limit state is now persisted with a try-catch; in-memory enforcement still applies for the current session.
- **Startup log spam**: `loadSettings` and `saveSettings` are called before unlock from `App.tsx` and `useUpdateCheck`. "Session is locked" errors from these pre-unlock calls are now silently swallowed rather than logged as errors.

### For contributors
- `LockScreen.tsx` catch block now logs uncaught errors via `logger.error` so future ACL omissions surface in logs immediately.
- `settingsService.test.ts` added: 10 tests covering locked-state behaviour for `loadSettings` and `saveSettings`.
- `rateLimitService.test.ts` regression test: `recordFailedAttempt` does not throw when `set_setting` rejects with "Session is locked".

## [0.9.0] — 2026-04-09

### Security
- **Password verification moves to Rust (SEC-DEFER-001)**: The unlock flow now calls a native `verify_password` Rust command instead of running PBKDF2 in the WebView. Same algorithm (PBKDF2-HMAC-SHA-256, 600k iterations), same salt format — covered by 5 unit test vectors including a Unicode password case and a salt-decode parity check. The hash never needs to leave the backend now.
- **Lock guards on analytics, health, and time capsule commands**: Seventeen Tauri commands across `analytics.rs`, `time_capsule.rs`, `oura.rs`, and `settings.rs` now reject calls while the app is locked. Previously, mood patterns, streak data, health context, and API tokens were readable without authentication. This is fixed.
- **STT model URL allowlist (A-14)**: `stt_download_model` validates model filenames against an explicit allowlist before constructing the Hugging Face download URL. Unrecognised filenames return an error before any network request is made.

### Added
- **Speech to Text settings tab**: A dedicated "Speech to Text" tab is now the 9th settings tab. Currently shows a placeholder; model download UI ships in v0.9.1.

### Changed
- **Settings tab split**: Appearance settings (theme, compact mode, animations) extracted from `GeneralTab` into a dedicated `AppearanceTab` component. No user-visible behaviour change.

### Fixed
- **Browser mode `get_data_stats` shape**: The browser-invoke shim was returning `{entryCount, totalSizeBytes, lastModified}` instead of the Rust shape `{totalEntries, averageMood}`, crashing the Privacy tab's average mood display in browser/dev mode.

### For contributors
- `verify_password` Rust command added to `journal.rs` with `#[cfg(test)]` unit tests. Browser-invoke shim routes to frontend crypto for browser mode.
- `require_unlocked` guard pattern is now consistent across all sensitive command modules.
- `browser-invoke.test.ts` expanded: covers `check_password_exists`, `store_password_hash`, `get_password_hash`, `verify_password`, `get_data_stats`, `import_data`, and native-only no-ops.

---

## [0.8.5.1] — 2026-04-09

### Fixed
- **Android Wear companion — tile tap regression**: `MoodTileService` was using `BuildConfig.APPLICATION_ID` (resolves to `com.moodhaven.app`) as the class path for `TileActionActivity`. The activity lives in package `com.moodbloom.wear`, so the correct fully-qualified name is `com.moodbloom.wear.TileActionActivity`. Tile mood taps work correctly again.
- **Android Wear companion — feedback path constant**: `WearPlugin` now uses `WearProtocol.PATH_FEEDBACK` for the `/feedback` MessageAPI path, consistent with all other paths in the file.
- **Android Wear companion — HR timeout log level**: Heart-rate timeout in `HealthSnapshot` promoted from `Log.d` to `Log.i` so the event is visible in field logs without requiring debug logging to be enabled.

---

## [0.8.5] — 2026-04-07

### Refactored
- **Peer sync engine module split**: `peer_sync_engine.rs` (2 554 lines) decomposed into a proper Rust module directory. Sub-modules: `protocol.rs` (wire types + port formula), `crypto.rs` (ECDH key derivation + AES-GCM helpers), `connection.rs` (TCP frame I/O), `conflict.rs` (DB helpers + LWW upsert logic). `mod.rs` retains the orchestration layer, Tauri commands, and unit tests. Wire format, transport key derivation, and session protocol sequence are bit-for-bit identical to 0.8.4 — no user-visible behaviour change.
- Internal types (`Msg`, `SyncMeta`, `SyncBookRow`, `SyncSignalRow`) are encapsulated within the module; only `sync_port_for_device`, `SyncEngineState`, and the four Tauri commands remain on the public API surface.

---

## [0.8.4] — 2026-04-05

### Security
- **SEC-DEP-001**: Upgraded `vite` 5.4.21 → 8.0.3 and `vitest` 1.6.1 → 4.1.2. Resolves GHSA-67mh-4wv8-2f99 (esbuild ≤0.24.2 devServer CORS bypass). The vulnerability was dev-tooling only; shipped Tauri binaries were never affected.
- **DOMPurify on release notes**: `UpdatePanel` now passes rendered release note HTML through `DOMPurify.sanitize()` before `dangerouslySetInnerHTML`. Defense-in-depth on top of the existing `renderMarkdown()` HTML escaping.
- **CI supply chain hardening**: All GitHub Actions in `.github/workflows/` pinned to immutable commit SHAs. Previously `actions/checkout`, `actions/setup-node`, `actions/cache`, `actions/upload-artifact`, `actions/download-artifact`, and `actions/setup-java` used mutable version tags. Note: `tauri-apps/tauri-action` (which runs with `TAURI_SIGNING_PRIVATE_KEY`) was already pinned; this commit pins the remaining six.

### Changed
- `@vitejs/plugin-react` bumped from 4.3.1 → 6.0.1 to match vite 8 peer requirements.
- `@testing-library/dom` added as an explicit dev dependency (required by `@testing-library/react` with vitest 4; was previously a transitive dep).
- `.npmrc` audit-level exception for GHSA-67mh-4wv8-2f99 removed — vulnerability resolved.

### Tests
- Added `recoveryKeyService`: spy test verifying `crypto.getRandomValues()` is called and `Math.random` is never called during key generation.
- Added `UpdatePanel`: 3 tests verifying DOMPurify is applied to release notes HTML before render.
- Test count: 641 (was 633).

---

## [Unreleased] — tooling

### Added
- **Automated pentest harness** (`scripts/pentest.sh`). Six-phase local security scan: static analysis (cargo-audit, npm audit, semgrep), DAST (OWASP ZAP + ffuf with dynamic Vite port detection), IPC fuzzer (119 Tauri commands, 1 558 cases via Playwright browser-invoke shim), AES-256-GCM crypto oracle prober, peer sync TCP fuzzer, and finding aggregator. Results written to `pentest-results/YYYYMMDD_HHMMSS/` as JSON + Markdown. Each tool is skipped gracefully with install hint when not present. Sync fuzzer uses concurrent port scanning (100 workers) across the full 44 000–44 999 range and validates that a port speaks the MoodHaven protocol before fuzzing it.
- **Daily/weekly remote security scan** (`trig_01BqvwYxK23odvmEhfuQqWhm`). Scheduled Claude Code remote agent: cargo-audit + npm audit daily at 08:00 Boise, semgrep static analysis added on Mondays. Opens a GitHub issue labelled `security` only on HIGH/CRITICAL findings; deduplicates to avoid re-opening issues for the same day.

### Fixed
- **`UpdatePanel.tsx` semgrep false positive.** Added `nosemgrep` suppression with inline justification on the `dangerouslySetInnerHTML` usage in the release-notes renderer. The `renderMarkdown` function HTML-escapes all input before substitution; source is developer-controlled GitHub release notes.
## [0.8.3] — 2026-04-05

### Security
- All journal, settings, and data management commands now enforce the session lock gate (`require_unlocked`). Calling any protected command while the app is locked returns an error instead of silently succeeding.
- `export_data` and `import_data` removed their dead `_password` parameters. Encryption was always client-side; the server parameter was never used.
- `resetRateLimit` (which calls `delete_setting`) is now called only after a successful unlock, not before. Fixes a pre-existing ordering bug where `delete_setting` would be called on a locked session.
- `resetRateLimit` failures are now logged via `logger.warn` instead of silently swallowed; prevents silent lockout on next launch if the DB operation fails.

### Fixed
- Peer sync `DONE_ACK` now reports the count of actually inserted/updated rows rather than total received. LWW-skipped duplicates no longer inflate the logged recv count.
- `speech_to_text.rs`: mutex lock poisoning now returns an error instead of panicking the process.
- Peer sync upserts are now applied in a single atomic `BEGIN IMMEDIATE`/`COMMIT` transaction. A dropped TCP connection mid-sync leaves the DB fully clean or fully applied.

### Added
- `ErrorBoundary` component wraps each view and the root layout. Rendering crashes are caught, logged, and present a "Reload" button instead of a blank screen.
- Batch `WHERE id IN (?)` queries in peer sync engine (`db_get_entries_full`, `db_get_books_full`, `db_get_signals_full`) replace per-ID `query_row` loops. Sync phases now issue 1 DB query per object type instead of N.
- 9 new Rust `#[cfg(test)]` tests for the peer sync engine: key derivation symmetry, LWW semantics, and transaction rollback.
- 3 new tests for `ErrorBoundary` (no-error render, default fallback, custom fallback).

## [0.8.2] — 2026-04-04

### Security
- **Crypto key cache no longer stores plaintext password.** The session key cache now uses a djb2 hash of the password as the Map key instead of the raw password string, preventing the user's password from persisting in the JS heap beyond the unlock operation.
- **Constant-time hash comparison.** `verifyPasswordHash` now uses a byte-level XOR comparison instead of `===`, closing a timing-based password oracle.
- **DOMPurify replaces custom HTML sanitizer.** `TimeCapsuleRevealModal` now uses DOMPurify to sanitize decrypted journal HTML, closing SVG/CSS/link injection vectors that the hand-rolled sanitizer missed.
- **Path traversal blocked in media commands.** `abs_enc_path` canonicalizes and validates that resolved paths stay within the app data directory, blocking `../`-style traversal from database-stored file paths.
- **`write_text_file` restricted.** The command now requires an unlocked session and rejects writes to `.ssh`, shell config files, and system directories after canonicalization.
- **Session lock gate on sensitive commands.** `factory_reset`, `write_text_file`, `get_all_journal_entries`, and `get_all_settings` now require the session to be unlocked before executing. `AppLockState` is managed in the Rust backend, toggled via new `unlock_app` / `lock_app` commands wired to `unlockJournal` / `lockJournal` in the frontend.
- **Constant-time PIN comparison in peer pairing.** The 6-digit pairing PIN is now compared via a byte-level XOR fold instead of Rust's short-circuit `!=`, removing a timing oracle for LAN attackers.
- **Peer sync entry validation.** `upsert_entry_from_sync` now validates UUID format, ISO 8601 timestamps, `capsule_type` enum membership, `book_id` length, and tag count/length before writing, blocking a malicious trusted peer from injecting forged field values.

---

## [0.8.1] — 2026-04-04

### Fixed
- **Ollama response size cap.** The Ollama formatting layer (L2 STT pipeline) now streams `response.body` and aborts with L1 fallback if a response exceeds 1 MB, preventing a rogue or misconfigured endpoint from causing OOM in the renderer. Single oversized chunks are rejected before accumulation. `reader.cancel()` is now awaited to prevent unhandled promise rejections.
- **Android release keystore path race.** Phone (`keystore-app.jks`) and wear (`keystore-wear.jks`) CI builds now write to module-specific paths, eliminating a parallel Gradle evaluation race on the shared `keystore.jks` file.
- **Keystore files gitignored.** Added `keystore*.jks` to both root `.gitignore` and `src-tauri/gen/android/.gitignore` so CI-decoded keystores cannot be accidentally committed.

### Changed
- **Android wear tile service.** `MoodTileService` now uses `BuildConfig.APPLICATION_ID` instead of a hardcoded string, so a future `applicationId` rename will produce a compile error instead of a silent breakage.
- **Android build features.** Enabled `buildConfig` generation in the wear module (`wear/build.gradle.kts`).

---

## [website-0.2.0] — 2026-04-05

### Added (website)
- **`/download` page.** OS-aware CTA detects Windows/macOS/Linux and surfaces the right installer. Falls back to a GitHub releases link when no build is available for the detected platform. Full platform grid below the fold covers all six supported targets.
- **`/about` page.** Product-focused about page covering the privacy-first mission, zero-knowledge architecture, and open-source model. `/founders` redirects here.
- **`/faq` page.** Technical FAQ accordion (12 questions) covering encryption, sync, AI, and offline use.
- **Three-column footer.** Product / Resources / Community link grid with `FooterColumns` component.
- **`sitemap.xml`.** Covers all public pages for search indexing.

### Fixed (website)
- **WCAG AA contrast.** Three `text-neutral-400` instances replaced with `text-neutral-500` (contrast 4.6:1, passing AA) in footer headings, copyright, and download page iOS tile sublabel.
- **Missing `metadataBase`.** Added `metadataBase: new URL("https://www.moodhaven.app")` to layout metadata — fixes broken OG/Twitter image resolution in production.

---

## [0.8.0] — 2026-04-04

### Added
- **Browser (web) port.** MoodHaven Journal now runs in any modern browser. Open it from a corporate laptop, a borrowed machine, or any device without installing anything. Your journal stays encrypted end-to-end: the zero-knowledge model is unchanged — your password never leaves the browser tab.
- **IndexedDB backend.** In the browser, entries, settings, and books are stored in IndexedDB (the browser's built-in local database). The same encryption used on the desktop protects every entry.
- **WebDAV sync for browser.** The browser build uses a fixed-filename sync file (`moodhaven-sync.moodhaven`) with `If-Match` ETag headers to prevent concurrent desktop + browser writes from silently overwriting each other.
- **PWA (installable).** The web build includes a `manifest.webmanifest` so browsers can offer "Install to home screen" — works on Android Chrome and desktop Chrome/Edge.
- **`npm run dev:web` / `build:web` scripts.** Set `VITE_TARGET=web` to switch the build into browser mode. Tauri plugin imports are replaced at build time via Vite module aliasing — no changes to existing service files.
- **`isBrowser` flag in `usePlatform()`.** Components can branch on `isBrowser` to show/hide features that require the desktop app (peer sync, STT, hardware keys).

### Fixed
- **IndexedDB `dbDeleteBook`: race condition.** Book deletion and entry reassignment now run in a single multi-store IDB transaction, closing a window where concurrent writes could leave entries pointing to a deleted book.
- **Monthly mood analytics: wrong date range.** `getMonthlyMoodData` was using day 31 for all months. February entries were silently missing; March entries appeared in February stats. Now computes the actual last day of each month.

---

## [0.7.15] — 2026-04-02

### Fixed
- **Wear OS companion: MoodHistory crash on unknown mood level.** `MoodHistory.Entry.mood` now falls back by `level == 3` (neutral) rather than `MOODS[2]` array index, making it safe if mood order changes.
- **Wear OS companion: AudioFrameParser path traversal.** Frame IDs from the watch are now sanitized (non-alphanumeric characters replaced with `_`) before being used as filenames. Empty audio frames are rejected.
- **Wear OS companion: channel close failures logged.** `WearListenerService` and `WearPlugin` now log a warning when `channelClient.close()` fails instead of swallowing the error silently.
- **Wear OS companion: complication cache visibility.** `MoodComplicationService` cache fields marked `@Volatile` for correct visibility across coroutine dispatchers.

### Changed
- **Wear OS companion: polish pass.** Addresses correctness and reliability issues across the Android phone bridge and Wear OS watch app. Key changes: `AudioFrameParser` extracted as a single parsing source of truth used by both `WearListenerService` (background) and `WearPlugin` (foreground); wire protocol constants consolidated into `WearProtocol`; `BreatheSessionActivity` busy-wait replaced with `AtomicBoolean` + `Channel(CONFLATED)` for correct pause/resume; `OfflineQueue` eviction changed from O(n) to O(1) `ArrayDeque`; `SignalSender` now retries with 250/500/1000 ms exponential backoff; `MoodComplicationService` adds 30-second SharedPrefs cache; `HistoryAdapter` extracted into `MoodHistoryAdapter` for reuse across `HistoryActivity` and `HistoryFragment`; `MoodAdapter` reuses existing `GradientDrawable` instead of allocating per bind.

---

## [0.7.14] — 2026-04-01

### Changed
- **SettingsPage split into tab components.** The 2,239-line `SettingsPage.tsx` has been broken into eight focused files under `src/components/settings/tabs/`: `GeneralTab`, `PrivacyTab`, `SyncTab`, `AITab`, `HealthTab`, `ExportTab`, `AboutTab`, and a barrel export. No behavior changes — the refactor improves navigation, reduces merge conflicts, and makes each settings area independently readable. The coordinator shell (`SettingsPage.tsx`) retains tab routing, scroll-to-section deep-links, and the export password modal.

### Added
- **Rust tests for time capsule commands.** Six `#[cfg(test)]` unit tests added to `src-tauri/src/commands/time_capsule.rs` using an in-memory SQLite database: seal sets columns correctly, seal rejects past dates, seal double-seal guard (can't seal an already-sealed entry), unseal clears `sealed_until` and defaults `capsule_type` to `'anniversary'`, `get_due_capsules` returns past-due entries, `get_due_capsules` excludes entries whose month/day matches today.

---

## [0.7.13] — 2026-03-31

### Added
- **Selective export.** The Export section in Settings now lets you filter by tags, mood range, and date range before exporting. Exports with no filters applied are identical to the previous full export (WebDAV-safe). The Rust `export_data` command accepts an optional `ExportFilter`; the `SelectiveExportPanel` component handles the filter UI with live entry count preview.
- **WeeklyStreakCard.** New AI card showing entries written this week against your weekly goal (default: 3). A pop animation fires when the goal is reached (respects `prefers-reduced-motion`); the card is disabled when AI features are off.
- **EntryStateBadge (J2).** Inline badge on each entry cycles through "Still thinking," "Complete," and "Come back to this." State is persisted via the new `patch_entry_status` Rust command. Null/undefined status defaults to "Complete" for backwards compatibility.
- **AICardWrapper.** Wraps AI insight cards with a per-session privacy badge ("Generated locally," "Cloud mode," or "Ollama offline") so users see at a glance where inference is happening.
- **ISO week utilities.** `getISOWeekStart()` and `countEntriesThisWeek()` added to `dateUtils.ts` for client-side weekly cadence counting.
- **`status` column on `journal_entries`.** Additive runtime migration — default `'complete'`, supports `'thinking' | 'complete' | 'revisit'`. Validated server-side before any write.

### Changed
- Insights view integrates `AICardWrapper` and `WeeklyStreakCard` alongside existing AI cards.
- Settings Export tab now renders `SelectiveExportPanel` instead of the bare export button.

---

## [0.7.12] — 2026-03-31

### Changed
- Restructured `src/lib/` from a flat ~40-file directory into `services/` (IPC wrappers, crypto, sync, peer, storage) and `utils/` (pure utilities: dateUtils, chartUtils, markdownUtils, metadataExtractor, transcriptFormatter, writingUtils, journalTemplates). No behavior changes — imports only.
- Renamed `plans/` → `active-plans/` to distinguish in-flight tracked plans from completed plans archived in `docs/internal/plans/`.
- Renamed `src/components/twoFactor/` → `two-factor/` for kebab-case consistency with all other component directories.

### Removed
- Deleted stale `PLAN-animations.md` from repo root (feature shipped in v0.7.11).
- Removed `scripts/docs/aifeedback/` context bundle directory (moved to `docs/internal/`).
- Removed `scripts/.env` containing a plain-text credential (file was gitignored; rotate the key if not already done).

---

## [0.7.11] — 2026-03-28

### Added
- **Bar-grow animation on Mood Distribution chart.** Bars animate from `scaleX(0)` to `scaleX(1)` on mount via a new `animate-bar-grow` Tailwind utility (custom `barGrow` keyframe, compositor-only, no layout shift). `origin-left` ensures bars grow left-to-right.
- **Slide-up animation on modals and drawers.** `SealEntryModal`, `TimeCapsuleRevealModal`, `NewBookModal`, and the bottom tray in `BottomTabBar` now use `animate-slide-up` instead of inline `motion-safe:animate-[fadeIn…]` expressions.
- **Slide-up on SearchModal inner panel.** The Ctrl+K search panel slides up on open.
- **Scale micro-interactions on tap targets.** `active:scale-95` added to inactive `SidebarItem`, `Navigation` tab buttons, and `TopBar` icon buttons. `CalendarDay` cells gain `hover:scale-[1.08] active:scale-[1.04]` when not selected (selected state keeps ring highlight only).
- **Staggered entry-card animation.** Timeline and On This Day entry cards use a 30 ms per-card `animationDelay` (capped at first 10 items) so cards cascade in rather than appearing all at once.
- **Filter-change re-stagger on Timeline.** Date-group container key includes `activeBookId` so switching journals remounts groups and re-fires the stagger animation.
- **Staggered Insights cards.** `MoodWeatherCard`, `GratitudeStreakCard`, `InsightsPanel`, and `WeeklyReflectionCard` animate in with 60 ms inter-card stagger via `animate-entry-in`.

### Changed
- **All `prefers-reduced-motion` coverage is implicit.** The existing blanket rule in `globals.css` (`:root` media query that sets all `animation` and `transition` to `none`) covers every new animation class without per-class overrides.

### For contributors
- **`MoodDistributionChart.test.tsx`.** 3 tests: bar width style, `animate-bar-grow origin-left` class presence, and empty-state text.
- **`CalendarDay.test.tsx`.** 3 tests: scale classes present when not selected, absent when selected, entry-count badge visibility.

---

## [0.7.10] — 2026-03-28

### Added
- **SQLite WAL mode + cache pragmas.** `PRAGMA journal_mode = WAL`, `cache_size = -8000` (8 MB), and `synchronous = NORMAL` applied at startup. WAL mode enables concurrent reads during writes; 8 MB page cache reduces repeated I/O on analytics queries.
- **`get_full_analytics_bundle` command.** Replaces five parallel `invoke()` calls from the Insights page with a single Rust command that acquires the DB mutex once and returns all analytics data (overall stats, streaks, mood distribution, day-of-week stats, 30-day trend) in one round trip.
- **`get_insights_metadata` command.** New lightweight command that reads entry counts, weekly totals, and top tags from plaintext columns — no decryption required. Used by Tier A loading in the Insights page to show stats immediately before the decrypt phase completes.
- **`mood_daily_stats` cache table.** SQLite trigger-maintained cache of `(date, average_mood, entry_count)`. Calendar view now reads from this index rather than running a full table scan with `strftime()` grouping. Includes automatic backfill for historical data on first access.
- **`idx_entries_book_id` index.** Runtime migration adds an index on `journal_entries(book_id)` to accelerate timeline filtering by journal.
- **WAL checkpoint before export.** `PRAGMA wal_checkpoint(FULL)` is called before `export_data` to flush pending WAL frames into the main DB file so the export captures a complete snapshot.

### Changed
- **Insights page tiered loading.** Tier A (metadata, no decrypt) renders the stats grid immediately. Tier B (30-day decrypt) fills in mood and streak cards with a skeleton placeholder until ready. Gratitude streak uses a `localStorage` cache keyed on entry count + last entry date to skip `getAllEntries()` on repeat visits when nothing has changed.
- **`useInsights` dep array tightened.** Hook now subscribes only to `settings.ai` rather than the full `settings` object, preventing non-AI settings changes (theme, privacy mode, etc.) from triggering a full Insights reload.
- **`aggregateMetadataBoth` replaces two `aggregateMetadata` calls.** Single convenience wrapper returns both `localMeta` and `aiMeta` in one call, replacing the previous pattern of calling `aggregateMetadata` twice per load.

### Fixed
- **Streak cache invalidation on delete-and-re-add.** The gratitude streak cache is now keyed on both total entry count and last entry date, preventing stale streak display when a user deletes N entries and adds N new ones in the same session (previously the count-only key would incorrectly hit the old cache).
- **Insights stats grid on IPC error.** `isMetadataReady` is now set to `true` in the error path so the stats grid renders with zero values rather than staying hidden indefinitely when `get_insights_metadata` fails.

---

## [0.7.9] — 2026-03-27

### Added
- **Structured logger with log level filtering.** New `src/lib/logger.ts` wraps `@tauri-apps/plugin-log` with a unified `logger.{debug,info,warn,error}(msg, ctx?)` API. Optional structured context is serialized as `key=value` pairs appended to the message. Messages longer than 2000 characters are truncated. The module default level is `warn`.
- **Log level selector in Settings → About.** A dropdown lets users choose between Error, Warn, Info, and Debug verbosity. The selection applies immediately to both the frontend filter and the Rust-side `log::set_max_level()` via the new `set_log_level` command. Default is `warn`. Includes a "Debug is verbose" warning label.
- **Log level persistence.** The selected log level is stored in both `AppSettings` (JSON) and the `settings` SQL table (`log_level` key). On startup, the Rust backend reads the SQL key before any other initialization — `tauri-plugin-log` is initialized at `LevelFilter::Debug` so `set_max_level()` is the sole runtime gate.
- **Open Log Folder button.** Settings → About now shows an "Open Log Folder" button (enabled only when the log file exists). Uses platform-native launchers (`open`, `explorer`, `xdg-open`) to bypass the Tauri shell URL allowlist.
- **Dev console bridge.** `attachConsole()` is called in dev builds so frontend log calls routed through `logger.ts` appear in the Chromium DevTools console.
- **New Tauri commands:** `get_log_path`, `open_log_folder`, `set_log_level`.

### Fixed
- **Log file excluded from factory reset.** `factory_reset` now also deletes `moodhaven.log` from `app_log_dir` (previously only the `logs` directory inside `app_data_dir` was cleaned, which is a different path on macOS and Linux).
- **`log_level` skipped during import.** Restoring a backup no longer silently sets the Rust log level to whatever was stored in the source device's backup.
- **`resetSettings` now resets log level.** Resetting settings via the store now calls `setLevel()` and `set_log_level` so the in-memory and Rust filters match the default `warn` level immediately.
- **Level change handler awaits both writes.** `handleLogLevelChange` now uses `Promise.all` to await `saveSettings()` and `invoke('set_log_level')` in parallel, preventing silent level divergence if either write fails.
- **`get_log_path` returns `None` until log file exists.** The "Open Log Folder" button is disabled on first launch before any logs have been written.
- **QA: `attachConsole()` wired up correctly.** Console bridge was scaffolded but never called on app startup; frontend log output was invisible in DevTools during development. Fixed by calling `attachConsole()` in the Tauri plugin init sequence.
- **QA: `get_log_path` added to ACL.** The command was registered in `lib.rs` but missing from `app-commands.toml`; "Open Log Folder" was permanently disabled at the capability layer. Fixed.
- **QA: `logger.warn` template literal fixed.** A call in `webdavService.ts` used string concatenation (`+`) inside a `logger.warn()` call, triggering the `no-restricted-syntax` ESLint rule. Replaced with a structured context argument.

### Changed
- **ESLint rule tightened.** `BinaryExpression` inside Tauri logger call arguments is now blocked by a custom `no-restricted-syntax` rule, preventing accidental string interpolation that bypasses structured logging.

---

## [0.7.7] — 2026-03-26

### Changed
- **Full rebrand: MoodBloom → MoodHaven Journal.** The product is now named MoodHaven Journal (by Moodbloom). All user-facing strings, metadata, and technical identifiers updated across the entire codebase.
  - App identifier: `com.moodbloom.app` → `com.moodhaven.app`
  - Database filename: `moodbloom.db` → `moodhaven.db`
  - mDNS service type: `_moodbloom._tcp.local` → `_moodhaven._tcp.local`
  - Peer sync transport key prefix: `moodbloom-sync-v1/v2` → `moodhaven-sync-v1/v2`
  - WebDAV directory: `MoodBloom/` → `MoodHaven/`; file extension: `.moodbloom` → `.moodhaven`
  - Export format version strings: `moodbloom-encrypted-v1` → `moodhaven-encrypted-v1`, `moodbloom-full-v2` → `moodhaven-full-v2`
  - FIDO2 relying party ID: `moodbloom.local` → `moodhaven.local`
  - npm package name: `moodbloom` → `moodhaven-journal`; Rust crate: `moodbloom_lib` → `moodhaven_journal_lib`
  - OS window title and productName use short form `MoodHaven`; in-app headings use `MoodHaven Journal`

---

## [0.7.6] — 2026-03-26

### Added
- **"Buy Me a Coffee" support link.** A permanent link in the sidebar footer and the Settings → About section lets users support the project. The link opens `buymeacoffee.com/moodbloom` in the default browser.
- **One-time support prompt.** Users who have been using the app for 30+ days see a subtle, dismissible prompt in the sidebar ("Enjoying MoodBloom? A coffee helps keep it going."). Once dismissed, it never appears again (stored in `localStorage`). Hidden when the sidebar is collapsed.
- **Dev bypass mode.** Set `VITE_DEV_MODE=bypass` in `.env.local` (or as an env var) when running `npm run tauri dev` to skip the setup screen, lock screen, and tutorial overlay entirely. Useful for QA automation and rapid iteration. The bypass is guarded by `import.meta.env.DEV` and cannot activate in production builds.

---

## [0.7.5] — 2026-03-26

### Added
- **Time Capsule feature.** Seal any journal entry until a future date — choose a *Letter to yourself* or *Vault* type, pick the reveal date, and the entry disappears from the timeline. On the next app unlock after the date passes, a reveal modal surfaces the entry with its decrypted content and a mood delta chip comparing your mood then vs. now.
- **Anniversary auto-reveal.** Entries older than 365 days are automatically surfaced as time capsules on unlock, separate from On This Day (which shows the same month/day). Toggle "Auto-surface anniversary entries" in Settings → Time Capsule to opt out.
- **Seal from timeline.** The ⋯ entry actions menu now includes a "Seal entry…" option for unsealed entries. After sealing, the timeline auto-refreshes. After revealing, the timeline shows the entry again.
- **Time Capsule settings section.** Settings → General → Time Capsule controls the master toggle, anniversary reveal toggle, and default seal duration (30 / 90 / 180 / 365 days).
- **Mood delta on reveal.** The reveal modal shows a chip ("Your mood has improved since this was written" / "Your mood has changed") computed from average mood since the entry was written vs. today's most recent entry.
- **"Write a response" CTA.** The reveal modal offers a primary "Write a response" button that marks the capsule as read and opens a fresh entry.

### Fixed
- **Peer sync capsule columns.** `db_upsert_entry` in the sync engine now includes `sealed_until`, `capsule_type`, `linked_original_id`, and `unsealed_at` in both INSERT and UPDATE — preventing a re-reveal loop where Device B would re-surface already-revealed capsules on every unlock.
- **UTC consistency in SQL.** `get_mood_delta` was using `date('now', 'localtime')` for the mood-today query; all date comparisons now use bare `'now'` (UTC) to match the rest of the schema.
- **Date picker timezone.** `seal_entry` now converts the local date picker value (`YYYY-MM-DD`) to the UTC equivalent of local midnight via `new Date(...T00:00:00).toISOString()` — previously used literal `T00:00:00Z` which was midnight UTC, causing off-by-hours errors for users east or west of Greenwich.
- **Re-seal and double-reveal guards.** `seal_entry` now rejects if the entry is already sealed (`sealed_until IS NOT NULL`) or was previously revealed (`unsealed_at IS NOT NULL`). `unseal_entry` now only runs if `unsealed_at IS NULL`, preventing silent timestamp overwrites on double-reveal.
- **Decrypted content sanitized.** `TimeCapsuleRevealModal` now strips `<script>`, event attributes (`on*`), and `javascript:` hrefs from decrypted HTML before rendering via `dangerouslySetInnerHTML`.
- **Double-click guard on reveal.** A `useRef` guard in `handleReveal` prevents racing concurrent calls when "Write a response" and "I've read this" are activated in the same render cycle.
- **`capsule_type` validation.** `seal_entry` rejects any `capsule_type` not in `["letter", "vault"]` with an error, preventing corrupted capsule metadata.
- **"Write a response" error handling.** If marking the capsule as revealed fails, the error is now surfaced to the user instead of silently eating it.

---

## [0.7.4] — 2026-03-24

### Added
- **Reading time estimate.** Word count bar shows `· N min read` next to word count once an entry reaches 200 words (1 min per 200 words, ceiling).
- **Daily-rotating greeting.** The writing view heading cycles through 8 contextual greetings per time-of-day (morning / afternoon / evening), seeded by day-of-year so the greeting stays stable all day and rotates tomorrow.
- **Weather loading skeleton.** While location/weather resolves, the weather chip shows a CSS shimmer skeleton pill instead of a spinner — matches the card's ambient style.
- **Focus mode exit hint.** A `Press Esc to exit focus` pill fades in for 3 s when distraction-free mode activates. Pressing Esc now also exits focus mode (previously only Ctrl+Shift+F worked).
- **Save micro-animation.** The ✓ Saved indicator blooms with a scale pulse each time a save completes successfully. Animation is a scale-only bounce (no opacity flash) so it works cleanly on repeated saves.
- **Inline tag chips.** Hashtags extracted from the entry appear as chips in the card header, with a `+ tag` button to open the tag manager. Chips are hidden in distraction-free mode.
- **Desktop word-count milestone glow.** Hitting 50 / 100 / 200 / 500 words triggers a violet glow pulse on the word count (desktop). Android already had a flash + haptic; both now share the same `didHitMilestone()` logic.
- **Flow-positioned prompt CTA.** "Not sure what to write?" fades out below the editor as the user starts typing, replacing the previous absolute-positioned overlay that could occlude content.
- **17 new tests** covering `getReadingTime`, `didHitMilestone`, and `getGreeting` with full boundary coverage. Total: 467 tests.

### Fixed
- **Sidebar header icon size.** Gear (settings) and cloud (sync) icons were 16px (`w-4 h-4`) while all sidebar nav icons are 20px (`w-5 h-5`). All four icon states (gear, spinning ring, cloud+check, cloud at rest) are now consistently `w-5 h-5`.
- **Esc key exits focus mode.** The focus-mode keyboard handler now responds to `Escape` in addition to `Ctrl+Shift+F`.
- **Focus hint timer leak.** Exiting focus mode before the 3-second hint timer fires no longer leaves `showFocusHint` stuck `true` (which would cause the hint to appear immediately on the next entry into focus mode without animating in).
- **Save success animation on failure.** A failed auto-save no longer plays the ✓ Saved bloom or keeps showing "✓ Saved" from a prior successful save. The indicator is now gated on per-save success tracking.
- **Weather shimmer keyframe.** `@keyframes shimmer` is now declared directly in `globals.css` — previously it was only in `tailwind.config.js`, where Tailwind's tree-shaking suppressed it (no `animate-shimmer` utility class was used), causing the skeleton to render as a static grey rectangle.
- **Word-count span reflow.** The word count and ✓ Saved spans now always have `display: inline-block`, preventing layout reflow on every milestone and save event.

---

## [0.7.3] — 2026-03-23

### Added
- **SetupScreen component extraction.** The first-run wizard is now composed of 10 focused step components (`WelcomeStep`, `PasswordStep`, `RecoveryStep`, `SecurityStep`, `StorageStep`, `DevicesStep`, `SyncFromPeerStep`, `ImportStep`, `SourceStep`, `CompleteStep`) replacing the previous 1200-line monolith. `SetupScreen` is now an orchestrator holding shared wizard state.
- **Makefile.** Adds `make build`, `make dev`, `make test`, `make typecheck`, `make lint` convenience targets.
- **CI security audit scripts.** `check:deny` (`cargo deny check`) and `check:audit` (`cargo audit`) added to `package.json`. `check:all` runs typecheck + lint + tests + both audits in sequence.
- **28 new tests.** `useSpeechToText` hook (228 lines, covers A-05 cancelled-ref race, A-10 isAvailable from ref, L2/L3 paths, model-not-downloaded guard); `aiService` additions. Total: 450 tests.

### Fixed
- **A-04: Mic indicator leak on navigation.** `useAudioRecorder` now calls `cleanup()` on unmount via a `useEffect` return — prevents the browser mic indicator remaining active if the user navigates away mid-recording.
- **A-05: Cancelled-ref race in `useSpeechToText`.** `cancelledRef` signals in-flight async chains (`transcribeAudio`, `formatTranscript`) to abort after `cancel()` is called — prevents stale `formattedResult` from appearing after cancellation.
- **A-08: TipTap XSS guard (complete).** `insertContent()` (which interprets input as HTML) is replaced throughout the STT path with `tr.insertText()`. Additionally, `RichTextEditor` now exposes a typed `insertHtml` prop for intentional HTML (templates/blockquotes), while `insertText` is strictly plain text — AI prompt suggestions now go through `tr.insertText` instead of `insertContent`.
- **A-10: `isAvailable` from ref.** `useSpeechToText.isAvailable` now reads `availabilityResultRef.current` (always current) instead of the `settings.modelDownloaded` state value, eliminating a stale-closure race.
- **CI: `dry_run` boolean string coercion.** GitHub Actions `inputs.dry_run == true/false` comparisons are now `== 'true'/'false'` (inputs are always strings) — the dry-run build step was silently never executing.
- **CI: Linux arm64 `PKG_CONFIG_PATH` appends** instead of overwriting, preserving any paths set by prior steps.
- **`build-whisper.sh` Windows path.** Removed `local` keyword used outside a function — it caused an immediate bash runtime error on `--windows` cross-compile runs.
- **Discovery cleanup stale closure.** `useEffect` cleanup in `SetupScreen` now reads `enableLanSyncRef.current` (always fresh) instead of the closure-captured `enableLanSync` state value, preventing mDNS from staying active after the wizard completes.

---

## [0.7.2] — 2026-03-22

### Added
- **Microphone permission modals.** `MicrophonePermissionModal` (pre-OS-prompt consent) and `MicrophoneBlockedModal` (platform-specific unblock instructions for macOS, Windows, Linux) handle Tauri WebView permission quirks where `navigator.permissions` may return `'denied'` before the user has ever been prompted.
- **CI whisper.cpp sidecar build.** GitHub Actions workflow now compiles `whisper-cli` from source on each platform (Linux, Windows, macOS) and caches the binary by upstream HEAD SHA, eliminating the need to commit binaries.
- **18 new tests.** `TranscriptPreviewOverlay`, `CloudConsentModal` component tests; existing test suite now 429 tests total (19 files).

### Fixed
- **Improved whisper error messages.** When the whisper sidecar exits non-zero, the error now includes stdout as a fallback (whisper writes some errors there) and the exit code — previously only stderr was included, resulting in empty error messages on some failure modes.
- **WAV header overflow guard.** `encodeWAV()` now throws explicitly if a recording would exceed the 32-bit WAV chunk size limit (~2h 28min at 16kHz), preventing silent header corruption.
- **TranscriptPreviewOverlay empty formatted text.** When L2/L3 formatting returns an empty string, the overlay now shows "Formatting returned an empty result" instead of silently displaying the raw text as if it were formatted.

---

## [0.7.1] — 2026-03-21

### Added
- **STT transcript formatting — 3-layer privacy ladder.** Voice recordings now produce clean, formatted journal prose instead of raw whisper output. Layer 1 (always on) removes filler words, collapses false starts/repetitions, and adds paragraph breaks using whisper timestamp data. Layer 2 (optional, Ollama) applies local LLM formatting with no data leaving the device. Layer 3 (optional, OpenAI BYOK) provides cloud-quality polish with explicit separate consent.
- **Transcript preview overlay.** When Layer 2 or Layer 3 formatting runs, a bottom-sheet overlay slides up showing the formatted text before it lands in the editor. Three choices: Use this / Edit first / Use raw text.
- **Cloud consent modal.** Selecting OpenAI formatting requires separate explicit consent ("I understand — enable cloud formatting") distinct from the existing AI metadata consent.
- **Quick-capture toggle.** Bolt icon next to the mic button bypasses formatting for a single recording session — raw whisper text inserts immediately.
- **"Clean up" editor action.** Select any text in the editor and click the sparkle button in the toolbar to run the formatting pipeline on the selection.
- **Settings → Speech to Text → Formatting sub-section.** Radio-list picker (Local / Ollama / OpenAI) with per-option descriptions; consent status and revoke link for cloud formatting.
- **`stt_transcribe_timestamped` Rust command.** Returns whisper JSON output with per-segment timestamps enabling pause-based paragraph detection; falls back gracefully to plain text.
- **`raw_transcription` column on `voice_memos` table.** Stores original whisper output alongside formatted version (idempotent migration).
- **Watch memo formatting hook.** `useWearVoiceMemos` accepts an optional `formatCallback` so watch-sourced transcriptions flow through the same formatting pipeline.

### Fixed
- **btoa stack overflow on recordings >30 seconds.** `speechToTextService.ts` was using `btoa(String.fromCharCode(...bytes))` which crashes via call-stack overflow for large audio buffers. Now uses a chunked 32KB approach.
- **OpenAI token truncation on long transcripts.** The existing `callOpenAI()` helper hardcodes `max_tokens: 1000`, silently truncating long recordings. `formatTranscript()` makes a direct fetch call with `max_tokens: 4096`.

---

## [0.7.0] — 2026-03-18

### Added
- **Encrypted peer sync engine** — TCP manifest-diff sync between trusted LAN devices with AES-256-GCM transport and last-write-wins conflict resolution
- Auto-sync triggers when a trusted peer is discovered (30-second cooldown)
- Auto-sync after a pairing is completed
- Non-obtrusive in-app notification for incoming pairing requests (replaces blocking dialog)
- `peer_full_restore` and `peer_apply_and_restart` Tauri commands for full database restore during device setup
- `transcribe_voice_memo` command hooking whisper.cpp sidecar into the voice memo pipeline
- `useWearVoiceMemos` hook for processing incoming Wear OS audio in the main app
- `peer_sync_state` SQLite table tracking last-sync-at per peer device

### Fixed
- `peer_full_restore` and `peer_apply_and_restart` added to ACL capability (`default.json`) so Tauri permits the calls
- DB rename in restore deferred to startup so `tauri dev` exit-and-reopen cycle works correctly
- Sync state trigger rewritten with `WHEN` clause to fix SQLite trigger error on upsert

---

## [0.6.1] — 2026-03

### Added
- **QR code / PIN pairing** — devices exchange a 6-digit PIN (or scan a QR) to establish trust; no manual IP entry
- `trusted_devices.json` persistent store for paired device records
- Deterministic sync port assignment — each device gets a stable port in the 44000–44999 range derived from its device ID

### Changed
- Settings → Devices tab extended with pairing flow UI (show QR, enter PIN, trusted device list)

---

## [0.6.0] — 2026-03

### Added
- **Local peer sync foundation**
  - Ed25519 device identity generated on first launch (`device.json` + `peer_key.bin`)
  - mDNS/DNS-SD broadcast and discovery (`_moodbloom._tcp.local`) via `mdns-sd`
  - Tauri events: `peer:discovered`, `peer:lost`
  - 6 Tauri commands: `peer_get_identity`, `peer_rename_device`, `peer_discovery_start/stop`, `peer_get_nearby`, `peer_discovery_is_active`
  - `peerDiscoveryService.ts`, `peerSyncStore.ts` Zustand store, `usePeerSync` hook
- **Settings → Devices tab** — full UI for nearby peers, pairing, and device management
- `PeerSyncBadge` in sidebar footer showing sync status

---

## [0.5.0] — 2026-03 — Major Polish Sprint

### Added
- **Hashtag auto-extraction** — tags parsed from entry content on save and stored in `entry_tags` table; surfaced in timeline
- **Pinned entries** — `pinned` boolean on `journal_entries`; pinned entries float to top; `patch_entry_pinned` Tauri command
- **Calendar 24-hour timeline view** — hourly mood distribution within each selected day
- **Journal Overview page** — per-book stats, description, settings
- **Insights page redesign** — section headers, AI CTA card, book filter, `MoodWeatherCard`, `GratitudeStreakCard`, `WeeklyReflectionCard`
- **Settings deep-linking** — `SettingsScrollTarget` allows direct scroll-to-section from other views
- **Temperature unit** setting (Celsius / Fahrenheit) for weather display
- **Auto-title toggle** — opt-out of automatic entry title generation

### Changed
- Timeline entry cards: mood rings, date group headers, auto-scroll on new entry, full search integration
- Writing view: ambient gradient background, focus fade, streak line in header, mood auto-detection threshold lowered to 5 words (was 8), lock icon replaces ✦ when manually set
- Mood scanning animation: pulsing dots on words 1–4 ("scanning…" label), pop animation on every mood change
- Oura health context badge redesigned; `buildHealthSummary()` uses qualitative modifiers only (never raw biometrics sent to AI)

---

## [0.4.0] — 2026-02

### Added
- **Multiple journals (Books)** — named, colour-coded journals with emoji; `books` SQLite table; `book_id` column on entries
- `list_books`, `create_book`, `update_book`, `delete_book` Tauri commands
- **Sync Details Modal** — storage type pill, entry count, last sync, upload/download with inline WebDAV auth
- **Cloud sync chip** in sidebar footer — shows relative last-sync time, opens inline panel
- **Template blockquotes** — templates insert styled `<blockquote>` HTML into TipTap instead of raw text
- `+ New Entry` pill in TopBar — always visible regardless of current view
- **Weather for existing entries** — opening a saved entry shows its captured weather/location

### Changed
- Sidebar: Settings icon (left) + Sync cloud icon (right) replace the app logo; My Books section added below navigation
- Analytics removed as a separate nav item — merged into the Insights view
- TopBar icons sized to `w-5 h-5` / `p-2`; bar height `h-12`
- `SettingsScrollTarget` type includes `'speech-to-text' | 'ai' | null`

### Fixed
- Weather race condition: if the entry saves before geolocation resolves, weather is patched in retroactively via `patch_entry_location_weather`
- `locationLoading` spinner micro-chip shown while geolocation resolves

---

## [0.3.2] — 2026-01

### Added
- **7 journal templates** — Gratitude, Happiness, Rest & Recovery, Grounding, Daily Reflection, Goals & Dreams, Free Write
- Templates page (`TemplateSelector` component) in Prompt Drawer
- `usedTemplateIds` tracked per-day in `localStorage`
- "✓ Used" badges on recently used templates

---

## [0.3.1] — 2026-01

### Added
- **Encrypted export** — `.moodbloom` files use AES-256-GCM envelope (`moodbloom-encrypted-v1` format)
- **Encrypted import** — auto-detects encrypted vs legacy unencrypted backup; decrypts on import
- **Factory reset** — two-click confirmation; wipes all data and settings, returns to first-run wizard

---

## [0.3.0] — 2025-12

### Added
- **First-run setup wizard** — Welcome, password creation, storage backend selection, optional import

---

## [0.2.2] — 2025-12

### Added
- Settings page tab structure: General, AI, Appearance, Privacy, Health
- Settings search — filters settings by keyword in real time
- Data management section (export, import, factory reset) in Settings

---

## [0.2.1] — 2025-12

### Fixed
- **Journal save freeze** — `create_entry` and `update_entry` were calling `get_entry` internally, causing a non-reentrant `std::sync::Mutex` deadlock; fixed by querying directly on the existing connection

---

## [0.2.0] — 2025-11

### Added
- **Calendar heatmap** — monthly view colour-coded by average daily mood
- **Analytics dashboard** — mood trend chart, distribution bar chart, streak tracking, day-of-week patterns
- **AI insights** (disabled by default) — contextual prompts and wellness observations using anonymised metadata only; supports OpenAI API (BYOK) and local Ollama

---

## [0.1.0] — 2025-10

### Added
- Initial release
- Mood tracking with 5-level emoji scale
- Encrypted journaling with TipTap rich-text editor
- AES-256-GCM encryption, PBKDF2 key derivation (600,000 iterations)
- TOTP two-factor authentication
- Native FIDO2 hardware key support (Rust CTAP2/HID)
- Optional 24-character recovery key
- WebDAV cloud sync (manual, encrypted)
- Location and weather capture (Open-Meteo + Nominatim, no API key)
- Privacy modes per entry (Open / Mindful / Private)
- Full-text search (`Ctrl+K`) with mood and date filters
- On This Day view
- Focus mode with typewriter scrolling
- Oura Ring integration (PAT-based)
- Configurable notification reminders
- Dark / Light / System theme
