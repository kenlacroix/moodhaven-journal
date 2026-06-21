// Send the MoodHaven blog newsletter to the EmailOctopus subscriber list via Resend.
//
// EmailOctopus is the list of record (it has no send API); Resend is the sender.
// Every send carries a working unsubscribe link, so the broadcast stays
// CAN-SPAM / GDPR compliant.
//
// "Just went live" for MoodHaven = a post whose publishDate is today or earlier
// and whose slug is NOT already in the sent-ledger (and which is not a draft).
// There is no `status` field — publishDate is the gate. Emailed slugs are tracked
// in ../.github/newsletter-sent.json (committed back), so nothing double-sends and
// a missed day self-heals.
//
// Modes:
//   --auto   announce every newly-live post once (the daily workflow path)
//   --send   actually send (without it: DRY RUN preview to stdout)
//
// Env: EMAILOCTOPUS_API_KEY, EMAILOCTOPUS_LIST_ID, RESEND_API_KEY,
//   NEWSLETTER_ADDRESS (postal address, legally required in the footer),
//   optional NEWSLETTER_FROM, REPLY_TO, SITE_URL, SUBSCRIBE_CONFIRM_SECRET.
// If the required secrets are unset, the script no-ops gracefully (exit 0).

import { readFileSync, writeFileSync, appendFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHmac } from 'node:crypto';
import matter from 'gray-matter';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); // website/
const POSTS_DIR = join(ROOT, 'content/posts');
const LEDGER = join(ROOT, '../.github/newsletter-sent.json'); // repo-root .github/
const SITE_URL = process.env.SITE_URL || 'https://www.moodhaven.app';
const FROM = process.env.NEWSLETTER_FROM || 'MoodHaven <newsletter@send.moodhaven.app>';
const REPLY_TO = process.env.REPLY_TO || 'contact@kennethlacroix.me';
const ADDRESS = process.env.NEWSLETTER_ADDRESS || '';
const SEND_DELAY_MS = Number(process.env.SEND_DELAY_MS ?? 600); // ~1.5/s, under Resend's rate limit

const args = process.argv.slice(2);
const autoMode = args.includes('--auto');
const doSend = args.includes('--send');

