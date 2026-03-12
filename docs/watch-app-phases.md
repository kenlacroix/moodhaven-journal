# MoodBloom Watch App — Voice-First Roadmap

> Watch role: voice capture assistant that records reflections, enriches them with
> biometric/activity context, and feeds encrypted audio into MoodBloom journals on
> phone or desktop. Mood taps are secondary; voice journaling is the primary value.

---

## Phase 1 — Core Recording + Signals ✅ COMPLETE

**Goal:** Working watch app with recording UI and mood tap pipeline.

### Delivered
- `RecordFragment`: tap-to-record / tap-to-stop with pulse animation, timer, long-press discard
- `RecordingSession`: 16 kHz mono AAC-LC, 10-minute limit (~2.4 MB max)
- `AudioTransferService`: ChannelAPI transfer with 4-byte-header wire protocol
- `AudioQueue`: persist-and-retry for when phone is out of range
- `MoodPickerScreen` / `SignalSender`: emoji mood tap → `/signal` MessageAPI → phone
- `WearListenerService` (phone): `MESSAGE_RECEIVED` + `CHANNEL_EVENT` intent filters
- `WearPlugin` (phone): foreground `ChannelClient.ChannelCallback` + `bridgeVoiceMemo()`
- End-to-end pipeline verified: watch "✓ Sent" → file in `voice_memos_incoming/` → Tauri event emitted

---

## Phase 2 — Phone-Side Transcription ← NEXT

**Goal:** Convert incoming `.m4a` files to text using whisper.cpp on the phone.

### What needs building

#### 2a. whisper.cpp sidecar (already scaffolded in CLAUDE.md)
- `whisper-cli` is the target binary; cross-compile for `aarch64-linux-android`
- Bundle via `tauri.conf.json` → `bundle.externalBin` as a Tauri sidecar
- Model download: on-demand from HuggingFace (`ggml-tiny.en.bin` ~75 MB default)
- Model stored in `app_data_dir/models/`; download progress shown in Settings

#### 2b. Tauri Rust command: `transcribe_voice_memo`
```rust
// src-tauri/src/commands/voice_memo.rs
#[tauri::command]
async fn transcribe_voice_memo(
    file_name: String,  // filename in voice_memos_incoming/
    model: String,      // e.g. "ggml-tiny.en.bin"
) -> Result<String, String>
// Invokes whisper-cli sidecar, returns transcribed text
```

#### 2c. TypeScript `useWearVoiceMemos` hook
- Listens for `wear://voice_memo` Tauri event
- Calls `transcribe_voice_memo` command
- Stores result (text + metadata) pending user review
- Cleans up the `.m4a` from `voice_memos_incoming/` after successful transcription

#### 2d. Watch feedback
- On transcription complete, phone sends `/feedback` message back to watch
- Watch shows "✓ Transcribed" status (already has feedback infrastructure)

### Acceptance criteria
- [ ] Record on watch → text appears in phone app within 30 seconds
- [ ] Transcription survives app restart (queued if app was in background)
- [ ] Failed transcription is retried; original audio is preserved
- [ ] Model download shows progress in Settings → Speech to Text

---

## Phase 3 — Metadata Enrichment

**Goal:** Attach HR, HRV, steps, and location snapshot to each recording.

### What needs building

#### 3a. Richer `HealthSnapshot` on watch
- Already captures HR/HRV via `HealthSnapshot.capture()` — verify fields
- Add: steps in last hour (Health Services API)
- Add: current activity type (WALKING, RUNNING, STATIONARY)
- Health data attached to `AudioQueue.PendingAudio.healthJson`

#### 3b. Location from phone (not watch)
- Watch sends recording; phone captures location at receive time
- Use existing `locationWeatherService.captureLocationWeather()` on phone side
- Attach to transcription metadata before creating draft entry

#### 3c. Context summary in draft
- Build a human-readable summary string:
  `"Recorded at 9:42 AM · HR 72 · Walking · Near Downtown"`
- Stored as `context_summary` on the voice memo / draft entry

### Acceptance criteria
- [ ] HR and steps appear on draft entries created from voice memos
- [ ] Location/weather attached when phone has location enabled
- [ ] Privacy mode: if Privacy Mode is `Private`, no location captured

---

## Phase 4 — Draft Journal Entries

**Goal:** Transcription + metadata → draft journal entry the user can review and publish.

### What needs building

