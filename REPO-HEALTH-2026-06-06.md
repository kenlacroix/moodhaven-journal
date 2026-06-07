# MoodHaven Journal — Whole-Repo Health Report
**Date:** 2026-06-06  
**Repo:** `kenlacroix/moodhaven-journal` (local: `MoodBloom-Tauri`)  
**Version on disk:** `1.7.0` (VERSION file) / `1.8.0` (git log — discrepancy flagged below)  
**Assessment scope:** main branch + unmerged task branches, all HANDOFF docs, CI config, full source tree  
**Mode:** Report-only. No code, docs, or branches were changed.

---

## 1. Executive Scorecard

| Dimension | Status | One-line verdict |
|-----------|--------|-----------------|
| Architecture & Code Quality | 🟡 | Sound layered design; 56 unmerged branches and 57 dead exports signal cleanup debt |
| **Security & Privacy** *(weighted 2×)* | 🟢 | Strong crypto posture post-pentest cycle; 8 documented residual gaps, none catastrophic |
| Test Health | 🟡 | 1337 TS + 139 Rust tests, but 35% statement coverage; peer TCP sync and STT entirely dark |
| Dependency Health | 🟡 | 0 CVEs; major upgrade backlog (React 19, Tailwind 4, TS 6, ESLint 10) is growing |
| Performance | 🟢 | 67% bundle reduction shipped; PBKDF2 concurrency fixed; O(n) cold-start remains open |
| Documentation | 🟡 | Reference docs strong; tutorials nonexistent; Browser/PWA mode entirely undocumented |
| UX & Accessibility | 🟡 | Aria pass done; color contrast unaudited; focus trap missing; axe-core not in CI |
| Repo & CI Hygiene | 🟡 | CI is excellent; 20+ stale branches + VERSION/CHANGELOG mismatch erode confidence |
| Trajectory | 🟢 | 185 commits in 30 days, active security investment, mature handoff process |

**Overall health: 🟡 Solid foundation, actively improving — remediation backlog is well-catalogued but needs sequenced execution.**

---

## 2. Top 5–7 Risks (ranked by severity × likelihood)

### RISK-1 — OAuth tokens stored in plaintext SQLite  
**Severity:** HIGH · **Likelihood:** CERTAIN (known Phase 1 gap)  
**Impact:** A local filesystem attacker, a compromised backup, or any code that reads the SQLite file gains Dropbox/Google Drive tokens in cleartext, enabling full cloud storage access even after the app is locked.  
**Source:** `HANDOFF-architecture-docs.md` § "What's Left" item 6; `threat-model.md` T10 residual risks; `cloud_providers.rs` — `cloud_{provider}_access_token` rows have no `__enc_v1:` prefix.  
**Cheapest credible mitigation:** Apply the existing `secureStorage.ts` (`__enc_v1:` AES-GCM) pattern to OAuth token columns. Already done for OpenAI key, WebDAV password, Oura PAT — this is a single PR following an established pattern.

---

### RISK-2 — Test coverage at 35% with zero coverage on peer sync and STT  
**Severity:** MEDIUM · **Likelihood:** HIGH (any change to these modules carries silent bug risk)  
**Impact:** The peer sync engine (`connection.rs`, `mod.rs` ~1,200+ lines) and STT sidecar are the two highest-complexity, highest-security-surface modules in the codebase. Silent regressions in key exchange, LWW conflict resolution, or sidecar path handling will not be caught by CI.  
**Source:** `HANDOFF-test-coverage-raise.md` — explicit uncovered path table.  
**Cheapest credible mitigation:** Peer sync needs an integration test harness (two in-process TCP peers); STT needs a test-mode stub sidecar. Both are pre-scoped in the handoff. Raises the floor from 35% to ~45% while covering the two riskiest paths.

---

### RISK-3 — Voice memo audio unencrypted on disk  
**Severity:** MEDIUM · **Likelihood:** CERTAIN (current behavior)  
**Impact:** `.m4a` / `.webm` files in `voice_memos_incoming/` and the permanent voice store are in plaintext. A local attacker or backup read of the app data directory exposes raw audio even when the journal is locked.  
**Source:** `HANDOFF-architecture-docs.md` § "What's Left" item 3; `threat-model.md` mitigations-vs-gaps table.  
**Cheapest credible mitigation:** Encrypt audio files at rest using the session key immediately after recording, decrypt to a temp file for transcription, then delete the temp. Consistent with how journal content is handled.