const die = (msg) => { console.error(`Error: ${msg}`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ghOut = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };

// ── Posts / ledger ───────────────────────────────────────────────────────────
const todayUTC = () => { const n = new Date(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); };
const readLedger = () => { try { return existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')).sent ?? [] : []; } catch { return []; } };
const writeLedger = (slugs) => writeFileSync(LEDGER, `${JSON.stringify({ sent: [...new Set(slugs)].sort((a, b) => a.localeCompare(b)) }, null, 2)}\n`);

const isDraft = (data) => data.draft === true || data.published === false;

const allPosts = () =>
  readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.mdx') && !f.startsWith('_'))
    .map((f) => {
      const { data } = matter(readFileSync(join(POSTS_DIR, f), 'utf8'));
      const d = new Date(data.publishDate);
      return {
        slug: typeof data.slug === 'string' && data.slug ? data.slug : f.replace(/\.mdx$/, ''),
        title: data.title || '',
        excerpt: data.excerpt || '',
        heroImage: typeof data.heroImage === 'string' ? data.heroImage : '',
        draft: isDraft(data),
        pub: Number.isNaN(d.getTime()) ? Infinity : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
      };
    });
const livePosts = () => allPosts().filter((p) => !p.draft && p.pub <= todayUTC());

// ── Content rendering ────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function heroUrl(heroImage) {
  if (!heroImage) return '';
  return /^https?:\/\//.test(heroImage) ? heroImage : `${SITE_URL}${heroImage.startsWith('/') ? '' : '/'}${heroImage}`;
}

// Derived from a blog post: title as subject, excerpt as the body, plus a
// read-the-post CTA and the hero image. No extra authoring — the post is the input.
function contentFromPost(post) {
  const url = `${SITE_URL}/blog/${post.slug}`;
  const hero = heroUrl(post.heroImage);
  const heroHtml = hero
    ? `<a href="${url}"><img src="${escapeHtml(hero)}" alt="${escapeHtml(post.title)}" width="100%" style="display:block;width:100%;border-radius:10px;margin:0 0 20px;"></a>\n`
    : '';
  const bodyHtml = `${heroHtml}<h1 style="font-size:22px;line-height:1.3;margin:0 0 14px;color:#1c1917;">${escapeHtml(post.title)}</h1>
<p style="margin:0 0 20px;">${escapeHtml(post.excerpt)}</p>
<p><a href="${url}" style="color:#10b981;font-weight:600;">Read it →</a></p>`;
  return { subject: post.title, preview: post.excerpt, bodyHtml };
}

const renderHtml = (c, unsub) => `<!doctype html>
<html>
<body style="margin:0;background:#f5f4f2;padding:24px 0;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(c.preview)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;">
      <tr><td style="padding:28px 32px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917;font-size:16px;line-height:1.6;">
        ${c.bodyHtml}
      </td></tr>
      <tr><td style="padding:20px 32px 28px;border-top:1px solid #eee;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#a8a29e;font-size:12px;line-height:1.6;">
        You're getting this because you subscribed at <a href="${SITE_URL}" style="color:#a8a29e;">moodhaven.app</a>.<br>
        ${unsub ? `<a href="${unsub}" style="color:#a8a29e;text-decoration:underline;">Unsubscribe</a> · ` : ''}${escapeHtml(ADDRESS)}
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;

const renderText = (c, unsub, url) => {
  const body = `${stripTags(c.bodyHtml)}`;
  return `${body}\n\n${url ? `Read it: ${url}\n\n` : ''}— — —\nYou subscribed at ${SITE_URL}.\n${unsub ? `Unsubscribe: ${unsub}\n` : ''}${ADDRESS}`;
};

function stripTags(html) {
  return html
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n').trim();
}

// Optional one-click unsubscribe, only when a signing secret is configured.
const unsubUrl = (secret, email) => {
  if (!secret || !email) return '';
  const token = createHmac('sha256', secret).update(`unsubscribe:${email.toLowerCase()}`).digest('base64url');
  return `${SITE_URL}/api/unsubscribe?e=${encodeURIComponent(email.toLowerCase())}&t=${token}`;
};

// ── EmailOctopus + Resend ────────────────────────────────────────────────────
async function* subscribedEmails(apiKey, listId) {
  let url = `https://api.emailoctopus.com/lists/${listId}/contacts?limit=100`;
  while (url) {
    const res = await fetch(url, { headers: { authorization: `Bearer ${apiKey}` } });
    if (!res.ok) die(`EmailOctopus list-contacts failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    for (const c of body.data || []) if (c.status === 'subscribed') yield c.email_address;
    url = body.paging?.next?.url || null;
  }
}

async function sendOne(resendKey, to, content, url, secret) {
  const unsub = unsubUrl(secret, to);
  const headers = {};
  if (unsub) {
    headers['List-Unsubscribe'] = `<${unsub}>, <mailto:${REPLY_TO}?subject=unsubscribe>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: FROM, to, reply_to: REPLY_TO, subject: content.subject,
      html: renderHtml(content, unsub), text: renderText(content, unsub, url),
      ...(Object.keys(headers).length ? { headers } : {}),
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
}

async function resolveRecipients(env) {
  const out = [];
  for await (const e of subscribedEmails(env.EMAILOCTOPUS_API_KEY, env.EMAILOCTOPUS_LIST_ID)) out.push(e);
  return out;
}

async function sendToList(env, content, url, recipients) {
  let ok = 0;
  const failures = [];
  for (const to of recipients) {
    try { await sendOne(env.RESEND_API_KEY, to, content, url, env.SUBSCRIBE_CONFIRM_SECRET); ok += 1; console.log(`  sent → ${to}`); }
    catch (err) { failures.push(to); console.error(`  FAILED → ${to}: ${err.message}`); }
    if (recipients.length > 1) await sleep(SEND_DELAY_MS);
  }
  return { ok, failed: failures.length };
}

// ── Main ─────────────────────────────────────────────────────────────────────
const main = async () => {
  const env = process.env;

  if (!autoMode) die('pass --auto (the only supported mode); add --send to actually email.');

  const sent = readLedger();
  const fresh = livePosts().filter((p) => !sent.includes(p.slug));
  if (!fresh.length) { console.log('No new posts to email.'); ghOut('sent', '0'); ghOut('failed', '0'); return; }

  // No-op safely until the secrets are configured.
  if (doSend && (!env.RESEND_API_KEY || !env.EMAILOCTOPUS_API_KEY || !env.EMAILOCTOPUS_LIST_ID || !ADDRESS)) {
    console.log('Newsletter secrets not fully set — skipping (set EMAILOCTOPUS_API_KEY/EMAILOCTOPUS_LIST_ID/RESEND_API_KEY/NEWSLETTER_ADDRESS to enable).');
    ghOut('sent', '0'); ghOut('failed', '0');
    return;
  }

  const recipients = doSend ? await resolveRecipients(env) : [];
  console.log(`${fresh.length} new post(s)${doSend ? `; ${recipients.length} subscriber(s).` : ' (dry run).'}`);

  let totalOk = 0, totalFail = 0;
  const summary = ['## Newsletter run', ''];
  for (const p of fresh) {
    const content = contentFromPost(p);
    const url = `${SITE_URL}/blog/${p.slug}`;
    if (!doSend) {
      console.log(`\nDRY: would email "${content.subject}"`);
      console.log(`     ${url}`);
      console.log(`--- plaintext preview ---\n${renderText(content, '', url).slice(0, 700)}`);
      continue;
    }
    const { ok, failed } = await sendToList(env, content, url, recipients);
    totalOk += ok; totalFail += failed;
    summary.push(`- \`${p.slug}\` → ${ok} sent${failed ? `, ${failed} failed` : ''}`);
    if (failed === 0) sent.push(p.slug); // ledger only a fully-clean send; partials retry next run
  }

  if (doSend) {
    writeLedger(sent);
    const summaryFile = join(env.RUNNER_TEMP || ROOT, 'newsletter-summary.md');
    writeFileSync(summaryFile, `${summary.join('\n')}\n`);
    ghOut('summary_file', summaryFile);
  }
  ghOut('sent', String(totalOk)); ghOut('failed', String(totalFail));
  console.log(doSend ? `Done: ${totalOk} sent, ${totalFail} failed.` : 'Dry run complete (add --send to email).');
};

main().catch((err) => { console.error(err); process.exit(1); });
