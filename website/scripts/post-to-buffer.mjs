// Announce newly-published MoodHaven blog posts to LinkedIn via Buffer's GraphQL
// API.
//
// Runs daily from .github/workflows/blog-social.yml. A post is announced once it
// is live (publishDate <= today, not draft/unpublished) and hasn't been
// announced before. Announced slugs are tracked in
// ../.github/linkedin-posted.json (committed back), which makes the job
// self-healing: a missed day is caught next run, and nothing double-posts.
//
// Safeguards (all keep it hands-off):
//   1. Best-time scheduling — posts are scheduled (not fired instantly) for the
//      next high-engagement LinkedIn slot, which also gives an edit/cancel window
//      in Buffer before they go out.
//   2. Validation — a post is skipped (job fails) if its caption is empty/too
//      long, contains placeholder text, reads as AI slop, or its URL isn't live.
//   3. Notify — outcomes are written for the workflow to open a GitHub issue.
//
// Modes:
//   (default)            announce fresh live posts
//   --seed               record all currently-live posts WITHOUT posting
//   --test               send one deletable test post (validates the path)
//   --verify             list scheduled + sent posts on the channel
//   --preview [slug]     print the caption + validation for a post (no posting,
//                        no URL check); omit slug for all fresh live posts
//
// Env: BUFFER_API_KEY, BUFFER_CHANNEL_ID, plus optional tuning —
//   BUFFER_MODE=addToQueue   use Buffer's own queue instead of best-time schedule
//   LINKEDIN_TZ=America/New_York   LINKEDIN_HOUR=12   LINKEDIN_DAYS=2,3,4 (Tue-Thu)
//   LINKEDIN_MIN_DELAY_HOURS=2     ALLOW_AI_SLOP=1 (bypass the slop linter)
//
// If BUFFER secrets are unset, announce/seed no-op gracefully (exit 0).

import { readFileSync, writeFileSync, appendFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import matter from 'gray-matter';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POSTS_DIR = join(ROOT, 'content/posts');
// Ledger lives at repo-root .github/, one level above the website/ directory.
const LEDGER = join(ROOT, '..', '.github', 'linkedin-posted.json');
const SITE_URL = 'https://www.moodhaven.app';
const BUFFER_ENDPOINT = 'https://api.buffer.com';

const MAX_CAPTION = 3000; // LinkedIn post text limit

// ── Text linter ──────────────────────────────────────────────────────────────
// Rejects empty/oversized text, leftover placeholders, and AI-slop phrases.
const PLACEHOLDERS = /\b(TODO|TKTK?|FIXME|XXX|REPLACE ?ME|INSERT[_ ]?HERE|LOREM IPSUM)\b|\{\{.*?\}\}/i;
const AI_SLOP = [
  "in today's fast-paced world", 'in the ever-evolving', 'ever-changing landscape', "let's dive in",
  'dive into the world', 'delve into', "it's important to note", "it's worth noting", 'in conclusion,',
  'game-changer', 'game changer', 'unlock the power', 'unlock the potential', 'harness the power',
  'in this digital age', 'look no further', 'the realm of', 'embark on a journey', 'supercharge your',
  'revolutionize', 'a testament to', 'elevate your', 'navigating the world', 'when it comes to',
];
const validateText = (text, limit = MAX_CAPTION, noun = 'caption') => {
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
const testMode = args.includes('--test');
const verifyMode = args.includes('--verify');
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
      const tags = Array.isArray(data.tags) ? data.tags : [];
      return {
        slug: f.replace(/\.mdx$/, ''),
        title: typeof data.title === 'string' ? data.title : f,
        excerpt: typeof data.excerpt === 'string' ? data.excerpt.trim() : '',
        linkedinText: typeof data.linkedinText === 'string' ? data.linkedinText.trim() : '',
        hashtags: Array.isArray(data.hashtags) ? data.hashtags : [],
        tags,
        draft: data.draft === true,
        published: data.published !== false,
        pub,
      };
    });

const livePosts = () => allPosts().filter((p) => p.pub !== null && !p.draft && p.published && p.pub <= todayUTC());

const postUrl = (p) => `${SITE_URL}/blog/${p.slug}`;

// Normalize a hashtag list ("journaling" or "#journaling" -> "#journaling").
const hashtagLine = (list) =>
  list
    .map((t) => `#${String(t).replace(/^#+/, '').replace(/[^a-z0-9]/gi, '')}`)
    .filter((t) => t.length > 1)
    .join(' ');

// LinkedIn caption. Prefers hand-written linkedinText; else builds from
// title + excerpt + URL. The URL is always present.
const caption = (p) => {
  const url = postUrl(p);
  if (p.linkedinText) {
    const base = p.linkedinText.includes(url) ? p.linkedinText : `${p.linkedinText}\n\n${url}`;
    const tags = hashtagLine(p.hashtags);
    return tags ? `${base}\n\n${tags}` : base;
  }
  const tags = hashtagLine(p.hashtags.length ? p.hashtags : p.tags.slice(0, 4));
  return [p.title, '', p.excerpt, '', url, tags && `\n${tags}`].filter((l) => l !== undefined).join('\n');
};

