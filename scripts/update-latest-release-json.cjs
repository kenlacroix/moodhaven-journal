#!/usr/bin/env node
// CI script: generates latest-release.json and uploads it as a GitHub release asset.
// Run after all platform builds complete:
//   node scripts/update-latest-release-json.cjs
//
// Requires: GITHUB_TOKEN env var (or gh CLI auth), TAG env var (e.g. "v0.9.0")
// Requires: gh CLI installed and authenticated

'use strict';

const { execSync } = require('child_process');

const REPO = 'kenlacroix/moodhaven-journal';
const TAG = process.env.TAG || process.argv[2];

if (!TAG) {
  console.error('ERROR: TAG env var or first argument required (e.g. v0.9.0)');
  process.exit(1);
}

function gh(cmd) {
  return execSync(`gh ${cmd}`, { encoding: 'utf8' }).trim();
}

function ghJson(cmd) {
  return JSON.parse(gh(cmd));
}

console.log(`Fetching release data for ${TAG}...`);

const release = ghJson(`release view ${TAG} --repo ${REPO} --json tagName,url,publishedAt,assets`);

function sizeLabel(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

const assets = release.assets
  .filter((a) => {
    const n = a.name;
    return (
      n.endsWith('.AppImage') ||
      n.endsWith('-setup.exe') ||
      n.endsWith('.dmg') ||
      n.endsWith('.apk') ||
      n.endsWith('.aab')
    );
  })
  .map((a) => ({
    name: a.name,
    downloadUrl: a.url,
    sizeLabel: sizeLabel(a.size || 0),
  }));

// Severity: releases at or above the 1.8.0 encryption-at-rest floor are
// security updates for the pre-1.8.0 (plaintext-DB) cohort. Mirrors the rule
// the in-app updater applies to the *running* version.
function computeSeverity(tag) {
  const [major = 0, minor = 0] = tag
    .replace(/^v/, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  return major > 1 || (major === 1 && minor >= 8) ? 'security' : 'recommended';
}

const payload = {
  version: release.tagName,
  releaseUrl: release.url,
  publishedAt: release.publishedAt,
  severity: computeSeverity(release.tagName),
  assets,
};

const fs = require('fs');
const outPath = 'latest-release.json';
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
console.log(`Wrote ${outPath} (${assets.length} assets)`);

console.log(`Uploading to release ${TAG}...`);
gh(`release upload ${TAG} ${outPath} --repo ${REPO} --clobber`);
console.log('Done. latest-release.json is now available at:');
console.log(`  https://github.com/${REPO}/releases/latest/download/latest-release.json`);
