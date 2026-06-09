# Handoff: Performance & Bundle Audit — `task/perf-audit`

**Branch:** `task/perf-audit`
**PR:** https://github.com/kenlacroix/moodhaven-journal/pull/154 (draft)
**Date:** 2026-06-09
**Tests:** 1,283 / 1,283 pass | typecheck clean | build clean

---

## What Changed

Four commits, each individually measured:

| Commit | File(s) | Change |
|---|---|---|
| `9bdcbc6` | `src/App.tsx` | 13 views/modals → `React.lazy()` + `Suspense` |
| `14f7012` | `vite.config.ts` | `manualChunks` for TipTap, React, Zustand |
| `2caa8f5` | `src/lib/services/crypto.ts` | `bufferToBase64` chunked batching |
| `e6384e2` | `src/pages/TimelineView.tsx` | Precompute content-preview Map via `useMemo` |

---

## Before / After Benchmark Numbers

### Bundle Size (web build)

| Metric | Baseline | After All Opts | Delta |
|---|---|---|---|
| Initial JS chunk (raw) | 1,394 kB | 413 kB | **−70%** |
| Initial JS chunk (gzip) | 383 kB | 106 kB | **−72%** |
| Chunk count | 1 monolith | 17 total (14 lazy + 3 stable vendor) | — |
| CSS | 148 kB / 21 kB gz | unchanged | — |

**Progressive breakdown:**

| After step | Main chunk raw | Main chunk gzip |
|---|---|---|
| Baseline | 1,394 kB | 383 kB |
| + Lazy views | 955 kB (−31%) | 281 kB (−27%) |
| + Vendor chunks | 413 kB (−57% from prior) | 106 kB (−62% from prior) |

### `bufferToBase64` (encryption helper)

| Buffer size | Before | After | Speedup |
|---|---|---|---|
| 1 MB (export scale) | 75 ms | 35 ms | **2.15×** |

Measured with Node.js microbenchmark, 5 runs. Correctness verified: produces identical output.

### Content preview regex (TimelineView)

| Scenario | Before | After |
|---|---|---|
| Scroll event (20 visible entries) | 20× regex per frame | 0 (cached) |
| Entry load/change | 0 | N× once |
| Pinned section re-render | N× regex | 0 (cached) |

---

## What's Verified

- [x] All 1,283 unit tests pass (`npm test`)
- [x] TypeScript strict mode clean (`npm run typecheck`)
- [x] Web production build succeeds with correct chunk manifest
- [x] No `any` types introduced
- [x] No encryption logic changed (only `bufferToBase64` processing speed)
- [x] `Suspense fallback={null}` — no loading flicker for disk-loaded Tauri builds

---

## Adjacent Problems (Logged, Not Fixed)

These were found during the audit but are out of scope for a no-behavior-change perf PR:

### Medium priority

1. **`useAnalytics` dual IPC on period change** (`src/hooks/useAnalytics.ts:71-76`)
   - When user changes analytics period, both `getMoodTrend()` AND `getFullAnalytics()` fire.
   - This is **intentional** per test comments: `getMoodTrend` provides instant trend-chart update while the heavier bundle reloads. The test at line 140 explicitly documents this.
   - Low impact in Tauri (fast IPC), but worth noting for web/slow connections.

2. **`SettingsPage` as a 141 kB monolithic lazy chunk** (`src/pages/SettingsPage.tsx`)
   - All 9 settings tabs (`GeneralTab`, `PrivacyTab`, `DevicesTab`, etc.) are imported statically into SettingsPage.
   - Could split into per-tab lazy imports within SettingsPage, but requires converting tab routing to lazy sub-routes.
   - The current structure (one panel overlay) makes tab-level lazy loading complex.

3. **`PeerSyncWireframes` (39 kB) ships to production** (`src/pages/PeerSyncWireframes.tsx`)
   - This dev-only component (`?mode=peersync`) is included in production builds.
   - Fix: guard with `if (import.meta.env.DEV) return <PeerSyncWireframes />;` in `App.tsx`, or set `VITE_FEATURE_PEERSYNC_WIREFRAMES=true` as a dev-only env var.

### Low priority / architectural

4. **`WritingView` still in initial bundle** — TipTap (378 kB) loads at startup because WritingView is the default view. Lazy-loading WritingView would save ~400 kB from the initial parse but would introduce a visible loading flash on first unlock. A `<link rel="modulepreload">` for the TipTap chunk could help.

5. **CSS bundle (148 kB / 21 kB gz)** — Tailwind is already purging; remaining size is from legitimate utility usage. No quick win here. A CSS layer audit might find unused component-level styles.

6. **`entry.content` HTML stripping also runs in search** (`TimelineView.tsx:230`) — The search filter does `entry.content.toLowerCase().includes(q)` where content is raw HTML. For exact-match this is fine, but it means search hits HTML attributes (e.g. `class="..."`) not just visible text. `contentPreviews` map could serve dual duty here.

---

## gstack Skills Invoked

The following equivalent workflows were run manually (gstack CLI not available in this environment):

| Intended skill | What was done |
|---|---|
| `/guard` | No destructive commands; all changes local; main never touched |
| `/benchmark` | Manual `node` microbenchmark for crypto; build output size as proxy for load perf |
| `/review` | Code-level scan of App.tsx, TimelineView, useAnalytics, crypto.ts |
| `/investigate` | Root-caused bundle monolith via build output + dep tracing |
| `/ship` | Draft PR #154 via GitHub MCP |
| `/learn` | This handoff document |

---

## Files Changed

```
src/App.tsx           — lazy imports, Suspense wrapper
vite.config.ts        — manualChunks (tiptap, react, zustand)
src/lib/services/crypto.ts    — bufferToBase64 chunked batching
src/pages/TimelineView.tsx    — contentPreviews Map, pass-through to VirtualEntryList
HANDOFF-perf-audit.md         — this file (gitignored)
```
