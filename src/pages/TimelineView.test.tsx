import { render, screen, waitFor } from '@testing-library/react';
import { getAllEntries } from '../lib/services/journalService';
import { listAllMedia } from '../lib/services/mediaService';
import {
  computeLayout,
  getVisibleRange,
  DEFAULT_HEADER_HEIGHT,
  DEFAULT_ENTRY_HEIGHT,
  type VirtualRow,
  TimelineView,
} from './TimelineView';
import type { JournalEntry } from '../types/journal';

// ── Global stubs ──────────────────────────────────────────────────────────────

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  },
);

// ── Service / store mocks ─────────────────────────────────────────────────────

vi.mock('../lib/services/journalService', () => ({
  getAllEntries: vi.fn().mockResolvedValue([]),
  deleteEntry: vi.fn().mockResolvedValue(undefined),
  patchEntryPinned: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/services/mediaService', () => ({
  listAllMedia: vi.fn().mockResolvedValue([]),
}));

vi.mock('../lib/services/locationWeatherService', () => ({
  getWeatherEmoji: vi.fn().mockReturnValue('☀️'),
}));

vi.mock('../lib/services/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('../lib/utils/chartUtils', () => ({
  getMoodColor: vi.fn().mockReturnValue('#10b981'),
}));

vi.mock('../lib/utils/dateUtils', () => ({
  getRelativeDateLabel: vi.fn().mockReturnValue('Today'),
  formatDate: vi.fn().mockReturnValue('2026-01-01'),
  parseEntryTimestamp: vi.fn().mockReturnValue(new Date('2026-01-01T10:00:00Z')),
}));

vi.mock('../stores/booksStore', () => ({
  useBooksStore: vi.fn((selector: (s: { activeBookId: null; books: [] }) => unknown) =>
    selector({ activeBookId: null, books: [] }),
  ),
}));

vi.mock('../hooks/usePlatform', () => ({
  usePlatform: vi.fn().mockReturnValue({ isAndroid: false }),
}));

vi.mock('../components/journal/EntryActionsMenu', () => ({
  EntryActionsMenu: () => null,
}));