---

### RISK-4 — VERSION file out of sync with git log  
**Severity:** LOW · **Likelihood:** CERTAIN (observed)  
**Impact:** `cat VERSION` → `1.7.0`. `git log` on main → `cf1a708 chore: bump version to 1.8.0`. CHANGELOG shows `[1.8.0] — 2026-06-07` (tomorrow) and `[1.7.5] — 2026-06-07`. Release process is either running ahead of version commits or VERSION is not being updated in lockstep with CHANGELOG. Downstream: any tooling or CI that reads VERSION will report the wrong version; update check logic may misfire.  
**Cheapest credible mitigation:** Audit the release script / `/ship` workflow to ensure VERSION, Cargo.toml version, and CHANGELOG are updated atomically. Add a CI lint step that validates all three agree.

---

### RISK-5 — sync v1 static-key fallback still in code (no forward secrecy)  
**Severity:** MEDIUM · **Likelihood:** LOW (requires active v1 peer)  
**Impact:** `derive_sync_key_static` (SHA-256 over shared device identity) remains as a fallback when a peer doesn't speak v2 ECDH. If an attacker captures sync traffic and later compromises either device's identity key, they can retroactively decrypt all traffic that used the v1 path. All shipped clients are v2-capable — the fallback is dead weight with non-zero attack surface.  
**Source:** `HANDOFF-architecture-docs.md` § "What's Left" item 2; `peer-sync-security.md` updated v2 protocol.  
**Cheapest credible mitigation:** Remove `derive_sync_key_static` and the v1 negotiation branch. Bump minimum protocol version to 2 in the HELLO message. One PR, low risk since no v1-only clients are in the wild.

---

### RISK-6 — 20+ stale unmerged branches (some 60+ days old) creating merge debt  
**Severity:** LOW · **Likelihood:** GROWING  
**Impact:** `feat/android-wear-companion-polish`, `feat/web-port`, `docs/web-port-planning`, `refactor/settings-page-split-and-capsule-tests`, `chore-lib-restructure`, and ~15 others have had no commits since late March or early April 2026. They diverge further with every main merge. Reviving any of them will require significant conflict resolution. The branch list also makes it harder to gauge what's actually in flight.  
**Cheapest credible mitigation:** Triage session: archive or delete branches whose work was superseded (e.g., `feat/web-port` if WP-001–004 are deferred). Keep only actively worked branches open.

---

### RISK-7 — Google Drive client_secret compiled into binary  
**Severity:** MEDIUM · **Likelihood:** CERTAIN (current build)  
**Impact:** `GOOGLE_CLIENT_SECRET_PLACEHOLDER` is a constant in `cloud_providers.rs`. When a real secret is injected for production builds, it can be extracted from the binary with standard reverse-engineering tools. This is a known Phase 1 gap but becomes a higher risk as cloud sync moves toward production.  
**Source:** `HANDOFF-architecture-docs.md` § "What's Left" item 7.  
**Cheapest credible mitigation:** CI-inject the secret at build time (GitHub Actions secret → `-DGOOGLE_CLIENT_SECRET=...` build flag), never storing it in source. This is standard practice for Tauri apps with OAuth. Phase 2 scope.

---

## 3. Per-Dimension Detail

### 3.1 Architecture & Code Quality — 🟡

**What's working:**
- Clean separation: Rust commands in `src-tauri/src/commands/`, React UI in `src/`, IPC wrappers in `src/lib/services/`. The boundary is consistently respected.
- Module contracts are well-defined: `crypto.ts` owns all encryption, `sessionKeyCache` prevents repeated PBKDF2, `secureStorage.ts` handles sensitive settings. Patterns are repeatable.
- Tauri ACL enforced via `capabilities/default.json`. `require_unlocked()` guards ~130 of ~156 IPC commands.
- TypeScript strict mode enforced; no committed `any` types per convention.
- Conventional commits, PR-gated development, CI on every push/PR.

