/**
 * Platform-agnostic HTTP fetch.
 *
 * In Tauri builds, @tauri-apps/plugin-http bypasses WebView CSP restrictions.
 * In browser builds, native window.fetch is used directly.
 *
 * Usage: import { httpFetch } from './http';
 * Drop-in replacement for both APIs — subset of the Fetch spec.
 */

let _tauriFetch: typeof fetch | null = null;

async function getTauriFetch(): Promise<typeof fetch> {
  if (_tauriFetch) return _tauriFetch;
  const mod = await import('@tauri-apps/plugin-http');
  _tauriFetch = mod.fetch as unknown as typeof fetch;
  return _tauriFetch;
}

export async function httpFetch(
  url: string,
  options?: RequestInit & { headers?: Record<string, string> },
): Promise<Response> {
  if (typeof window !== 'undefined' && !window.__TAURI_INTERNALS__) {
    return window.fetch(url, options);
  }
  const tauriFetch = await getTauriFetch();
  return tauriFetch(url, options as Parameters<typeof fetch>[1]);
}
