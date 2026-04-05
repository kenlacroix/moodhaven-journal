# MoodHaven Journal — Design & Product TODOs

> Tracked items from `/plan-design-review` and other review passes.
> Resolved items are moved to the relevant plan file or CHANGELOG.

---

## Website Design Debt (from design-unification autoplan review, 2026-04-04)

### DESIGN-DEBT-001: Hero background photo
**What:** The rain photo hero is blue-toned and conflicts with the violet brand after the token sweep. Replace with app screenshot, branded illustration, or violet-tinted editorial layout.
**Why:** Both CEO and Design review models flagged it as "beautiful image, weak brand" — visitors remember ambiance, not product. No screenshot exists yet so this is deferred.
**Fix options:** (a) App screenshot split-layout hero once UI stabilizes, (b) Clean cream/violet layout with no background image (CSS-only, no new assets).
**Effort:** human ~2h / CC+gstack ~30min once screenshot exists

### DESIGN-DEBT-002: Newsletter carousel on homepage
**What:** The auto-scrolling Substack carousel in HomeClient.tsx distracts from the conversion flow and has no narrative purpose on the homepage.
**Why:** Both design models flagged it. It attracts attention away from the CTAs and does not advance the purchase/usage decision.
**Fix:** Remove from homepage or demote it below product proof. Keep component, just don't render on `app/page.tsx`.
**Effort:** human ~30min / CC+gstack ~5min

### DESIGN-DEBT-003: Value props → proof-based modules
**What:** The Privacy / Calm Interface / Cross-Platform three-icon section repeats the hero mood claims without adding concrete proof.
**Why:** Codex design review: "Sections repeating same mood statement" is a hard rejection signal. Three proof-based modules would be more convincing: Privacy (local encryption details), Insight (mood tracking + AI), Availability (platforms).
**Depends on:** screenshots or feature art
**Effort:** human ~2h / CC+gstack ~30min

### DESIGN-DEBT-004: Social proof on homepage
**What:** No testimonials, user count, GitHub star count, or press mentions. Visitors have no signal the app is used by real people.
**Why:** CEO and design models both flag this as a conversion gap. A GitHub star badge is 30 minutes.
**Quick win:** Add `[![GitHub Stars](https://img.shields.io/github/stars/kenlacroix/moodhaven-journal)](...)` to the footer or above the fold.
**Effort:** human ~30min / CC+gstack ~5min

### DESIGN-DEBT-005: Pricing section on homepage
**What:** The website never states that the app is free. Visitors don't know if it's free, freemium, or subscription.
**Why:** Flagged by both CEO models. "Free to download. Pro for AI and cloud." is one line that converts.
**Effort:** human ~30min / CC+gstack ~5min (part of a hero or FAQ update)

---

## Design System

### D-001: Create DESIGN.md (design source of truth)
**What:** Run `/design-consultation` to produce `DESIGN.md` — a single document specifying MoodHaven Journal's design system: color tokens, typography scale, spacing, motion, component vocabulary.
**Why:** Every design review currently infers conventions by grepping the codebase. Without a stated system, reviewers guess, engineers guess, and visual inconsistency accumulates silently.
**Pros:** All future `/plan-design-review` and `/design-review` passes become significantly more precise. New contributors have a reference. AI-assisted UI work is better calibrated.
**Cons:** Takes ~30 min with `/design-consultation`; may surface existing inconsistencies that feel like new work.
**Context:** Flagged during STT Transcript Formatting design review (2026-03-21). No DESIGN.md has ever existed in this repo.
**Depends on:** None — run `/design-consultation` at any time.
**Effort:** human ~4h / CC+gstack ~30min

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

### A-16: Ollama response body has no size limit — vulnerable to rogue server DoS (P3)
**What:** `response.json()` buffers the entire Ollama response in memory. A misconfigured or adversarial Ollama endpoint could return a 500MB body, causing OOM in the renderer process.
**Fix:** Use `response.body` with a `TransformStream` byte counter. If the body exceeds 1MB before parsing, abort the stream and fall back to L1.

---

### D-003: Spec the voice memos empty state
**What:** Define the empty-state copy and primary action for the voice memos panel in WritingView — the screen a brand-new STT user sees before their first recording.
**Why:** Voice journaling is a new behavior for MoodHaven Journal users. Without an onboarding-style empty state, users who enable STT and see a blank panel have no signal about what to do next.
**Pros:** Converts a moment of confusion into a moment of invitation. Follows the design principle "empty states are features."
**Cons:** Requires copywriting + small component work.
**Context:** Identified during STT design review Pass 3 (user journey). The plan adds the voice memo list UI but never specifies its empty state.
**Depends on:** STT Transcript Formatting PR must ship first.
**Effort:** human ~2h / CC+gstack ~15min

---

## Time Layer (feat/time-layer)