#### 4a. `voice_memo_drafts` SQLite table (or `draft` flag on `journal_entries`)
```sql
-- Option A: draft flag on existing table
ALTER TABLE journal_entries ADD COLUMN is_draft INTEGER NOT NULL DEFAULT 0;
ALTER TABLE journal_entries ADD COLUMN source TEXT;  -- 'watch_voice', 'manual', etc.

-- Option B: separate drafts table (preferred — keeps timeline clean)
CREATE TABLE voice_memo_drafts (
    id          TEXT PRIMARY KEY,
    created_at  TEXT NOT NULL,
    audio_file  TEXT,           -- null after cleanup
    duration_ms INTEGER,
    transcript  TEXT,           -- encrypted
    health_json TEXT,           -- HR, HRV, steps
    context     TEXT,           -- human-readable summary
    mood        INTEGER,        -- inferred or null
    book_id     TEXT DEFAULT 'default',
    reviewed    INTEGER DEFAULT 0
);
```

#### 4b. Drafts UI on phone
- "Voice Drafts" section in Timeline or Writing view
- Shows transcript preview, duration, health context
- Tap to open in editor (pre-filled with transcript)
- User can edit, assign mood, pick book, then publish
- Published draft → standard `journal_entries` row; draft row deleted

#### 4c. Watch badge
- After publish, send `/feedback` to watch with entry count
- Watch shows "3 drafts pending" badge in `RecordFragment`

### Acceptance criteria
- [ ] Voice memo creates draft visible in phone app
- [ ] Draft can be edited and published as a real journal entry
- [ ] Published draft appears in Timeline with `source: 'watch_voice'` badge
- [ ] Draft is not visible in Timeline until published

---

## Phase 5 — AI Enrichment + Smart Features

**Goal:** Use transcription + metadata for AI insights, prompts, and smart notifications.

### What needs building

#### 5a. Mood inference from transcript
- Local sentiment scoring (extend `metadataExtractor.ts`)
- Pre-fill mood ring on draft based on inferred sentiment
- User can override before publishing

#### 5b. Auto-tag suggestions
- Extract keywords/topics from transcript locally
- Suggest 2–3 hashtags on draft editor
- Uses existing hashtag auto-extraction infrastructure

#### 5c. AI enrichment (opt-in)
- If AI is enabled: send transcript metadata (not raw text) to AI for insight
- Generate a short reflection prompt: "Your recording mentions feeling rushed —
  would you like to explore what's driving that?"
- Surfaced in Insights view under "From your recordings"

#### 5d. Smart prompts (watch notification)
- If HR elevated for 30+ min (via periodic Health Services snapshot): push notification
  "Your HR has been elevated — want to record a note?"
- Tapping notification opens `RecordFragment` directly

#### 5e. Playback on watch
- `RecordFragment` or new fragment: list recent recordings (from `AudioQueue` + local cache)
- Tap to play back via `MediaPlayer`
- Limited to last 3 recordings to keep storage bounded

#### 5f. Weekly summary notification
- Every Sunday: notification summarising week's recordings
  "You made 5 voice entries this week (avg HR 68, mood trend: improving)"

### Acceptance criteria
- [ ] Draft mood pre-filled from sentiment inference (overridable)
- [ ] At least 2 tag suggestions appear on draft editor
- [ ] Smart prompt notification fires correctly on elevated HR (opt-in)
- [ ] Playback works for recordings still in watch cache

---

## Technical Notes

### Wire protocol (unchanged)
```
[4 bytes BE int] = metadata JSON length
[N bytes]        = metadata JSON (UTF-8)
[remaining]      = raw .m4a audio bytes
```

### File lifecycle
```
Watch cacheDir/*.m4a
  → ChannelAPI transfer
  → phone filesDir/voice_memos_incoming/<id>.m4a
  → transcribed → voice_memo_drafts table
  → .m4a deleted from incoming dir
  → draft published → journal_entries row
```

### Key files
| File | Purpose |
|------|---------|
| `wear/.../RecordingSession.kt` | Recording with 10-min limit |
| `wear/.../AudioTransferService.kt` | ChannelAPI send |
| `wear/.../AudioQueue.kt` | Offline queue |
| `app/.../WearListenerService.kt` | Phone receive (background) |
| `app/.../WearPlugin.kt` | Phone receive (foreground) + Tauri bridge |
| `src-tauri/src/commands/voice_memo.rs` | whisper.cpp sidecar (Phase 2) |
| `src/hooks/useWearVoiceMemos.ts` | TypeScript consumer (Phase 2) |
