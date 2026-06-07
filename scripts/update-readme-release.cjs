#!/usr/bin/env node
// Rewrites README.md for a new release:
//   1. All `MoodHaven_<ver>_*` / `MoodHaven-<ver>-*` asset filenames -> new 3-part version
//      (also normalizes legacy lowercase `moodhaven_<ver>` to the real asset casing)
//   2. Prepends a "**<tag>** — <notes>" entry under "## Recent Changes" (idempotent)
//
// Env: TAG (e.g. v1.8.0 or v1.6.0.1), NOTES (tag annotation text, optional)
// Asset filenames always use the 3-part version (Tauri names bundles from
// tauri.conf.json, which CI enforces as 3-part semver; the 4th part is tag-only).

const fs = require('fs');
const path = require('path');

const TAG = process.env.TAG;
if (!TAG || !/^v\d+(\.\d+){2,3}(-\S+)?$/.test(TAG)) {
  console.error(`ERROR: TAG env var missing or invalid (got "${TAG}")`);
  process.exit(1);
}
const ASSET_VERSION = TAG.replace(/^v/, '').replace(/-.*$/, '').split('.').slice(0, 3).join('.');
const NOTES = (process.env.NOTES || '').trim().replace(/\s+/g, ' ');

const readmePath = path.join(__dirname, '..', 'README.md');
let readme = fs.readFileSync(readmePath, 'utf8');
const original = readme;

// 1. Asset filename versions
readme = readme.replace(
  /\b(?:MoodHaven|moodhaven)([_-])\d+(?:\.\d+){2,3}/g,
  `MoodHaven$1${ASSET_VERSION}`
);

// 2. Recent Changes entry
const heading = '## Recent Changes';
if (NOTES && readme.includes(heading) && !readme.includes(`**${TAG}**`)) {
  readme = readme.replace(heading + '\n\n', `${heading}\n\n**${TAG}** — ${NOTES}\n`);
}

if (readme === original) {
  console.log('README.md already up to date');
} else {
  fs.writeFileSync(readmePath, readme);
  console.log(`README.md updated for ${TAG} (asset version ${ASSET_VERSION})`);
}
