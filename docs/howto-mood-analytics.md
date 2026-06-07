# Mood Analytics — User Guide

> **Applies to:** Desktop app — v1.8.0+

MoodHaven Journal surfaces your journaling patterns visually in the **Insights** view. This guide explains the analytics charts and how to read them.

---

## Year Heatmap

The year heatmap shows the past 53 weeks of entries laid out as a calendar grid — one column per week, one row per day. Each cell is coloured by average mood for that day.

**Colours**

| Mood | Colour |
|:---|:---|
| 5 — Excellent | Emerald `#10b981` |
| 4 — Good | Lime `#84cc16` |
| 3 — Neutral | Amber `#eab308` |
| 2 — Low | Orange `#f97316` |
| 1 — Bad | Red `#ef4444` |
| No entries | Neutral grey |

Days with multiple entries show the average mood. Hovering a cell shows the date and entry count.

The heatmap is available in the **Deep Dive** section of the Insights view. Select the **All Time** period from the period picker to see the full history (the heatmap always covers the trailing 53 weeks regardless of the period picker).

---

## Streak Calendar

Below the year heatmap, the **Streak Calendar** shows the past 12 weeks as a compact dot grid. Each dot represents one day; filled dots indicate at least one entry was written. Dot colour reflects average mood for that day using the same palette as the year heatmap.

Use the streak calendar to track your recent journaling consistency at a glance.

---

## Day-of-Week Patterns

The **Day-of-Week Pattern** section shows your best and worst journaling days as callout chips.

- **Best day** — the weekday with your highest average mood across all entries.
- **Worst day** — the weekday with your lowest average mood.

A day is only included if it has at least 3 entries. If not enough data exists for a reliable comparison, the chips are hidden.

This can reveal subtle patterns — for example, that your Monday entries tend to score lower, or that Saturdays consistently rate higher.

---

## Period Picker

The Insights view has a period selector at the top: **7 Days**, **30 Days**, **90 Days**, and **All Time**.

| Chart | Affected by period? |
|:---|:---|
| Mood trend line | Yes |
| Distribution chart | Yes |
| Year heatmap | No — always shows trailing 53 weeks |
| Streak calendar | No — always shows trailing 12 weeks |
| Day-of-week pattern | No — always uses all-time data |

---

## Frequently Asked Questions

**How many entries do I need before the charts are useful?**

The year heatmap and streak calendar render with any number of entries — even one. The day-of-week callout chips require at least 3 entries per day-of-week before they appear.

**Why does the year heatmap show grey for recent days?**

Grey means no entries were written on that day. It does not indicate a data error.

**Do the analytics include entries from all books?**

Yes. The analytics aggregate across all named journals (Books). Filtering by book is not currently supported in Insights.

**Is any data sent to a server to generate these charts?**

No. All analytics are computed locally from your device's SQLite database. The `get_year_heatmap` command runs a single SQL query on-device and returns mood data only — no entry content is read for analytics.

**How often is the heatmap refreshed?**

The heatmap data is fetched when the Insights view opens. It reflects entries up to the moment you open the view.

---

## Related

- Architecture (schema): [`docs/architecture.md`](architecture.md) — see Analytics section
- Tauri commands: [`docs/tauri-commands.md`](tauri-commands.md) — see Analytics section
- Source: `src/components/analytics/MoodYearHeatmap.tsx`, `src/components/analytics/StreakCalendar.tsx`, `src/components/analytics/DayOfWeekPattern.tsx`, `src/hooks/useAnalytics.ts`
