# MoodBloom — AI Assistant Guidelines

**MoodBloom** is a cross-platform desktop journaling app with mood tracking and AI-powered insights.
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
| `src-tauri/src/lib.rs` | All ~96 Tauri command registrations |
| `src-tauri/src/db/mod.rs` | SQLite schema, migrations, Database struct |
| `src/App.tsx` | React root |
| `src/stores/` | 4 Zustand stores (app, settings, books, …) |
| `src/lib/crypto.ts` | AES-256-GCM encryption (PBKDF2 key derivation) |
| `src/lib/cloudSyncService.ts` | WebDAV sync orchestration |
| `src/lib/peerSyncEngineService.ts` | P2P sync IPC wrappers |
| `src/types/settings.ts` | App settings type definitions |
| `vitest.config.ts` | Test runner config |
| `src/test/setup.ts` | Global test setup + Tauri IPC mock |

---

## Commands

```bash
npm run tauri dev          # dev server with hot reload
npm run tauri build        # production build
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
