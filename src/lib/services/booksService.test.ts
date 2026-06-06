import { invoke } from '@tauri-apps/api/core';
import { listBooks, createBook, updateBook, deleteBook } from './booksService';

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
});

// Raw book as returned from Rust (settings is JSON string)
function makeRawBook(overrides: Record<string, unknown> = {}) {
  return {
    id: 'book-001',
    name: 'My Journal',
    emoji: '📔',
    color: '#8b5cf6',
    sort_order: 0,
    description: null,
    settings: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('listBooks', () => {
  it('calls list_books and parses each raw book', async () => {
    const rawBooks = [makeRawBook({ id: 'a' }), makeRawBook({ id: 'b' })];
    mockInvoke.mockResolvedValue(rawBooks);

    const result = await listBooks();

    expect(mockInvoke).toHaveBeenCalledWith('list_books');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('a');
    expect(result[1].id).toBe('b');
  });

  it('converts null description to undefined', async () => {
    mockInvoke.mockResolvedValue([makeRawBook({ description: null })]);

    const [book] = await listBooks();

    expect(book.description).toBeUndefined();
  });

  it('keeps string description as-is', async () => {
    mockInvoke.mockResolvedValue([makeRawBook({ description: 'My personal log' })]);

    const [book] = await listBooks();

    expect(book.description).toBe('My personal log');
  });

  it('parses settings JSON string into object', async () => {
    const settings = { defaultPrivacyMode: 1, autoTagEnabled: false };
    mockInvoke.mockResolvedValue([makeRawBook({ settings: JSON.stringify(settings) })]);

    const [book] = await listBooks();

    expect(book.settings).toEqual(settings);
  });

  it('leaves settings undefined when null', async () => {
    mockInvoke.mockResolvedValue([makeRawBook({ settings: null })]);

    const [book] = await listBooks();

    expect(book.settings).toBeUndefined();
  });

  it('returns empty array when no books', async () => {
    mockInvoke.mockResolvedValue([]);

    const result = await listBooks();

    expect(result).toEqual([]);
  });
});

describe('createBook', () => {
  it('calls create_book with required args', async () => {
    mockInvoke.mockResolvedValue(makeRawBook());

    await createBook('Work Log', '💼', '#3b82f6');

    expect(mockInvoke).toHaveBeenCalledWith('create_book', {
      name: 'Work Log',
      emoji: '💼',
      color: '#3b82f6',
      description: null,
      settings: null,
    });
  });

  it('passes description and serializes settings', async () => {
    const settings = { defaultPrivacyMode: 2 };
    mockInvoke.mockResolvedValue(makeRawBook({ settings: JSON.stringify(settings) }));

    await createBook('Private', '🔒', '#ef4444', 'Private thoughts', settings);

    expect(mockInvoke).toHaveBeenCalledWith('create_book', {
      name: 'Private',
      emoji: '🔒',
      color: '#ef4444',
      description: 'Private thoughts',
      settings: JSON.stringify(settings),
    });
  });

  it('returns parsed Book from raw response', async () => {
    const rawBook = makeRawBook({ name: 'New Book', color: '#10b981' });
    mockInvoke.mockResolvedValue(rawBook);

    const book = await createBook('New Book', '📗', '#10b981');

    expect(book.name).toBe('New Book');
    expect(book.color).toBe('#10b981');
  });

  it('propagates invoke errors', async () => {
    mockInvoke.mockRejectedValue(new Error('DB error'));

    await expect(createBook('Bad', '❌', '#000')).rejects.toThrow('DB error');
  });
});

describe('updateBook', () => {
  it('calls update_book with all args', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await updateBook('book-id', 'Updated Name', '📝', '#6366f1');

    expect(mockInvoke).toHaveBeenCalledWith('update_book', {
      id: 'book-id',
      name: 'Updated Name',
      emoji: '📝',
      color: '#6366f1',
      description: null,
      settings: null,
    });
  });

  it('serializes settings to JSON string', async () => {
    const settings = { defaultPrivacyMode: 0 };
    mockInvoke.mockResolvedValue(undefined);

    await updateBook('id', 'Name', '📔', '#fff', 'desc', settings);

    expect(mockInvoke).toHaveBeenCalledWith('update_book', {
      id: 'id',
      name: 'Name',
      emoji: '📔',
      color: '#fff',
      description: 'desc',
      settings: JSON.stringify(settings),
    });
  });

  it('passes description when given', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await updateBook('id', 'Name', '📔', '#fff', 'My description');

    const callArgs = mockInvoke.mock.calls[0][1] as Record<string, unknown>;
    expect(callArgs.description).toBe('My description');
  });
});

describe('deleteBook', () => {
  it('calls delete_book with id', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await deleteBook('book-to-delete');

    expect(mockInvoke).toHaveBeenCalledWith('delete_book', { id: 'book-to-delete' });
  });

  it('propagates invoke errors', async () => {
    mockInvoke.mockRejectedValue(new Error('Cannot delete default book'));

    await expect(deleteBook('default')).rejects.toThrow('Cannot delete default book');
  });
});
