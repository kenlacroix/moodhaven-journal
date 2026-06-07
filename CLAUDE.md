# MoodHaven Journal — AI Assistant Guidelines

**MoodHaven Journal** is a cross-platform desktop journaling app with mood tracking and AI-powered insights.
Stack: Tauri v2 (Rust) + React + TypeScript + TailwindCSS + SQLite (rusqlite).
Platforms: Windows, Linux, macOS.

---

## Non-Obvious Conventions

**Rust commands**
- All `#[tauri::command]` functions must be registered in `src-tauri/src/lib.rs`
- New command modules → add to `src-tauri/src/commands/mod.rs` AND `lib.rs`
- Never hold the DB mutex across `await` or HTTP calls — get value, drop lock, then proceed
- `rusqlite` is non-reentrant: never call a db function from within a locked db function
- SQLite settings table created lazily via `ensure_settings_table()` in each command

**Frontend**
- Tauri IPC wrappers live in `src/lib/*.ts`; hooks live in `src/hooks/`
- In-flight feature plans live in `active-plans/` (git-tracked); completed plans archived in `docs/internal/plans/` (gitignored)
- Settings storage: `settings.json` (frontend Zustand) + SQLite `settings` table (`set_setting`)
- `tokio::join!` requires explicit tokio dep — prefer sequential `.await` instead
- `reqwest` is in Cargo.toml with `json + stream` features for Rust-side HTTP

**Security (non-negotiable)**
- Journal text content NEVER sent to external APIs — metadata only
- All encryption/decryption client-side; backend never sees plaintext
- No master keys, admin passwords, or cloud recovery mechanisms
- See @.claude/docs/security.md for full model, checklist, and forbidden patterns

**Design**
- Mood colors: excellent `#10b981`, good `#84cc16`, neutral `#eab308`, low `#f97316`, bad `#ef4444`
- Animations: `duration-200` micro-interactions, `duration-300` page transitions
- Always respect `prefers-reduced-motion`
- Min window size: 800×600

**Code quality**
- TypeScript strict mode — no `any` types
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
- Max 400 lines changed per PR

---

## Key Files

| File | Purpose |
|------|---------|
| `src-tauri/tauri.conf.json` | App config, sidecar binaries |
| `src-tauri/Cargo.toml` | Rust dependencies |
| `src-tauri/capabilities/default.json` | Tauri ACL — permitted commands + plugins |
| `src-tauri/src/lib.rs` | All ~150 Tauri command registrations |
| `src-tauri/src/db/mod.rs` | SQLite schema, migrations, Database struct |
| `src/App.tsx` | React root |
| `src/stores/` | 4 Zustand stores (app, settings, books, …) |
| `src/lib/services/logger.ts` | Structured logger wrapper around @tauri-apps/plugin-log |
| `src/lib/services/crypto.ts` | AES-256-GCM encryption (PBKDF2 key derivation) |
| `src/lib/services/cloudSyncService.ts` | WebDAV sync orchestration |
| `src/lib/services/cloudProvidersService.ts` | Dropbox + Google Drive OAuth PKCE IPC wrappers |
| `src/lib/services/pinUnlockService.ts` | PIN unlock IPC wrappers |
| `src/lib/services/biometricService.ts` | OS keyring biometric session unlock |
| `src/lib/services/http.ts` | Conditional fetch: `@tauri-apps/plugin-http` in Tauri, `window.fetch` in browser |
| `src/lib/services/peerSyncEngineService.ts` | P2P sync IPC wrappers |
| `src/lib/backend/browser.ts` | IndexedDB backend — all IDB operations for browser mode |
| `src/lib/backend/browser-invoke.ts` | Browser invoke shim — routes Tauri command names to IndexedDB |
| `src/lib/backend/browser-stubs.ts` | No-op stubs for Tauri-only plugins in browser builds |
| `src/types/settings.ts` | App settings type definitions |
| `src/lib/services/timeCapsuleService.ts` | Time capsule IPC wrappers |
| `src/types/analytics.ts` | `HeatmapDay`, `AnalyticsPeriod`, `ANALYTICS_PERIODS` type definitions |
| `src/lib/services/analyticsService.ts` | Analytics IPC wrappers including `getYearHeatmap()` |
| `src/components/analytics/MoodYearHeatmap.tsx` | 53-week SVG year heatmap for InsightsView |
| `src/components/analytics/StreakCalendar.tsx` | 12-week dot grid recent-activity calendar |
| `src/components/analytics/DayOfWeekPattern.tsx` | Best/worst day-of-week callout chips |
| `src/hooks/useTimeCapsule.ts` | Time capsule state + logic |
| `src/components/timecapsule/SealEntryModal.tsx` | Seal entry UI |
| `src/components/timecapsule/TimeCapsuleRevealModal.tsx` | Capsule reveal UI |
| `src/components/editor/RichTextEditor.tsx` | TipTap editor orchestrator (~320 lines) |
| `src/components/editor/EditorToolbar.tsx` | CollapsibleToolbar, MicButton, ToolbarBtn, QuickCaptureToggle |
| `src/components/editor/EditorRecording.tsx` | WaveformBars, RecordingStrip (STT recording UI) |
| `src/components/editor/EditorLinkDialog.tsx` | Link insert/edit modal |
| `src/components/editor/EditorIcons.tsx` | 13 TB*Icon SVG components |
| `src/components/editor/EditorStyles.css` | ProseMirror + slash command styles |
| `src/components/layout/Sidebar.tsx` | Sidebar shell — collapsed state + composition (~100 lines) |
| `src/components/layout/SidebarHeader.tsx` | Settings icon + sync indicator |
| `src/components/layout/SidebarNavigation.tsx` | Main nav items (All Entries, Insights, Calendar…) |
| `src/components/layout/SidebarBooks.tsx` | My Books section + new book modal |
| `src/components/layout/SidebarPrompts.tsx` | Support/download prompts, update banner, sparkline, footer |
| `src/components/peer-sync/DevicesTab.tsx` | Sync settings tab orchestrator |
| `src/components/peer-sync/DevicesThisDevice.tsx` | ThisDeviceCard + RenameForm |
| `src/components/peer-sync/DevicesNearby.tsx` | NearbyPeerRow, EmptyNearby, SyncStatusInline |
| `src/components/peer-sync/DevicesSyncOptions.tsx` | LAN-only toggle + sync interval select |
| `src/components/peer-sync/DeviceIconSet.tsx` | DeviceIcon, SignalBars, ScanningDots atoms |
| `src/components/peer-sync/PairingModal.tsx` | Pairing modal shell (~120 lines) |
| `src/components/peer-sync/PairingShowCodeTab.tsx` | Server-side PIN/QR tab |
| `src/components/peer-sync/PairingEnterCodeTab.tsx` | Client-side PIN entry tab |
| `src/components/peer-sync/PairingUIComponents.tsx` | PINDisplay, PINInput, SuccessScreen, LockedBanner |
| `src/components/peer-sync/PairingHooks.ts` | useQRCode, useCountdown, formatCountdown |
| `src/components/settings/tabs/PrivacyTab.tsx` | Privacy tab orchestrator + 2FA modals (~130 lines) |
| `src/components/settings/tabs/PrivacyTwoFactor.tsx` | Full 2FA section (enabled/disabled states) |
| `src/components/settings/tabs/PrivacyDataManagement.tsx` | Data stats, export, reset + confirm modal |
| `src/components/settings/tabs/PrivacyBiometric.tsx` | Biometric unlock — OS keyring (desktop) + Android |
| `src/components/settings/tabs/PrivacyPinUnlock.tsx` | PIN unlock setup + disable UI |
| `src/components/settings/tabs/PrivacyAutoLock.tsx` | Auto-lock timeout + clipboard clear |
| `src/components/settings/tabs/PrivacyTransparency.tsx` | TransparencySection + PrivacyStatRow |
| `src/components/voice-memo/VoiceMemoDraftCard.tsx` | Compact Timeline draft card — duration, context chip, mood dots, Review/Discard CTAs |
| `src/components/voice-memo/VoiceDraftEditor.tsx` | Full-screen draft editor with hashtag pills; encrypts on publish |
| `src/hooks/useVoiceMemoDrafts.ts` | Draft list state + publishDraft + discardDraft |
| `src/components/writing/AppearanceDrawer.tsx` | WritingView appearance panel — font, size, line height, tint, a11y options |
| `src/modules/stillhaven/components/StillEffectCard.tsx` | Per-protocol effect stats table + best-protocol recommendation chip in Session History |
| `vitest.config.ts` | Test runner config |
| `src/test/setup.ts` | Global test setup + Tauri IPC mock |

