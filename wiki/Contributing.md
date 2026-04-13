# Contributing to MoodHaven Journal

MoodHaven is MIT-licensed and built in public. Contributions of all kinds are welcome.

---

## How to Report a Bug

1. Check [existing issues](https://github.com/kenlacroix/moodhaven-journal/issues) first.
2. Open a new issue with:
   - Platform (Windows / macOS / Linux / Web) and version
   - Steps to reproduce
   - What you expected vs. what happened
   - Log file if available (Settings → About → Open Log Folder)

## How to Submit a PR

1. Fork the repo and create a branch: `feat/your-feature` or `fix/the-bug`
2. Run tests before submitting: `npm test`
3. Run type checks: `npm run typecheck`
4. Keep PRs focused — max ~400 lines changed
5. Follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `docs:`

## Security Issues

**Do not open a public issue for security vulnerabilities.** See [SECURITY.md](https://github.com/kenlacroix/moodhaven-journal/blob/main/SECURITY.md) for the responsible disclosure process.

## Development Setup

```bash
# Prerequisites: Node 18+, Rust toolchain (rustup)
# Linux also needs: libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

npm install
npm run tauri dev          # desktop app with hot reload
npm run dev:web            # browser-only mode (no Rust needed)
npm test                   # run all 693 tests
npm run typecheck          # tsc --noEmit
```

See **[Building from Source](Building-from-Source)** for platform-specific prerequisites.

## Architecture Notes

Before making significant changes, read:

- **[Architecture Overview](Architecture-Overview)** — directory structure, data flow, store/hook/service pattern
- **[Tauri Command Reference](Tauri-Command-Reference)** — how to add new Rust commands
- **[Security Model](Security-Model)** — non-negotiable security constraints

## Code Style

- TypeScript strict mode — no `any` types
- Zustand stores → hooks → service layer → Tauri IPC (don't skip layers)
- New Tauri commands must be registered in `lib.rs`, `mod.rs`, `capabilities/default.json`, and have a TypeScript IPC wrapper in `src/lib/`
- Never hold the SQLite mutex across an `await` call
