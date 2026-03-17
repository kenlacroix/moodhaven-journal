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

## Phase 4 — Phone-Side Transcription ✅ COMPLETE

**Goal:** Convert incoming `.m4a` files to text using whisper.cpp on the phone.

### Delivered

#### 4a. whisper.cpp sidecar
- `whisper-cli` sidecar wired via `tauri_plugin_shell`; model download/management
  already in `speech_to_text.rs` (`stt_download_model`, `stt_check_model`, etc.)
- Models stored in `app_data_dir/models/`; Settings → Speech to Text shows download
  progress with cancellation and SHA-256 verification

#### 4b. `transcribe_voice_memo` Rust command (`voice_memos.rs`)
- Accepts `id: String, model: String`
- Resolves audio file path from DB row → runs `whisper` sidecar with `-m -f -nt -np`
- Patches `transcription` column via `db::patch_voice_memo_transcription`
- Returns transcribed text; caller handles error if sidecar/model unavailable

#### 4c. `useWearVoiceMemos` hook (`src/hooks/useWearVoiceMemos.ts`)
- Loads all untranscribed memos from DB on mount and queues them sequentially
- Exposes `addMemo(memo)` — call from `useWearSignals.onVoiceMemo` for new arrivals
- Tracks `transcribing: Set<string>` for per-memo loading state
- `onTranscribed` / `onTranscriptionError` callbacks for UI feedback

### Wire-up pattern
```tsx
const { memos, transcribing, addMemo } = useWearVoiceMemos({
  model: settings.sttModel ?? 'ggml-tiny.en.bin',
  enabled: settings.sttEnabled,
});
useWearSignals({ password, onVoiceMemo: addMemo });
```

---

## Phase 5 — Metadata, Drafts & AI Enrichment

**Goal:** Turn raw transcriptions into rich, reviewable draft journal entries:
richer watch-side health context → phone assembles a readable context string →
mood is inferred locally → user opens a pre-filled editor → one tap publishes
to the journal.

---

### 5a. Richer watch-side health snapshot

**Current:** `HealthSnapshot.capture()` returns `{"hr":78}`.

**Change:** Expand the JSON to include step count (last-hour delta) and coarse
activity classification, so the phone can build a more useful context string.

```kotlin
// HealthSnapshot.kt — expanded JSON output
{
  "hr": 78,
  "steps": 412,          // step count delta from StepCounterSensor in last ~60s window
  "activity": "walking"  // "still" | "walking" | "running" | "unknown"
}
```

**Implementation:**
- Add `TYPE_STEP_COUNTER` sensor read alongside the existing HR read (same
  `withTimeoutOrNull` pattern, 5s timeout). Store baseline on app launch;
  emit delta from baseline.
- Add `TYPE_LINEAR_ACCELERATION` or use the existing HR loop to infer coarse
  activity: mean |accel| < 0.4 m/s² → "still"; 0.4–2.5 → "walking"; > 2.5 → "running".
- No new permissions required (`ACTIVITY_RECOGNITION` is only needed for the
  Google Activity Recognition API; raw sensor reads are permission-free).

**Acceptance:** `health_json` arriving on the phone contains `steps` and
`activity` fields when the watch has a body sensor.

---

### 5b. Phone-side context assembly

When `useWearSignals` receives a `wear://voice_memo` event (and calls
`store_voice_memo`), immediately:

1. **Capture location + weather** via `locationWeatherService.captureLocationWeather()`
   (same service used by WritingView). Non-blocking — proceed even if it times out.
2. **Build context string** from the available fields:
   ```
   "9:42 AM · HR 78 · Walking · 412 steps · Near Downtown · ☁️ 14°C"
   ```
   Omit any field whose data is absent (HR optional, steps optional, location optional).
3. **Persist context** immediately via the new `patch_voice_memo_context` command
   so it survives app restarts.

#### DB migrations (runtime, idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS`)

Add four columns to the existing `voice_memos` table:

```sql
ALTER TABLE voice_memos ADD COLUMN context       TEXT;
ALTER TABLE voice_memos ADD COLUMN inferred_mood INTEGER;
ALTER TABLE voice_memos ADD COLUMN book_id       TEXT NOT NULL DEFAULT 'default';
ALTER TABLE voice_memos ADD COLUMN reviewed      INTEGER NOT NULL DEFAULT 0;
```

> **Note:** No separate `voice_memo_drafts` table needed. A memo becomes a
> "pending draft" when `transcription IS NOT NULL AND reviewed = 0 AND entry_id IS NULL`.
> Publishing sets `entry_id`; discarding deletes the row.

#### New Rust commands (`voice_memos.rs`)

