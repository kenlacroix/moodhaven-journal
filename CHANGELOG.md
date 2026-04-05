# Changelog

All notable changes to MoodHaven Journal are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

---

## [Unreleased] — tooling

### Added
- **Automated pentest harness** (`scripts/pentest.sh`). Six-phase local security scan: static analysis (cargo-audit, npm audit, semgrep), DAST (OWASP ZAP + ffuf with dynamic Vite port detection), IPC fuzzer (119 Tauri commands, 1 558 cases via Playwright browser-invoke shim), AES-256-GCM crypto oracle prober, peer sync TCP fuzzer, and finding aggregator. Results written to `pentest-results/YYYYMMDD_HHMMSS/` as JSON + Markdown. Each tool is skipped gracefully with install hint when not present. Sync fuzzer uses concurrent port scanning (100 workers) across the full 44 000–44 999 range and validates that a port speaks the MoodHaven protocol before fuzzing it.
- **Daily/weekly remote security scan** (`trig_01BqvwYxK23odvmEhfuQqWhm`). Scheduled Claude Code remote agent: cargo-audit + npm audit daily at 08:00 Boise, semgrep static analysis added on Mondays. Opens a GitHub issue labelled `security` only on HIGH/CRITICAL findings; deduplicates to avoid re-opening issues for the same day.

### Fixed
- **`UpdatePanel.tsx` semgrep false positive.** Added `nosemgrep` suppression with inline justification on the `dangerouslySetInnerHTML` usage in the release-notes renderer. The `renderMarkdown` function HTML-escapes all input before substitution; source is developer-controlled GitHub release notes.
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