**Debt and concerns:**
- **57 unused exports** (Knip — `HANDOFF-perf-bundle-audit.md`): barrel re-exports and orphaned type interfaces. Low risk individually, but they inflate the surface area that tools like Knip need to track and slow dead-code detection over time.
- **Two QR code libraries** (`qrcode.react` in TotpSetup, `qrcode` in PairingHooks): ~15 kB gzip duplication in the Settings chunk. One should be consolidated.
- **`architecture.md` data model stale**: the `journal_entries` schema still shows `content TEXT`; actual column is `encrypted_content TEXT` (`HANDOFF-architecture-docs.md` item 8). Misleads any auditor reading the doc.
- **`lib.rs` registers ~156 commands**: this file is a registration list, not logic, but at this scale it's worth confirming that retired commands are removed promptly (ACL-002 from PT4 found 3 stale entries — good that it was caught by pentest, concerning that CI didn't).
- **`cloud_providers.rs`** is the largest single command file at 936 lines. Phase 1 cloud sync is largely a stub (placeholder credentials, no token encryption, no auto-sync) but the scaffolding is already dense. Complexity will compound in Phase 2.
- **Active plans:** `active-plans/android-companion-polish.md` and `active-plans/ios-app-v2-0.md` suggest two substantial features in flight simultaneously. Context: Android companion (Kotlin + Wear OS Health Services) and iOS Phase 2 are both long-horizon work. No architectural risk now, but sequencing matters.
- **Open TODOS (from TODOS.md):**
  - `STILL-001`: `stillCompleteSession` / `stillAbandonSession` "Session not found" errors crash reconnect flow
  - `STILL-002`: Oura cache key timezone mismatch (UTC vs local-time ISO 8601) — off-by-one bug for UTC+ users
  - `STILL-003`: `duration_seconds` accepts negative values — no input validation
  - `WP-001–004`: Web port Phase 2 deferred (LAN sync bridge, WebAssembly STT, delta WebDAV, WebAuthn)
  - `SETTINGS-002`: Per-tab React.lazy() (micro-optimization, deferred)
  - `STILL-B-001` (watch side): Live HR adaptation on watch requires Kotlin Health Services work, still pending

---

### 3.2 Security & Privacy — 🟢 *(weighted 2×)*

**Crypto posture — strong:**
- AES-256-GCM with PBKDF2 (600k iterations, per-entry random salt and IV). No nonce reuse possible by construction.
- Session key cache uses `HMAC-SHA256(session_nonce, password)` as key — password not used as map key, cleared from memory with `Zeroizing<String>` on retrieval.
- TOTP encrypted at rest (`enc:v1:` prefix); backup codes use PBKDF2-v2 (600k iterations per code).
- Peer sync: X25519 ECDH forward-secret transport keys + Ed25519 HELLO challenge/response. LWW timestamp validation with `MAX_FUTURE_SECS = 10`.
- Password rate limiter (5 failures → 30s lockout) enforced Rust-side; not bypassable from JS.
- `TwoFactorPendingState` enforced in Rust — frontend cannot call `unlock_app` without completing 2FA.
- `require_unlocked()` guards 130/156 IPC commands.
- npm audit: 0 vulnerabilities. cargo audit: 0 CVEs.
- No hardcoded secrets in git history (gitleaks in CI, runs on full history).
- 5 pentest cycles (PT1–PT5) with tracked findings — active security investment.

**Resolved findings (today, `task/security-hardening`):**
| Finding | Severity | Fix |
|---------|----------|-----|
| Export version mismatch (`"1.1.0"` not in import allowlist — all backups fail to restore) | HIGH | `"1.1.0"` added to `ALLOWED_IMPORT_VERSIONS` |
| `http://` allowed for WebDAV (credential leakage) | MEDIUM | Warning added in `validateWebDAVUrl` |
| `write_text_file` Windows path protection incomplete | LOW | `#[cfg(target_os = "windows")]` blocked prefix guards added |
| `verify_totp_code` setup flow lacks rate limiter | LOW | `PasswordRateLimiter` shared budget added |

**Residual gaps (documented, not yet fixed):**

