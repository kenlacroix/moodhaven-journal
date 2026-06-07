# Activity Tagging + Correlation (v1.8.0)

> **Status (2026-06-07):** Complete. PR #129 open — all 7 CI checks passing. Awaiting merge.
> **Branch:** `feat/activity-tagging`

---

## What shipped

### Phase 1 — Activity Tagging

**Database:**
- `activities` table: `id TEXT PK`, `name TEXT`, `emoji TEXT`, `is_predefined INTEGER`, `created_at TEXT`
- `entry_activities` junction: `(entry_id, activity_id)` PK, FK cascades, `idx_entry_activities_entry` index
- 15 predefined activities seeded at startup (Exercise, Social, Work, Reading, Creative, Meditation, Good Sleep, Poor Sleep, Nature, Family, Cooking, Music, Learning, Travel, Gaming)
- Custom activity cap: 50

**Rust commands (`src-tauri/src/commands/activities.rs`):**
- `list_activities` — returns all (predefined + custom), ordered by `is_predefined DESC, sort_order ASC`
- `create_activity(id, name, emoji)` — validates 1–30 char name, defaults emoji to `✨`, enforces 50-cap atomically
- `delete_activity(id)` — rejects predefined activities with an error
- `sync_entry_activities(entryId, activityIds)` — DELETE + INSERT for full replacement per save
- `get_entry_activities(entryId)` — returns `Activity[]` for a given entry
- `get_activity_stats()` — per-activity `entryCount` + `avgMood` (requires unlock)

**TypeScript layer:**
- `src/types/activities.ts` — `Activity`, `ActivityWithStats` types
- `src/lib/services/activityService.ts` — IPC wrappers for all 6 commands
- `src/hooks/useActivities.ts` — list state, `createActivity`, `deleteActivity`, `syncEntryActivities`
- `src/components/journal/ActivityPicker.tsx` — pill grid, inline custom creation, predefined can't be deleted

**WritingView:** ActivityPicker rendered below tag chips (non-distraction-free only), saves via `syncEntryActivities` on blur/save.

**TimelineView:** activity filter chip row; clicking a chip filters entries by that activity.

**Browser/IDB:** `activity_ids` stored as array in `BrowserEntryRow`; full `list_activities`, `create_activity`, `delete_activity`, `sync_entry_activities`, `get_entry_activities`, `get_activity_stats` dispatch cases in `browser-invoke.ts`.

---

### Phase 2 — Activity Correlation Chart

**Hook (`src/hooks/useActivityAnalytics.ts`):**
- Fetches `get_activity_stats()` and `get_full_analytics_bundle` overall avg
- Filters to activities with `entryCount >= 3`, computes `moodDelta = avgMood - overallAvg`
- Sorts by delta descending

**Component (`src/components/analytics/ActivityCorrelationChart.tsx`):**
- SVG diverging bar chart — emerald bars (positive delta) / rose bars (negative delta)
- Center line at zero, emoji+name labels left, delta value labels right
- Minimum 3 entries per activity gate enforced

**InsightsView:** correlation chart wired above Deep Dive toggle; hidden when no activity data qualifies.

---

## Tests

- `hooks/useActivityAnalytics.test.ts` — 6 tests
- `components/analytics/ActivityCorrelationChart.test.tsx` — 8 tests
- `components/journal/ActivityPicker.test.tsx` — 12 tests
- `hooks/useActivities.test.ts` — 7 tests (via component)
- `browser-invoke.test.ts` — activity dispatch cases included
- **Total suite: 1,467 tests**

---

## Deferred

- **Peer sync for custom activity definitions** — entries' `activity_ids` sync already; custom activity rows (name/emoji) don't replicate to peers yet. Planned v1.8.1.
