# Website Polish & Vision Audit — MoodHaven Journal (moodhaven.app)
**Date:** 2026-06-06  
**Branch:** `task/website-polish` (off `feat/website-overhaul`)  
**Auditor:** Claude Sonnet 4.6 via gstack /qa + /design-review  

---

## 1. Scorecard

| Dimension | Score | Current state |
|---|---|---|
| First impression / above the fold | **7/10** | Value prop clear in 3s. Dual CTA (Try / Download). Version chip. Slightly corporate; no "builder made this" signal. |
| Visual design | **7/10** | Coherent violet+orange palette, warm `#F8F6F2` background, consistent Inter. **Logo is a 1.4 MB PNG — should be SVG.** |
| Layout & hierarchy | **7/10** | Good section flow, generous whitespace. 7-item nav is crowded. Homepage section order is logical. |
| Content & narrative | **6/10** | Strong privacy story. No first-person builder voice above the fold. No case-study arc (problem → build → outcome). Founder face only in `/about`. |
| Conversion / CTAs | **7/10** | "Try Free" nav + "Try it live" + "Download" dual CTA + newsletter. GitHub star badge present. No dead ends. Missing: inline GitHub CTA in hero copy. |
| Motion & microinteractions | **7/10** | Tasteful `whileInView` fade-up everywhere. Nav underline on hover. Raindrop canvas **now wired** (was orphaned). prefers-reduced-motion **now respected** (was missing). |
| Responsive & cross-device | **8/10** | Hamburger drawer works. Transparent→solid nav. All pages render clean at 390px. Navbar 7 items gets a little tight at 768px. |
| Accessibility | **6/10** | Skip link ✓. ARIA on nav/hamburger ✓. `lang="en"` ✓. **prefers-reduced-motion in AnimatedReveal was missing — now fixed.** Dark mode deliberately suppressed (documented in globals.css). Contrast: warm BG with neutral-700 text is fine. |
| Performance | **4/10** | **CRITICAL image sizes below.** Changelog page 1.7 MB HTML. Next.js image optimizer helps at delivery; source assets are the root problem. |
| SEO & sharing | **8/10** | Full OG + Twitter ✓. JSON-LD Organization+WebSite+SoftwareApplication ✓. Sitemap ✓. Canonical URLs ✓. **Favicon in `/icons/` not root** — now fixed. **Blog Article schema** — now added. |
| Missing details | **7/10** | Custom 404 ✓. Scroll-to-top ✓. Smooth scroll ✓. Print styles ✓. `/founders` is a 308 ghost redirect → /about. No loading state for version chip. |
| Code health | **7/10** | TypeScript strict ✓. Good decomposition. `HeroParticles.tsx` was dead code — now wired. Changelog source ~9KB inline data (fine, but watch for growth). |

**Overall: 6.9 / 10**

What a 10 looks like across each dimension is detailed in §5.

---

## 2. What's Missing (Gap List)

Items a high-polish builder site should have but this one doesn't:

