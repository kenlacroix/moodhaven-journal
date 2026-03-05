/**
 * Books Store
 *
 * Manages the list of named journals (books) and which one is currently active.
 * The active book filters the Timeline view. All other views (Write, Insights, etc.)
 * are unaffected — a new entry is written into the active book.
 */

import { create } from 'zustand';
import type { Book } from '../types/journal';
import { listBooks, createBook, updateBook, deleteBook } from '../lib/booksService';

interface BooksState {
  books: Book[];
  activeBookId: string | null; // null = all books (no filter)
  isLoading: boolean;

  // Actions
  loadBooks: () => Promise<void>;
  setActiveBook: (id: string | null) => void;
  addBook: (name: string, emoji: string, color: string) => Promise<Book>;
  editBook: (id: string, name: string, emoji: string, color: string) => Promise<void>;
  removeBook: (id: string) => Promise<void>;
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
      console.error('Failed to load books:', err);
      set({ isLoading: false });
    }
  },

  setActiveBook: (id) => set({ activeBookId: id }),

  addBook: async (name, emoji, color) => {
    const book = await createBook(name, emoji, color);
    set((s) => ({ books: [...s.books, book] }));
    return book;
  },

  editBook: async (id, name, emoji, color) => {
    await updateBook(id, name, emoji, color);
    set((s) => ({
      books: s.books.map((b) =>
        b.id === id ? { ...b, name, emoji, color } : b
      ),
    }));
  },

  removeBook: async (id) => {
    await deleteBook(id);
    const { activeBookId } = get();
    set((s) => ({
      books: s.books.filter((b) => b.id !== id),
      // If the deleted book was active, reset to "all"
      activeBookId: activeBookId === id ? null : activeBookId,
    }));
  },
}));
