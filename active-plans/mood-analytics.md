# Mood Analytics (v1.8.0 Phase 1, v1.9.0 Phase 2)

> **Status (2026-06-07):** Phase 1 complete. PR #130 open — CI running. Awaiting merge after PR #129 (activity-tagging).
> **Branch:** `feat/mood-analytics`

---

## Phase 1 — v1.8.0 (complete)

### 1a — Year heatmap

**`MoodYearHeatmap`** — 53-week × 7-day SVG grid with mood-colored cells.

- New DB function `get_year_heatmap()` in `src-tauri/src/db/analytics.rs`
- New Tauri command `get_year_heatmap` in `src-tauri/src/commands/analytics.rs`; requires unlock
- `HeatmapDay` interface added to `src/types/analytics.ts`
- `getYearHeatmap()` IPC wrapper in `src/lib/services/analyticsService.ts`
- `heatmapData`, `isHeatmapLoading` state added to `useAnalytics` hook
- `MoodYearHeatmap` component: 53-week SVG, loading skeleton, month/day labels, `MoodLegend`
- Browser backend: `get_year_heatmap` dispatch case in `browser-invoke.ts`

### 1b — All-time trend period

- `AnalyticsPeriod` type extended with `'all'` key; `ANALYTICS_PERIODS` includes `All Time` entry
- `getMoodTrend` service handles `days <= 0` as all-time query
- `get_full_analytics_bundle` Rust command handles `trend_days = 0` for all-time data
- Borrow lifetime fix: `all_stmt`/`trend_stmt` intermediate `collect()` bound to named variable before `?`

### 1c — Best/worst day callout

**`DayOfWeekPattern`** — chips showing best and worst day-of-week based on `dayOfWeekStats`.

- Rendered in the Deep Dive section of `InsightsView`

### 1d — 12-week streak calendar

**`StreakCalendar`** — 12-week × 7-day dot grid reusing `heatmapData` from `useAnalytics`.

- No new Tauri command needed (reuses `heatmapData`)
- Constants: `WEEKS=12`, `DAYS=7`, `DOT=8`, `GAP=4`
- Day-of-week labels (Mo, We, Fr, Sa); month labels row above grid
- Today cell highlighted with `ring-1 ring-slate-400`
- `title` attributes: `"YYYY-MM-DD: mood X.X (N entries)"` or `"YYYY-MM-DD: no entries"`
- Rendered as "Recent Activity" card at top of Deep Dive collapsible in `InsightsView`
- 6 tests in `StreakCalendar.test.tsx`

---

## Phase 2 — v1.9.0 (deferred)

**Prerequisite:** `activity-tagging` PR #129 must be merged to main so `src/types/activities.ts` and `getActivityStats` IPC wrapper are available.

### 2a — Activity correlation chart (`ActivityCorrelationChart`)

- Bar/scatter chart showing per-activity average mood vs overall average
- Uses `get_activity_stats` Tauri command (already implemented in activity-tagging)
- New `useActivityAnalytics` hook combining activity stats with mood baseline
- Rendered in Deep Dive section after `DayOfWeekPattern`

### 2b — Activity insights card (AI tier)

- Surfaces the activity with the strongest positive/negative mood correlation
- Opt-in, AI tier only; metadata only (activity name + avg mood delta), no journal text

---

## Files changed (Phase 1)

| File | Change |
|:---|:---|
| `src-tauri/src/db/analytics.rs` | `HeatmapDay` struct, `get_year_heatmap()`, all-time trend fix |
| `src-tauri/src/commands/analytics.rs` | `get_year_heatmap` command |
| `src-tauri/src/lib.rs` | command registration |
| `src-tauri/capabilities/default.json` | ACL entry |
| `src/types/analytics.ts` | `HeatmapDay`, `'all'` key in `AnalyticsPeriod` |
| `src/lib/services/analyticsService.ts` | `getYearHeatmap()`, all-time `getMoodTrend` |
| `src/hooks/useAnalytics.ts` | `heatmapData`, `isHeatmapLoading` |
| `src/components/analytics/MoodYearHeatmap.tsx` | New component |
| `src/components/analytics/DayOfWeekPattern.tsx` | New component |
| `src/components/analytics/StreakCalendar.tsx` | New component |
| `src/components/analytics/index.ts` | exports |
| `src/pages/InsightsView.tsx` | Deep Dive section wired up |
| `src/lib/backend/browser-invoke.ts` | `get_year_heatmap` dispatch |

---

## Release gate (Phase 1)

- [x] `get_year_heatmap` Rust command + DB function
- [x] All-time trend period (`days=0`)
- [x] `DayOfWeekPattern` best/worst callout chips
- [x] `MoodYearHeatmap` 53-week SVG heatmap
- [x] `StreakCalendar` 12-week dot grid
- [x] `InsightsView` Deep Dive wired to all new components
- [x] Browser backend parity
- [x] tsc --noEmit clean
- [x] 1461 tests passing
- [x] Rust E0597 borrow lifetime fix committed + pushed
- [x] PR #130 open (feat/mood-analytics)
- [ ] CI green (run triggered 2026-06-07)
- [ ] PR merged to main (after PR #129)
