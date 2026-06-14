/**
 * WritingView tests — UX additions from fix/android-ux-batch.
 *
 * Covers:
 * - Attach button shows a spinner and is disabled while `isAttaching` (mobile).
 * - Mobile media strip renders ("Encrypting…") during an in-flight attach.
 * - Save indicator wording: "Saved · N words" when saved, singular "1 word".
 *
 * The component pulls in many heavy deps (TipTap editor, hooks, stores). They
 * are mocked here so the test exercises only the footer/attach/save UI logic.
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WritingView } from './WritingView';
import { getEntryById } from '../lib/services/journalService';
import { pickAndAttachMedia, listEntryMedia } from '../lib/services/mediaService';
import { useAppStore } from '../stores/appStore';

// ── Force mobile layout (the reworded save indicator + spinner live there) ─────
vi.mock('../hooks/usePlatform', () => ({
  usePlatform: vi.fn().mockReturnValue({
    isAndroid: true,
    isIOS: false,
    isMobile: true,
    isBrowser: false,
    isDesktop: false,
    canPeerSync: false,
    canSTT: false,
    canHardwareKey: false,
  }),
}));
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: vi.fn().mockReturnValue(true) }));

// ── Editor: minimal stub exposing onChange(html, text) ─────────────────────────
vi.mock('../components/editor', () => ({
  RichTextEditor: ({
    onChange,
  }: {
    onChange?: (html: string, text: string) => void;
  }) => (
    <button
      type="button"
      data-testid="editor-set"
      onClick={() => onChange?.('<p>hello world today friend now</p>', 'hello world today friend now')}
    >
      editor
    </button>
  ),
}));

// ── Service mocks ──────────────────────────────────────────────────────────────
vi.mock('../lib/services/journalService', () => ({
  saveEntry: vi.fn().mockResolvedValue({ id: 'entry-1', title: '', content: '<p>x</p>', mood: 3 }),
  getEntryById: vi.fn().mockResolvedValue(null),
  patchEntryLocationWeather: vi.fn().mockResolvedValue(undefined),
  deleteEntry: vi.fn().mockResolvedValue(undefined),
  getBookTags: vi.fn().mockResolvedValue([]),
}));

vi.mock('../lib/services/activityService', () => ({
  syncEntryActivities: vi.fn().mockResolvedValue(undefined),
  getEntryActivities: vi.fn().mockResolvedValue([]),
}));

vi.mock('../lib/services/mediaService', () => ({
  pickAndAttachMedia: vi.fn().mockResolvedValue({ attached: [], skipped: [] }),
  listEntryMedia: vi.fn().mockResolvedValue([]),
  openMedia: vi.fn().mockResolvedValue(undefined),
  deleteMedia: vi.fn().mockResolvedValue(undefined),
  getMediaThumbnail: vi.fn().mockResolvedValue(''),
}));

vi.mock('../lib/services/locationWeatherService', () => ({
  captureLocationWeather: vi.fn().mockResolvedValue(null),
  getWeatherEmoji: vi.fn().mockReturnValue('☀️'),
  displayTemp: vi.fn().mockReturnValue('20°C'),
}));

vi.mock('../lib/services/analyticsService', () => ({
  getStreakStats: vi.fn().mockResolvedValue({ currentStreak: 0, longestStreak: 0, totalDays: 0 }),
  getOverallStats: vi.fn().mockResolvedValue({ averageMood: 3, totalEntries: 0 }),
}));

vi.mock('../lib/services/voiceMemoService', () => ({
  deleteVoiceMemo: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/services/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// ── Hook mocks ─────────────────────────────────────────────────────────────────
vi.mock('../hooks/useActivities', () => ({
  useActivities: vi.fn().mockReturnValue({
    activities: [],
    isLoading: false,
    addCustom: vi.fn(),
    remove: vi.fn(),
    reload: vi.fn(),
  }),
}));

vi.mock('../hooks/useJournalPrompts', () => ({
  useJournalPrompts: vi.fn().mockReturnValue({
    forYouPrompts: [],
    generalPrompts: [],
    healthPrompts: [],
    isLoading: false,
    isAIEnabled: false,
    refresh: vi.fn(),
  }),
}));

vi.mock('../hooks/useWearVoiceMemos', () => ({
  useWearVoiceMemos: vi.fn().mockReturnValue({ memos: [], transcribing: false, addMemo: vi.fn() }),
}));

vi.mock('../hooks/useWellbeingContext', () => ({
  useWellbeingContext: vi.fn().mockReturnValue({
    context: null,
    isVisible: false,
    dismiss: vi.fn(),
    onWordsWritten: vi.fn(),
  }),
}));

// ── Child component stubs ──────────────────────────────────────────────────────
vi.mock('../components/journal/ActivityPicker', () => ({ ActivityPicker: () => null }));
vi.mock('../components/writing/AppearanceDrawer', () => ({ AppearanceDrawer: () => null }));
vi.mock('../components/ai/PromptDrawer', () => ({ PromptDrawer: () => null }));
vi.mock('../components/journal/EntryOptionsMenu', () => ({ EntryOptionsMenu: () => null }));
vi.mock('../components/journal/TagManagerModal', () => ({ TagManagerModal: () => null }));
vi.mock('../components/wellbeing/WellbeingCard', () => ({ WellbeingCard: () => null }));

// ── Stores ─────────────────────────────────────────────────────────────────────
vi.mock('../stores/appStore', () => ({ useAppStore: vi.fn() }));
vi.mock('../stores/booksStore', () => ({
  useBooksStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({ activeBookId: 'default', books: [] })
  ),
}));

const SETTINGS_STATE = {
  appearanceDrawerOpen: false,
  setAppearanceDrawerOpen: vi.fn(),
  toggleAppearanceDrawer: vi.fn(),
  setAppearanceHintPulse: vi.fn(),
  distractionFree: false,
  setDistractionFree: vi.fn(),
  setShowPrompts: vi.fn(),
  setHasSeenWritingDrawerHint: vi.fn(),
  settings: {
    journal: {
      showPrompts: false,
      autoLocationWeather: false,
      autoTitle: false,
      temperatureUnit: 'C',
    },
    appearance: {
      writing: {
        fontFamily: 'sans',
        fontSize: 'medium',
        lineHeight: 'normal',
        paragraphSpacing: 'normal',
        backgroundTint: 'none',
        writingWidth: 'normal',
        focusMode: false,
        highContrast: false,
        dyslexiaProfile: false,
        reducedMotion: 'off',
        textScale: 1,
      },
    },
    speechToText: { model: 'ggml-base.en.bin', enabled: false },
    tutorial: { hasSeenWritingDrawerHint: true },
  },
};

vi.mock('../stores/settingsStore', () => {
  const actions = { setSavingState: vi.fn(), setLastAutoSaved: vi.fn() };
  const hook = vi.fn((selector: (s: unknown) => unknown) => selector(SETTINGS_STATE));
  // Components also call useSettingsStore.getState() for imperative writes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (hook as any).getState = () => ({ ...SETTINGS_STATE, ...actions });
  return { useSettingsStore: hook };
});

function setupAppStore(sessionPassword: string | null = 'pw') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (vi.mocked(useAppStore) as any).mockImplementation((selector: (s: unknown) => unknown) =>
    selector({ sessionPassword })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setupAppStore('pw');
  vi.mocked(getEntryById).mockResolvedValue(null);
  vi.mocked(listEntryMedia).mockResolvedValue([]);
});

describe('WritingView — attach spinner / disabled state', () => {
  it('shows a spinner, disables the attach button, and renders the media strip while attaching', async () => {
    // Hold pickAndAttachMedia open so isAttaching stays true while we assert.
    let release!: () => void;
    vi.mocked(pickAndAttachMedia).mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ attached: [], skipped: [] });
      })
    );

    // Existing entry → savedEntryIdRef is populated so the attach button is enabled.
    vi.mocked(getEntryById).mockResolvedValue({
      id: 'entry-1',
      title: 'T',
      content: '<p>hello world</p>',
      mood: 3,
      privacyMode: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    render(<WritingView entryId="entry-1" />);

    const attachBtn = await screen.findByRole('button', { name: /attach/i });
    expect(attachBtn).not.toBeDisabled();

    await act(async () => {
      await userEvent.click(attachBtn);
    });

    // Mid-attach: button disabled + aria-busy, media strip shows the encrypting chip.
    await waitFor(() => {
      const busy = screen.getByRole('button', { name: /attach/i });
      expect(busy).toBeDisabled();
      expect(busy).toHaveAttribute('aria-busy', 'true');
    });
    expect(screen.getByText(/encrypting/i)).toBeInTheDocument();

    // Release the attach so the test ends cleanly.
    await act(async () => {
      release();
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /attach/i })).not.toBeDisabled();
    });
  });
});

describe('WritingView — save indicator wording', () => {
  afterEach(() => vi.useRealTimers());

  it('shows "Saved · 1 word" (singular) after a one-word entry auto-saves', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Existing entry with a single word → wordCount === 1, and savedEntryIdRef set
    // so auto-save fires even below the 5-word new-entry threshold.
    vi.mocked(getEntryById).mockResolvedValue({
      id: 'entry-1',
      title: '',
      content: '<p>hello</p>',
      mood: 3,
      privacyMode: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    render(<WritingView entryId="entry-1" />);

    // Before save: bare word count, singular.
    await waitFor(() => {
      expect(screen.getByText('1 word')).toBeInTheDocument();
    });

    // Advance past the 2s auto-save debounce → lastSavedAt set.
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    await waitFor(() => {
      expect(screen.getByText('Saved · 1 word')).toBeInTheDocument();
    });
  });

  it('shows "Saved · N words" (plural) after a multi-word entry auto-saves', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    vi.mocked(getEntryById).mockResolvedValue({
      id: 'entry-1',
      title: '',
      content: '<p>one two three</p>',
      mood: 3,
      privacyMode: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    render(<WritingView entryId="entry-1" />);

    await waitFor(() => {
      expect(screen.getByText('3 words')).toBeInTheDocument();
    });

    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    await waitFor(() => {
      expect(screen.getByText('Saved · 3 words')).toBeInTheDocument();
    });
  });
});