| Gap | Severity | Location | Decision required? |
|-----|----------|----------|--------------------|
| OAuth tokens unencrypted in SQLite | MEDIUM | `cloud_providers.rs` | No — apply existing `__enc_v1:` pattern |
| Google Drive `client_secret` in binary | MEDIUM | `cloud_providers.rs` | Yes — CI secret injection |
| Voice memo audio unencrypted on disk | MEDIUM | `voice_memos_incoming/` | No — encrypt at write, decrypt to temp |
| Binary restore frames bypass transport encryption | MEDIUM | `connection.rs:46–64` | Yes — protocol v3 change required |
| sync v1 static-key fallback (no forward secrecy) | MEDIUM | `peer_sync_engine/crypto.rs` | No — remove fallback |
| `peer_key.bin` Ed25519 private key unencrypted | LOW | `peer_identity.rs` | Yes — OS keyring vs. passphrase-protected |
| Restore checksum fail-open when `.sha256` absent | LOW | `mod.rs:1743–1748` | No — harden after 2–3 release cycles |
| Sidecar binary integrity not verified at runtime | LOW | `speech_to_text.rs` | Yes — hash distribution model |
| WebDAV restore not hash-verified (replay risk) | LOW | `cloudSyncService.ts` | No — add ETag/content-hash check |
| `unlock_app` IPC bypass gap (no password re-verify) | LOW | `session_bridge.rs` | Yes — threat model scope decision |

**cargo audit:** 0 CVEs. 19 unmaintained-crate warnings, all transitive via Tauri/wry/GTK3 bindings. None affect runtime code paths. Track at next major Tauri version upgrade.

---

### 3.3 Test Health — 🟡

