# Changelog

All notable changes to MoodBloom are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

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
