# MoodHaven Journal — Design & Product TODOs

> Tracked items from `/plan-design-review` and other review passes.
> Resolved items are moved to the relevant plan file or CHANGELOG.

---

## Website Design Debt (from design-unification autoplan review, 2026-04-04)

### ~~DESIGN-DEBT-001: Hero background photo~~ ✅ RESOLVED (2026-04-12)
**Completed:** v0.9.3 — Rain photo replaced with violet gradient (`from-primary-900 via-primary-800 to-primary-700`) + radial highlight overlay + two-column layout with `writing-view.png` app screenshot on desktop. `HeroParticles` canvas removed. `HeroImage` updated to `writing-view.png`.

### ~~DESIGN-DEBT-002: Newsletter carousel on homepage~~ ✅ RESOLVED (2026-04-12)
**Completed:** v0.9.3 — Carousel was already replaced by `CommunityCallout` (GitHub + Substack links) in a prior pass. No carousel renders on `app/page.tsx`. `WaitlistModal.tsx` deleted (orphaned).

### ~~DESIGN-DEBT-003: Value props → proof-based modules~~ ✅ RESOLVED (2026-04-12)
**Completed:** v0.9.3 — `FeaturesGrid.tsx` rewritten with proof-based copy: named algorithm (`PBKDF2, 600k iterations, per-entry random salt`), named files (`crypto.ts`), concrete behaviors (`Ed25519 device identity, QR/PIN pairing, AES-256-GCM transport`). Removed abstract claims.

### ~~DESIGN-DEBT-004: Social proof on homepage~~ ✅ RESOLVED (2026-04-12)
**Completed:** v0.9.3 — GitHub star badge added to hero copy block in `HomeClient.tsx`. Links to `kenlacroix/moodhaven-journal`.

### ~~DESIGN-DEBT-005: Pricing section on homepage~~ ✅ RESOLVED (2026-04-12)
**Completed:** v0.9.3 — FOSS statement added to hero ("Free and open source. No account, no subscription, no cloud required."). FAQ page rewritten to remove Pro tier language and add open-source Q&A. Privacy page cleaned of waitlist/Formspree references.

---

## Design System

### ~~D-001: Create DESIGN.md (design source of truth)~~ ✅ RESOLVED (2026-04-12)
**Completed:** v0.9.3 — `DESIGN.md` created at repo root. Covers: color tokens (primary violet, accent orange, mood scale, neutrals), typography (Inter, size/weight/role table), spacing and layout conventions, motion system (AnimatedReveal parameters, stagger, duration), component vocabulary (buttons, cards, section containers, NavBar, Footer, Hero pattern), app design tokens, Do/Don't table.

---

## STT Transcript Formatting (follow-up from PR: transcript-formatting)

### ~~D-002: Pin amber design token for 'formatting' state~~ ✅ RESOLVED 2026-03-22
**Decision:** `text-amber-500 dark:text-amber-400` for both MicButton `'formatting'` spinner and QuickCaptureToggle active bolt.
**Rationale:** amber-500 matches in-progress semantic (InsightsView streak + PeerSync connecting). Distinct from mood-3 (amber-400 dot), warning text (amber-600/400), danger CTA (amber-600).
**Updated in:** `ceo-plans/2026-03-21-stt-transcript-formatting.md` → State color spec section.

---

## Security Hardening (fix/security-hardening — v0.7.3)

### → F-001: API credentials stored plaintext in SQLite → fix/security-hardening
- OpenAI key, WebDAV password, Oura PAT encrypted with AES-256-GCM using session password before storage
- `secureStorage.ts` (new), `settingsService.ts` + `settingsStore.ts` + `ouraService.ts` updated
- `oura_validate_pat` new Tauri command; `oura_sync_today` accepts `pat: String` param

---

## STT — Adversarial Review Follow-ups

