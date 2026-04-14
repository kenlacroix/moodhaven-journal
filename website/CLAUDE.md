# MoodHaven Landing Site

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · MDX
**Deploy:** Cloudflare Pages → `moodhaven.app`
**Journal app:** `https://journal.moodhaven.app` (separate Cloudflare Pages project, built from repo root)

## Commands
```bash
cd website
npm install
npm run dev      # localhost:3000
npm run build    # production build
```

## Key Files

| File | Purpose |
|------|---------|
| `app/page.tsx` | Home — fetches Substack posts, renders HomeClient |
| `components/HomeClient.tsx` | Hero, value props, newsletter carousel, founder card |
| `components/HeroImage.tsx` | App screenshot used standalone on blog/about pages |
| `components/NavBar.tsx` | Top nav |
| `components/Footer.tsx` | Social links, "Open Journal App" CTA, copyright |
| `app/blog/[slug]/page.tsx` | MDX blog post renderer |
| `content/posts/*.mdx` | Blog post content (frontmatter: title, excerpt, publishDate, heroImage) |
| `lib/getSubstackPosts.ts` | Fetches latest posts from moodhaven.substack.com RSS |
| `lib/posts.ts` | MDX post loader — `PostMeta` / `PostFull` types |

## Non-Obvious Notes
- Blog posts with `publishDate` in the future are hidden (`notFound()`)
- Substack RSS is fetched at build time (static) — redeploy to refresh
- Hero uses `writing-view.png` from `public/images/` — update if screenshot changes