// ── Validation helper ─────────────────────────────────────────────────────────
const urlIsLive = async (url) => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
};

// ── Best-time scheduling (timezone-aware, DST-safe via Intl) ─────────────────
const tzOffsetMs = (date, tz) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUTC - date.getTime();
};

// Soonest future high-engagement slot, at least MIN_DELAY hours out (the edit
// window). Default: Tue/Wed/Thu 12:00 in the audience timezone. Env-overridable.
const nextBestTime = (now = new Date()) => {
  const tz = process.env.LINKEDIN_TZ || 'America/New_York';
  const hour = Number(process.env.LINKEDIN_HOUR ?? 12);
  const days = (process.env.LINKEDIN_DAYS || '2,3,4').split(',').map(Number); // 0=Sun..6=Sat
  const minDelayMs = Number(process.env.LINKEDIN_MIN_DELAY_HOURS ?? 2) * 3600_000;
  const earliest = now.getTime() + minDelayMs;

  for (let i = 0; i < 14; i += 1) {
    const probe = new Date(now.getTime() + i * 86_400_000);
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(probe)
      .split('-')
      .map(Number);
    const dow = new Date(Date.UTC(ymd[0], ymd[1] - 1, ymd[2])).getUTCDay();
    if (!days.includes(dow)) continue;
    const guess = Date.UTC(ymd[0], ymd[1] - 1, ymd[2], hour, 0, 0);
    const slot = guess - tzOffsetMs(new Date(guess), tz);
    if (slot >= earliest) return new Date(slot).toISOString();
  }
  return new Date(earliest).toISOString();
};

// ── Buffer ───────────────────────────────────────────────────────────────────
const gql = async (apiKey, query) => {
  const res = await fetch(BUFFER_ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body.errors ?? body)}`);
  return body.data;
};

// Watcher: list scheduled + sent posts so you can confirm an announcement went out.
const verify = async (apiKey, channelId) => {
  const orgs = (await gql(apiKey, 'query { account { organizations { id } } }')).account?.organizations ?? [];
  const orgId = orgs[0]?.id;
  if (!orgId) throw new Error('no organization found for this API key');
  for (const status of ['scheduled', 'sent']) {
    const q = `query { posts(first: 15, input: { organizationId: ${JSON.stringify(orgId)}, filter: { status: [${status}], channelIds: [${JSON.stringify(channelId)}] } }) { edges { node { id text dueAt } } } }`;
    const edges = (await gql(apiKey, q)).posts?.edges ?? [];
    console.log(`\n${status.toUpperCase()} (${edges.length}):`);
    for (const e of edges) {
      const n = e.node;
      console.log(`  ${n.id}  due ${n.dueAt ?? '-'}  ${(n.text || '').replace(/\s+/g, ' ').slice(0, 55)}`);
    }
  }
};

const postToBuffer = async (apiKey, channelId, text, dueAtOverride) => {
  const useQueue = !dueAtOverride && process.env.BUFFER_MODE === 'addToQueue';
  const scheduling = useQueue
    ? 'mode: addToQueue'
    : `mode: customScheduled, dueAt: ${JSON.stringify(dueAtOverride ?? nextBestTime())}`;
  const query = `
    mutation CreatePost($text: String!) {
      createPost(input: {
        text: $text,
        channelId: ${JSON.stringify(channelId)},
        schedulingType: automatic,
        ${scheduling}
      }) {
        ... on PostActionSuccess { post { id dueAt } }
        ... on MutationError { message }
      }
    }`;
  const res = await fetch(BUFFER_ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { text } }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body.errors ?? body)}`);
  const result = body.data?.createPost;
  if (result?.message) throw new Error(`Buffer: ${result.message}`);
  if (!result?.post?.id) throw new Error(`Unexpected response: ${JSON.stringify(body)}`);
  return result.post;
};

// ── Output for the notify step ────────────────────────────────────────────────
const ghOut = (k, v) => {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
};
const writeSummary = (md) => {
  const path = join(process.env.RUNNER_TEMP || ROOT, 'linkedin-run-summary.md');
  writeFileSync(path, md);
  ghOut('summary_file', path);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
};