### ~~TL-005: get_due_capsules On-This-Day exclusion uses UTC not local date~~ ✅ RESOLVED 2026-04-04
**Fix:** `get_due_capsules` now accepts an optional `local_date: Option<String>` (YYYY-MM-DD). Frontend `getDueCapsules()` passes `new Date().toLocaleDateString('en-CA')`. Falls back to `date('now')` when not provided.

### TL-006: Anniversary entries visible in timeline before reveal (P2)
**What:** Anniversary entries (capsule_type IS NULL, sealed_until IS NULL) have `encrypted_content` populated and appear in the timeline like normal entries — they are not hidden. Clarify product intent: should anniversary entries be hidden until the reveal modal triggers, or just highlighted?
**Context:** Adversarial review of feat/time-layer (2026-03-26).
**Effort:** product decision first, then ~30min CC

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

### D-DEV-001: Implement VITE_DEV_MODE=seeded (P2)
**What:** When `VITE_DEV_MODE=seeded`, create 3–5 encrypted journal entries with realistic mood data using the dev password (`'dev-bypass'`), then call `refresh()` on journal hooks so the UI starts with populated data. Useful for testing Timeline, Insights, Calendar, and On This Day views without manual data entry.
**Fix:** Add `src/lib/devSeed.ts` module. Call it after the bypass state is set in `checkInitialization()`, guarded by `import.meta.env.VITE_DEV_MODE === 'seeded'`.
**Context:** Deferred from feat/dev-bypass-unlock plan (2026-03-26). "bypass" mode shipped; "seeded" needs seed data design.
**Effort:** human ~2h / CC+gstack ~20min

---

---

## Play Store (CI / Android — v0.7.15+)

### PS-001: Sign APKs with upload keystore (P2)
**What:** Generate a release keystore once, store as `ANDROID_KEYSTORE_BASE64` + `ANDROID_KEY_ALIAS` + `ANDROID_KEY_PASSWORD` GitHub secrets, wire signing config into both `wear/build.gradle.kts` and `app/build.gradle.kts`. Swap `assembleDebug` / `--debug` for `assembleRelease` / (no flag) in CI.
**Why:** Play Store requires consistently signed APKs/AABs. Debug-signed builds can only be sideloaded.
**Effort:** human ~1h / CC ~15min

### PS-002: Switch to AAB for Play Store submission (P2)
**What:** Replace `assembleRelease` with `bundleRelease` (Gradle) and `--debug` removal with no flag (Tauri CLI) in CI. Output is `.aab` instead of `.apk`.
**Why:** Play Store requires Android App Bundle (AAB) format, not APK, for new apps since 2021.
**Effort:** human ~15min / CC ~5min

### PS-003: Add `wearApp { uses ':wear' }` to phone app/build.gradle.kts (P2)
**What:** Add the following inside the `dependencies {}` block of `src-tauri/gen/android/app/build.gradle.kts`:
```kotlin
wearApp(project(":wear"))
```
**Why:** This is what makes the Play Store treat the phone and watch apps as a linked pair — the watch app auto-installs when the phone app is installed. Without it they are independent unlinked listings.
**Effort:** human ~5min / CC ~2min

---

## Android Wear Companion (feat/android-wear-companion-polish — v0.7.15)

### WEAR-001: Enable BuildConfig generation in wear module (P3)
**What:** Add `buildFeatures { buildConfig = true }` to `src-tauri/gen/android/wear/build.gradle.kts` and replace the hardcoded `"com.moodbloom.app"` string in `MoodTileService.kt` with `BuildConfig.APPLICATION_ID`.
**Why:** `MoodTileService.kt:118` currently has a hardcoded `setPackageName("com.moodbloom.app")` string. If the app's `applicationId` ever changes, this silently breaks tile launch without a compile error. `BuildConfig` is the safe derived constant.
**Context:** Attempted during companion polish pass (2026-04-02) but BuildConfig generation is not enabled in the wear module's `build.gradle.kts`, causing an unresolved reference. Deferred — the hardcoded value matches the actual applicationId in `build.gradle.kts`.
**Effort:** human ~15min / CC+gstack ~5min

---

## Settings Refactor (refactor/settings-page-split-and-capsule-tests — v0.7.14)

### SETTINGS-001: Extract `use2FASetup` hook (P3)
**What:** Extract the 2FA state machine from `PrivacyTab.tsx` into a `src/hooks/use2FASetup.ts` hook. Covers: `show2FASetup`, `showBackupCodes`, `backupCodes`, `isDisabling2FA`, `showDisable2FAConfirm`, and all 6 associated callbacks.
**Why:** PrivacyTab is currently the largest tab component (~523 lines). The 2FA state block is self-contained and reusable if a dedicated Security page is ever added.
**Context:** Deferred from settings refactor plan (2026-04-01). Acceptable as-is since it doesn't affect DX or UX. Extract when PrivacyTab next needs modification.
**Effort:** human ~1h / CC+gstack ~10min

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
