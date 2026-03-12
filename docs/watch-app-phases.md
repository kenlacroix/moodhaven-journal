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
- `MoodPickerFragment` / `SignalSender`: emoji mood tap → `/signal` MessageAPI → phone
- `WearListenerService` (phone): `MESSAGE_RECEIVED` + `CHANNEL_EVENT` intent filters
- `WearPlugin` (phone): foreground `ChannelClient.ChannelCallback` + `bridgeVoiceMemo()`
- End-to-end pipeline verified: watch "✓ Sent" → file in `voice_memos_incoming/` → Tauri event emitted

---

## Phase 2 — Watch Polish Sprint ← NEXT

**Goal:** High-polish watch UX before any phone integration work. Fixes rough edges
on all 4 existing pages, adds the Breathe page, and reshapes navigation.

---

### 2a. Record Screen Polish

#### Current issues
- 10-minute limit is invisible; recording can feel open-ended
- `quickMoodBtn` (😊 in bottom-right) looks like a random orphaned emoji
- Status text is plain; no warm tone during long recordings

#### Changes

**Progress arc** — circular arc around the record button edge fills over 10 minutes.
Turns amber at 8 min, red at 9:30 min. Subtle, always visible while recording.

```
╔════════════════════╗
║   ● ● ●  (dots)    ║
║                    ║
║  ╭───────────╮     ║
║  │ ████░░░░░ │     ║  ← arc fills clockwise (8% = 48s)
║  │     ⏹     │     ║  ← big stop icon while recording
║  │  2:18     │     ║  ← timer inside button
║  ╰───────────╯     ║
║                    ║
║  Recording…        ║
║  ────────────────  ║
║  😊 Mood  🧘 Breathe ║  ← replace orphan emoji with labeled row
╚════════════════════╝
```

**Idle state:**
```
╔════════════════════╗
║   ● ● ●  (dots)    ║
║                    ║
║  ╭───────────╮     ║
║  │    🎙      │     ║
║  │  Tap to   │     ║
║  │  record   │     ║
║  ╰───────────╯     ║
║                    ║
║  ● 1 queued        ║  ← only shown if queue > 0
║  ────────────────  ║
║  😊 Mood  🧘 Breathe ║
╚════════════════════╝
```

**Key code changes:**
- `RecordFragment`: draw arc with `Canvas` / `ObjectAnimator` on a custom `ArcProgressView`
- Replace `quickMoodBtn` (single emoji) with a 2-button row: `[😊 Mood]  [🧘 Breathe]`
- `[🧘 Breathe]` navigates to `PAGE_BREATHE` (new page 4, see 2d)
- Long-press hint auto-hides after 2 s (already done); add haptic on auto-stop

---

### 2b. Mood Picker Polish

Current state is already good (wheel scroll, scale+fade, circular gesture). Polish items:

- **Background colour shift**: full-screen background colour transitions to the focused mood's
  colour at 15% opacity as you scroll — gives an ambient tint without harsh contrast
- **Label above wheel**: small label `"How are you?"` fades out once you start scrolling
  (opacity tied to scroll velocity)
- **Confirmation haptic sequence**: two quick taps on send (not one flat buzz)
- **Sent badge on mood items**: most recently sent mood shows a subtle `✓` badge,
  so you know what you last logged without going to History
- **Queue badge position**: move `"● 3 queued"` to top edge (current bottom placement
  can overlap the wheel on smaller displays)

```
╔════════════════════╗   ← background: mood colour @ 15% opacity
║   ● ● ●  (dots)    ║
║                    ║
║   How are you?     ║   ← fades as you scroll
║  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  ║
║       😫  0.5×     ║   ← faded, small (edge)
║      😔   0.7×     ║
║  ▶ 😐  Neutral  1× ║   ← center: full size, bright
║      😊   0.7×     ║
║       😄  0.5×     ║   ← faded, small
╚════════════════════╝
```

---

### 2c. Sync / Connection Screen Polish

Current: connection dot + status text + queue count + retry button.
Missing: rich context that tells you something *useful* at a glance.