> Items from the adversarial review of `feat/stt-transcript-formatting`. Critical fixes (#1–6) were applied in the same PR. The 8 below are deferred.

### ~~A-04: MediaStream / AudioContext not cleaned up on unmount~~ ✅ RESOLVED v0.7.3
**What:** If the component unmounts mid-recording, the MediaStream and AudioContext are left open — the OS microphone indicator (red dot / LED) stays on indefinitely.
**Fix:** Added `useEffect` cleanup in `useAudioRecorder.ts` that calls `cleanup()` on unmount.

### ~~A-05: `cancel()` doesn't abort in-flight Tauri invoke or formatting fetch~~ ✅ RESOLVED v0.7.3
**What:** Calling `cancel()` sets local state to idle but the running `transcribeAudio` invoke and `formatTranscript` fetch continue running in the background. If they resolve after cancellation they may still call `setFormattedResult`.
**Fix:** Added `cancelledRef` in `useSpeechToText.ts`; checked at each `await` point in `stopAndTranscribe`. Tests added.

### ~~A-07: Path traversal — model filename not canonicalized in Rust STT commands~~ → fix/security-hardening
**What:** `stt_transcribe` and related commands accept a `model_name` string from the WebView and build a file path from it without canonicalizing or validating it. A crafted value like `../../etc/passwd` could read arbitrary files.
**Fix:** Resolve the path with `std::fs::canonicalize`, verify it starts with the expected models directory, and return an error otherwise.

### ~~A-08: TipTap `insertContent` parses Ollama/OpenAI response as HTML — link injection risk~~ ✅ RESOLVED v0.7.3
**What:** `insertContent(formattedResult.formatted)` treats the string as HTML. If an Ollama or OpenAI response contains `<a href="javascript:…">` or similar, it will be inserted as live HTML into the editor.
**Fix:** Switched to `tr.insertText` (via `editor.chain().command()`) in `RichTextEditor.tsx` for all three handlers (handleUseFormatted, handleEditFirst, handleUseRaw).

### ~~A-10: `isAvailable` uses stale `modelDownloaded` setting instead of real filesystem~~ ✅ RESOLVED v0.7.3
**What:** `isAvailable` is computed as `settings.enabled && settings.modelDownloaded`. The `modelDownloaded` flag in settings can drift from reality (e.g. user deletes the model file manually).
**Fix:** `isAvailable` now reads from `availabilityResultRef.current` (populated by `checkAvailability()`) instead of the settings flag.

### ~~A-12: `stt_cancel_download` not registered in `lib.rs`; download progress events never wired~~ ✅ RESOLVED 2026-04-04
**Fix:** Registered `commands::stt_cancel_download` in `lib.rs`. Rewrote `downloadModel()` in `speechToTextService.ts` to set up a `listen('stt-download-progress', …)` listener before invoking, clean it up in `finally`. Added `cancelDownload()` export. Extended `DownloadProgress` interface with `state`, `speed`, `error` fields to match Rust struct.

### ~~A-13: `raw_transcription` DB column added but never written to~~ ✅ RESOLVED 2026-04-04
**Fix:** `patch_voice_memo_transcription` in `db/mod.rs` now sets `raw_transcription = transcription` when `raw_transcription IS NULL` (first write from whisper.cpp). Subsequent calls leave `raw_transcription` intact.

### ~~A-14: `stt_download_model` URL is attacker-controllable from the WebView — no allowlist in Rust~~ → fix/security-hardening
**What:** The download URL for Whisper models is constructed from a `model_name` parameter passed by the frontend. A compromised WebView could supply an arbitrary URL and cause the Rust sidecar to fetch from an attacker-controlled server.
**Fix:** Maintain an allowlist of valid model names in Rust, map each name to its canonical Hugging Face URL, and reject any model name not in the allowlist.

### ~~A-15: OpenAI 401 silently falls back to local formatting without user feedback~~ ✅ RESOLVED 2026-04-04
**Fix:** `formatTranscript` in `aiService.ts` now throws `Error('INVALID_KEY')` on 401 instead of returning `source: 'local'`. `useSpeechToText` catches it and sets `transcribeError` prompting the user to update their key in Settings.

### ~~A-16: Ollama response body has no size limit~~ ✅ RESOLVED (2026-04-04)
Replaced `response.json()` with a streaming reader that aborts and falls back to L1 if the body exceeds 1 MB.

---

### ~~D-003: Spec the voice memos empty state~~ ✅ RESOLVED (2026-04-12)
**Completed:** v0.9.3 — `WearVoiceMemoPanel` in `WritingView` renders an empty state with first-run copy and a "Get started" prompt when no memos are present.

---

## Time Layer (feat/time-layer)

### ~~TL-005: get_due_capsules On-This-Day exclusion uses UTC not local date~~ ✅ RESOLVED 2026-04-04
**Fix:** `get_due_capsules` now accepts an optional `local_date: Option<String>` (YYYY-MM-DD). Frontend `getDueCapsules()` passes `new Date().toLocaleDateString('en-CA')`. Falls back to `date('now')` when not provided.

### ~~TL-006: Anniversary entries visible in timeline before reveal~~ ✅ RESOLVED (2026-04-05)
**Decision:** Show in timeline, marked with a badge (option B). Anniversary entries are regular past entries — hiding them would confuse users who can't find their own writing. Added rose "Anniversary" badge and indigo "Time Capsule" badge (for actively sealed entries) to both the main entry list and the pinned entries section in `TimelineView.tsx`.

### ~~TL-007: Peer sync: unsealed_at LWW can re-queue already-revealed capsule~~ ✅ RESOLVED 2026-04-04
**Fix:** `unseal_entry` now also sets `updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')` so the LWW timestamp reflects the reveal and peer sync propagates the unsealed state correctly.

### ~~TL-004: Export/import does not preserve capsule columns~~ ✅ RESOLVED 2026-04-04
**Fix:** `import_data` in `data_management.rs` now passes `location_weather` and `book_id` to `db::create_entry()`, then runs a follow-up SQL UPDATE to restore `created_at`, `updated_at`, `pinned`, `sealed_until`, `capsule_type`, `linked_original_id`, `unsealed_at` from the JSON payload.

---


### TL-003: Accessibility spec for TimeCapsuleRevealModal
**What:** Focus trap (focus enters modal on open, returns to trigger element on close), ESC key handler (triggers Close path, not Write a response), `aria-modal="true"`, `aria-labelledby` pointing to the "Something from your past self" header text.
**Why:** Without a focus trap, keyboard users can tab behind the modal while it's open. ESC is the standard dismiss gesture for any modal. Without `aria-labelledby`, screen readers have no label for the dialog.
**Pros:** Makes the modal keyboard-accessible and screen-reader-legible at zero design cost. SyncDetailsModal has the same gap — fixing here sets a precedent.
**Cons:** ~30 min implementation. Needs `useEffect` for focus management.
**Context:** Identified during Time Layer design review (2026-03-25). The plan specifies interaction states but never mentions focus management or keyboard nav.
**Depends on:** Time Layer PR (feat/time-layer).
**Effort:** human ~30min / CC+gstack ~5min
**Completed:** feat/time-layer (2026-03-25) — aria-modal, firstFocusRef on mount, ESC keydown handler all implemented in TimeCapsuleRevealModal.tsx and SealEntryModal.tsx.

---

## Logging (feat/logging-debug — v0.7.9)

### LOG-001: Per-module log level configuration (P3)
**What:** Allow setting different verbosity per logical module (e.g., `[sync]` at `debug`, `[ai]` at `warn`). Currently a global level applies to all log output.
**Why:** Debug-level sync logs are extremely verbose and would bury unrelated debug output from other modules.
**Effort:** human ~4h / CC+gstack ~30min

### LOG-002: Log level badge / indicator (P4)
**What:** Show a small indicator in the About tab (or sidebar footer) when the log level is set to `debug` or `error` so users don't forget they changed it.
**Why:** A user who left `debug` on for a troubleshooting session has no reminder that verbose logging is still active.
**Effort:** human ~30min / CC+gstack ~5min

---

## Dev Mode / QA (feat/dev-bypass-unlock — v0.7.6)

### ~~D-DEV-001: Implement VITE_DEV_MODE=seeded~~ ✅ RESOLVED (2026-04-05)
Added `src/lib/devSeed.ts` with 5 realistic entries (moods 2–5, varied tags). `checkInitialization()` in `appStore.ts` triggers `seedDevEntries()` when `VITE_DEV_MODE=seeded`. Entries all land today (no custom `created_at` support in `create_journal_entry` — acceptable for layout/interaction testing).

---

---

## Play Store (CI / Android — v0.7.15+)

### ~~PS-001: Sign APKs with upload keystore~~ ✅ RESOLVED (2026-04-04)
Signing config wired into both `wear/build.gradle.kts` and `app/build.gradle.kts`. Keystore decoded from `ANDROID_KEYSTORE_BASE64`; passwords/alias from CI secrets. Gracefully no-ops when secrets absent.

### ~~PS-002: Switch to AAB for Play Store submission~~ ✅ RESOLVED (2026-04-04)
CI switched from `assembleDebug`/`--debug` to `bundleRelease`. Artifacts renamed `wear-aab`/`phone-aab`. `latest-release.json` updated to match.

### ~~PS-003: Add `wearApp` link to phone app/build.gradle.kts~~ ✅ RESOLVED (2026-04-04)
`wearApp(project(":wear"))` added to `app/build.gradle.kts` dependencies. Play Store now treats phone + watch apps as a linked pair.

---

## Android Wear Companion (feat/android-wear-companion-polish — v0.7.15)

### ~~WEAR-001: Enable BuildConfig generation in wear module~~ ✅ RESOLVED (2026-04-04)
Added `buildFeatures { buildConfig = true }` to `wear/build.gradle.kts`. Replaced hardcoded `"com.moodbloom.app"` in `MoodTileService.kt:118` with `BuildConfig.APPLICATION_ID`.

### ~~WEAR-002: Align phone/wear applicationId for Play Store auto-install~~ ✅ RESOLVED (2026-04-09)
`wear/build.gradle.kts` now uses `applicationId = "com.moodhaven.app"` (aligned with phone). Fixed in commit `a4ab1a7`.
**Completed:** v0.8.3.1 (2026-04-09)

### PS-004: Add checksums for Android AAB artifacts (P3)
**What:** `scripts/generate-checksums.cjs` only hashes `.AppImage`, `.exe`, `.dmg`, and `.msi`. The new `app-release.aab` and `wear-release.aab` artifacts (added in PS-002) have no integrity metadata in `latest-release.json`.
**Why:** Without checksums, the updater cannot verify AAB integrity before installation.
**Effort:** human ~10min / CC ~5min

---

## Settings Refactor (refactor/settings-page-split-and-capsule-tests — v0.7.14)

### ~~SETTINGS-001: Extract `use2FASetup` hook (P3)~~ ✅ RESOLVED (2026-04-12)
**Completed:** v0.9.3 — `src/hooks/use2FASetup.ts` extracted from `PrivacyTab.tsx`. Covers all 6 callbacks + state. 6 Vitest tests added in `use2FASetup.test.ts`.

### SETTINGS-002: `React.lazy()` tab loading (P4)
**What:** Wrap each tab import in `SettingsPage.tsx` with `React.lazy()` and add a `<Suspense fallback={null}>` wrapper around the rendered tab. Only the active tab's JS chunk is loaded on first render.
**Why:** Settings is loaded lazily already at the page level; per-tab lazy loading would be a micro-optimization. Deferred until bundle analysis shows it matters.
**Context:** Deferred from settings refactor plan (2026-04-01).
**Effort:** human ~30min / CC+gstack ~5min

---

## Web Port (feat/web-port — Phase 2+)

### WP-001: LAN sync bridge daemon (Phase 2)
**What:** Small native binary that runs on the user's machine, exposes a WebSocket, bridges mDNS discovery and TCP sync to the browser. Allows the browser version to participate in LAN sync.
**Why:** Browser has no raw TCP or mDNS access. Bridge daemon is the least-bad option for preserving the zero-knowledge LAN sync model in a browser context.
**Security requirements:** Must bind loopback-only (127.0.0.1, not 0.0.0.0). Must validate `Origin` header on every WebSocket handshake (CSWSH defense). Must require client auth token (generated at daemon start, passed to browser via URL param). Malicious websites can reach `ws://localhost:<port>` without these defenses.
**Context:** Deferred from web port plan (2026-04-04). Phase 1 ships without sync. Validate demand first.
**Effort:** human ~2w / CC+gstack ~4h

### WP-002: whisper.wasm STT in browser (Phase 2+)
**What:** Port whisper.cpp STT to run in the browser via WASM. `@nicolo-ribaudo/whisper-wasm` or compile from source. Stream audio from getUserMedia → WASM → insert at cursor.
**Why:** Deferred from Phase 1. The WASM port exists upstream but integration is non-trivial.
**Context:** Deferred from web port plan (2026-04-04).
**Effort:** human ~1w / CC+gstack ~2h

### WP-003: Delta WebDAV sync (Phase 2)
**What:** Replace full-snapshot upload with delta format (only changed entries since last sync). Currently cloudSyncService.ts uploads a complete re-encryption of all entries on every save. For 1000+ entries this is slow.
**Why:** Two P0 blockers flagged in web port eng review: (1) concurrent desktop+browser writes without ETag/If-Match will silently destroy data; (2) browser `fetch()` to WebDAV is blocked by CORS on most self-hosted servers. Phase 1 must document CORS requirements and add ETag conditional PUT before launch. The full-snapshot performance issue (slow at 1000+ entries) is the Phase 2 motivator for the delta format.
**Context:** Deferred from web port plan (2026-04-04). Needs protocol design (snapshot header + delta manifest).
**Effort:** human ~1w / CC+gstack ~2h

### WP-004: WebAuthn hardware key for browser mode (Phase 2+)
**What:** The desktop app uses native CTAP2/HID for hardware keys. The browser version should use WebAuthn (navigator.credentials.get). This is actually BETTER in browser — gets Face ID, Windows Hello, YubiKey all for free via the WebAuthn API.
**Why:** Upgrade, not workaround. Deferred from Phase 1 scope.
**Context:** Deferred from web port plan (2026-04-04).
**Effort:** human ~3d / CC+gstack ~1h

---

## Completed

### SEC-DEP-001: Upgrade vite@8 + vitest@4 (GHSA-67mh-4wv8-2f99)
**Completed:** v0.8.4 (2026-04-05) — vite 5.4.21 → 8.0.3, vitest 1.6.1 → 4.1.2. Zero vulnerabilities. esbuild CORS CVE resolved.

---

## Packaging Debt

### PKG-001: Move @types/dompurify to devDependencies
**What:** `@types/dompurify` is currently in `dependencies` (package.json:44) instead of `devDependencies`. Type-only packages should not be in production deps.
**Why:** Produces a misleading dependency graph; inflates npm audit surface area. No runtime impact (Vite tree-shakes it out).
**Fix:** `npm install --save-dev @types/dompurify && npm uninstall @types/dompurify` (effectively just move it). Verify `npm run typecheck` passes.
**Priority:** P4 (cosmetic)
**Effort:** human ~5min / CC+gstack ~5min
