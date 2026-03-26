# MoodBloom — Design & Product TODOs

> Tracked items from `/plan-design-review` and other review passes.
> Resolved items are moved to the relevant plan file or CHANGELOG.

---

## Design System

### D-001: Create DESIGN.md (design source of truth)
**What:** Run `/design-consultation` to produce `DESIGN.md` — a single document specifying MoodBloom's design system: color tokens, typography scale, spacing, motion, component vocabulary.
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

### A-12: `stt_cancel_download` not registered in `lib.rs`; download progress events never wired (P2)
**What:** The `stt_cancel_download` Tauri command exists in Rust but is never added to `generate_handler![]` in `lib.rs`, so it's unreachable from the frontend. Download progress events emitted by the Rust side are also not listened to in any frontend hook.
**Fix:** Register `commands::speech_to_text::stt_cancel_download` in `lib.rs`. Add a `listen('stt-download-progress', …)` call in `useSpeechToText` or a dedicated `useModelDownload` hook.

### A-13: `raw_transcription` DB column added but never written to (P2)
**What:** A `raw_transcription TEXT` column was added to the schema but the `create_journal_entry` / `update_journal_entry` commands never populate it. The column is always NULL.
**Fix:** Pass the raw transcript text from `useSpeechToText` through to the save path and include it in the INSERT/UPDATE SQL.

### ~~A-14: `stt_download_model` URL is attacker-controllable from the WebView — no allowlist in Rust~~ → fix/security-hardening
**What:** The download URL for Whisper models is constructed from a `model_name` parameter passed by the frontend. A compromised WebView could supply an arbitrary URL and cause the Rust sidecar to fetch from an attacker-controlled server.
**Fix:** Maintain an allowlist of valid model names in Rust, map each name to its canonical Hugging Face URL, and reject any model name not in the allowlist.

### A-15: OpenAI 401 silently falls back to local formatting without user feedback (P2)
**What:** When the OpenAI API returns 401 (invalid/revoked key), `formatTranscript` silently returns L1-formatted text with `source: 'local'`. The user believes they're using OpenAI but silently gets local quality.
**Fix:** Return an error result (e.g. `{ error: 'INVALID_KEY' }`) and surface it in the UI as an amber error on the mic button, prompting the user to update their OpenAI key in Settings.

### A-16: Ollama response body has no size limit — vulnerable to rogue server DoS (P3)
**What:** `response.json()` buffers the entire Ollama response in memory. A misconfigured or adversarial Ollama endpoint could return a 500MB body, causing OOM in the renderer process.
**Fix:** Use `response.body` with a `TransformStream` byte counter. If the body exceeds 1MB before parsing, abort the stream and fall back to L1.

---

### D-003: Spec the voice memos empty state
**What:** Define the empty-state copy and primary action for the voice memos panel in WritingView — the screen a brand-new STT user sees before their first recording.
**Why:** Voice journaling is a new behavior for MoodBloom users. Without an onboarding-style empty state, users who enable STT and see a blank panel have no signal about what to do next.
**Pros:** Converts a moment of confusion into a moment of invitation. Follows the design principle "empty states are features."
**Cons:** Requires copywriting + small component work.
**Context:** Identified during STT design review Pass 3 (user journey). The plan adds the voice memo list UI but never specifies its empty state.
**Depends on:** STT Transcript Formatting PR must ship first.
**Effort:** human ~2h / CC+gstack ~15min

---

## Time Layer (feat/time-layer)

### TL-004: Export/import does not preserve capsule columns (P1)
**What:** `import_data` calls `db::create_entry()` which only writes `(id, ec, mood, privacy_mode, location_weather, book_id)`. The four capsule columns (`sealed_until`, `capsule_type`, `linked_original_id`, `unsealed_at`) are silently dropped. A user who exports and re-imports loses all sealed/revealed capsule state.
**Fix:** Extend `import_data` to read and write the capsule columns from the JSON export payload.
**Priority:** P1 — time capsule feature is shipping in this PR; backup fidelity should follow in the next patch.
**Context:** Identified in pre-landing review of feat/time-layer (2026-03-26). Deferred to follow-up.
**Effort:** human ~1h / CC+gstack ~30min

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