// ── Main ──────────────────────────────────────────────────────────────────────
const main = async () => {
  if (previewMode) {
    const posts = previewSlug
      ? allPosts().filter((p) => p.slug === previewSlug)
      : livePosts().filter((p) => !new Set(readLedger()).has(p.slug));
    if (posts.length === 0) {
      console.log(previewSlug ? `No post found with slug "${previewSlug}".` : 'No fresh live posts to preview.');
      return;
    }
    const slot = nextBestTime();
    for (const p of posts) {
      const text = caption(p);
      const errs = validateText(text, MAX_CAPTION);
      const hand = Boolean(p.linkedinText);
      console.log(`\n=== ${p.slug} · scheduled for ${slot} ===`);
      console.log(`--- LinkedIn ${hand ? '(hand-written)' : '(generated)'} ---`);
      console.log(text);
      console.log(`(${text.length}/${MAX_CAPTION} chars)`);
      console.log(errs.length ? `VALIDATION: ${errs.join('; ')}` : 'VALIDATION: ok (URL check runs at post time)');
    }
    return;
  }

  if (verifyMode) {
    const apiKey = process.env.BUFFER_API_KEY;
    const channelId = process.env.BUFFER_CHANNEL_ID;
    if (!apiKey || !channelId) {
      console.error('BUFFER_API_KEY / BUFFER_CHANNEL_ID not set.');
      process.exit(1);
    }
    await verify(apiKey, channelId);
    return;
  }

  if (testMode) {
    const apiKey = process.env.BUFFER_API_KEY;
    const channelId = process.env.BUFFER_CHANNEL_ID;
    if (!apiKey || !channelId) {
      console.error('BUFFER_API_KEY / BUFFER_CHANNEL_ID not set.');
      process.exit(1);
    }
    const text =
      'Integration test for the MoodHaven blog auto-announcer — please ignore. ' +
      'Confirming the publishing path works end to end, then deleting this.\n\n' +
      `${SITE_URL}/`;
    const errs = validateText(text, MAX_CAPTION);
    if (!(await urlIsLive(`${SITE_URL}/`))) errs.push('home URL not reachable');
    if (errs.length) {
      console.error(`Test caption failed validation: ${errs.join('; ')}`);
      process.exit(1);
    }
    const dueAt = new Date(Date.now() + Number(process.env.TEST_DELAY_MIN ?? 4) * 60_000).toISOString();
    const post = await postToBuffer(apiKey, channelId, text, dueAt);
    console.log(`TEST post created: Buffer id ${post.id}, scheduled ${post.dueAt}. Delete it in Buffer/LinkedIn.`);
    return;
  }

  const posted = new Set(readLedger());

  if (seedOnly) {
    const all = [...new Set([...posted, ...livePosts().map((p) => p.slug)])].sort((a, b) => a.localeCompare(b));
    writeFileSync(LEDGER, `${JSON.stringify(all, null, 2)}\n`);
    console.log(`Seeded ledger with ${all.length} already-live posts (no posting).`);
    return;
  }

  const fresh = livePosts().filter((p) => !posted.has(p.slug));
  if (fresh.length === 0) {
    console.log('No new posts to announce.');
    ghOut('announced', '0');
    ghOut('failed', '0');
    return;
  }

  const apiKey = process.env.BUFFER_API_KEY;
  const channelId = process.env.BUFFER_CHANNEL_ID;
  if (!apiKey || !channelId) {
    console.log('BUFFER_API_KEY / BUFFER_CHANNEL_ID not set — skipping (set repo secrets to enable).');
    ghOut('announced', '0');
    ghOut('failed', '0');
    return;
  }

  const announced = []; // { slug, id, dueAt }
  const failed = []; // { slug, reason }
  for (const p of fresh) {
    const url = postUrl(p);
    const text = caption(p);
    const errs = validateText(text, MAX_CAPTION);
    if (errs.length) {
      failed.push({ slug: p.slug, reason: errs.join('; ') });
      console.error(`SKIP "${p.title}": ${errs.join('; ')}`);
      continue; // not ledgered — retried next run once fixed
    }
    if (!(await urlIsLive(url))) {
      failed.push({ slug: p.slug, reason: `post URL not reachable (200): ${url}` });
      console.error(`SKIP "${p.title}": post URL not reachable (200): ${url}`);
      continue;
    }
    try {
      const post = await postToBuffer(apiKey, channelId, text);
      posted.add(p.slug); // ledger once LinkedIn lands
      announced.push({ slug: p.slug, id: post.id, dueAt: post.dueAt });
      console.log(`Scheduled LinkedIn "${p.title}" -> Buffer ${post.id} @ ${post.dueAt}`);
    } catch (err) {
      failed.push({ slug: p.slug, reason: err.message });
      console.error(`FAILED LinkedIn "${p.title}": ${err.message}`);
    }
  }

  writeFileSync(LEDGER, `${JSON.stringify([...posted].sort((a, b) => a.localeCompare(b)), null, 2)}\n`);

  const lines = ['## LinkedIn announce run', ''];
  if (announced.length) {
    lines.push(`### Scheduled (${announced.length})`);
    announced.forEach((a) => lines.push(`- \`${a.slug}\` → Buffer ${a.id}, due ${a.dueAt}`));
    lines.push('');
  }
  if (failed.length) {
    lines.push(`### Skipped / failed (${failed.length})`);
    failed.forEach((f) => lines.push(`- \`${f.slug}\`: ${f.reason}`));
  }
  writeSummary(`${lines.join('\n')}\n`);
  ghOut('announced', String(announced.length));
  ghOut('failed', String(failed.length));

  if (failed.length) process.exit(1); // exit non-zero only when a post failed
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
