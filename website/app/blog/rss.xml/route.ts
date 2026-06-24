// app/blog/rss.xml/route.ts
import { getAllPosts, type PostMeta } from "@/lib/posts";

export const dynamic = "force-static";

const BASE = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.moodhaven.app"
).replace(/\/$/, "");

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const todayISO = new Date().toISOString().slice(0, 10);

  const posts = getAllPosts()
    .filter((p: PostMeta) => {
      if (p.draft === true) return false;
      if (p.published === false) return false;
      if (!p.publishDate) return false;
      if (p.publishDate.slice(0, 10) > todayISO) return false;
      return true;
    })
    .sort((a, b) => (a.publishDate! < b.publishDate! ? 1 : -1));

  const items = posts
    .map((p) => {
      const url = `${BASE}/blog/${p.slug}`;
      const pubDate = new Date(p.publishDate!).toUTCString();
      return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(p.excerpt ?? "")}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>MoodHaven Journal Blog</title>
    <link>${BASE}/blog</link>
    <atom:link href="${BASE}/blog/rss.xml" rel="self" type="application/rss+xml" />
    <description>Privacy-first software, local-first design, and what we're building.</description>
    <language>en-US</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
