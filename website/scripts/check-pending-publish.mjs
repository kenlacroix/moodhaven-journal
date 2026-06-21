// Guardrail: report blog posts that are queued (publishDate in the future, so
// hidden by the build-time gate until that date) and posts with no publishDate
// (which never publish). Run weekly by .github/workflows/blog-pending-check.yml
// so a queued post is visible in CI output before its slot, and a missing date
// never silently keeps a post offline.
//
// Dependency-light: uses gray-matter (already a website dep) and Node builtins,
// so the workflow needs no extra install beyond `npm ci`.

import { readdirSync, readFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import matter from "gray-matter";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const POSTS = join(ROOT, "content/posts");

const dayUTC = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const today = dayUTC(new Date());

const posts = readdirSync(POSTS)
  .filter((f) => f.endsWith(".mdx"))
  .map((f) => {
    const { data } = matter(readFileSync(join(POSTS, f), "utf8"));
    const publishDate = data.publishDate ?? data.date ?? null;
    return {
      slug: f.replace(/\.mdx$/, ""),
      title: typeof data.title === "string" ? data.title : f,
      publishDate: publishDate ? String(publishDate) : null,
      draft: data.draft === true,
      published: data.published !== false,
    };
  });

const queued = posts.filter((p) => {
  if (!p.publishDate) return false;
  return dayUTC(new Date(p.publishDate)) > today;
});
const missing = posts.filter((p) => !p.publishDate);

const ghOut = (k, v) => {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
};

if (queued.length) {
  console.log(`Queued posts (hidden until their publishDate):`);
  for (const p of queued.sort((a, b) => a.publishDate.localeCompare(b.publishDate))) {
    const flags = [p.draft ? "draft" : null, !p.published ? "published:false" : null]
      .filter(Boolean)
      .join(", ");
    console.log(`  - ${p.publishDate}  ${p.slug}  "${p.title}"${flags ? `  [${flags}]` : ""}`);
  }
} else {
  console.log("No queued posts — nothing is waiting on a future publishDate.");
}

if (missing.length) {
  console.log(`\nPosts with NO publishDate (will never publish until one is set):`);
  for (const p of missing) console.log(`  - ${p.slug}  "${p.title}"`);
} else {
  console.log("\nAll posts have a publishDate.");
}

ghOut("queued", String(queued.length));
ghOut("missing", String(missing.length));
