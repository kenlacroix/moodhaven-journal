#!/usr/bin/env node
/**
 * submit-virustotal.js
 *
 * Runs in CI after checksums are generated, while all platform installers are
 * still in artifacts/. Submits each desktop installer to VirusTotal so a public
 * scan report exists, then writes virustotal.txt (asset name → report URL, keyed
 * by SHA-256) and uploads it to the GitHub release.
 *
 * This is a transparency signal, NOT code signing: a clean VirusTotal report
 * means no AV engine currently flags the build, but it does not remove the
 * Windows SmartScreen "unknown publisher" prompt or the macOS Gatekeeper block.
 * Those require a real signing certificate (tracked on the roadmap).
 *
 * The report URL is the permanent hash-based GUI link
 * (https://www.virustotal.com/gui/file/<sha256>), so it stays valid even after
 * the one-time analysis id expires.
 *
 * Usage (set in environment):
 *   GH_TOKEN    — GitHub token with repo write access
 *   TAG         — release tag, e.g. "v1.2.3"
 *   VT_API_KEY  — VirusTotal API key (free public tier is fine for this
 *                 non-commercial project: 4 lookups/min, 500/day)
 *
 * Non-fatal: a missing key, quota exhaustion, or VT outage logs a warning and
 * exits 0 — it must never block a release.
 */

'use strict';

const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TAG = process.env.TAG;
const VT_API_KEY = process.env.VT_API_KEY;

if (!TAG) {
  console.error('TAG environment variable is required');
  process.exit(1);
}
if (!VT_API_KEY) {
  console.warn('VT_API_KEY not set — skipping VirusTotal submission.');
  process.exit(0);
}

const ARTIFACTS_DIR = path.join(process.cwd(), 'artifacts');
const OUT_FILE = path.join(process.cwd(), 'virustotal.txt');

// Desktop installers only — AABs are Play-managed and not AV-relevant.
const ASSET_EXTENSIONS = ['.exe', '.msi', '.dmg', '.AppImage', '.deb', '.rpm'];

// VT public API: 4 lookups/min. Space submissions ~16s apart to stay under it.
const THROTTLE_MS = 16_000;
// Files larger than this must use the dedicated large-file upload URL.
const DIRECT_UPLOAD_LIMIT = 32 * 1024 * 1024;

const VT_API = 'https://www.virustotal.com/api/v3';
const VT_GUI_FILE = 'https://www.virustotal.com/gui/file';

function findAssets(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findAssets(fullPath));
    } else if (ASSET_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      results.push({ name: entry.name, path: fullPath });
    }
  }
  return results;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function submitFile({ name, path: filePath }) {
  const size = fs.statSync(filePath).size;
  let endpoint = `${VT_API}/files`;

  if (size > DIRECT_UPLOAD_LIMIT) {
    const res = await fetch(`${VT_API}/files/upload_url`, {
      headers: { 'x-apikey': VT_API_KEY },
    });
    if (!res.ok) throw new Error(`upload_url request failed: ${res.status}`);
    const body = await res.json();
    endpoint = body.data;
  }

  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(filePath)]), name);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'x-apikey': VT_API_KEY },
    body: form,
  });
  if (!res.ok) throw new Error(`submit failed: ${res.status} ${await res.text()}`);
}

(async () => {
  const assets = findAssets(ARTIFACTS_DIR);
  if (assets.length === 0) {
    console.warn('No installers found in artifacts/ — nothing to submit.');
    process.exit(0);
  }

  const lines = [];
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const hash = sha256(asset.path);
    const reportUrl = `${VT_GUI_FILE}/${hash}`;
    try {
      await submitFile(asset);
      console.log(`Submitted ${asset.name} → ${reportUrl}`);
    } catch (e) {
      // Still record the hash link — VT may already know the file, and the link
      // resolves once any scan of these bytes completes.
      console.warn(`VT submit failed for ${asset.name}: ${e.message}`);
    }
    lines.push(`${asset.name}  ${reportUrl}`);
    if (i < assets.length - 1) await sleep(THROTTLE_MS);
  }

  const header =
    '# VirusTotal scan reports for this release (keyed by SHA-256).\n' +
    '# Reports may take a few minutes to populate after publish.\n' +
    '# A clean report means no AV engine flags the build; it is not a code signature.\n';
  fs.writeFileSync(OUT_FILE, header + lines.join('\n') + '\n');
  console.log(`\nWrote ${OUT_FILE}`);

  try {
    execSync(`gh release upload "${TAG}" "${OUT_FILE}" --clobber`, {
      stdio: 'inherit',
      env: { ...process.env },
    });
    console.log('Uploaded virustotal.txt to release.');
  } catch (e) {
    console.warn('Failed to upload virustotal.txt:', e.message);
  }
})().catch((e) => {
  // Last-resort guard: never fail the release over VT.
  console.warn('VirusTotal step error (non-fatal):', e.message);
  process.exit(0);
});
