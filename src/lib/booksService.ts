/**
 * Books Service — IPC wrappers for the Tauri books commands.
 */

import { invoke } from '@tauri-apps/api/core';
import type { Book, BookSettings } from '../types/journal';

/** Raw book shape returned from Rust (settings is JSON string, not parsed object) */
interface RawBook {
  id: string;
  name: string;
  emoji: string;
  color: string;
  sort_order: number;
  description?: string | null;
  settings?: string | null;
  created_at: string;
}

function parseBook(raw: RawBook): Book {
  return {
    ...raw,
    description: raw.description ?? undefined,
    settings: raw.settings ? (JSON.parse(raw.settings) as BookSettings) : undefined,
  };
}

export async function listBooks(): Promise<Book[]> {
  const raws = await invoke<RawBook[]>('list_books');
  return raws.map(parseBook);
}

export async function createBook(
  name: string,
  emoji: string,
  color: string,
  description?: string,
  settings?: BookSettings,
): Promise<Book> {
  const raw = await invoke<RawBook>('create_book', {
    name,
    emoji,
    color,
    description: description ?? null,
    settings: settings ? JSON.stringify(settings) : null,
  });
  return parseBook(raw);
}

export async function updateBook(
  id: string,
  name: string,
  emoji: string,
  color: string,
  description?: string,
  settings?: BookSettings,
): Promise<void> {
  return invoke<void>('update_book', {
    id,
    name,
    emoji,
    color,
    description: description ?? null,
    settings: settings ? JSON.stringify(settings) : null,
  });
}

export async function deleteBook(id: string): Promise<void> {
  return invoke<void>('delete_book', { id });
}
