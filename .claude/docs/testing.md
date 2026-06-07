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

## Current Coverage (as of v1.8.0)
| Test File | Tests |
|-----------|-------|
| `lib/backend/browser.test.ts` | 43 |
| `lib/backend/browser-invoke.test.ts` | 29 |
| `components/ai/AICardWrapper.test.tsx` | 8 |
| `components/ai/GratitudeStreakCard.test.tsx` | 8 |
| `components/ai/MoodWeatherCard.test.tsx` | 6 |
| `components/ai/TimeOfDayInsightCard.test.tsx` | 8 |
| `components/ai/WeeklyReflectionCard.test.tsx` | 7 |
| `components/ai/WeeklyStreakCard.test.tsx` | 5 |
| `components/ai/WritingMomentumCard.test.tsx` | 9 |
| `components/analytics/MoodDistributionChart.test.tsx` | 3 |
| `components/calendar/CalendarDay.test.tsx` | 3 |
| `components/ErrorBoundary.test.tsx` | 3 |
| `components/journal/EntryStateBadge.test.tsx` | 5 |
| `components/journal/MoodSelector.test.tsx` | 9 |
| `components/journal/TagCloud.test.tsx` | 6 |
| `components/journal/TemplateSelector.test.tsx` | 9 |
| `components/layout/Sidebar.test.tsx` | 9 |
| `components/settings/SelectiveExportPanel.test.tsx` | 4 |
| `components/stt/MicrophoneBlockedModal.test.tsx` | 9 |
| `components/stt/MicrophonePermissionModal.test.tsx` | 8 |
| `components/timecapsule/SealEntryModal.test.tsx` | 6 |
| `components/timecapsule/TimeCapsuleRevealModal.test.tsx` | 9 |
| `components/transcript/CloudConsentModal.test.tsx` | 7 |
| `components/transcript/TranscriptPreviewOverlay.test.tsx` | 11 |
| `components/updater/UpdatePanel.test.tsx` | 4 |
| `components/voice-memo/VoiceDraftEditor.test.tsx` | 8 |
| `components/voice-memo/VoiceMemoDraftCard.test.tsx` | 9 |
| `components/writing/AppearanceDrawer.test.tsx` | 6 |
| `hooks/use2FASetup.test.ts` | 7 |
| `hooks/useAnalytics.test.ts` | 17 |
| `hooks/useAppBanners.test.ts` | 5 |
| `hooks/useCalendar.test.ts` | 27 |
| `hooks/useInsights.test.ts` | 7 |
| `hooks/useJournalPrompts.test.ts` | 26 |
| `hooks/useOuraContext.test.ts` | 62 |
| `hooks/useSpeechToText.test.ts` | 7 |
| `hooks/useVoiceMemoDrafts.test.ts` | 12 |
| `hooks/useWearVoiceMemos.test.ts` | 9 |
| `hooks/useWristLoop.test.ts` | 6 |
| `lib/services/aiService.test.ts` | 28 |
| `lib/services/analyticsService.test.ts` | 12 |
| `lib/services/cloudSyncService.test.ts` | 13 |
| `lib/services/crypto.test.ts` | 24 |
| `lib/services/dataManagementService.test.ts` | 8 |
| `lib/services/http.test.ts` | 5 |
| `lib/services/journalService.test.ts` | 3 |
| `lib/services/logger.test.ts` | 15 |
| `lib/services/rateLimitService.test.ts` | 43 |
| `lib/services/recoveryKeyService.test.ts` | 8 |
| `lib/services/reminderService.test.ts` | 25 |
| `lib/services/secureStorage.test.ts` | 10 |
| `lib/services/settingsService.test.ts` | 10 |
| `lib/services/timeCapsuleService.test.ts` | 6 |
| `lib/services/voiceMemoService.test.ts` | 14 |
| `lib/stillService.test.ts` | 16 |
| `lib/services/webdavService.test.ts` | 34 |
| `lib/utils/chartUtils.test.ts` | 27 |
| `lib/utils/dateUtils.test.ts` | 61 |
| `lib/utils/journalTemplates.test.ts` | 10 |
| `lib/utils/metadataExtractor.test.ts` | 84 |
| `lib/utils/transcriptFormatter.test.ts` | 18 |
| `lib/utils/writingUtils.test.ts` | 10 |
| `components/stillhaven/WristLoopBanner.test.tsx` | 8 |
| `modules/stillhaven/engine/bioMapping.test.ts` | 20 |
| `modules/stillhaven/handoff.test.ts` | 16 |
| `modules/stillhaven/StillhavenConsentModal.test.tsx` | 12 |
| `modules/stillhaven/components/AbandonedSessionPrompt.test.tsx` | 4 |
| `modules/stillhaven/components/ActivationDial.test.tsx` | 6 |
| `modules/stillhaven/components/HrvInput.test.tsx` | 5 |
| `modules/stillhaven/components/ProtocolPicker.test.tsx` | 7 |
| `modules/stillhaven/components/WelcomeCard.test.tsx` | 5 |
| `pages/CalendarPage.test.tsx` | 7 |
| `pages/InsightsView.test.tsx` | 12 |
| `pages/OnThisDayView.test.tsx` | 6 |
| `pages/TimelineView.test.tsx` | 9 |
| `stores/appStore.test.ts` | 18 |
| `stores/booksStore.test.ts` | 25 |
| `stores/peerSyncStore.test.ts` | 43 |
| `stores/settingsStore.test.ts` | 18 |
| `stores/stillStore.test.ts` | 31 |
| `types/writingAppearance.test.ts` | 4 |
| `hooks/useActivities.test.ts` | 7 |
| `components/journal/ActivityPicker.test.tsx` | 12 |
| **Total** | **1461 (100 files)** |
