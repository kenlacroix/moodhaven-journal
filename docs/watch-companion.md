# MoodHaven Journal Watch Companion

> **Status:** Phases 1–5 and D complete. Phone companion brand aligned with MoodHaven design system.
> **Platform:** Wear OS (Android) + Android phone companion

---

## What Is the Watch Companion?

The MoodHaven Journal watch companion is a Wear OS app that acts as a **voice journaling assistant on your wrist**. Its primary purpose is to let you capture a voice reflection quickly — before the thought fades — and have it waiting in MoodHaven Journal on your desktop when you sit down to write.

**What the watch does:**
- Records voice memos (up to 10 minutes, 16 kHz mono AAC-LC)
- Lets you tag the recording with a quick mood tap
- Transfers the audio to your phone over the Wear OS ChannelAPI
- Optionally captures health context (heart rate, activity) at the time of recording

**What the watch does NOT do:**
- Store journal entries itself
- Connect to any cloud service
- Send audio anywhere except your paired phone

---

## Architecture

```
Watch (Wear OS)
    │
    │  1. Tap to record → tap to stop
    │  2. Audio: 16 kHz mono AAC-LC (≤10 min, ≈2.4 MB max)
    │  3. Optional: mood tap (emoji) sent via MessageAPI
    │  4. Audio: 4-byte-header ChannelAPI transfer
    │  5. AudioQueue: persist-and-retry if phone out of range
    │
    ▼
Android Phone (WearListenerService)
    │
    │  6. Receives ChannelAPI transfer
    │  7. WearPlugin: foreground ChannelCallback + bridgeVoiceMemo()
    │  8. File written to {app_data}/voice_memos_incoming/
    │  9. Intent broadcast to Tauri WebView
    │
    ▼
MoodHaven Journal Desktop App (or Tauri on Android, future)
    │
    │  10. useWearVoiceMemos hook picks up incoming file
    │  11. store_voice_memo command: moves file to permanent storage,
    │       attaches health context, creates voice_memos DB record
    │  12. transcribe_voice_memo: whisper.cpp sidecar → text
    │  13. User reviews transcription, edits, creates journal entry
    │  14. link_voice_memo_to_entry: associates memo with entry
```

**Privacy:** Audio never leaves your devices. There is no upload step. The phone is the only intermediary. Whisper.cpp transcription happens locally on the desktop — no cloud speech API.

---

## Watch App Screens

### Record Screen

The main screen. Tap the large button to start recording, tap again to stop.

- A circular arc fills over 10 minutes (turns amber at 8 min, red at 9:30 min).
- Timer shows elapsed recording time inside the button.
- Bottom row: shortcuts to Mood tap and Breathe screens.
- On stop: file queued for transfer; "✓ Sent" confirmation shown.
- Long-press the button while recording to discard without saving.

### Mood Tap Screen

Four emoji mood options. Tapping one sends a mood signal to MoodHaven Journal via MessageAPI. The signal is stored in the `signals` table and can be linked to a journal entry later.

### Breathe Screen *(Phase 2)*

Guided breathing exercise with an expanding/contracting animation. Helps settle before a voice reflection.

### History Screen *(Phase 2)*

Shows recent voice memos transferred to the phone, with transfer status and optional transcription preview.

---

## Data Flow: Audio Transfer

The watch uses the Wear OS **ChannelAPI** for reliable audio transfer:

1. Watch opens a channel: `channel = channelClient.openChannel(nodeId, "/audio_transfer")`
2. A 4-byte big-endian header is sent first: `[0x4D, 0x42, duration_ms_as_2_bytes]` (MB magic + duration)
3. Audio bytes follow.
4. Channel closes when transfer completes.
5. If the phone is out of range, `AudioQueue` persists the file and retries when the node reconnects.

The phone side (`WearListenerService`) listens for `CHANNEL_EVENT` intents, reads the header, writes the audio to `voice_memos_incoming/`, and broadcasts an intent so the Tauri app can process it.

---

## Data Flow: Mood Signals

Quick mood taps are sent via the Wear OS **MessageAPI** (lower latency, no guarantee):

1. Watch: `messageClient.sendMessage(nodeId, "/signal", payload_bytes)`
2. Phone: `WearListenerService` receives `MESSAGE_RECEIVED` intent, extracts payload
3. Desktop: `create_signal` Tauri command creates a `signals` record with `source = 'wear_os'`, `signal_type = 'mood_tap'`
4. Later, `link_signal_to_entry` can associate the signal with a journal entry

