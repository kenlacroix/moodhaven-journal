# Content Queue

Scheduling model for the MoodHaven blog (`website/content/posts/*.mdx`).

## How scheduling works

A post is **live** when **all** of these hold (evaluated at build time):

1. `publishDate` is today or in the past (`publishDate <= today`)
2. `draft` is not `true`
3. `published` is not `false`

There is **no separate `status` field** here (unlike the kennethlacroix.me site).
The single gate is the date plus those two optional booleans. It lives in two
places that read the same frontmatter via `lib/posts.ts`:

- `app/blog/[slug]/page.tsx` — returns `notFound()` for a future `publishDate`.
- The blog listing — filters to `publishDate <= today`, `draft !== true`,
  `published !== false`.

Because the gate is build-time, a post with a **future** `publishDate` stays
hidden until the site is rebuilt on or after that date. The daily
`.github/workflows/blog-refresh.yml` cron (`0 12 * * *`, 12:00 UTC) hits the
Cloudflare Pages deploy hook, so a queued post **auto-goes-live on its date with
no git push** — provided the `CF_DEPLOY_HOOK` repo secret is set.

> Optional `draft: true` guard: `lib/posts.ts` already reads `draft` and
> `published`. Use `draft: true` (or `published: false`) on a file you want to
> keep parked regardless of date — handy for a written-but-not-approved post that
> happens to have a past date.

## Workflow for a queued post

1. Create the `.mdx` with a **future** `publishDate` (next biweekly slot — see
   below). Optionally add `draft: true` while you're still writing.
2. Write it. Keep `draft: true` until it's ready, then remove it (or set
   `draft: false`).
3. Leave the future `publishDate`. The post is committed and pushed to `main`
   now, but stays hidden — the build-time gate hides it.
4. It auto-publishes on `publishDate` at the next daily rebuild. To publish
   immediately instead, set `publishDate` to today (or run the **Blog refresh**
   workflow manually via *workflow_dispatch*).

The weekly **Blog pending publish check** workflow
(`.github/workflows/blog-pending-check.yml`) lists queued posts and any post
missing a `publishDate`, so nothing silently slips its slot.

## Cadence: biweekly

New posts go out on a **biweekly** (every 14 days) cadence, on **Saturdays**.
See `website/scripts/drip-schedule-proposal.md` for the current post inventory
and the proposed forward dates. Existing live posts keep their dates — only new
posts use the biweekly slots.
