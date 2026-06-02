# MoodHaven Journal — Origin Story

How a privacy-first encrypted journal grew from a first commit to v1.3.0 across seven eras of development — October 2025 to May 2026.

---

## Era 1 — Foundation · October 2025 · v0.1.0

The non-negotiables were established on day one: AES-256-GCM encryption with PBKDF2 key derivation (600,000 iterations), a five-level mood scale, and a rich-text editor built on TipTap. The backend never sees plaintext. Keys live only in memory while the app is unlocked.

Two-factor authentication shipped from the first release — both TOTP via an authenticator app and FIDO2 hardware keys using native Rust CTAP2/HID, bypassing the WebView entirely. An optional 24-character recovery key lets users escape a locked device without a cloud account.

**Shipped**
- AES-256-GCM encryption · PBKDF2 600k iterations · mood 1–5 scale
- TipTap rich-text editor · TOTP 2FA · FIDO2 hardware key (native Rust)
- 24-character recovery key · WebDAV cloud sync (manual, encrypted)
- Location and weather capture · privacy modes per entry (Open/Mindful/Private)
- Full-text search (Ctrl+K) · On This Day view · Oura Ring integration
- Focus mode with typewriter scrolling · configurable reminders

---

## Era 2 — Intelligence · November–December 2025 · v0.2.0–v0.3.2

With the storage layer solid, the focus shifted to making the journal *useful* over time. Analytics surfaced patterns; AI turned patterns into insights. The first-run setup wizard made onboarding coherent.

AI features are opt-in, disabled by default, and require explicit consent. Only anonymised metadata is ever sent to a model — mood scores, patterns, time-of-day tendencies. Journal text never leaves the device.

**Shipped**
- Calendar heatmap · mood trend chart · distribution bar chart
- Streak tracking · day-of-week mood patterns
- AI insights (OpenAI BYOK + local Ollama, metadata-only)
- First-run setup wizard · encrypted import/export (`.moodbloom` format)
- Factory reset (two-click, wipes all data) · seven journal templates
- Gratitude · Happiness · Rest · Grounding · Daily Reflection · Goals · Free Write

---

## Era 3 — Organization · February–March 2026 · v0.4.0–v0.5.0

A journal for each part of your life. Multiple named, colour-coded journals (Books) let users separate work reflections from personal ones, daily entries from long-form essays.

This era also brought the full polish sprint: hashtag extraction, pinned entries, a 24-hour calendar timeline view, a daily-rotating greeting, reading time estimates, focus mode improvements, and mood milestone animations.

**Shipped**
- Multiple journals (Books) — named, emoji, colour-coded
- WebDAV sync modal with inline auth · cloud sync chip in sidebar
- Hashtag auto-extraction · pinned entries (float to top)
- Calendar 24-hour timeline view · Insights page redesign
- AI card wrappers (MoodWeatherCard, GratitudeStreakCard, WeeklyReflectionCard)
- Reading time estimates · daily-rotating greeting · focus mode exit hint
- Mood milestone glow · word-count milestone pop animations

---

## Era 4 — Connection · March 2026 · v0.6.0–v0.7.x

The biggest era by commit count. Peer sync arrived: Ed25519 device identity, mDNS discovery, PIN/QR pairing, and an AES-256-GCM TCP sync engine — zero cloud required. Two trusted devices on the same LAN sync automatically within 30 seconds of appearing together.

Speech-to-text followed via a whisper.cpp sidecar (four model sizes, fully offline). A three-layer formatting pipeline turns raw dictation into polished journal prose. The Wear OS companion shipped its first voice capture pipeline.

The product was renamed from MoodBloom to **MoodHaven Journal** in this era.

**Shipped**
- Ed25519 device identity · mDNS/DNS-SD peer discovery
- PIN/QR pairing · AES-256-GCM TCP sync engine (port 44000–44999)
- whisper.cpp sidecar STT · four Whisper models (75 MB – 1.5 GB)
- 3-layer transcript formatting (local → Ollama → OpenAI BYOK)
- Time capsule feature — seal entries until a future date
- SQLite WAL mode · `get_full_analytics_bundle` (single-round-trip analytics)
- Structured logging with `set_log_level` at runtime
- Wear OS companion Phase 1 — voice capture, mood taps via ChannelAPI
- Full rebrand to MoodHaven Journal (v0.7.7)
- EntryStateBadge · SelectiveExportPanel · SettingsPage split (8 tabs)
- Staggered timeline animations · modal slide-up animations

---

## Era 5 — Openness · April 2026 · v0.8.0