vi.mock('../components/journal/TagCloud', () => ({
  TagCloud: () => null,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'e1',
    content: 'Test content',
    mood: 3,
    tags: [],
    privacyMode: 0,
    book_id: 'default',
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
    pinned: false,
    ...overrides,
  };
}

function makeHeaderRow(date = '2026-01-01', entry?: JournalEntry): VirtualRow {
  const sample = entry ?? makeEntry();
  return { type: 'header', key: `h:${date}`, date, count: 1, sampleEntry: sample };
}

function makeEntryRow(entry?: JournalEntry): VirtualRow {
  const e = entry ?? makeEntry();
  return { type: 'entry', key: `e:${e.id}`, entry: e };
}

// ── Pure function tests ───────────────────────────────────────────────────────

describe('computeLayout', () => {
  it('assigns offset 0 to the first row', () => {
    const rows: VirtualRow[] = [makeHeaderRow(), makeEntryRow()];
    const { offsets } = computeLayout(rows, new Map());
    expect(offsets[0]).toBe(0);
  });

  it('uses DEFAULT_HEADER_HEIGHT and DEFAULT_ENTRY_HEIGHT when heights map is empty', () => {
    const rows: VirtualRow[] = [makeHeaderRow(), makeEntryRow()];
    const { offsets, totalHeight } = computeLayout(rows, new Map());
    expect(offsets[1]).toBe(DEFAULT_HEADER_HEIGHT);
    expect(totalHeight).toBe(DEFAULT_HEADER_HEIGHT + DEFAULT_ENTRY_HEIGHT);
  });

  it('uses measured heights from the map when available (VSCROLL-TEST-2)', () => {
    const entry = makeEntry({ id: 'tall' });
    const rows: VirtualRow[] = [makeEntryRow(entry)];
    // Simulate a ResizeObserver update setting the row height to 250
    const heights = new Map([['e:tall', 250]]);
    const { offsets, totalHeight } = computeLayout(rows, heights);
    expect(offsets[0]).toBe(0);
    expect(totalHeight).toBe(250);
  });

  it('accumulates offsets correctly across mixed measured and default heights', () => {
    const e1 = makeEntry({ id: 'a' });
    const e2 = makeEntry({ id: 'b' });
    const rows: VirtualRow[] = [makeHeaderRow(), makeEntryRow(e1), makeEntryRow(e2)];
    const heights = new Map([
      ['h:2026-01-01', 48],
      ['e:a', 160],
    ]);
    const { offsets, totalHeight } = computeLayout(rows, heights);
    expect(offsets[0]).toBe(0);
    expect(offsets[1]).toBe(48);
    expect(offsets[2]).toBe(48 + 160);
    expect(totalHeight).toBe(48 + 160 + DEFAULT_ENTRY_HEIGHT);
  });
});

describe('getVisibleRange', () => {
  it('returns {start:0, end:0} for an empty row list', () => {
    const result = getVisibleRange([], [], 0, 600);
    expect(result).toEqual({ start: 0, end: 0 });
  });

  it('returns all rows when totalHeight fits in the viewport', () => {
    const rows: VirtualRow[] = [makeHeaderRow(), makeEntryRow()];
    const offsets = [0, DEFAULT_HEADER_HEIGHT];
    const { start, end } = getVisibleRange(rows, offsets, 0, 1000);
    expect(start).toBe(0);
    expect(end).toBe(rows.length - 1);
  });

  it('excludes rows fully above the scroll position', () => {
    // 10 entry rows, each DEFAULT_ENTRY_HEIGHT tall — scroll past the first 3
    const rows: VirtualRow[] = Array.from({ length: 10 }, (_, i) =>
      makeEntryRow(makeEntry({ id: `e${i}` })),
    );
    const offsets = rows.map((_, i) => i * DEFAULT_ENTRY_HEIGHT);
    // scrollTop = 360 means the first 3 rows (0–359px) are fully above the fold
    const { start } = getVisibleRange(rows, offsets, 360, 600);
    // start may be reduced by OVERSCAN but must not exceed 3
    expect(start).toBeLessThanOrEqual(3);
  });
});

// ── Component: pinned section above virtual list (VSCROLL-TEST) ───────────────

describe('TimelineView — pinned section', () => {
  beforeEach(() => {
    vi.mocked(getAllEntries).mockResolvedValue([]);
    vi.mocked(listAllMedia).mockResolvedValue([]);
  });

  it('renders the Pinned section when pinned entries exist', async () => {
    vi.mocked(getAllEntries).mockResolvedValue([
      makeEntry({ id: 'pinned-1', pinned: true }),
      makeEntry({ id: 'normal-1', pinned: false }),
    ]);

    render(<TimelineView onSelectEntry={() => {}} onNewEntry={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('📌 Pinned')).toBeInTheDocument();
    });
  });

  it('renders the Pinned section before the virtual entry list in DOM order', async () => {
    vi.mocked(getAllEntries).mockResolvedValue([
      makeEntry({ id: 'pinned-1', pinned: true }),
      makeEntry({ id: 'normal-1', pinned: false }),
    ]);

    render(<TimelineView onSelectEntry={() => {}} onNewEntry={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('📌 Pinned')).toBeInTheDocument();
      expect(screen.getByTestId('virtual-entry-list')).toBeInTheDocument();
    });

    const pinnedHeading = screen.getByText('📌 Pinned');
    const virtualList = screen.getByTestId('virtual-entry-list');

    // DOCUMENT_POSITION_FOLLOWING (4) means virtualList comes after pinnedHeading in the DOM
    const position = pinnedHeading.compareDocumentPosition(virtualList);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
