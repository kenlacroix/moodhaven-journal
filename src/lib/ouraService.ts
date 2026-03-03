/**
 * Oura Ring service for MoodBloom
 *
 * Wraps Tauri IPC calls to the Oura commands in Rust.
 * All API calls go through Rust → Oura API, keeping the PAT
 * off the JavaScript side entirely.
 */

import { invoke } from '@tauri-apps/api/core';
import type { OuraHealthContext, OuraStatusResponse } from '../types/oura';

/** Validate and store a Personal Access Token */
export async function savePAT(pat: string): Promise<void> {
  await invoke<void>('oura_save_pat', { pat });
}

/** Remove PAT and all cached data */
export async function disconnect(): Promise<void> {
  await invoke<void>('oura_disconnect');
}

/** Get current connection status */
export async function getStatus(): Promise<OuraStatusResponse> {
  return invoke<OuraStatusResponse>('oura_get_status');
}

/** Fetch today's metrics from Oura API and cache them */
export async function syncToday(): Promise<OuraHealthContext> {
  return invoke<OuraHealthContext>('oura_sync_today');
}

/** Get cached health context for a date (YYYY-MM-DD). Returns null if not synced yet. */
export async function getContext(date: string): Promise<OuraHealthContext | null> {
  return invoke<OuraHealthContext | null>('oura_get_context', { date });
}

/** Get today's cached context, syncing first if not yet fetched today */
export async function getTodayContext(autoSync = true): Promise<OuraHealthContext | null> {
  const today = new Date().toISOString().slice(0, 10);
  const cached = await getContext(today);
  if (cached) return cached;
  if (!autoSync) return null;
  try {
    return await syncToday();
  } catch {
    return null;
  }
}

/** Get last N days of cached health contexts, sorted ascending by date */
export async function getHistory(days: number): Promise<OuraHealthContext[]> {
  return invoke<OuraHealthContext[]>('oura_get_history', { days });
}

/** Fetch and cache health data for the last N days. Returns count of newly fetched days. */
export async function backfill(days: number): Promise<number> {
  return invoke<number>('oura_backfill', { days });
}
