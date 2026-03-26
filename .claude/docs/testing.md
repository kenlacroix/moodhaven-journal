# Testing Guide

## Stack
- **Vitest** — test runner (Vite-native)
- **@testing-library/react** — component rendering & queries
- **@testing-library/jest-dom** — DOM matchers
- **@testing-library/user-event** — user interaction simulation
- **jsdom** — browser DOM environment

## Commands
```bash
npm test                # run all tests once
npm run test:watch      # watch mode
npm run test:coverage   # v8 coverage report
```

## File Conventions
- Co-located: `src/lib/dateUtils.ts` → `src/lib/dateUtils.test.ts`
- Components: `MoodSelector.tsx` → `MoodSelector.test.tsx`
- Setup file: `src/test/setup.ts` (global mocks + polyfills)
- Config: `vitest.config.ts`
- Globals available: `describe`, `it`, `expect`, `vi` (no imports needed)

## Mocking Tauri IPC
Tests run in jsdom — Tauri IPC is unavailable. Global mock in `src/test/setup.ts`:
```typescript
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
```

Per-test usage:
```typescript
import { invoke } from '@tauri-apps/api/core';
const mockInvoke = vi.mocked(invoke);
beforeEach(() => vi.clearAllMocks());
mockInvoke.mockResolvedValue({ ok: true });
expect(mockInvoke).toHaveBeenCalledWith('command_name', { arg: 'value' });
```

## Mocking Zustand Stores
```typescript
// Mock module BEFORE importing the store
vi.mock('../lib/journalService', () => ({ hasPassword: vi.fn(), ... }));
// Reset store state in beforeEach
beforeEach(() => { useAppStore.setState({ isInitialized: false }); vi.clearAllMocks(); });
```

## WebCrypto in Tests
jsdom doesn't fully support WebCrypto. Setup file polyfills it:
```typescript
import { webcrypto } from 'node:crypto';
vi.stubGlobal('crypto', webcrypto);
```
For heavy crypto files, use Node environment: `// @vitest-environment node` at top of file.

## Test Categories
| Category | Mocking | Notes |
|----------|---------|-------|
| Pure utilities | None | Use `vi.useFakeTimers()` for date-dependent tests |
| Complex logic | None | Sentiment, pattern detection, aggregation |
| Crypto | Tauri `invoke` | `// @vitest-environment node` |
| Zustand stores | Service modules | Test via `getState()` / `setState()` |
| React components | Tauri (global) | Testing Library queries + `userEvent` |

## What to Test
- Pure functions, data transformations, state transitions
- User interactions, accessibility attributes, error paths
- Edge cases: empty inputs, boundary values, invalid data

## What NOT to Test
- Tauri/Rust backend (needs `#[cfg(test)]` modules)
- Page-level integration flows (future work)
- E2E, visual regression (future work)
- React hooks in isolation — test through components

## Current Coverage (as of v0.7.6)
| Test File | Tests |
|-----------|-------|
| `lib/dateUtils.test.ts` | 54 |
| `lib/chartUtils.test.ts` | 27 |
| `lib/journalTemplates.test.ts` | 10 |
| `lib/metadataExtractor.test.ts` | 79 |
| `lib/crypto.test.ts` | 20 |
| `lib/recoveryKeyService.test.ts` | 7 |
| `lib/aiService.test.ts` | 17 |
| `stores/appStore.test.ts` | 17 |
| `stores/settingsStore.test.ts` | 18 |
| `components/journal/MoodSelector.test.tsx` | 9 |
| `components/journal/TemplateSelector.test.tsx` | 9 |
| `lib/writingUtils.test.ts` | 10 |
| `lib/timeCapsuleService.test.ts` | 6 |
| `components/timecapsule/SealEntryModal.test.tsx` | 6 |
| `components/timecapsule/TimeCapsuleRevealModal.test.tsx` | 9 |
| `components/layout/Sidebar.test.tsx` | 9 |
| **Total** | **~497** |