```
╔════════════════════╗
║   ● ● ●  (dots)    ║
║                    ║
║  🟢  Pixel 9       ║   ← green/red dot + device name
║  Connected         ║
║  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  ║
║  📼  3 recordings  ║   ← today's voice memo count
║  ⏱  Last sync 4m  ║   ← time since last successful transfer
║  📦  0 queued      ║   ← pending offline items
║  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  ║
║     ↑ Sync now     ║   ← only shown if queue > 0
╚════════════════════╝
```

**Key code changes:**
- `SyncFragment`: add today's recording count (read `AudioQueue` + local pref counter)
- Add last-sync timestamp (store in SharedPrefs after each successful transfer)
- Show voice memo queue count separately from mood signal queue
- Distinguish "recordings synced today" (new stat) from "pending" (existing)

---

### 2d. Navigation Restructure (5 pages)

Add Breathe as page 4 (rightmost). Sync moves to be accessible but not prime real estate.

```
← History  |  Record  |  Mood  |  Breathe  |  Sync →
              (default)
```

Dot indicators update to 5 dots. `MainActivity` adapter updated to 5 pages.
`RecordFragment` bottom row: `[😊 Mood]` navigates left, `[🧘 Breathe]` navigates right.

---

### 2e. Global Polish

- **Watch face ambient colour**: use the dominant mood colour of the last entry as a
  faint background wash on the Record page (replaces flat black)
- **Transition animations**: use `ViewPager2` with a custom `PageTransformer` that adds a
  subtle fade+scale instead of hard horizontal slides
- **Typography**: increase time/status text to use `@style/TextAppearance.Wear.Large`
  where appropriate — easier to read during activity
- **Empty states**: History page empty state gets an illustration and a nudge to Record

---

## Phase 3 — Breathing & Meditation Feature

**Goal:** A guided breathing session with animated visual, haptic rhythm, optional HR
capture before/after, and a post-session summary. Accessible from Breathe page.

---

### Screens

#### 3a. Mode Selector — BreatheFragment (page 4)

Scrollable `WearableRecyclerView` with pill items using the same `WheelLayoutCallback`
as the mood picker. 6 modes with the same scale+fade drum-roll effect.

```
╔════════════════════╗
║  🧘 Breathe         ║
║  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  ║
║    ────────────    ║   ← faded small (edge)
║   │  🌙 Unwind  │  ║
║  ▶│  🎯 Focus   │  ║   ← centered, full size
║   │  ⚡ Energize│  ║
║    ────────────    ║   ← faded small (edge)
╚════════════════════╝
```

Full mode list (scroll order — calmest → most activating):
1. 🌙 Unwind   (4-7-8 breathing, pre-sleep)
2. 🌿 Restore  (4-0-7, deep recovery)
3. 😌 Relax    (4-1-6, anxiety relief)
4. ⚖️ Balance  (4-4-4-4 box, reset)
5. 🎯 Focus    (4-2-4, clarity)
6. ⚡ Energize (3-0-2, alertness)

Tapping a mode navigates to the Mode Detail screen.

---

#### 3b. Mode Detail Screen — BreatheModeDetailActivity

Matches the Balance app reference: title, description, cycle count adjuster, Play button.

```
╔════════════════════╗
║   ⚖️ Balance        ║   ← mode name
║                    ║
║  Box breathing     ║   ← short description (1 line)
║  Clears mental     ║
║  fog & resets      ║
║  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  ║
║  4 · 4 · 4 · 4     ║   ← pattern: in · hold · out · hold (seconds)
║  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  ║
║      8 cycles      ║   ← about 3 min 12 sec
║    −         +     ║   ← decrement / increment cycles
║  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  ║
║     ▶  Begin       ║   ← large play button
╚════════════════════╝
```

- Cycles convert to approximate time shown below the adjuster: `~3 min 12 sec`
- Min cycles: 3 (any mode); Max: 20
- Tapping Begin → captures resting HR snapshot (1-second capture, non-blocking)
  then navigates to the Active Session screen

---

#### 3c. Active Session Screen — BreatheSessionActivity

