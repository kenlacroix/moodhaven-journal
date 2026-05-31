/**
 * Books Store
 *
 * Manages the list of named journals (books) and which one is currently active.
 * The active book filters the Timeline view. All other views (Write, Insights, etc.)
 * are unaffected — a new entry is written into the active book.
 */

import { create } from 'zustand';
import type { Book, BookSettings } from '../types/journal';
import { listBooks, createBook, updateBook, deleteBook } from '../lib/services/booksService';
import { logger } from '../lib/services/logger';

interface BooksState {
  books: Book[];
  activeBookId: string | null; // null = all books (no filter)
  isLoading: boolean;

  // Actions
  loadBooks: () => Promise<void>;
  setActiveBook: (id: string | null) => void;
  addBook: (name: string, emoji: string, color: string, description?: string, settings?: BookSettings) => Promise<Book>;
  editBook: (id: string, name: string, emoji: string, color: string, description?: string, settings?: BookSettings) => Promise<void>;
  removeBook: (id: string) => Promise<void>;
  /** Patch just the settings field of a book (local + remote) */
  patchBookSettings: (id: string, settings: BookSettings) => Promise<void>;
}

export const useBooksStore = create<BooksState>((set, get) => ({
  books: [],
  activeBookId: null,
  isLoading: false,

  loadBooks: async () => {
    set({ isLoading: true });
    try {
      const books = await listBooks();
      set({ books, isLoading: false });
    } catch (err) {
      logger.error('Failed to load books:', { error: String(err) });
      set({ isLoading: false });
    }
  },

  setActiveBook: (id) => set({ activeBookId: id }),

  addBook: async (name, emoji, color, description, settings) => {
    const book = await createBook(name, emoji, color, description, settings);
    set((s) => ({ books: [...s.books, book] }));
    return book;
  },

  editBook: async (id, name, emoji, color, description, settings) => {
    await updateBook(id, name, emoji, color, description, settings);
    set((s) => ({
      books: s.books.map((b) =>
        b.id === id ? { ...b, name, emoji, color, description, settings } : b
      ),
    }));
  },

  patchBookSettings: async (id, settings) => {
    const { books } = get();
    const book = books.find((b) => b.id === id);
    if (!book) return;
    await updateBook(id, book.name, book.emoji, book.color, book.description, settings);
    set((s) => ({
      books: s.books.map((b) => (b.id === id ? { ...b, settings } : b)),
    }));
  },

  removeBook: async (id) => {
    await deleteBook(id);

    // Record a pending tombstone so the next sync removes this book from the
    // remote manifest instead of re-downloading it.
    try {
      const key = 'mb_pending_book_tombstones';
      const existing: string[] = JSON.parse(localStorage.getItem(key) ?? '[]');
      if (!existing.includes(id)) {
        localStorage.setItem(key, JSON.stringify([...existing, id])); // nosemgrep: no-localstorage-secrets (book tombstone UUIDs, not secrets)
      }
    } catch { /* non-critical */ }

    const { activeBookId } = get();
    set((s) => ({
      books: s.books.filter((b) => b.id !== id),
      activeBookId: activeBookId === id ? null : activeBookId,
    }));
  },
}));
