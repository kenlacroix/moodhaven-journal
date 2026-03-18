# Changelog

All notable changes to MoodBloom are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

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
