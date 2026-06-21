// Generate a manual-post Reddit draft for each freshly-published MoodHaven blog
// post and surface it as a GitHub issue to copy-paste by hand.
//
// Unlike the LinkedIn auto-announcer (scripts/post-to-buffer.mjs), NOTHING is
// ever posted to Reddit automatically — Reddit punishes broadcast/link-drop
// patterns with removals, shadow-bans, and domain blacklists, so a human picks
// the subreddit and posts. This only drafts.
//
// Runs from .github/workflows/blog-reddit-draft.yml. A post is drafted once it
// is live (publishDate <= today, not draft/unpublished) and not already in the
// ledger (../.github/reddit-drafted.json, committed back). The script computes
// drafts, writes one issue body per slug to RUNNER_TEMP, and updates the ledger
// in the working tree; the workflow opens the issues and commits the ledger only
// after they all succeed (so a failed run retries cleanly next time).
//
// Modes:
//   (default)         draft fresh live posts
//   --seed            mark all currently-live posts as drafted WITHOUT drafting
//                     (run once on first deploy so historical posts don't flood
//                     issues)
//   --preview [slug]  print the draft(s) to stdout; no ledger/issue side effects

import { readFileSync, writeFileSync, appendFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import matter from 'gray-matter';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POSTS_DIR = join(ROOT, 'content/posts');
const LEDGER = join(ROOT, '..', '.github', 'reddit-drafted.json');
const SITE_URL = 'https://www.moodhaven.app';
const REDDIT_LIMIT = 40000; // Reddit self-text post body cap

// ── Text linter (mirrors post-to-buffer.mjs) ──────────────────────────────────
const PLACEHOLDERS = /\b(TODO|TKTK?|FIXME|XXX|REPLACE ?ME|INSERT[_ ]?HERE|LOREM IPSUM)\b|\{\{.*?\}\}/i;
const AI_SLOP = [
  "in today's fast-paced world", 'in the ever-evolving', 'ever-changing landscape', "let's dive in",
  'dive into the world', 'delve into', "it's important to note", "it's worth noting", 'in conclusion,',
  'game-changer', 'game changer', 'unlock the power', 'unlock the potential', 'harness the power',
  'in this digital age', 'look no further', 'the realm of', 'embark on a journey', 'supercharge your',
  'revolutionize', 'a testament to', 'elevate your', 'navigating the world', 'when it comes to',
];
const validateText = (text, limit = REDDIT_LIMIT, noun = 'body') => {
  const errors = [];
  if (!text || text.trim().length === 0) errors.push(`${noun} is empty`);
  if (text.length > limit) errors.push(`${noun} is ${text.length} chars (max ${limit})`);
  const ph = text.match(PLACEHOLDERS);
  if (ph) errors.push(`placeholder text found: "${ph[0]}"`);
  if (process.env.ALLOW_AI_SLOP !== '1') {
    const low = text.toLowerCase();
    const hit = AI_SLOP.find((s) => low.includes(s));
    if (hit) errors.push(`reads as AI slop: "${hit}" (set ALLOW_AI_SLOP=1 to override)`);
  }
  return errors;
};

const args = process.argv.slice(2);
const seedOnly = args.includes('--seed');
const previewIdx = args.indexOf('--preview');
const previewMode = previewIdx !== -1;
const previewSlug = previewMode ? args[previewIdx + 1] : undefined;

// ── Posts ────────────────────────────────────────────────────────────────────
const readLedger = () => {
  if (!existsSync(LEDGER)) return [];
  try {
    return JSON.parse(readFileSync(LEDGER, 'utf8'));
  } catch {
    return [];
  }
};

const todayUTC = () => {
  const n = new Date();
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
};

const allPosts = () =>
  readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.mdx') && !f.startsWith('_'))
    .map((f) => {
      const { data } = matter(readFileSync(join(POSTS_DIR, f), 'utf8'));
      const raw = data.publishDate ?? data.date ?? null;
      const d = raw ? new Date(raw) : null;
      const pub = d && !Number.isNaN(d.getTime()) ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : null;
      return {
        slug: f.replace(/\.mdx$/, ''),
        title: typeof data.title === 'string' ? data.title : f,
        excerpt: typeof data.excerpt === 'string' ? data.excerpt.trim() : '',
        redditText: typeof data.redditText === 'string' ? data.redditText.trim() : '',
        redditSubreddits: Array.isArray(data.redditSubreddits) ? data.redditSubreddits : [],
        draft: data.draft === true,
        published: data.published !== false,
        pub,
      };
    });

const livePosts = () => allPosts().filter((p) => p.pub !== null && !p.draft && p.published && p.pub <= todayUTC());
const postUrl = (p) => `${SITE_URL}/blog/${p.slug}`;

// ── Draft ────────────────────────────────────────────────────────────────────
const draftBody = (p) => {
  const url = postUrl(p);
  const blurb = p.redditText || `${p.excerpt}\n\nFull writeup: ${url}`;
  const warnings = validateText(blurb, REDDIT_LIMIT, 'body');
  const subs = p.redditSubreddits.length
    ? p.redditSubreddits.map(
        (s) => `- ${String(s).startsWith('r/') ? s : `r/${s}`} — check its self-promo rule before posting`,
      )
    : ['- _None specified._ Add `redditSubreddits` to the post frontmatter, or pick 1–2 on-topic subs by hand.'];

  const lines = [
    `**Post:** ${p.title}`,
    `**URL:** ${url}`,
    '',
    '### Suggested title',
    p.title,
    '_No hashtags, no clickbait — Reddit removes both._',
    '',
    '### Body (copy-paste, then make it yours)',
    '```',
    blurb,
    '```',
    '',
    '### Candidate subreddits',
    ...subs,
    '',
    '### Before you post',
    '- Post as a participant, not a broadcaster — Reddit shadow-bans link-drops.',
    '- Lead with the substance; put the link at the bottom.',
    "- One subreddit at a time; don't cross-post the same link.",
  ];
  if (warnings.length) {
    lines.push('', '### ⚠️ Draft needs a look', ...warnings.map((w) => `- ${w}`));
  }
  lines.push('', "_Close this issue once you've posted (or decided not to)._");
  return lines.join('\n');
};

const ghOut = (k, v) => {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
};

// ── Main ──────────────────────────────────────────────────────────────────────
const main = () => {
  if (previewMode) {
    const posts = previewSlug
      ? allPosts().filter((p) => p.slug === previewSlug)
      : livePosts().filter((p) => !new Set(readLedger()).has(p.slug));
    if (posts.length === 0) {
      console.log(previewSlug ? `No post found with slug "${previewSlug}".` : 'No fresh live posts to preview.');
      return;
    }
    for (const p of posts) {
      console.log(`\n=== Reddit draft: ${p.slug} ===\n`);
      console.log(draftBody(p));
    }
    return;
  }

  const drafted = new Set(readLedger());

  if (seedOnly) {
    const all = [...new Set([...drafted, ...livePosts().map((p) => p.slug)])].sort((a, b) => a.localeCompare(b));
    writeFileSync(LEDGER, `${JSON.stringify(all, null, 2)}\n`);
    console.log(`Seeded ledger with ${all.length} already-live posts (no drafts written).`);
    ghOut('count', '0');
    return;
  }

  const fresh = livePosts().filter((p) => !drafted.has(p.slug));
  if (fresh.length === 0) {
    console.log('No new posts to draft for Reddit.');
    ghOut('count', '0');
    return;
  }

  const outDir = process.env.RUNNER_TEMP || ROOT;
  for (const p of fresh) {
    writeFileSync(join(outDir, `reddit-draft-${p.slug}.md`), draftBody(p));
    drafted.add(p.slug);
    console.log(`Drafted Reddit post for "${p.title}" (${p.slug}).`);
  }

  writeFileSync(LEDGER, `${JSON.stringify([...drafted].sort((a, b) => a.localeCompare(b)), null, 2)}\n`);
  ghOut('count', String(fresh.length));
  ghOut('slugs', fresh.map((p) => p.slug).join(','));
  ghOut('draft_dir', outDir);
};

main();
