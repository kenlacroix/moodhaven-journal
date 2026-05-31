vi.mock('../lib/services/booksService', () => ({
  listBooks: vi.fn(),
  createBook: vi.fn(),
  updateBook: vi.fn(),
  deleteBook: vi.fn(),
}));

vi.mock('../lib/services/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { useBooksStore } from './booksStore';
import {
  listBooks,
  createBook,
  updateBook,
  deleteBook,
} from '../lib/services/booksService';
import { logger } from '../lib/services/logger';
import type { Book } from '../types/journal';

const mockListBooks = vi.mocked(listBooks);
const mockCreateBook = vi.mocked(createBook);
const mockUpdateBook = vi.mocked(updateBook);
const mockDeleteBook = vi.mocked(deleteBook);
const mockLoggerError = vi.mocked(logger.error);

const makeBook = (overrides: Partial<Book> = {}): Book => ({
  id: 'b1',
  name: 'Morning',
  emoji: '☀️',
  color: '#8b5cf6',
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('booksStore', () => {
  beforeEach(() => {
    useBooksStore.setState({ books: [], activeBookId: null, isLoading: false });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('has empty books array', () => {
      expect(useBooksStore.getState().books).toEqual([]);
    });

    it('has null activeBookId', () => {
      expect(useBooksStore.getState().activeBookId).toBeNull();
    });

    it('has isLoading false', () => {
      expect(useBooksStore.getState().isLoading).toBe(false);
    });
  });

  describe('loadBooks', () => {
    it('sets books on success', async () => {
      const books = [makeBook({ id: 'b1' }), makeBook({ id: 'b2', name: 'Evening' })];
      mockListBooks.mockResolvedValue(books);

      await useBooksStore.getState().loadBooks();

      expect(useBooksStore.getState().books).toEqual(books);
    });

    it('clears isLoading after success', async () => {
      mockListBooks.mockResolvedValue([]);

      await useBooksStore.getState().loadBooks();

      expect(useBooksStore.getState().isLoading).toBe(false);
    });

    it('sets isLoading true while loading', async () => {
      let resolve: (v: Book[]) => void;
      mockListBooks.mockReturnValue(new Promise((r) => { resolve = r; }));

      const promise = useBooksStore.getState().loadBooks();
      expect(useBooksStore.getState().isLoading).toBe(true);

      resolve!([]);
      await promise;
    });

    it('clears isLoading on error', async () => {
      mockListBooks.mockRejectedValue(new Error('network fail'));

      await useBooksStore.getState().loadBooks();

      expect(useBooksStore.getState().isLoading).toBe(false);
    });

    it('logs error when listBooks throws', async () => {
      const err = new Error('network fail');
      mockListBooks.mockRejectedValue(err);

      await useBooksStore.getState().loadBooks();

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to load books:',
        { error: String(err) },
      );
    });

    it('does not update books array on error', async () => {
      useBooksStore.setState({ books: [makeBook()] });
      mockListBooks.mockRejectedValue(new Error('fail'));

      await useBooksStore.getState().loadBooks();

      expect(useBooksStore.getState().books).toEqual([makeBook()]);
    });
  });

  describe('setActiveBook', () => {
    it('sets activeBookId to provided id', () => {
      useBooksStore.getState().setActiveBook('b1');
      expect(useBooksStore.getState().activeBookId).toBe('b1');
    });

    it('sets activeBookId to null to show all books', () => {
      useBooksStore.setState({ activeBookId: 'b1' });
      useBooksStore.getState().setActiveBook(null);
      expect(useBooksStore.getState().activeBookId).toBeNull();
    });
  });

  describe('addBook', () => {
    it('appends the created book to books array', async () => {
      const newBook = makeBook({ id: 'b2', name: 'Evening' });
      mockCreateBook.mockResolvedValue(newBook);

      await useBooksStore.getState().addBook('Evening', '🌙', '#f59e0b');

      expect(useBooksStore.getState().books).toContainEqual(newBook);
    });

    it('preserves existing books when appending', async () => {
      const existing = makeBook({ id: 'b1' });
      useBooksStore.setState({ books: [existing] });

      const newBook = makeBook({ id: 'b2', name: 'Evening' });
      mockCreateBook.mockResolvedValue(newBook);

      await useBooksStore.getState().addBook('Evening', '🌙', '#f59e0b');

      expect(useBooksStore.getState().books).toHaveLength(2);
      expect(useBooksStore.getState().books[0]).toEqual(existing);
    });

    it('returns the created book', async () => {
      const newBook = makeBook({ id: 'b2' });
      mockCreateBook.mockResolvedValue(newBook);

      const result = await useBooksStore.getState().addBook('Evening', '🌙', '#f59e0b');

      expect(result).toEqual(newBook);
    });

    it('calls createBook with provided arguments', async () => {
      mockCreateBook.mockResolvedValue(makeBook());

      await useBooksStore.getState().addBook('Test', '📝', '#abc123', 'A desc');

      expect(mockCreateBook).toHaveBeenCalledWith('Test', '📝', '#abc123', 'A desc', undefined);
    });
  });

  describe('editBook', () => {
    it('updates the matching book in state', async () => {
      const book = makeBook({ id: 'b1', name: 'Morning' });
      useBooksStore.setState({ books: [book] });
      mockUpdateBook.mockResolvedValue(undefined);

      await useBooksStore.getState().editBook('b1', 'Afternoon', '🌤️', '#10b981');

      const updated = useBooksStore.getState().books.find((b) => b.id === 'b1');
      expect(updated?.name).toBe('Afternoon');
      expect(updated?.emoji).toBe('🌤️');
      expect(updated?.color).toBe('#10b981');
    });

    it('does not mutate other books', async () => {
      const b1 = makeBook({ id: 'b1', name: 'Morning' });
      const b2 = makeBook({ id: 'b2', name: 'Evening' });
      useBooksStore.setState({ books: [b1, b2] });
      mockUpdateBook.mockResolvedValue(undefined);

      await useBooksStore.getState().editBook('b1', 'Noon', '🌞', '#eab308');

      const other = useBooksStore.getState().books.find((b) => b.id === 'b2');
      expect(other?.name).toBe('Evening');
    });

    it('calls updateBook with all arguments', async () => {
      useBooksStore.setState({ books: [makeBook()] });
      mockUpdateBook.mockResolvedValue(undefined);

      await useBooksStore.getState().editBook('b1', 'New', '📖', '#ff0000', 'Desc');

      expect(mockUpdateBook).toHaveBeenCalledWith('b1', 'New', '📖', '#ff0000', 'Desc', undefined);
    });
  });

  describe('patchBookSettings', () => {
    it('calls updateBook with all existing book fields plus new settings', async () => {
      const book = makeBook({ id: 'b1', name: 'Morning', emoji: '☀️', color: '#8b5cf6' });
      useBooksStore.setState({ books: [book] });
      mockUpdateBook.mockResolvedValue(undefined);

      const newSettings = { defaultPrivacyMode: 1 as const };
      await useBooksStore.getState().patchBookSettings('b1', newSettings);

      expect(mockUpdateBook).toHaveBeenCalledWith(
        'b1',
        'Morning',
        '☀️',
        '#8b5cf6',
        undefined,
        newSettings,
      );
    });

    it('updates settings on the matching book in state', async () => {
      const book = makeBook({ id: 'b1' });
      useBooksStore.setState({ books: [book] });
      mockUpdateBook.mockResolvedValue(undefined);

      const newSettings = { defaultPrivacyMode: 2 as const };
      await useBooksStore.getState().patchBookSettings('b1', newSettings);

      const updated = useBooksStore.getState().books.find((b) => b.id === 'b1');
      expect(updated?.settings).toEqual(newSettings);
    });

    it('is a no-op when book id does not exist', async () => {
      useBooksStore.setState({ books: [makeBook({ id: 'b1' })] });

      await useBooksStore.getState().patchBookSettings('nonexistent', { defaultPrivacyMode: 1 as const });

      expect(mockUpdateBook).not.toHaveBeenCalled();
    });
  });

  describe('removeBook', () => {
    it('removes the book from state', async () => {
      useBooksStore.setState({ books: [makeBook({ id: 'b1' }), makeBook({ id: 'b2', name: 'Evening' })] });
      mockDeleteBook.mockResolvedValue(undefined);

      await useBooksStore.getState().removeBook('b1');

      expect(useBooksStore.getState().books.map((b) => b.id)).toEqual(['b2']);
    });

    it('resets activeBookId to null when the active book is removed', async () => {
      useBooksStore.setState({
        books: [makeBook({ id: 'b1' })],
        activeBookId: 'b1',
      });
      mockDeleteBook.mockResolvedValue(undefined);

      await useBooksStore.getState().removeBook('b1');

      expect(useBooksStore.getState().activeBookId).toBeNull();
    });

    it('does not reset activeBookId when a different book is removed', async () => {
      useBooksStore.setState({
        books: [makeBook({ id: 'b1' }), makeBook({ id: 'b2', name: 'Evening' })],
        activeBookId: 'b2',
      });
      mockDeleteBook.mockResolvedValue(undefined);

      await useBooksStore.getState().removeBook('b1');

      expect(useBooksStore.getState().activeBookId).toBe('b2');
    });

    it('calls deleteBook with the correct id', async () => {
      useBooksStore.setState({ books: [makeBook({ id: 'b1' })] });
      mockDeleteBook.mockResolvedValue(undefined);

      await useBooksStore.getState().removeBook('b1');

      expect(mockDeleteBook).toHaveBeenCalledWith('b1');
    });
  });
});
