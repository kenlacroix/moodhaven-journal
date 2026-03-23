/**
 * Oura Ring service for MoodBloom
 *
 * Wraps Tauri IPC calls to the Oura commands in Rust.
 *
 * Security: the Personal Access Token is stored encrypted via secureStorage.
 * Callers that need to sync must supply the session password so the PAT can
 * be decrypted and passed directly to Rust — the PAT is never stored plaintext.
 */

import { invoke } from '@tauri-apps/api/core';
import type { OuraHealthContext, OuraStatusResponse } from '../types/oura';
import { secureSet, secureGet } from './secureStorage';

const OURA_PAT_KEY = 'oura_pat';

/**
 * Validate a PAT against the Oura API, then store it encrypted.
 * `password` is the user's session password (from appStore.sessionPassword).
 */
export async function savePAT(pat: string, password: string): Promise<void> {
  // Validate first (Rust makes the API call — PAT is not stored by Rust)
  await invoke<void>('oura_validate_pat', { pat });
  // Store encrypted in SQLite
  await secureSet(OURA_PAT_KEY, pat, password);
}

/** Remove PAT and all cached data */
export async function disconnect(): Promise<void> {
  await invoke<void>('oura_disconnect');
}

/** Get current connection status (checks whether a PAT key exists in the DB) */
export async function getStatus(): Promise<OuraStatusResponse> {
  return invoke<OuraStatusResponse>('oura_get_status');
}

/**
 * Fetch today's metrics from the Oura API and cache them.
 * `password` is the user's session password — used to decrypt the PAT before calling Rust.
 */
export async function syncToday(password: string): Promise<OuraHealthContext> {
  const pat = await secureGet(OURA_PAT_KEY, password);
  if (!pat) throw new Error('Oura not connected — save a Personal Access Token first');
  return invoke<OuraHealthContext>('oura_sync_today', { pat });
}

/** Get cached health context for a date (YYYY-MM-DD). Returns null if not synced yet. */
export async function getContext(date: string): Promise<OuraHealthContext | null> {
  return invoke<OuraHealthContext | null>('oura_get_context', { date });
}

/**
 * Get today's cached context, syncing first if not yet fetched today.
 * `password` is required for syncing (to decrypt PAT). If omitted, returns cached only.
 */
export async function getTodayContext(
  autoSync = true,
  password?: string
): Promise<OuraHealthContext | null> {
  const today = new Date().toISOString().slice(0, 10);
  const cached = await getContext(today);
  if (cached) return cached;
  if (!autoSync || !password) return null;
  try {
    return await syncToday(password);
  } catch {
    return null;
  }
}

/** Get last N days of cached health contexts, sorted ascending by date */
export async function getHistory(days: number): Promise<OuraHealthContext[]> {
  return invoke<OuraHealthContext[]>('oura_get_history', { days });
}

/** Fetch and cache health data for the last N days. Returns count of newly fetched days. */
export async function backfill(days: number, password: string): Promise<number> {
  const pat = await secureGet(OURA_PAT_KEY, password);
  if (!pat) throw new Error('Oura not connected');
  return invoke<number>('oura_backfill', { days, pat });
}