No install required. MoodHaven Journal became a browser app — the same zero-knowledge encryption running against IndexedDB instead of SQLite. A user on a borrowed laptop can open the web build, unlock their journal via WebDAV, and close the tab with nothing left behind.

WebDAV sync for the browser uses `If-Match` ETag headers to prevent concurrent desktop + browser writes from silently overwriting each other.

**Shipped**
- Browser/web port (IndexedDB backend, identical encryption model)
- WebDAV sync for browser (ETag-guarded)
- PWA (installable, offline-capable)
- `npm run dev:web` / `build:web` scripts · `VITE_TARGET=web` build mode
- `isBrowser` flag for desktop-only feature gating
- Monthly mood analytics date range fix (February entries were missing)

---

## Era 6 — Hardening · April–May 2026 · v0.9.0–v1.0.0

From feature-complete to production-ready. Password verification moved to Rust — the hash never leaves the backend. Seventeen Tauri commands gained lock guards. The STT model URL is now validated against an explicit allowlist before any network request.

A full security sweep: DOMPurify on rendered journal HTML, path traversal blocking in media commands, constant-time PIN comparison, peer sync entry validation, rate limiting on unlock, and SHA-pinned CI supply chain.

v1.0.0 shipped on May 24, 2026. 702 tests, MIT-licensed, no telemetry.

**Shipped**
- `verify_password` Rust command (hash stays in backend)
- Lock guards on 17 analytics, health, and time capsule commands
- STT model URL allowlist · DOMPurify on TimeCapsuleRevealModal
- Path traversal blocked in media commands · constant-time PIN comparison
- `PasswordRateLimiter` (5 failures → 30-second lockout)
- Vite 5 → 8 · vitest 1 → 4 (GHSA-67mh-4wv8-2f99 resolved)
- SHA-pinned GitHub Actions CI supply chain
- STT recording strip UI · model management tab with download progress
- Timeline virtual scroll (`position: absolute` + `ResizeObserver`)
- 7-day mood sparkline in sidebar · keyboard shortcuts (1–5, ?)
- On This Day banner · streak milestone toasts
- **v1.0.0: first stable release** — Linux, macOS, Windows

---

## Era 7 — Enrichment · May 2026 · v1.1.0–v1.3.0

Deeper than a journal. StillHaven arrived: a bilateral audio stimulation companion that uses alternating left-right tones to help settle the nervous system before writing. Bio-adaptive: it reads today's Oura HRV at check-in and listens for live heart-rate signals from the Wear OS watch mid-session.

Voice memo drafts turned the watch companion into a first-class writing tool — recordings surface as reviewable cards in the Timeline with inferred mood, biometric context, and hashtag suggestions. Write, encrypt, publish.

The TOTP seed, previously stored as plaintext, was encrypted at rest using AES-256-GCM derived from the user's password.

**Shipped**
- StillHaven — bilateral audio engine, protocol picker, activation dial
- Bio-adaptive engine (Oura HRV + live watch heart-rate signals)
- Journal handoff from StillHaven sessions
- Abandoned session detection · first-visit welcome card
- Voice memo draft pipeline — VoiceMemoDraftCard, VoiceDraftEditor
- Writing appearance drawer — font, size, tint, high contrast, dyslexia profile
- Wear OS Phase B (brand sweep) · Phase C (splash screen) · Phase 5a (HealthSnapshot)
- TOTP encrypted at rest · writer window capability scoped (~30 commands only)
- `PasswordRateLimiter` persisted to disk · settings sync allowlist
- Full-restore SHA-256 integrity check
- Word count tracking · `session_id` links entries to StillHaven sessions
- WellbeingCard morning context card · wrist loop (StillHaven via watch tap)
- **1,165 JS/TS tests · ~148 Tauri commands · three platforms**

---

## Where Things Stand — v1.3.0 · May 31, 2026

MoodHaven Journal is a complete, privacy-first journaling platform for people who take both their writing and their data seriously.

The architecture: Tauri v2 (Rust) + React + TypeScript + SQLite. Zero accounts. Zero telemetry. AES-256-GCM encryption throughout. A browser build for anywhere. A Wear OS companion for your wrist. A bilateral audio companion for your nervous system. And 1,165 tests keeping it honest.

Everything is open-source under the MIT licence.

**Stack snapshot**
- `npm test` → 1,165 tests across 70 files
- `cargo check` → ~148 Tauri commands in 21 Rust modules
- Platforms: Ubuntu (.AppImage + .deb) · macOS Intel + Apple Silicon (.dmg) · Windows (.msi + .exe)
- Browser: any modern browser (IndexedDB, no install)
- Watch: Wear OS 3.0+
