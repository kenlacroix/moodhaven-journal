# HANDOFF — Performance & Bundle Audit

**Branch:** `task/perf-bundle-audit`
**Base branch:** `main` (v1.6.0.x)
**Tests:** 1337/1337 pass
**Typecheck:** clean (0 errors in production code)

---

## What Was Done

### 1. Bundle analysis baseline

Built with Rollup/Rolldown and measured gzip sizes:

| Before | After |
|--------|-------|
| 1 chunk: 1,440 kB raw / ~485 kB gzip | Initial chunk: 501 kB raw / **129 kB gzip** |
| All views in main bundle (no code splitting) | 9 views lazy-loaded; vendor-editor isolated |
| TipTap/ProseMirror in initial parse path | vendor-editor: 567 kB / 183 kB (separate, cacheable) |

**Initial JS parse reduction: 67% gzip** (485 kB → 129 kB)

---

## Commits

### `62fb619` — perf: lazy-load views, add vendor chunks, fix bufferToBase64

**File: `src/App.tsx`**
All 9 view/page components converted from static imports to `React.lazy()`:
- `WritingView`, `TimelineView`, `OnThisDayView`, `InsightsView`, `CalendarPage`
- `SettingsPage`, `JournalOverviewPage`, `StillView`, `StillSessionsView`
- `SyncDetailsModal` also lazy (it statically imported syncEngine, defeating dynamic chunking)
- `BreakoutWriterApp` kept static (only renders at `?mode=writer`, correct)
- `<Suspense>` wrappers added with empty fallbacks (no layout shift)

**File: `vite.config.ts`**
Added `build.rollupOptions.output.manualChunks`:
- `vendor-editor` — all `@tiptap/*` + `prosemirror-*` packages (567 kB / 183 kB gzip, now cacheable)
- `vendor-react` — `react`, `react-dom`, `scheduler` (thin stub at 0.19 kB — Rolldown already splits React internally)
- `vendor-state` — `zustand` (0.78 kB)

**File: `src/lib/services/crypto.ts`**
`bufferToBase64`: replaced O(n) char-by-char string concatenation with chunked
`String.fromCharCode.apply` (32 kB chunks). Avoids call-stack overflow on large
ciphertext buffers and reduces GC pressure on string concat.

---

### `18dc0a1` — perf: cap PBKDF2 concurrency at 8 in batch-decrypt paths

**File: `src/lib/services/journalService.ts`**

Added `mapConcurrent<T,U>` (20-line zero-dependency worker-pool) and applied it
to all three batch-decrypt call sites:
- `getAllEntries` (used by TimelineView, searchEntries)
- `getEntriesByDateRange` (used by CalendarPage)
- `getEntriesOnThisDay`

**Why:** `Promise.all(rows.map(decryptEntry))` fires N simultaneous 600k-iteration
PBKDF2 derivations. With 100+ entries each unique salt = 100+ cache misses queued at
once. WebCrypto queues them all into the platform's crypto thread pool, creating
memory pressure and unpredictable latency spikes.

**Numbers (estimated from PBKDF2 single-op ~35ms on modern hardware):**

| Entries | Before (unbounded) | After (8-concurrent) |
|---------|--------------------|----------------------|
| 10 | ~35ms (parallel) | ~35ms |
| 50 | ~35ms (parallel, but peak mem) | ~180ms (~35ms × 50/8 rounds) |
| 100 | unpredictable (scheduler overload) | ~440ms |
| 500 | likely OOM or hang on low-RAM devices | ~2,200ms |

The tradeoff is throughput for memory safety. 8 workers means 8× speedup vs.
sequential while keeping queue depth constant. Users with cold caches (first load
or new entry-salt) will see deterministic linear scaling instead of OOM/stall.

Note: subsequent loads benefit from `sessionKeyCache` (HMAC-keyed, per-session) —
same (password, salt) pair is a cache hit with zero PBKDF2 cost.

---

## Confirmed Not Regressed

- All 1337 tests pass
- TypeScript strict-mode clean
- `INEFFECTIVE_DYNAMIC_IMPORT` for `WritingView` is expected and correct:
  `BreakoutWriterApp` statically imports `WritingView` so it can render it
  synchronously in the standalone writer window. Not a regression.
- Encryption correctness unchanged: 600k PBKDF2 iterations, AES-256-GCM,
  random salt per entry, `sessionKeyCache` — all preserved.

---

## Bigger Wins Needing Architectural Change

These were identified but not done here (out of scope or require product decision):

### A. TipTap still loads with WritingView (first view shown)
`WritingView` is the default landing view. Even though it's a separate lazy chunk,
it loads immediately on first render. The 567 kB `vendor-editor` chunk is fetched
on first view. Options:
- Show a different default view (Timeline) so editor loads lazily — product decision
- Preload `vendor-editor` with `<link rel="modulepreload">` during idle — safe
- Profile actual Time-to-Interactive in Tauri WebView to see if it's even a bottleneck

### B. PBKDF2 is O(n) on cold start; sessionKeyCache doesn't help first load
Every entry has a unique salt → every first-load decryption is a PBKDF2 miss.
Architectural fixes:
- **Option 1:** Single shared salt per session (all entries encrypted under one key).
  Eliminates the O(n) problem entirely. Major migration + reduces theoretical
  security isolation between entries — not recommended without threat-model review.
- **Option 2:** Paginate `getAllEntries` — show first 50 immediately, load rest in
  background. TimelineView would need virtual scrolling. Largest user-visible win.
- **Option 3:** Move key derivation to a WebWorker thread to unblock the main thread
  during bulk decryption.

### C. Knip reported 57 unused exports
Mostly barrel `index.ts` re-exports and type-only interfaces that TypeScript
retains. Safe to clean up but out of scope for this audit.

### D. Two QR code libraries in the bundle
`qrcode.react` is statically imported in `TotpSetup` (Settings → Privacy → 2FA).
`qrcode` is dynamically imported in `PairingHooks`. The static one pulls in the
full library into `SettingsPage` chunk (141 kB / 32 kB gzip).
Could consolidate to one library + lazy-load, saving ~15 kB gzip from SettingsPage.

---

## Files Changed

```
src/App.tsx                          (lazy-load views)
src/lib/services/crypto.ts           (bufferToBase64 chunked)
src/lib/services/journalService.ts   (PBKDF2 concurrency limiter)
vite.config.ts                       (manualChunks for vendor splitting)
HANDOFF-perf-bundle-audit.md         (this file)
```
