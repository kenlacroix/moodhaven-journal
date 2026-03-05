/**
 * Books Service — IPC wrappers for the Tauri books commands.
 */

import { invoke } from '@tauri-apps/api/core';
import type { Book } from '../types/journal';

export async function listBooks(): Promise<Book[]> {
  return invoke<Book[]>('list_books');
}

export async function createBook(name: string, emoji: string, color: string): Promise<Book> {
  return invoke<Book>('create_book', { name, emoji, color });
}

export async function updateBook(id: string, name: string, emoji: string, color: string): Promise<void> {
  return invoke<void>('update_book', { id, name, emoji, color });
}

export async function deleteBook(id: string): Promise<void> {
  return invoke<void>('delete_book', { id });
}
