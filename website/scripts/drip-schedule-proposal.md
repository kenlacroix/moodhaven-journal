# Drip Schedule Proposal

> Proposal only — **do not apply**. This documents a recommended forward cadence.
> Today: **2026-06-21**.

## Current posts (by `publishDate`)

All 20 current posts are **past-dated**, so they are already live (except the one
flagged `published: false`). The most recent live post is **2026-06-13**.

| publishDate | Slug | Notes |
|-------------|------|-------|
| 2025-04-27 | `welcome-to-moodhaven-journal` | live |
| 2025-05-02 | `why-i-built-moodhaven` | live |
| 2025-05-05 | `the-moodhaven-roadmap-whats-next` | live |
| 2025-05-08 | `protecting-the-pause` | live |
| 2025-05-16 | `our-privacy-philosophy-at-moodhaven` | live |
| 2025-05-23 | `how-moodhaven-protects-your-journal` | live |
| 2025-05-30 | `how-moodhaven-insights-will-work` | live |
| 2025-06-06 | `choosing-self-hosting-for-journals` | live |
| 2025-06-13 | `first-look-moodhavens-mobile-companion` | live |
| 2025-06-20 | `reflections-on-building-moodhaven` | live |
| 2025-06-28 | `moodhaven-mobile-alpha-early-access` | **`published: false`** (hidden regardless of date) |
| 2026-05-24 | `moodhaven-v1-shipped` | live |
| 2026-05-26 | `stillhaven-arrives` | live |
| 2026-05-26 | `what-is-stillhaven` | live |
| 2026-06-07 | `stress-testing-the-privacy-in-your-journal` | live |
| 2026-06-08 | `what-we-actually-send-to-ai` | live |
| 2026-06-09 | `why-local-first-matters` | live |
| 2026-06-09 | `what-happens-when-you-change-your-password` | live |
| 2026-06-10 | `activity-tagging-and-mood-correlation` | live |
| 2026-06-13 | `breaking-into-our-own-app-on-a-real-phone` | live (most recent) |

## The honest consequence of retro-dating

The publish gate is **date-based and hides future dates**. So if you take an
already-LIVE, indexed post and change its `publishDate` to a **future** date, the
next rebuild will **remove it from the live site** until that date arrives. That:

- breaks its URL for visitors (returns `notFound()`),
- de-indexes it / hurts SEO and any inbound links,
- and is generally a bad idea for content that is already public.

**Therefore: do not retro-date existing live posts to spread them across the
biweekly slots.** Leave published posts exactly where they are.

## Proposed forward cadence (biweekly, Saturdays)

Anchor: the first Saturday on or after today (2026-06-21) is **2026-06-27**, then
every 14 days. The newest existing post is 2026-06-13, so 2026-06-27 is a clean
next slot. Assign these dates to **new** posts in order, one per slot:

| Slot | publishDate (Sat) |
|------|-------------------|
| 1 | 2026-06-27 |
| 2 | 2026-07-11 |
| 3 | 2026-07-25 |
| 4 | 2026-08-08 |
| 5 | 2026-08-22 |
| 6 | 2026-09-05 |
| 7 | 2026-09-19 |
| 8 | 2026-10-03 |

## Recommendation

- **Keep all published posts as-is.** Do not retro-date live, indexed content.
- **Only new (future) posts** use the biweekly Saturday dates above.
- A new post is committed/pushed now with its future `publishDate`; it stays
  hidden by the build-time gate and **auto-goes-live on its date** via
  `.github/workflows/blog-refresh.yml` (daily 12:00 UTC rebuild) — once the
  `CF_DEPLOY_HOOK` repo secret is set.
- If you want a written-but-not-ready post parked, add `draft: true` (supported
  by `lib/posts.ts`) instead of moving a live post's date.