| Command | Signature | Purpose |
|---------|-----------|---------|
| `patch_voice_memo_context` | `(id, context, location_weather_json?)` | Store context string + weather snapshot |
| `patch_voice_memo_mood` | `(id, inferred_mood)` | Store locally-inferred mood |
| `publish_voice_memo_draft` | `(id, encrypted_content, mood, book_id, privacy_mode)` | Create journal entry, link via `entry_id`, mark `reviewed=1`; returns `JournalEntry` |
| `discard_voice_memo_draft` | `(id)` | Delete row + audio file (same as `delete_voice_memo` but named for clarity) |
| `list_pending_drafts` | `(limit?)` | `WHERE reviewed=0 AND transcription IS NOT NULL AND entry_id IS NULL` |

#### Updated `VoiceMemoRow` (Rust + TypeScript)

```rust
pub struct VoiceMemoRow {
    pub id:            String,
    pub timestamp:     String,
    pub duration_ms:   i64,
    pub health_json:   Option<String>,
    pub file_path:     String,
    pub transcription: Option<String>,
    pub context:       Option<String>,    // ← new
    pub inferred_mood: Option<i64>,       // ← new
    pub book_id:       String,            // ← new (default: "default")
    pub reviewed:      i64,              // ← new (0 = pending, 1 = published/dismissed)
    pub entry_id:      Option<String>,
    pub source:        String,
    pub created_at:    String,
}
```

---

### 5c. Local mood inference + hashtag suggestions

After `transcribe_voice_memo` completes, immediately run local enrichment —
no AI API required:

```typescript
// In useWearVoiceMemos, after successful transcription:
import { scoreContentMood, extractKeywords } from '../lib/metadataExtractor';

const words = plainText.split(/\s+/).length;
if (words >= 5) {
  const mood = scoreContentMood(plainText);   // returns 1–5
  await patchVoiceMemoMood(id, mood);
  setMemos(prev => prev.map(m => m.id === id ? { ...m, inferred_mood: mood } : m));
}

// Hashtag suggestions — computed client-side on draft open, not persisted
export function suggestHashtags(transcript: string): string[] {
  // Re-uses extractKeywords from metadataExtractor; maps to #tag format
  return extractKeywords(transcript).slice(0, 3).map(k => `#${k}`);
}
```

---

### 5d. Draft cards in Timeline

Pending drafts surface as distinct cards at the **top of the Timeline**, above
the date groups, until reviewed.

```
╭─────────────────────────────────────────────╮
│  🎙  Voice Memo · 2 min 18 sec              │
│  9:42 AM · HR 78 · Walking · Near Downtown  │  ← context chip
│  "I've been thinking about the presentation │
│   and I feel pretty good about where it's…" │  ← 2-line transcript preview
│                                              │
│  ● ● ● ○ ○   [Review]   [✕ Discard]        │  ← inferred mood dots + CTAs
╰─────────────────────────────────────────────╯
```

**Component:** `src/components/voice-memo/VoiceMemoDraftCard.tsx`
- Shows mic icon, duration, context chip, 2-line transcript truncation
- Inferred mood rendered as the standard 5-dot row (pre-filled, greyed out)
- "Review" button → opens `VoiceDraftEditor`
- "✕" button → calls `discard_voice_memo_draft` with a single click (no confirm)
  after a 3-second undo toast

**Hook:** `src/hooks/useVoiceMemoDrafts.ts`
```typescript
interface UseVoiceMemoDraftsResult {
  drafts: VoiceMemo[];           // pending drafts, newest first
  publishDraft: (id: string, content: string, mood: number,
                 bookId: string, privacyMode: number) => Promise<JournalEntry>;
  discardDraft: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}