Full-screen immersive. Black background. Single animated ring.

```
╔════════════════════╗
║                    ║
║     Inhale…        ║   ← phase label (large, centred)
║                    ║
║   ╭─────────────╮  ║
║  ╱               ╲ ║
║ │    ○ ○ ○ ○ ○   │ ║   ← progress dots (cycle x/total)
║ │      ╭───╮     │ ║
║ │      │ 4 │     │ ║   ← countdown seconds
║ │      ╰───╯     │ ║
║  ╲               ╱ ║
║   ╰─────────────╯  ║   ← ring pulses out (inhale) / in (exhale)
║                    ║
║       cycle 2/8    ║   ← small, bottom
╚════════════════════╝
```

**Ring animation:**
- `Inhale`: ring radius expands from 40% → 90% of screen over inhale seconds
- `Hold`: ring holds at 90%, subtle slow pulse (±2%)
- `Exhale`: ring contracts from 90% → 40% over exhale seconds
- `Hold`: ring holds at 40%, subtle slow pulse
- Colour: soft violet `#C4B5FD` for all modes except Energize (amber `#FBBF24`)

**Haptics (VibratorManager):**
- Start of inhale: 1× short tap (20ms)
- Start of hold: nothing (silence = cue)
- Start of exhale: 2× gentle taps 80ms apart
- Start of final hold: nothing
- Cycle complete: 1× medium tap (40ms)
- Session complete: long vibration pattern (celebration)

**Crown / bezel:** rotating crown skips to next phase early (for users who find pacing too slow)

**Early exit:** tap anywhere → pause overlay with `[Resume]` `[End session]`

---

#### 3d. Session Summary Screen — shown after all cycles complete

```
╔════════════════════╗
║  ✓ Session done    ║
║                    ║
║  ⚖️ Balance  8×    ║   ← mode + cycles completed
║  3 min 12 sec      ║   ← actual elapsed time
║                    ║
║  HR before:  78    ║   ← from pre-session snapshot
║  HR after:   64    ║
║  ↓ 14 bpm          ║   ← delta highlighted
║                    ║
║  [ Record a note ] ║   ← optional — navigates to RecordFragment
║  [ Done ]          ║
╚════════════════════╝
```

- HR delta shown only when both snapshots succeeded
- "Record a note" navigates to Record page and pre-fills status "Post Breathe · Balance"
- Auto-dismisses to Record page after 6 seconds if no interaction

---

### Breathing mode parameters

| Mode     | Emoji | In | H1 | Out | H2 | Default cycles | ~Time   |
|----------|-------|----|----|----|-----|----------------|---------|
| Unwind   | 🌙    | 4  | 7  | 8  | 0  | 4              | ~3 min  |
| Restore  | 🌿    | 4  | 0  | 7  | 0  | 10             | ~3 min  |
| Relax    | 😌    | 4  | 1  | 6  | 0  | 12             | ~3 min  |
| Balance  | ⚖️    | 4  | 4  | 4  | 4  | 8              | ~3 min  |
| Focus    | 🎯    | 4  | 2  | 4  | 0  | 12             | ~3 min  |
| Energize | ⚡    | 3  | 0  | 2  | 0  | 18             | ~2 min  |

All default to roughly 2–3 minutes to respect watch session norms.

---

### Adaptive suggestions (HR-based)

After returning to the watch app, if a recent HR reading is available from
`HealthSnapshot`, the mode selector shows a subtle suggestion chip:

```
╔════════════════════╗
║  🧘 Breathe         ║
║  💛 HR 94 · Try     ║   ← suggestion based on elevated HR
║     😌 Relax        ║
║  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  ║
║  ...mode list...   ║
╚════════════════════╝
```

Rules:
- HR > 90 → suggest Relax
- HR 80–90 (+ evening hour) → suggest Unwind
- HR < 60 (+ midday) → suggest Energize
- Default (no recent HR) → no suggestion chip

---

### Key new files