### Content / narrative
- **No builder byline above the fold.** The hero says "MoodHaven" everywhere. A visitor has no idea a single person built this. Add "Built by Ken LaCroix" with a link to `/about` or your personal site in the hero or within the first two scroll stops.
- **No case-study arc.** Every visitor who came here from a job listing, conference talk, or GitHub star wants to understand: *what was the problem, what did you build, what was hard, what shipped?* The About timeline exists but tells dates, not decisions.
- **No "builder's lens" blog post.** You have a Substack post ([seven-months-of-vibe-coding](https://www.kennethlacroix.me/post/seven-months-of-vibe-coding-how-i-built-a-privacy-first-journal-app-with-an-ai-pair-programmer)) but it's not linked from the site. That post is pure portfolio gold; it belongs in the blog.
- **No testimonials or social proof** beyond a GitHub star badge (which shows the count but has no faces). One or two real quotes from users or early testers would anchor the "people actually use this" claim.

### Technical / UX
- **`logo-full.png` is 1.4 MB** — critical. Every page loads this at priority. Target ≤20 KB SVG or compressed WebP. This single change could improve LCP by 1–2 seconds on mobile.
- **`tea-window.jpg` 2.1 MB, `hero-rain.jpg` 1.3 MB** — decorative images served at source size. Even through Next.js image optimization this is too large. Compress to ≤200 KB at 2x.
- **`icons/calm.png` (1.4 MB) and `icons/privacy.png` (1.5 MB)** — icon-sized images have no business being that large. Convert to WebP or SVG, target ≤50 KB.
- **No loading skeleton for version chip** — the hero chip shows "See what's new" as fallback while the GitHub API call resolves. Consider a CSS shimmer placeholder so the CLS doesn't jank.
- **`/founders` returns a 308** — ghost route. Either remove the page or make it a proper redirect in `next.config.ts`. The 308 is permanent but the current page is just an empty file that redirects.
- **Changelog is a single 1.7 MB page** — jump-nav now added, but pagination or a "Show older" collapse would dramatically reduce the initial payload. Even collapsing entries older than 3 versions behind a "Show full history" toggle would cut the payload by ~70%.

### Design
- **No dark mode** — explicitly suppressed in `globals.css`. This is a conscious design call (documented), but it's worth a yearly revisit. Many privacy-focused users who will be drawn to this product prefer dark interfaces.
- **Inter is capable but generic** — a single distinctive heading typeface (e.g., Sora, DM Serif Display, or even a system mono face for headings) would make the site feel less like a Tailwind starter.
- **Section headers repeat the same pattern** — every section uses the same uppercase 10px eyebrow + bold h2 + neutral-500 paragraph. The rhythm is consistent (good) but flattens contrast between sections (room to grow).

### SEO / discovery
- **No `<link rel="alternate" type="application/rss+xml">` in `<head>`** for the blog. RSS is small effort and appreciated by technical audiences.
- **Blog OG images** for the 3 new posts use no hero image (the posts have `heroImage` frontmatter paths but the images may not be present). Verify that OG crawler gets a real image.
- **SoftwareApplication schema version is hardcoded** to "1.1.0" in `layout.tsx` — should be dynamic (read from a build-time constant).

---

## 3. Quick Wins Applied

All committed to `task/website-polish`:

| Commit | Change | Impact |
|---|---|---|
| `6d39d7d` | **AnimatedReveal: respect `prefers-reduced-motion`** | WCAG 2.3.3 compliance; uses `useReducedMotion()` from Framer Motion, zero extra deps. Renders static `<div>` when flag is set. |
| `2c0d3f4` | **Favicon metadata in `layout.tsx`** | Favicon was in `/icons/favicon.ico` not `/favicon.ico`. Browsers got a 404. Added `icons:{}` to the Next.js Metadata export. |
| `75f697c` | **Article JSON-LD on blog posts** | Each blog page now emits `@type: Article` with headline, author, publishDate, URL, and image. Google Rich Results now has structured data to parse. |
| `7ad90c0` | **Changelog version jump-nav + anchor IDs** | 1.7 MB page is still large but now navigable. Version pills at the top deeplink to each `<article id="v{version}">`. Added `scroll-mt-20` to clear the sticky nav. |
| `a787ac0` | **Wire `HeroParticles` canvas into hero** | `HeroParticles.tsx` existed as an orphaned file. Now rendered in the hero behind `z-10 pointer-events-none aria-hidden="true"`. Also added `cancelAnimationFrame` cleanup on unmount and skips animation under `prefers-reduced-motion`. |

---

## 4. The Over-the-Top Vision

### Direction A — "Proof of Work" (Radical Transparency)

**The idea:** Every section of the site becomes a hyperlink into the actual source. The hero contains your commit velocity (live GitHub API call). The about page is a build log, not a narrative. Clicking any claim — "AES-256-GCM", "zero telemetry", "1,461 tests" — takes you to the exact line of code that proves it.

**Signature moment:** A "Live Stats" strip between the hero and AppPreview:
```
[ 1,461 tests passing ] [ 164 Tauri commands ] [ v1.8.0 shipped 3 days ago ] [ 0 external analytics calls ]
```
Each badge is a link to the relevant source file or CI run. Visitors feel like they're looking at a dashboard, not a marketing page.

**Design language:** Tighter grid, mono font for the stats/badge strip (your brand already uses purple — add a data-terminal accent). Light background with subtle `ring-1` card borders everywhere (you're already close to this).

**Interactive idea:** A "Decrypt this" demo inline in the PrivacyProof section. Enter a demo password, see a fake journal entry encrypt in real time in the browser (pure WebCrypto, zero server call). The site SHOWS the zero-knowledge claim, it doesn't just assert it.

**Effort:** Medium. Stats strip is a few components + one GitHub API call. The "Decrypt this" demo is a small self-contained WebCrypto playground (~1 day). No rebuild required.

**Risk:** Low. The "builder resume" meta-narrative requires content from you (case-study write-up), not code.

---

### Direction B — "The Workshop" (Builder Aesthetic)

**The idea:** Lean into the fact that this is a builder's project, not a funded startup. The site has an atelier feel — like opening the door to a workshop. Some surfaces deliberately show the seams (a code snippet that animates in, a terminal-style log of the build process, commit messages as pull quotes).

**Signature moment:** The hero background becomes a live particle canvas upgrade (not the current simple raindrops). Take inspiration from the Projection Engine / Seventeen breath visuals:
- Particles spawn at random positions, drift slowly, and are **repelled by the cursor**
- At rest they form a loose cloud behind the hero text
- On scroll-out, they disperse
- The canvas size matches the full hero height, not just 400px
- Falls back to the current radial gradient if `prefers-reduced-motion` or the browser's canvas performance degrades (test with `performance.now()` after first 5 frames)

**Typeface:** Swap Inter for a geometric sans (Geist, or DM Sans) with a mono accent for code/stats. The homepage should feel like a GitHub README got a design pass, not like a SaaS landing page.

**Color:** The violet+orange system is strong. The improvement is *contrast between sections* — alternate the section backgrounds between `#F8F6F2` (current), `#FFFFFF`, and a deep `primary-950` for 1–2 dark-accent sections (the ComparisonTable, the PrivacyProof specs grid). Gives the page a heartbeat.

**Effort:** Medium-high for the particle upgrade (2–3 days to get right with degradation logic). Typeface swap + section-level color alternation is a half day. Total: ~3–4 days.

**Risk:** The particle upgrade is the most visible change and could introduce jank on low-end hardware. Requires thorough degradation testing. The rest is low risk.

---

### Direction C — "Builder + Product, One Story" (Add Personal Layer)

**The idea:** The site does a good job selling MoodHaven. It does a poor job showing who built it. This direction adds a thin but human layer that makes it also serve as a portfolio signal without turning it into a personal homepage.

**Structural changes:**
1. **Hero addition:** Underneath the headline, add one small line — "Built by [Ken LaCroix](/) · open source · MIT licensed" — with your headshot thumbnail (the `founder-headshot.png` already exists). This single sentence shifts the reader's frame from "SaaS company" to "someone built this."
2. **A "How I built this" section** between HowItWorks and FeaturesGrid. Three cards: the problem, the tech decisions (Tauri + Rust + React), the hardest part (encryption UX without cloud recovery). Links to the blog post and the architecture docs.
3. **Blog becomes the portfolio's heartbeat.** The blog index should have a "From the builder" tag alongside "Privacy" and "Features" — posts with that tag feed the resume/portfolio story.

**Signature moment:** The footer "Built by Ken LaCroix" link currently goes to your Wix site. If/when you build a new personal site, this is a free backlink. In the interim, it could link to your GitHub profile where visitors see all your projects (MoodHaven, moonlander-enhanced, Seventeen, etc.) together.

**Effort:** Low. No structural rebuild. Two new components, one copy update, a few link changes. Half a day.

**Risk:** Essentially zero. All changes are additive.

---

## 5. Roadmap: Current → Polished → Exceptional

### Tier 1 — Polish (do now, ~2 days total, high ROI)

| Task | Effort | Owner |
|---|---|---|
| Replace `logo-full.png` with SVG | 1h | **Ken** (need source logo file) |
| Compress `tea-window.jpg`, `hero-rain.jpg` to <200 KB | 30m | **Ken** (run through Squoosh or `cwebp`) |
| Compress `calm.png`, `privacy.png` to <50 KB | 30m | **Ken** |
| Add blog post for "seven months of vibe-coding" (already written, just publish) | 15m | **Ken** |
| Add RSS `<link>` to layout head for blog | 30m | CC |
| Fix `/founders` ghost route (add permanent redirect in next.config.ts or delete page) | 15m | CC |
| Add dynamic `softwareVersion` to JSON-LD (read from package.json at build) | 30m | CC |
| Add "Built by Ken LaCroix" line + thumbnail to hero | 1h | CC |

### Tier 2 — Strong (1 week, meaningful differentiation)

| Task | Effort |
|---|---|
| "How I built this" 3-card section on homepage | 2h |
| "Live stats" strip from GitHub API (test count, commands, last release) | 4h |
| Add a "Decrypt this" WebCrypto demo in PrivacyProof | 1 day |
| Upgrade particle canvas to repel-on-cursor behavior (Direction B) | 2 days |
| Alternating section backgrounds (dark accent for 1–2 sections) | 2h |
| Changelog: collapse entries older than 3 versions behind "Show full history" | 2h |

### Tier 3 — Exceptional (when you have time, maximum portfolio signal)

| Task | Effort |
|---|---|
| Full particle hero upgrade (Projection Engine style, with degradation) | 3 days |
| Personal portfolio integration ("Built by Ken" → personal site with all projects) | depends on new site |
| Dark mode implementation | 1–2 days |
| Interactive live-sync animation (show two devices syncing over LAN in real time) | 2–3 days |

---

## 6. Content You Need to Supply

These gaps exist because they require real input from you — no AI fabrication appropriate:

1. **SVG version of the logo** — or the Figma/AI source so it can be exported at correct size. The current 1.4 MB PNG is the single biggest performance problem on the site.
2. **The "How I built this" 3-card content** — what was the problem you were solving, what were the key tech decisions, what was the hardest part? 3–5 sentences per card.
3. **A case-study paragraph for the About page** — not the "what it does" description (you have that), but the "what decisions I made and why" narrative.
4. **One or two user testimonials** — a sentence from anyone who has used MoodHaven seriously. Even "from the comments on my blog post" is fine.
5. **Blog images for the 3 new posts** (activity-tagging, why-local-first, what-we-send-to-ai) — these posts have hero image paths in frontmatter but need actual images.
6. **Confirmation of the GitHub star widget** — the badge renders from `img.shields.io`. Verify it resolves in production (shields.io is sometimes cached 24h+).

---

*Branch: `task/website-polish` — 5 commits applied. Do not merge to main without review.*
