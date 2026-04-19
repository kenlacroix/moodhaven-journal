#!/usr/bin/env node
/**
 * generate-checksums.js
 *
 * Runs in CI after all platform builds complete.
 * Finds all downloadable release assets (AppImage, exe, dmg) in the
 * artifacts/ directory, computes SHA-256 for each, writes checksums.txt,
 * then uploads it to the GitHub release.
 *
 * Usage (set in environment):
 *   GH_TOKEN  — GitHub token with repo write access
 *   TAG       — release tag, e.g. "v1.2.3"
 *
 * Requires: @actions/core is NOT used — plain Node.js + gh CLI only.
 */

'use strict';

const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TAG = process.env.TAG;
if (!TAG) {
  console.error('TAG environment variable is required');
  process.exit(1);
}

const ARTIFACTS_DIR = path.join(process.cwd(), 'artifacts');
const CHECKSUM_FILE = path.join(process.cwd(), 'checksums.txt');

// Extensions we want to checksum (updater assets + installers + Android bundles)
const ASSET_EXTENSIONS = ['.AppImage', '.exe', '.dmg', '.msi', '.aab'];

// ── Collect all platform assets ────────────────────────────────────────────────
function findAssets(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findAssets(fullPath));
    } else if (ASSET_EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
      results.push({ name: entry.name, path: fullPath });
    }
  }
  return results;
}

// ── SHA-256 of a file ─────────────────────────────────────────────────────────
function sha256(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ── Main ──────────────────────────────────────────────────────────────────────
const assets = findAssets(ARTIFACTS_DIR);
if (assets.length === 0) {
  console.warn('No assets found in artifacts/ — nothing to checksum.');
  process.exit(0);
}

console.log(`Found ${assets.length} assets:`);
const lines = [];
for (const { name, path: filePath } of assets) {
  const hash = sha256(filePath);
  const line = `${hash}  ${name}`;
  lines.push(line);
  console.log(`  ${line}`);
}

fs.writeFileSync(CHECKSUM_FILE, lines.join('\n') + '\n');
console.log(`\nWrote ${CHECKSUM_FILE}`);

// Upload checksums.txt to the GitHub release
try {
  execSync(
    `gh release upload "${TAG}" "${CHECKSUM_FILE}" --clobber`,
    { stdio: 'inherit', env: { ...process.env } }
  );
  console.log('Uploaded checksums.txt to release.');
} catch (e) {
  console.error('Failed to upload checksums.txt:', e.message);
  process.exit(1);
}
