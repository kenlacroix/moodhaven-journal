# Platform Availability

MoodHaven Journal runs on four distinct surfaces. This document is the authoritative
reference for what works where.

---

## Platform Overview

| Platform | What it is | Where to get it |
|----------|-----------|-----------------|
| **Desktop** | Full Tauri app (Windows, macOS, Linux) | [Releases](https://github.com/kenlacroix/moodhaven-journal/releases) |
| **Web** | Browser app — no install required | [journal.moodhaven.app](https://journal.moodhaven.app) |
| **Android Phone** | Companion bridge (Wear OS relay) | Google Play (coming soon) |
| **Wear OS** | Watch app — voice capture + mood taps | Bundled with Android companion |

> The Android phone app is a **companion bridge**, not a standalone journal. It relays
> voice memos and mood signals from your watch to your desktop. Journaling happens on
> Desktop or Web.

---

## Feature Matrix

| Feature | Desktop | Web | Android Phone | Wear OS |
|---------|:-------:|:---:|:-------------:|:-------:|
| **Journal** | | | | |
| Write, edit, delete entries | ✅ | ✅ | — | — |
| Multiple journals (books) | ✅ | ✅ | — | — |
| Rich text formatting | ✅ | ✅ | — | — |
| Mood tracking (1–5 scale) | ✅ | ✅ | — | — |
| Timeline & calendar view | ✅ | ✅ | — | — |
| Tags | ✅ | ✅ | — | — |
| Media attachments | ✅ | ✅ | — | — |
| Pinned entries | ✅ | ✅ | — | — |
| Entry status (thinking / complete / revisit) | ✅ | ✅ | — | — |
| **Security** | | | | |
| AES-256-GCM encryption | ✅ | ✅ | — | — |
| Password + PBKDF2 (600k iterations) | ✅ | ✅ | — | — |
| 2FA (TOTP) | ✅ | ✅ | — | — |
| Hardware key (FIDO2 / YubiKey) | ✅ | — ¹ | — | — |
| Recovery key | ✅ | ✅ | — | — |
| **Sync** | | | | |
| LAN peer sync (Ed25519 + AES-GCM) | ✅ | — ² | — | — |
| WebDAV cloud sync | ✅ | ✅ | — | — |
| Export / import (.moodhaven) | ✅ | ✅ | — | — |
| **AI & Insights** | | | | |
| AI insights (mood metadata only) | ✅ | ✅ | — | — |
| Contextual writing prompts | ✅ | ✅ | — | — |
| Weekly reflection | ✅ | ✅ | — | — |
| **Speech-to-Text** | | | | |
| Whisper.cpp local transcription | ✅ | — ³ | — | — |
| Voice memo from watch | ✅ | — | relay only | ✅ (record) |
| **Health Integration** | | | | |
| Oura Ring health context | ✅ | — | — | — |
| Oura-enhanced StillHaven pace | ✅ | — | — | — |
| Mood tap from watch | ✅ (receives) | — | relay only | ✅ (send) |
| Live watch HR (StillHaven Tier B) | planned ⁴ | — | relay only | planned ⁴ |
| **StillHaven (Bilateral Sessions)** | | | | |
| Session playback (audio) | ✅ | ✅ | — | — |
| Oura bio-adaptive pace | ✅ | — | — | — |
| **Other** | | | | |
| Time capsule entries | ✅ | ✅ | — | — |
| On This Day view | ✅ | ✅ | — | — |
| Search (Ctrl+K) | ✅ | ✅ | — | — |
| Notifications / reminders | ✅ | — | — | — |
| In-app update checker | ✅ | — | — | — |

---

## Notes

**¹ Hardware key on Web:** WebAuthn (Face ID, Windows Hello, YubiKey) is possible in
the browser and would be an upgrade over the desktop CTAP2/HID approach. Tracked in
`TODOS.md` as `WP-004`.

**² LAN sync on Web:** Requires a local bridge daemon (WebSocket → mDNS/TCP). Tracked
in `TODOS.md` as `WP-001`. Not in scope until demand is validated.

**³ STT on Web:** whisper.cpp has a WASM port. Integration is non-trivial. Tracked in
`TODOS.md` as `WP-002`.

**⁴ Live watch HR (StillHaven Tier B):** Desktop plumbing is designed and documented in
`TODOS.md` as `STILL-B-001`. Blocked on watch-side Kotlin work (Wear OS Health Services
real-time HR loop). Activates automatically once the watch sends `health_snapshot` signals.

---

## Platform-specific setup notes

### Desktop
All features work after a standard install. Hardware key support requires building with
`--features hardware-key` and `libudev-dev` on Linux. See `.claude/docs/build.md`.

### Web (browser)
- Data lives in IndexedDB (not SQLite). No Rust backend.
- LAN sync and hardware keys are not available.
- WebDAV sync works if your server has CORS headers configured for `journal.moodhaven.app`.
- STT and Oura Ring require desktop.

### Android Phone
Install the companion APK to enable watch integration. The phone app does not display
journal entries — it bridges audio and signals to your desktop.

### Wear OS
- Tap the large button to start a voice memo.
- Swipe to the Mood screen to send a quick mood tap.
- Recordings appear in your desktop app under Memos for review and transcription.