```
- Loads `list_pending_drafts()` on mount and after each `addMemo` call
- `publishDraft` calls `publish_voice_memo_draft` then removes from local state
- `discardDraft` calls `discard_voice_memo_draft` then removes from local state

**TimelineView wiring:**
- Import `useVoiceMemoDrafts`; render `<VoiceMemoDraftCard>` for each draft above
  the `<DateGroup>` list
- Draft count badge on the Timeline nav item when drafts exist

---

### 5e. Voice Draft Editor

Reuses the full `WritingView` infrastructure via a dedicated route/modal, keeping
implementation minimal.

```
╭─────────────────────────────────────────────────────────╮
│  ✕   Voice Memo Draft                        [Publish]  │
│  ──────────────────────────────────────────────────────  │
│  9:42 AM · HR 78 · Walking · Near Downtown · ☁️ 14°C   │  ← context bar (read-only)
│  ──────────────────────────────────────────────────────  │
│  Mood:  ● ● ● ○ ○   (pre-selected; user can change)    │
│  ──────────────────────────────────────────────────────  │
│  [#gratitude]  [#work]  [#focus]                        │  ← hashtag suggestions
│                                                          │
│  I've been thinking about the presentation              │
│  and I feel pretty good about where it's                │  ← editable TipTap
│  landed. The client seemed engaged and…                 │
╰─────────────────────────────────────────────────────────╯
```

**Component:** `src/components/voice-memo/VoiceDraftEditor.tsx`
- Receives `memo: VoiceMemo` as prop
- Converts `memo.transcription` → TipTap HTML via `document.createTextNode` wrap:
  `<p>${transcript}</p>` (preserves line breaks as `<br>` if transcript contains `\n`)
- Mood selector pre-filled from `memo.inferred_mood ?? 3`
- Context bar renders the `memo.context` string as a read-only chip row
- Hashtag suggestion pills: `suggestHashtags(memo.transcription)` → clicking appends
  `#tag ` at current cursor position via TipTap `insertContent`
- "Publish" → calls `publishDraft(id, html, mood, bookId, privacyMode)` then closes
- Book selector (dropdown) defaults to `memo.book_id` or active book

**Open from:** `VoiceMemoDraftCard → "Review"` button, and optionally from a
future "Drafts" section in the Timeline filter bar.

---

### 5f. Optional AI enrichment (gated behind AI enabled flag)

Only runs when `aiSettings.enabled === true`. Uses metadata, **not raw transcript**.

```typescript
// After context assembly + mood inference:
if (aiSettings.enabled && memo.transcription) {
  const metadata: MetadataSummary = buildMetadataFromMemo(memo);
  const [prompts] = await generatePrompts(metadata);  // existing aiService.ts
  // Surface as a "Reflection prompt" chip below the hashtag suggestions in VoiceDraftEditor
}
```

Weekly notification (via existing reminder infrastructure):
- If ≥ 3 voice memos were published in the last 7 days, fire a notification:
  `"${count} voice entries this week · mood trending ${trend}"`
- Scheduled in `reminderService.ts` as part of the weekly reflection check

---

### New files

| File | Purpose |
|------|---------|
| `wear/.../HealthSnapshot.kt` | Extend to capture steps + activity type |
| `src-tauri/src/db/mod.rs` | Runtime migrations for 4 new columns + `list_pending_drafts` DB fn |
| `src-tauri/src/commands/voice_memos.rs` | 5 new commands (context, mood, publish, discard, list_pending) |
| `src/lib/voiceMemoService.ts` | IPC wrappers for new commands + `suggestHashtags()` utility |
| `src/hooks/useVoiceMemoDrafts.ts` | Draft list state, publish/discard actions |
| `src/hooks/useWearVoiceMemos.ts` | Extend: call `patchVoiceMemoMood` after transcription |
| `src/components/voice-memo/VoiceMemoDraftCard.tsx` | Timeline draft card |
| `src/components/voice-memo/VoiceDraftEditor.tsx` | Full-screen review + publish editor |

### Modified files

| File | Change |
|------|--------|
| `src/features/timeline/TimelineView.tsx` | Render draft cards above date groups; add draft count badge |
| `src/lib/metadataExtractor.ts` | Export `extractKeywords()` for hashtag suggestion use |
| `src-tauri/gen/android/wear/src/main/java/com/moodbloom/wear/HealthSnapshot.kt` | Add steps + activity fields |

### Acceptance criteria

- [ ] Watch records → phone receives → transcription completes → draft card appears
      in Timeline within 30 seconds (WiFi) / on next app open (offline)
- [ ] Context chip shows HR, steps, activity, and location when all are available;
      gracefully omits any field that failed to capture
- [ ] Mood pre-selected correctly (or neutral if transcript < 5 words)
- [ ] Hashtag suggestions are relevant (≥ 1 of 3 applicable in manual testing)
- [ ] Publish flow creates a valid `journal_entries` row with correct book + mood
- [ ] Discard removes both the DB row and the `.m4a` file
- [ ] Drafts survive app restart (queued in DB, not just in-memory)
- [ ] All new Rust commands covered by `cargo check` (no compile errors)
- [ ] TypeScript `npm run typecheck` passes with no new errors

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
| `src-tauri/src/commands/voice_memos.rs` | whisper.cpp sidecar + draft commands (Phase 4–5) |
| `src/hooks/useWearVoiceMemos.ts` | Transcription queue + mood inference (Phase 4–5) |
| `src/hooks/useVoiceMemoDrafts.ts` | Draft list + publish/discard (Phase 5) |
| `src/components/voice-memo/VoiceMemoDraftCard.tsx` | Timeline draft card (Phase 5) |
| `src/components/voice-memo/VoiceDraftEditor.tsx` | Review + publish editor (Phase 5) |
