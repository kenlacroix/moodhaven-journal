#!/usr/bin/env node
/**
 * Generates one hero image per blog post via OpenAI dall-e-3.
 *
 * Usage: OPENAI_API_KEY=sk-... node scripts/generate-blog-images.mjs [--force]
 *
 * - Writes PNGs to website/public/images/blog/<slug>.png
 * - Skips slugs whose output already exists (unless --force)
 * - Serial, with a small delay to stay polite on rate limits
 */
import { writeFile, access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "..", "public", "images", "blog");
const force = process.argv.includes("--force");

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("ERROR: set OPENAI_API_KEY in env.");
  process.exit(1);
}

const STYLE_SUFFIX =
  " Painterly editorial illustration, warm cream and off-white background (#F3F0EA), subtle violet accents (muted purple #8b5cf6 to deep #4c1d95), gentle morning or golden-hour light, calm and contemplative mood, soft brushwork, no text, no people's faces, no logos, no UI elements. Landscape composition, generous negative space.";

const POSTS = [
  {
    slug: "welcome-to-moodhaven-journal",
    prompt:
      "An open leather-bound journal on a warm wooden table beside a small bouquet of dried wildflowers, soft dawn light through a nearby window, hopeful and quiet.",
  },
  {
    slug: "why-i-built-moodhaven",
    prompt:
      "A single empty wooden chair facing a sunlit window, a closed journal and a worn fountain pen resting on the seat, intimate and reflective, a feeling of personal beginning.",
  },
  {
    slug: "our-privacy-philosophy-at-moodhaven",
    prompt:
      "A hand-bound journal with a small brass clasp resting on a wooden desk, a soft cloth folded beside it, low warm light suggesting privacy and care, no surveillance imagery — just stillness and trust.",
  },
  {
    slug: "the-moodhaven-roadmap-whats-next",
    prompt:
      "A gentle winding footpath through a calm meadow under a soft evening sky, distant low hills, a sense of journey forward without urgency.",
  },
  {
    slug: "protecting-the-pause",
    prompt:
      "A single steaming ceramic teacup on a stone window ledge, soft fog drifting outside, warm morning light, deep stillness — a pause held protected.",
  },
  {
    slug: "how-moodhaven-protects-your-journal",
    prompt:
      "A closed leather journal sealed with a small violet wax seal, candle burning low beside it on a wooden desk, soft chiaroscuro light, feeling of guarded safekeeping.",
  },
  {
    slug: "how-moodhaven-insights-will-work",
    prompt:
      "A quiet desk at dusk with a small open notebook, beside it a sheet of parchment marked with delicate hand-drawn constellation lines connecting small dots, a lantern glowing softly — the act of finding gentle patterns.",
  },
  {
    slug: "choosing-self-hosting-for-journals",
    prompt:
      "A small handmade wooden cabin in a calm wooded landscape at dusk, warm amber light glowing from its single window, a sense of self-contained sanctuary, painterly and quiet.",
  },
  {
    slug: "first-look-moodhavens-mobile-companion",
    prompt:
      "A small leather notebook and a folded soft scarf beside a worn canvas satchel on a wooden bench at a train station platform, warm afternoon light, conveying portable reflection.",
  },
  {
    slug: "reflections-on-building-moodhaven",
    prompt:
      "A craftsman's workbench at golden hour with a journal, a few small hand tools, sketches on loose paper, a half-finished wooden piece — careful, patient making.",
  },
  {
    slug: "moodhaven-v1-shipped",
    prompt:
      "A single lit oil lantern on a quiet wooden pier at dusk, its warm light reflected in still water, soft violet sky above, a milestone reached without fanfare.",
  },
  {
    slug: "stillhaven-arrives",
    prompt:
      "Concentric rings spreading slowly across very still water at dawn, a single small stone visible just below the surface at center, soft violet and cream sky reflected, painterly and meditative.",
  },
  {
    slug: "what-is-stillhaven",
    prompt:
      "Two soft glowing orbs hovering gently above calm water, one slightly to the left, one slightly to the right, warm cream light blending into soft violet, painterly and dreamlike, evoking gentle alternating rhythm and settling.",
  },
  {
    slug: "activity-tagging-and-mood-correlation",
    prompt:
      "A wooden desk at golden hour with a small open journal, beside it several smooth river stones arranged in a loose connecting line and a few pressed leaves, faint delicate lines linking them like a gentle pattern quietly emerging, warm and contemplative.",
  },
  {
    slug: "breaking-into-our-own-app-on-a-real-phone",
    prompt:
      "A closed leather journal on a wooden table with a small brass padlock resting beside it and a magnifying glass laid nearby catching soft morning light, calm and reassuring rather than alarming, a sense of careful inspection and safekeeping.",
  },
  {
    slug: "what-happens-when-you-change-your-password",
    prompt:
      "An old worn brass key lying beside a brand-new brass key on a weathered wooden desk, a closed journal with a small violet wax seal nearby, soft warm light, a quiet sense of safe transition and continuity.",
  },
  {
    slug: "why-local-first-matters",
    prompt:
      "A single small cottage on a quiet tree-lined island in calm still water at golden hour, one warm glowing window, no bridges or wires to the mainland, utterly self-contained and serene.",
  },
  {
    slug: "default-hero",
    prompt:
      "A calm abstract painterly scene — soft rolling fog over a still lake at dawn, gentle violet and cream light, deep tranquility, no focal subject.",
  },
];

async function exists(p) {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

// The site fallback hero lives at public/images/default-hero.png (one level
// up from the blog dir); every other slug is a per-post hero under blog/.
function outPathFor(slug) {
  if (slug === "default-hero") {
    return resolve(outDir, "..", "default-hero.png");
  }
  return resolve(outDir, `${slug}.png`);
}

async function generate({ slug, prompt }) {
  const outPath = outPathFor(slug);
  if (!force && (await exists(outPath))) {
    console.log(`SKIP ${slug} (exists)`);
    return;
  }
  const fullPrompt = `${prompt}${STYLE_SUFFIX}`;
  console.log(`GEN  ${slug} ...`);
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: fullPrompt,
      n: 1,
      size: "1536x1024",
      quality: "high",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${slug}: HTTP ${res.status} ${text.slice(0, 400)}`);
  }
  const json = await res.json();
  const item = json?.data?.[0];
  let bytes;
  if (item?.b64_json) {
    bytes = Buffer.from(item.b64_json, "base64");
  } else if (item?.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) throw new Error(`${slug}: image fetch ${imgRes.status}`);
    bytes = Buffer.from(await imgRes.arrayBuffer());
  } else {
    throw new Error(`${slug}: no image data in response`);
  }
  await writeFile(outPath, bytes);
  console.log(`OK   ${slug} -> ${outPath}`);
}

await mkdir(outDir, { recursive: true });

let failures = 0;
for (const post of POSTS) {
  try {
    await generate(post);
  } catch (err) {
    failures++;
    console.error(`FAIL ${post.slug}: ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, 1000));
}

console.log(`\nDone. ${POSTS.length - failures}/${POSTS.length} succeeded.`);
process.exit(failures === 0 ? 0 : 1);