---

## Desktop Integration (Tauri)

### Incoming Voice Memos

The `useWearVoiceMemos` hook handles the full lifecycle:

```typescript
// Listens for new files in voice_memos_incoming/
// Calls store_voice_memo → moves file → creates DB record
// Triggers transcribe_voice_memo (async, whisper.cpp)
// Notifies user that a new memo is ready to review
```

### Voice Memo List

Voice memos appear in a dedicated section of the Writing view (or a future Memos view). Each shows:
- Recording timestamp and duration
- Transcription (when complete) or "Transcribing…" spinner
- "Create Entry" button — pre-fills the journal with the transcription text
- Delete button

### Tauri Commands Used

| Command | Purpose |
|:---|:---|
| `store_voice_memo` | Move incoming file to permanent storage, create DB record |
| `list_voice_memos` | List memos awaiting review |
| `get_voice_memo` | Get a single memo by ID |
| `delete_voice_memo` | Delete memo and audio file |
| `patch_voice_memo_transcription` | Update transcription text after STT |
| `patch_voice_memo_context` | Attach biometric context (hr, steps, activity) after transcription |
| `patch_voice_memo_mood` | Set inferred mood after `scoreContentMood` runs |
| `list_pending_drafts` | List memos ready to review in the draft pipeline |
| `publish_voice_memo_draft` | Create a journal entry from a draft; mark memo reviewed |
| `discard_voice_memo_draft` | Discard a draft without creating an entry |
| `link_voice_memo_to_entry` | Associate memo with a created journal entry |
| `transcribe_voice_memo` | Run whisper.cpp sidecar on the audio file |
| `create_signal` | Store a mood tap or health snapshot from the watch |
| `list_entry_signals` | Get signals linked to an entry |

---

## Health Context

At the time of recording, the watch captures a health snapshot — heart rate, step count delta, and coarse activity classification (`still` / `walking` / `running`) — and attaches it to the voice memo as `health_json`. The `HealthSnapshot` schema (v1.2.0+) is: `{ hr?: number, steps?: number, activity?: 'still' | 'walking' | 'running' }`. This context is:

- Stored unencrypted alongside the memo metadata (not in journal content).
- Optionally surfaced in the Writing view as a badge (same as Oura Ring context).
- **Never sent to any AI.** Only qualitative descriptors (e.g., "active day") are used in AI prompt generation.

---

## Roadmap

| Phase | Status | Summary |
|:---|:---|:---|
| 1 — Core Recording | ✅ Complete | Recording UI, AudioQueue, ChannelAPI transfer, desktop receipt |
| 2 — UX Polish | ✅ Complete (2e) | Record arc, shortcut row (Mood/Breathe), ambient mood wash, double-tap haptic, fade+scale PageTransformer |
| B — Brand Sweep | ✅ Complete | 60+ hardcoded hex literals replaced with `@color/` references; 13 named color entries added |
| C — Splash Screen | ✅ Complete | `Theme.MoodHaven.Splash` using `androidx.core:core-splashscreen`; OLED-black background |
| 5a — HealthSnapshot | ✅ Complete | Steps delta + coarse activity classification added to `HealthSnapshot.capture()` |
| 5 — Draft Pipeline | ✅ Complete | Desktop voice memo draft cards in Timeline; `VoiceMemoDraftCard`, `VoiceDraftEditor`, `useVoiceMemoDrafts`, 5 new Tauri commands |
| D — Phone Brand | ✅ Complete | Phone companion app name, colors, theme, and splash screen aligned with MoodHaven design system; `androidx.core:core-splashscreen` added |
| 3 — Phone Integration | Upcoming | Journal creation from watch, sync status display on watch |
| 4 — Deep Integration | Upcoming | Watch-side entry preview, mood correlation, activity badges |

---

## Setup

> The watch companion requires a paired Android phone with the MoodHaven Journal bridge app installed. Phase 2 (UX Polish) and the voice memo draft pipeline (Phase 5) are available in v1.2.0.

**Requirements:**
- Wear OS 3.0+ watch
- Android 11+ phone with Bluetooth pairing to the watch
- MoodHaven Journal desktop app v1.2.0+

**To set up:**
1. Install the MoodHaven Journal companion APK on your phone.
2. Install the MoodHaven Journal watch APK on your watch.
3. Open MoodHaven Journal on your desktop and connect via Settings → Devices.
4. On the watch, tap the record button to begin.