| File | Purpose |
|------|---------|
| `wear/.../BreatheFragment.kt` | Mode picker page (page 4) |
| `wear/.../BreatheModeDetailActivity.kt` | Cycle adjuster + Begin |
| `wear/.../BreatheSessionActivity.kt` | Full-screen animation + haptics |
| `wear/.../BreatheSummaryActivity.kt` | Post-session HR summary |
| `wear/.../BreathingMode.kt` | Data class + 6 mode definitions |
| `wear/.../ArcProgressView.kt` | Custom canvas view for ring animation |
| `wear/res/layout/fragment_breathe.xml` | Mode picker layout |
| `wear/res/layout/activity_breathe_detail.xml` | Detail screen layout |
| `wear/res/layout/activity_breathe_session.xml` | Session layout |
| `wear/res/layout/activity_breathe_summary.xml` | Summary layout |

---

## Phase 4 — Phone-Side Transcription

**Goal:** Convert incoming `.m4a` files to text using whisper.cpp on the phone.

### What needs building

#### 4a. whisper.cpp sidecar (already scaffolded in CLAUDE.md)
- `whisper-cli` cross-compiled for `aarch64-linux-android` as a Tauri sidecar
- Model download: on-demand from HuggingFace (`ggml-tiny.en.bin` ~75 MB default)
- Model stored in `app_data_dir/models/`; Settings → Speech to Text shows progress

#### 4b. Tauri Rust command: `transcribe_voice_memo`
```rust
// src-tauri/src/commands/voice_memo.rs
#[tauri::command]
async fn transcribe_voice_memo(file_name: String, model: String) -> Result<String, String>
// Invokes whisper-cli sidecar, returns transcribed text
```

#### 4c. TypeScript `useWearVoiceMemos` hook
- Listens for `wear://voice_memo` Tauri event
- Calls `transcribe_voice_memo` command
- Stores result pending user review; cleans up `.m4a` after transcription

### Acceptance criteria
- [ ] Record on watch → text appears in phone app within 30 seconds
- [ ] Transcription survives app restart (queued if app was in background)
- [ ] Model download shows progress in Settings → Speech to Text

---

## Phase 5 — Metadata, Drafts & AI Enrichment

**Goal:** Transcription + metadata → draft journal entry → publish.

### Metadata enrichment (5a)
- Richer `HealthSnapshot`: steps in last hour, activity type (WALKING / STATIONARY)
- Location from phone at receive time via `locationWeatherService`
- Context summary string: `"Recorded at 9:42 AM · HR 72 · Walking · Near Downtown"`

### Draft journal entries (5b)
```sql
CREATE TABLE voice_memo_drafts (
    id TEXT PRIMARY KEY, created_at TEXT,
    audio_file TEXT, duration_ms INTEGER,
    transcript TEXT,       -- encrypted
    health_json TEXT,      -- HR, HRV, steps
    context TEXT,          -- human-readable
    mood INTEGER,          -- inferred, nullable
    book_id TEXT DEFAULT 'default',
    reviewed INTEGER DEFAULT 0
);
```
- Draft visible in Timeline with badge; not published until user confirms
- Tap → editor pre-filled with transcript; assign mood, edit, publish
- Published → standard `journal_entries` row; draft deleted

### AI enrichment (5c, opt-in)
- Mood inference from transcript via `metadataExtractor.ts`
- 2–3 hashtag suggestions on draft editor
- Optional: AI reflection prompt from transcript metadata (not raw text)
- Weekly summary notification: "5 voice entries this week · mood trending up"

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

### Key existing files
| File | Purpose |
|------|---------|
| `wear/.../RecordingSession.kt` | Recording with 10-min limit |
| `wear/.../AudioTransferService.kt` | ChannelAPI send |
| `wear/.../AudioQueue.kt` | Offline queue |
| `app/.../WearListenerService.kt` | Phone receive (background) |
| `app/.../WearPlugin.kt` | Phone receive (foreground) + Tauri bridge |
| `src-tauri/src/commands/voice_memo.rs` | whisper.cpp sidecar (Phase 4) |
| `src/hooks/useWearVoiceMemos.ts` | TypeScript consumer (Phase 4) |