**Coverage baseline (post `task/test-coverage-raise`, PR #99 draft):**

| Metric | Current |
|--------|---------|
| Statements | 35.51% |
| Branches | 27.47% |
| Functions | 30.92% |
| Lines | 36.32% |

TypeScript: 1337 tests / ~90 files. Rust: 139 tests. CI matrix: Node 20.19 + 22, Rust on Ubuntu / Windows / macOS.

**What's well covered:**
- `crypto.ts` — round-trip, tamper detection, wrong-key rejection, buffer overflow fix (`bufferToBase64`)
- `syncManifest`, `syncEngine`, `signalService`, `deviceIdentity` — the security contracts are tested
- `peer_sync_engine/crypto.rs`, `protocol.rs`, `conflict.rs` — 52 Rust tests covering crypto, LWW, clock-skew
- All service IPC wrappers have argument-shape tests
- AI card components, analytics charts, hooks — all have test files

**Highest-risk uncovered paths:**
| Path | Risk | Notes |
|------|------|-------|
| Peer TCP sync engine (`connection.rs`, `mod.rs`, ~1,200 lines) | HIGH | Requires two in-process TCP peers; no harness yet |
| STT sidecar (`speech_to_text.rs`, 819 lines) | HIGH | Requires real or stub whisper binary; not in CI |
| Full WebDAV sync integration | MEDIUM | Mocked at boundary only |
| All React UI components | LOW-MEDIUM | Intentionally 0%; noted as future work in testing.md |
| `booksService`, `mediaService`, `peerSyncEngineService` | LOW | IPC-thin; minimal logic to test |

**Test quality observations:**
- No obviously tautological tests found in reviewed files. Security contract tests (`signalService.test.ts`) test meaningful invariants (plaintext never appears in IPC call, wrong password throws).
- syncEngine tests mock crypto for speed (real PBKDF2 tested separately in `syncManifest.test.ts`) — acceptable trade-off, documented.
- No flaky test signals from CI history (no "flaky" labels, no retry-on-failure configuration found).
- Rust tests use `#[cfg(test)] mod tests` (correct Rust idiom, not compiled into release).

---

### 3.4 Dependency Health — 🟡

**Clean slate (no CVEs or high vulns):**
- `npm audit`: 0 vulnerabilities (after `dep-modernization` branch, PR #98 draft)
- `cargo audit`: 0 CVEs, 19 unmaintained-crate warnings (all transitive/unfixable)
- `cargo deny` in CI for supply-chain policy enforcement

**Patch/minor updates applied (dep-modernization PR #98):**
- `@tiptap/*` 3.23.5 → 3.26.0, Tauri plugins to latest 2.x, dompurify 3.4.5 → 3.4.8, vite 8.0.13 → 8.0.16, base64 Rust 0.21 → 0.22, image 0.24 → 0.25

**Deferred (blocked by API changes — require dedicated branches):**

| Package | Current | Latest | Risk |
|---------|---------|--------|------|
| `rand` (Rust) | 0.8 | 0.10 | Security-sensitive crypto paths; API changed. Explicit audit required. |
| `rusqlite` | 0.31 | 0.40 | 9 major versions; schema migration risk. Incremental only. |
| `mdns-sd` | 0.11 | 0.20 | Significant API surface; `peer_discovery.rs` (~600 lines) requires full audit. |
| `flume` | 0.11 | 0.12 | Blocked by `mdns-sd 0.11` hard-dep. Upgrade together. |
| React | 18.3.1 | 19.2.7 | Major rewrite (concurrent features, changed APIs). Dedicated branch. |
| Tailwind | 3.4.19 | 4.3.0 | Configuration format completely changed. Requires `tailwind.config.js` rewrite. |
| TypeScript | 5.9.3 | 6.0.3 | Major; verify strict mode behavior. |
| ESLint | 8.57.1 | 10.4.1 | Requires flat config migration. |
| `@typescript-eslint/*` | 7.x | 8.x | Blocked on ESLint 9+. |
| `zustand` | 4.5.7 | 5.0.14 | Changed store API; all 4 stores affected. |

**Priority note:** The Rust crypto deps (`rand`, `rusqlite`) carry more risk than the JS tooling upgrades. Addressing them before they diverge further (currently 0 CVEs but growing API gap) is higher priority than React 19.

---

### 3.5 Performance — 🟢

**Shipped improvements (task/perf-bundle-audit):**
- Initial JS: 1,440 kB raw / 485 kB gzip → 501 kB raw / **129 kB gzip** (67% reduction via lazy-loading 9 views)
- `vendor-editor` (TipTap/ProseMirror): isolated as separate cacheable chunk (567 kB / 183 kB gzip)
- PBKDF2 concurrency capped at 8 concurrent decrypt ops — prevents OOM/hang at 100+ entries
- `bufferToBase64` fixed: O(n) string concatenation → chunked `String.fromCharCode.apply` (prevents call-stack overflow on large ciphertext)

**Remaining open items:**
- **TipTap loads on first view** (`WritingView` is default landing view): `vendor-editor` (183 kB gzip) is fetched on first render. Adding `<link rel="modulepreload">` during idle would help; changing the default landing view to Timeline is a product decision.
- **PBKDF2 cold-start O(n)**: with 100+ entries, first-load decrypt takes ~440ms even with concurrency cap. `sessionKeyCache` helps on warm loads. Long-term fix: paginate `getAllEntries` (show first 50 immediately) + virtual scrolling in TimelineView.
- **Delta WebDAV sync** (WP-003): current full-snapshot re-encryption on every save is O(n). With 1000+ entries this will be slow. Deferred to Phase 2, but the ETag/If-Match P0 blocker (silent data destruction on concurrent desktop+browser writes) should be addressed before Phase 1 ships.

---

### 3.6 Documentation — 🟡

**Diataxis coverage map:**

| Feature / Entity | Reference | How-to | Tutorial | Explanation |
|:--|:--:|:--:|:--:|:--:|
| AES-256-GCM encryption | ✅ | ❌ | ❌ | ✅ |
| Peer sync v2 protocol | ✅ | ❌ | ❌ | ✅ |
| WebDAV sync | ✅ | ✅ README | ❌ | ❌ |
| Dropbox / Google Drive | ✅ | ❌ | ❌ | ✅ |
| Threat model | ✅ | ❌ | ❌ | ✅ |
| 2FA (TOTP + hardware key) | ✅ | ❌ | ❌ | ✅ |
| Voice memos / STT | ✅ | ✅ | ❌ | ✅ |
| Watch companion | ✅ | ✅ | ❌ | ✅ |
| Time capsule | ✅ | ❌ | ❌ | ❌ |
| StillHaven | ✅ | ❌ | ❌ | ❌ |
| **Browser / PWA mode** | ❌ | ❌ | ❌ | ❌ |
| **First-run setup** | ❌ | ❌ | ❌ | ❌ |
| AI features / BYOK | ✅ | ❌ | ❌ | ✅ |
| Activity tagging | ❌ | ❌ | ❌ | ❌ |
| Mood analytics | ❌ | ❌ | ❌ | ❌ |

**Critical gaps:**
- **Browser / PWA mode**: zero coverage. `browser.ts`, `browser-invoke.ts`, and the ETag-guarded WebDAV flow that makes it work are undocumented. Any contributor touching these will be guessing.
- **First-run setup / unlock flow**: no how-to or tutorial. A new user (or QA engineer) has no guided path.
- **Activity tagging and mood analytics (v1.8.0 features)**: just shipped; docs not yet written.

**Documentation quality observations:**
- `docs/threat-model.md` (new, 2026-06-06): comprehensive, well-structured, cross-referenced to source constants. High value.
- `docs/peer-sync-security.md` (updated): corrected from v1-only to actual v2 implementation. Previously was materially false.
- `architecture.md` §8 sync protocol block: corrected. §data-model block: still stale (`content TEXT` → `encrypted_content TEXT`).
- SECURITY.md: now accurately reflects supported versions (was 7 minor versions stale).

---

### 3.7 UX & Accessibility — 🟡

**Completed (task/accessibility, 2026-06-06):**
- 11 commits covering EditorToolbar, Sidebar, PairingModal, SealEntryModal, TimeCapsuleRevealModal, PrivacyTab, SettingsPage, SpeechToTextTab, DevicesTab, MoodSelector
- Replaced `title` attributes with `aria-label` throughout; added `aria-expanded`, `aria-pressed`, `aria-current`, `role="tablist/tab/tabpanel/group/toolbar/dialog/alert/status"` where appropriate
- `prefers-reduced-motion` user setting now actually applies in WritingView (was wired but not firing)
- +45 regression tests for a11y invariants

**Unresolved gaps:**
- **Color contrast**: Mood color tokens (`#84cc16` good, `#eab308` neutral, `#f97316` low) are likely to fail WCAG AA 4.5:1 for small text against both light and dark backgrounds. Not measured — a designer needs to approve replacement tokens.
- **Focus trap**: No `focus-trap-react` integration. Tab key can escape modal overlays. PairingModal, SealEntryModal, PrivacyTab 2FA modals are all affected.
- **axe-core not in CI**: The app requires Tauri IPC which is unavailable in browser dev server without mocking. Running axe in CI requires either Playwright + Tauri WebDriver integration, or a fully mocked IPC layer in Vitest.
- **Screen reader testing**: No evidence of testing with VoiceOver or NVDA. The aria semantics are now structurally correct, but behavioral verification is missing.

---

### 3.8 Repo & CI Hygiene — 🟡

**CI strengths:**
- `test.yml`: frontend (Node 20.19 + 22 matrix), rust (ubuntu/windows/macos matrix), lint, secret scanning — comprehensive
- All Actions pinned to SHA hashes (security best practice; mitigates supply-chain substitution)
- Concurrency group cancellation prevents queued-up runs on force-push
- `cargo deny` for supply-chain policy; `gitleaks-action` for secrets scanning (full history checkout)
- `npm audit --audit-level=high` in CI; `cargo audit` in Rust job
- `cargo clippy --all-targets -- -D warnings` (deny warnings = no silent lints)
- Stub whisper sidecar creation for CI (avoids requiring real binary)

**Hygiene concerns:**
- **VERSION mismatch**: `VERSION` file reads `1.7.0`; `git log` on main shows `cf1a708 chore: bump version to 1.8.0`. CHANGELOG shows 1.8.0 dated 2026-06-07 (tomorrow) and 1.7.5 dated 2026-06-07. Either the release process is forward-dating entries or VERSION wasn't updated when the bump commit landed.
- **56 unmerged branches**: 20+ stale (last commit >60 days ago, as of 2026-06-06):
  - `feat/android-wear-companion-polish` (2026-04-03)
  - `feat/web-port`, `docs/web-port-planning` (2026-04-04)
  - `refactor/settings-page-split-and-capsule-tests` (2026-04-02)
  - `chore-lib-restructure` (2026-03-31)
  - `feat/animations`, `feat/db-performance`, `feat/logging-debug` (2026-03-27–28)
  - `feat/time-layer`, `docs/screenshot-gallery` (2026-03-25)
  - 10+ others from March 2026
- **PR-REVIEW-2026-06-05.md**: untracked file in repo root — review artifacts should not live in the working tree
- **4 draft PRs open** (`task/security-hardening`, `task/test-coverage-raise`, `task/perf-bundle-audit`, `task/dep-modernization`, `task/architecture-docs`): all are substantive improvements ready for review but blocked on human merge decision
- **`files(1).zip` untracked** (observed in sibling Seventeen repo, but check for similar in MoodBloom-Tauri)
- No branch protection rules visible from local inspection — confirm `main` requires PR + CI pass before merge on GitHub

---

### 3.9 Trajectory — 🟢

**Velocity:** 185 commits in the last 30 days, 570 in 90 days. High sustained cadence.

**Shipping cadence (from CHANGELOG):**
- v1.7.0 → v1.7.5 → v1.8.0 all in the last 7 days — rapid patch/minor release cycle
- Five pentest cycles (PT1–PT5) completed and findings addressed in dedicated security PRs
- Each major feature has a handoff doc + draft PR — good knowledge management

**Where momentum is concentrating:**
- Security hardening (5 pentest cycles, SQLCipher migration, ongoing /cso audits)
- Test coverage buildout (PR #99 draft, +100 tests)
- Dependency modernization (PR #98 draft)
- Performance (bundle audit done, waiting to merge)
- a11y (task/accessibility — done, waiting to merge)

**Where momentum is stalling:**
- 5 draft PRs all waiting for merge; if they pile up they'll create rebase conflicts with each other
- Watch companion live HR (STILL-B-001 watch side) — Kotlin/Health Services work blocked, no recent commits on that path
- iOS Phase 2 (`feat/ios-phase2-setup`) — in active-plans but no recent commits visible
- Browser/PWA Phase 2 features (WP-001–004) deferred; web port branch is 60+ days stale
- 20+ stale branches that represent abandoned or superseded work — no visible triage process

**Test health trend:** Improving. Coverage is being actively raised (35% → expected ~45% when PR #99 merges). Rust test suite went from 0 to 139 tests in recent work.

---

## 4. Prioritized Remediation Backlog

Items are sequenced by: (a) unblocks other work, (b) risk reduction per hour of effort, (c) momentum.

| # | Item | Maps to | Effort (est.) | Notes |
|---|------|---------|---------------|-------|
| 1 | **Merge draft PRs** (security, test coverage, perf, a11y, dep modernization, architecture docs) | All dims | ~2h review | 5 PRs waiting; merge conflicts will compound weekly. Merge in order: arch-docs → security → a11y → perf → test-coverage → dep-modernization |
| 2 | **Encrypt OAuth tokens in SQLite** (RISK-1) | Security | ~2h | Apply existing `secureStorage.ts` pattern. No architectural decision needed. |
| 3 | **Stale branch triage** (RISK-6) | CI hygiene | ~1h | Delete/archive 20+ branches from March 2026. Reduces cognitive load and future merge debt. |
| 4 | **Fix VERSION / CHANGELOG sync** (RISK-4) | CI hygiene | ~1h | Audit `/ship` workflow; add CI lint to verify VERSION == package.json version == Cargo.toml version. |
| 5 | **Remove sync v1 fallback** (RISK-5) | Security | ~2h | Delete `derive_sync_key_static` + v1 negotiation branch. Low risk: no v1-only peers in the wild. |
| 6 | **Fix STILL-001, STILL-002, STILL-003** (open TODOS) | Code quality | ~3h | STILL-001 (crash on reconnect), STILL-002 (UTC timezone bug), STILL-003 (negative duration). All scoped. |
| 7 | **Encrypt voice memo audio at rest** (RISK-3) | Security | ~4h | Encrypt on write, decrypt to temp for transcription. Follows journal content pattern. |
| 8 | **Peer sync integration test harness** (RISK-2) | Test health | ~1d | Two in-process TCP peers. Most impactful coverage improvement for risk reduction. |
| 9 | **Architecture.md data model fix** | Documentation | ~15min | Change `content TEXT` → `encrypted_content TEXT` in schema block. |
| 10 | **Browser/PWA mode docs** | Documentation | ~2h | Document `browser.ts`, `browser-invoke.ts`, ETag-guarded WebDAV, known limitations vs Tauri mode. |
| 11 | **ETag/If-Match P0 for WebDAV** (WP-003 blocker) | Security / data integrity | ~4h | Concurrent desktop+browser writes silently destroy data without ETag conditional PUT. Must land before Phase 1 cloud sync ships. |
| 12 | **Color contrast audit** | Accessibility | ~2h design | Mood color tokens vs WCAG AA 4.5:1. Requires designer approval before code change. |
| 13 | **Focus trap for modals** | Accessibility | ~3h | `focus-trap-react` integration. PairingModal, SealEntryModal, PrivacyTab modals. |
| 14 | **rand 0.8 → 0.10 Rust upgrade** | Dependency health | ~4h | Security-sensitive. Explicit audit of all use sites before upgrading. |
| 15 | **Consolidate QR code libraries** | Code quality / bundle | ~1h | Replace `qrcode.react` static import with existing `qrcode` dynamic import. ~15 kB gzip saving. |
| 16 | **Google Drive client_secret CI injection** (RISK-7) | Security | ~2h + infra | Phase 2 scope. Blocker before cloud sync production launch. |

**Long-running task alignment:**
- Security hardening: items 2, 5, 7, 11, 16
- Test buildout: item 8 (peer TCP harness)
- Dependency modernization: item 14 (rand), then mdns-sd, then rusqlite
- Documentation: items 9, 10
- Accessibility: items 12, 13

---

## 5. Open Questions / Human-Decision Items

**Q1 — Binary restore frame encryption (RISK-2 security, Finding 3)**  
`write_binary_frame` in `connection.rs:46–64` sends raw SQLite bytes during `peer_full_restore` without per-frame AES-GCM transport encryption. Fixing requires a breaking protocol change (both peers must be on protocol v3 simultaneously, or version negotiation added to HELLO). This is moderate effort with a compatibility risk window. **Decision needed:** ship protocol v3 (Option A) vs accept risk and add UI warning (Option B)?

**Q2 — `peer_key.bin` Ed25519 private key unencrypted**  
The device identity key (`peer_key.bin`, 0600 perms) is stored in plaintext. A local filesystem attacker can read it. Options: (a) protect with OS keyring (same approach as `biometricService.ts`), (b) passphrase-protect with the user's password (adds startup friction), (c) accept risk (local attacker has many other vectors anyway). **Decision needed:** what is the threat model tolerance here?

**Q3 — `unlock_app` IPC bypass gap**  
The Rust session lock trusts the frontend's call to `unlock_app` without re-verifying the password cryptographically. Hardening: add a password-derived HMAC token that Rust validates. This would close the gap documented in T9 of `threat-model.md`. But it changes the unlock flow and may add latency. **Decision needed:** is this within the threat model for a local desktop app?

**Q4 — WebDAV `http://` capability scope**  
The `task/security-hardening` PR added a UI warning for `http://` WebDAV endpoints but did NOT remove `{ "url": "http://**" }` from `capabilities/default.json`. If you want to enforce HTTPS-only, that requires a breaking change for users with local HTTP NAS setups. **Decision needed:** warning-only (current) vs enforce-HTTPS?

**Q5 — iOS Phase 2 scope and sequencing**  
`active-plans/ios-app-v2-0.md` is in flight. iOS requires a different build pipeline and has no equivalent of the Android companion path already established in CI. What is the intended sequencing vs. Android companion watch-side work (STILL-B-001)?

**Q6 — Release process ownership**  
The VERSION / CHANGELOG / Cargo.toml version discrepancy (item 4 in the backlog) suggests the release process may be manual and error-prone. Does `/ship` own this end-to-end? If not, who does, and is there a runbook?

---

## 6. Confirmation

**No code, docs, or branches were changed.** This is a read-only diagnostic. All findings are based on reading the codebase, HANDOFF documents, CHANGELOG, CI configuration, git log, and audit outputs as they exist on `main` at commit `dd84d84` (2026-06-06).

The next step is sequenced execution via the long-running task branches already open: merge the five draft PRs first (item 1), then work the security residuals (items 2, 5, 7) before Phase 1 cloud sync ships.

---

*This report is an AI-assisted assessment and is not a substitute for professional penetration testing or a formal security audit. For a production app handling sensitive personal data, engage a qualified security firm before public launch.*
