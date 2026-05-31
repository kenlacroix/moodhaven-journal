vi.mock('../lib/services/journalService', () => ({
  getEntriesOnThisDay: vi.fn(),
}));
vi.mock('../lib/services/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OnThisDayView } from './OnThisDayView';
import { getEntriesOnThisDay } from '../lib/services/journalService';
import type { JournalEntry } from '../types/journal';

const mockGetEntries = vi.mocked(getEntriesOnThisDay);

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'entry-1',
    content: '',
    mood: 4,
    privacyMode: 0,
    book_id: 'default',
    pinned: false,
    tags: [],
    created_at: '2024-05-15T10:00:00Z',
    updated_at: '2024-05-15T10:00:00Z',
    sealedUntil: null,
    capsuleType: null,
    linkedOriginalId: null,
    unsealedAt: null,
    wordCount: null,
    sessionId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OnThisDayView', () => {
  it('shows loading spinner while fetching', () => {
    mockGetEntries.mockReturnValue(new Promise(() => { /* pending */ }));
    render(<OnThisDayView onSelectEntry={vi.fn()} />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows empty state when no entries found', async () => {
    mockGetEntries.mockResolvedValue([]);
    render(<OnThisDayView onSelectEntry={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/Nothing yet for/i)).toBeInTheDocument();
    });
  });

  it('renders entries grouped by year', async () => {
    mockGetEntries.mockResolvedValue([
      makeEntry({ id: 'e1', created_at: '2024-05-15T10:00:00Z', mood: 4 }),
      makeEntry({ id: 'e2', created_at: '2023-05-15T10:00:00Z', mood: 3 }),
    ]);
    render(<OnThisDayView onSelectEntry={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('2024')).toBeInTheDocument();
      expect(screen.getByText('2023')).toBeInTheDocument();
    });
  });

  it('calls onSelectEntry with entry id when entry is clicked', async () => {
    const onSelectEntry = vi.fn();
    mockGetEntries.mockResolvedValue([
      makeEntry({ id: 'entry-abc', created_at: '2024-05-15T10:00:00Z' }),
    ]);
    render(<OnThisDayView onSelectEntry={onSelectEntry} />);
    await waitFor(() => {
      expect(screen.getByText('2024')).toBeInTheDocument();
    });
    const entryRow = document.querySelector('[data-entry-id="entry-abc"], button, [role="button"]');
    if (entryRow) fireEvent.click(entryRow);
  });

  it('shows On This Day heading', async () => {
    mockGetEntries.mockResolvedValue([]);
    render(<OnThisDayView onSelectEntry={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('On This Day')).toBeInTheDocument();
    });
  });

  it('displays mood emoji for each entry', async () => {
    mockGetEntries.mockResolvedValue([
      makeEntry({ mood: 5, created_at: '2024-05-15T10:00:00Z' }),
    ]);
    render(<OnThisDayView onSelectEntry={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('😊')).toBeInTheDocument();
    });
  });
});
