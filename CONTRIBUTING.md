# Contributing to MoodBloom

Thank you for considering a contribution. MoodBloom is a privacy-first journaling app — please keep that principle front-of-mind whenever you add or change code.

---

## Table of Contents

- [Ways to Contribute](#ways-to-contribute)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Commit and PR Conventions](#commit-and-pr-conventions)
- [Security Issues](#security-issues)
- [Architecture Guide](#architecture-guide)

---

## Ways to Contribute

| Area | Examples |
|:---|:---|
| **Bug reports** | Crashes, data not saving, incorrect behaviour |
| **Security review** | Encryption implementation, IPC validation, peer sync |
| **Accessibility** | WCAG 2.1 AA gaps, keyboard navigation, screen reader support |
| **Internationalisation** | Translation support, RTL layout |
| **UI / UX** | Designs, mockups, screenshots for the README |
| **Documentation** | Guides, tutorials, corrections |
| **Tests** | Coverage for uncovered modules, E2E tests |

Please **open an issue** to discuss significant changes before opening a pull request. This avoids duplicated effort and lets us align on approach.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) 1.77+
- Platform-specific build tools (see [README — Building from Source](README.md#building-from-source))

### Clone and Run

```bash
git clone https://github.com/kenlacroix/moodhaven-journal.git
cd moodhaven-journal
npm install
npm run tauri:dev      # Hot-reload dev server
```

### Verify the Setup

```bash
npm test               # All 371 tests should pass
npm run typecheck      # No TypeScript errors
cd src-tauri && cargo check    # Rust compiles cleanly
```

---

## Development Workflow

1. **Fork** the repository and create a branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make your changes.** Follow the code standards below.

3. **Write or update tests** for any changed logic.

4. **Run the full check suite** before pushing:
   ```bash
   npm test
   npm run typecheck
   npm run lint
   cd src-tauri && cargo check
   ```

5. **Open a pull request** against `main` with a clear description of what changed and why.

---

## Code Standards

### TypeScript

- **Strict mode** — `any` is not allowed; use specific types or `unknown`.
- **No silent failures** — propagate errors; don't swallow them with empty `catch` blocks.
- All new service functions should have matching `.test.ts` coverage.

### Rust

- All Tauri commands must be `async` and decorated with `#[tauri::command]`.
- New command modules must be declared in `src-tauri/src/commands/mod.rs` and registered in `src-tauri/src/lib.rs`.
- Never hold a `Mutex` lock across an `await` or HTTP call — acquire, copy the value, drop the lock, then proceed.
- Never call a DB function from within another DB function that already holds the lock (non-reentrant mutex).

### Privacy & Security (mandatory)

- Journal text must **never** appear in logs, error messages, or IPC payloads in plaintext.
- Sensitive settings (API keys, PATs, WebDAV passwords) must go through the encrypted settings store.
- Any new metadata stored unencrypted must be justified (required for analytics or ordering) and documented in `SECURITY.md`.
- New Tauri commands must be added to `src-tauri/capabilities/default.json` before they can be called from the frontend.

### UI

- Follow the existing colour palette and spacing. See `CLAUDE.md §3` for design tokens.
- Use `transition-all duration-200` for micro-interactions; `duration-300` for page transitions.
- Respect `prefers-reduced-motion`.
- All interactive elements must be keyboard-navigable.

---

## Testing

### Running Tests

```bash
npm test               # Run all tests once
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report (v8)
```

### Test File Conventions

- Test files live **next to** their source file.
  - `src/lib/dateUtils.ts` → `src/lib/dateUtils.test.ts`
  - `src/components/Foo.tsx` → `src/components/Foo.test.tsx`
- Use `// @vitest-environment node` for files that rely heavily on `crypto.subtle`.

### Mocking Tauri IPC

Tests run in jsdom. Tauri IPC is globally mocked in `src/test/setup.ts`:

```typescript
import { invoke } from '@tauri-apps/api/core';
const mockInvoke = vi.mocked(invoke);

it('calls the right command', async () => {
  mockInvoke.mockResolvedValue({ ok: true });
  await myService.doThing();
  expect(mockInvoke).toHaveBeenCalledWith('command_name', { arg: 'value' });
});
```

### What to Test

- Pure functions and data transformations
- State transitions in Zustand stores
- User interactions in React components (via Testing Library)
- Error paths and edge cases

### What Not to Test

- Tauri/Rust backend (needs separate `#[cfg(test)]` modules)
- E2E flows (future work)
- Visual regression (future work)

---

## Commit and PR Conventions

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add hashtag filter to search overlay
fix: prevent double-save when closing entry quickly
chore: bump tauri to 2.1.0
docs: add peer sync security model
test: cover recoveryKeyService edge cases
```

### PR Size

Keep PRs under **400 lines changed**. For larger features, split into incremental PRs (data model, backend commands, frontend UI).

### PR Description

Include:
- What the change does
- Why it's needed
- How to test it manually
- Any security considerations

---

## Security Issues

**Do not open a public GitHub issue for security vulnerabilities.**

Report them via [GitHub Security Advisories](https://github.com/kenlacroix/moodhaven-journal/security/advisories/new). See [SECURITY.md](SECURITY.md) for the full policy and scope.

---

## Architecture Guide

A full architecture overview (data model, command registry, encryption flow, peer sync) is in [`docs/architecture.md`](docs/architecture.md).

Key files to read before making changes:

| File | Purpose |
|:---|:---|
| `CLAUDE.md` | AI assistant context — also the best single-file project reference |
| `docs/architecture.md` | Data model, command registry, component map |
| `src/lib/crypto.ts` | AES-256-GCM + PBKDF2 — the encryption core |
| `src-tauri/src/db/mod.rs` | SQLite schema and migrations |
| `src-tauri/src/lib.rs` | Tauri command registration |
| `src/test/setup.ts` | Global test mocks |
