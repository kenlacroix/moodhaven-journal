# Activity Tagging (v1.8.0)

> **Status (2026-06-07):** Complete. PR #126 open — all 7 CI checks passing. Awaiting merge.
> **Branch:** `worktree-feat+activity-tagging`

---

## Scope

Tag journal entries with activities to track correlation between what you did and how you felt. 15 predefined activities seeded on first launch; users can add up to 50 custom activities. Per-activity mood averages and entry counts surfaced in Insights.

---

## Implementation (complete)

### Database

- `activities` table — `id TEXT PK, name TEXT, emoji TEXT, is_predefined INT, created_at TEXT`
- `entry_activities` junction table — `(entry_id, activity_id) PK`, both FK with `ON DELETE CASCADE`
- `idx_entry_activities_entry` index on `entry_id` for correlated subquery performance
- 15 predefined activities seeded at startup: Exercise, Social, Work, Reading, Creative, Meditation, Good Sleep, Poor Sleep, Nature, Family, Cooking, Music, Learning, Travel, Gaming
- Custom activity cap: 50 (atomic check, races cannot bypass)

### Rust commands (`src-tauri/src/commands/activities.rs`)

| Command | Purpose |
|:---|:---|
| `list_activities` | All activities (predefined + custom) |
| `create_activity` | Custom activity; enforces name ≤30 chars + 50-cap |
| `delete_activity` | Custom only; predefined return error |
| `sync_entry_activities` | Replace all links for an entry (upsert pattern) |
| `get_entry_activities` | Activities for a single entry |
| `get_activity_stats` | Per-activity entry count + avg mood; requires unlock |

All registered in `src-tauri/src/lib.rs` and permitted in `capabilities/default.json`.

### TypeScript

- `src/types/activities.ts` — `Activity`, `ActivityWithStats` interfaces
- `src/lib/services/activityService.ts` — IPC wrappers for all 6 commands
- `src/hooks/useActivities.ts` — activity list state, create/delete, sync entry links
- `src/components/journal/ActivityPicker.tsx` — pill grid with custom activity creation inline
- `src/lib/backend/browser.ts` — IDB CRUD for activities + entry_activities (browser mode parity)
- `src/lib/backend/browser-invoke.ts` — dispatch cases for all 6 commands

### UI integration

- `WritingView` — ActivityPicker rendered below the mood selector on every entry
- `TimelineView` — filter bar includes activity chips; entries filtered by selected activity

### Tests

- `src/hooks/useActivities.test.ts` — 18 tests (list, create, delete, sync, stats, error paths)
- `src/components/journal/ActivityPicker.test.tsx` — 12 tests (render, select, deselect, custom create, limit enforcement)

---

## Deferred

- **Peer sync for custom activity definitions** — entry `activity_ids` already sync with entries; custom activity rows (name/emoji) don't yet replicate to peers. Deferred to v1.8.1 (doesn't block v1.8.0).
- **Phase 2 activity correlation chart** (`ActivityCorrelationChart`) — depends on `src/types/activities.ts` being on main. Tracked in `active-plans/mood-analytics.md` under Phase 2 (v1.9.0).

---

## Release gate

- [x] All Rust commands implemented and registered
- [x] TypeScript types, service, hook complete
- [x] ActivityPicker component with custom creation
- [x] WritingView + TimelineView integration
- [x] Browser backend parity
- [x] Tests passing (1461 total)
- [x] tsc --noEmit clean
- [x] cargo check clean
- [x] PR #126 open, all 7 CI checks passing
- [ ] PR merged to main