---

## Commands

```bash
npm run tauri dev          # dev server with hot reload
npm run tauri build        # production build
npm run dev:web            # browser dev server (no Rust needed)
npm run build:web          # browser build → dist-web/
npm test                   # run all tests
npm run test:watch         # watch mode
npm run typecheck          # tsc --noEmit
npm run lint               # ESLint
cd src-tauri && cargo check
```

---

## Detailed References

- Security model & checklist: @.claude/docs/security.md
- Testing guide + coverage table: @.claude/docs/testing.md
- Cross-platform build guide: @.claude/docs/build.md
- AI integration & STT architecture: @.claude/docs/ai-features.md
- Architecture overview: @docs/architecture.md
- Tauri commands reference: @docs/tauri-commands.md
- Peer sync security: @docs/peer-sync-security.md
- STT setup: @docs/speech-to-text.md
- Watch companion: @docs/watch-companion.md
- Browser / PWA mode: @docs/browser-pwa-mode.md
- Getting started (first-run tutorial): @docs/howto-getting-started.md
- Time Capsule user guide: @docs/howto-time-capsule.md
- StillHaven user guide: @docs/howto-stillhaven.md
- Mood analytics user guide: @docs/howto-mood-analytics.md

## Health Stack

- typecheck: tsc --noEmit
- lint: npm run lint:ci
- test: vitest run
- deadcode: knip
- rust: cargo check && cargo fmt --check

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health

## GBrain Configuration (configured by /setup-gbrain)
- Mode: local-stdio
- Engine: pglite
- Config file: ~/.gbrain/config.json (mode 0600)
- Setup date: 2026-05-31
- MCP registered: yes (user scope)
- Artifacts sync: full → https://github.com/kenlacroix/gstack-artifacts-ken (private)
- Current repo policy: read-write (kenlacroix/moodhaven-journal)
- Note: OpenAI embedding key needs updating — OPENAI_API_KEY in env returns 401. Vector search degraded until fixed; text search works.

## GBrain Search Guidance (configured by /sync-gbrain)
<!-- gstack-gbrain-search-guidance:start -->

GBrain is set up on this machine. Prefer gbrain over Grep for semantic questions.

Prefer gbrain when:
- "Where is X handled?" — `gbrain search "<terms>"` or `gbrain query "<question>"`
- Symbol lookup — `gbrain code-def <symbol>` or `gbrain code-refs <symbol>`
- "What calls Y?" — `gbrain code-callers <symbol>`
- Past decisions/retros — `gbrain search "<terms>" --source gstack-brain-ken`

Grep is still right for exact strings, regex, and file globs.
Run `/sync-gbrain` to force-refresh.

<!-- gstack-gbrain-search-guidance:end -->
