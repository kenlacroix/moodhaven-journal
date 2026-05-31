/**
 * WebDAV Service for MoodHaven Journal
 *
 * Handles WebDAV HTTP operations (PUT, GET, PROPFIND, MKCOL).
 * Uses @tauri-apps/plugin-http for HTTP requests that bypass CSP restrictions.
 */

import { httpFetch as fetch } from './http';
import type { WebDAVConfig } from '../../types/settings';
import { forModule } from './logger';

const log = forModule('sync');

export interface WebDAVResponse {
  success: boolean;
  status?: number;
  error?: string;
  data?: string;
}

const MOODHAVEN_DIR = 'MoodHaven';

/**
 * Build HTTP Basic Auth header value
 */
export function buildAuthHeader(username: string, password: string): string {
  return 'Basic ' + btoa(`${username}:${password}`);
}

/**
 * Normalize WebDAV URL: ensure trailing slash, trim whitespace
 */
export function normalizeWebDAVUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.endsWith('/')) {
    normalized += '/';
  }
  return normalized;
}

/**
 * Build full path to a file within the MoodHaven directory
 */
export function buildFilePath(baseUrl: string, filename: string): string {
  return `${normalizeWebDAVUrl(baseUrl)}${MOODHAVEN_DIR}/${filename}`;
}

/**
 * Build path to MoodHaven directory
 */
export function buildDirectoryPath(baseUrl: string): string {
  return `${normalizeWebDAVUrl(baseUrl)}${MOODHAVEN_DIR}/`;
}

/**
 * Test WebDAV connection using PROPFIND on the base URL
 */
export async function testConnection(config: WebDAVConfig): Promise<WebDAVResponse> {
  try {
    const response = await fetch(normalizeWebDAVUrl(config.url), {
      method: 'PROPFIND',
      headers: {
        'Authorization': buildAuthHeader(config.username, config.password),
        'Depth': '0',
        'Content-Type': 'application/xml',
      },
    });

    if (response.status === 207 || response.status === 200) {
      return { success: true, status: response.status };
    }

    if (response.status === 401) {
      return { success: false, status: 401, error: 'Invalid credentials' };
    }

    return { success: false, status: response.status, error: `Server returned ${response.status}` };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error) || 'Connection failed',
    };
  }
}

/**
 * Ensure the MoodHaven directory exists (MKCOL)
 */
export async function ensureDirectory(config: WebDAVConfig): Promise<WebDAVResponse> {
  try {
    const dirUrl = buildDirectoryPath(config.url);
    const response = await fetch(dirUrl, {
      method: 'MKCOL',
      headers: {
        'Authorization': buildAuthHeader(config.username, config.password),
      },
    });

    // 201 = Created, 405 = Already exists
    if (response.status === 201 || response.status === 405) {
      return { success: true, status: response.status };
    }

    return { success: false, status: response.status, error: `Failed to create directory: ${response.status}` };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create directory',
    };
  }
}

/**
 * Upload a file to WebDAV (PUT)
 *
 * Pass `etag` to enable conditional PUT (If-Match header).
 * Returns `{ success: false, status: 412 }` on ETag mismatch — caller
 * should fetch the current version, merge (LWW by updated_at), then retry.
 */
export async function uploadFile(
  config: WebDAVConfig,
  filename: string,
  content: string,
  etag?: string | null,
): Promise<WebDAVResponse & { etag?: string }> {
  try {
    const fileUrl = buildFilePath(config.url, filename);
    const headers: Record<string, string> = {
      'Authorization': buildAuthHeader(config.username, config.password),
      'Content-Type': 'application/octet-stream',
    };
    if (etag) {
      headers['If-Match'] = etag;
    }
    const response = await fetch(fileUrl, { method: 'PUT', headers, body: content });

    if (response.status === 412) {
      return { success: false, status: 412, error: 'ETag mismatch — remote was modified' };
    }

    if (response.status === 201 || response.status === 204 || response.status === 200) {
      const newEtag = response.headers.get('ETag') ?? undefined;
      return { success: true, status: response.status, etag: newEtag };
    }

    return { success: false, status: response.status, error: `Upload failed: ${response.status}` };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

/**
 * Upload with ETag-guarded retry.
 *
 * On 412 Precondition Failed: download the current remote, merge by
 * updated_at LWW (remote wins for newer entries), then retry the PUT.
 * At most 2 attempts — if it fails again, surface the error to the caller.
 */
export async function uploadFileWithETagRetry(
  config: WebDAVConfig,
  filename: string,
  content: string,
  etag: string | null,
): Promise<WebDAVResponse & { etag?: string }> {
  const result = await uploadFile(config, filename, content, etag);
  if (result.status !== 412) return result;

  // Remote changed — download, merge LWW, retry once
  const remote = await downloadFile(config, filename);
  if (!remote.success || !remote.data) {
    return { success: false, error: 'ETag conflict and remote download failed' };
  }

  try {
    const localEntries: Array<{ id: string; updated_at: string }> = JSON.parse(content)?.entries ?? [];
    const remoteEntries: Array<{ id: string; updated_at: string }> = JSON.parse(remote.data)?.entries ?? [];

    const merged = new Map<string, (typeof localEntries)[number]>();
    for (const entry of remoteEntries) merged.set(entry.id, entry);
    for (const entry of localEntries) {
      const existing = merged.get(entry.id);
      if (!existing || entry.updated_at >= existing.updated_at) {
        merged.set(entry.id, entry);
      }
    }

    const mergedContent = JSON.stringify({ entries: Array.from(merged.values()), mergedAt: new Date().toISOString() });
    // Retry without If-Match (unconditional overwrite after merge)
    return uploadFile(config, filename, mergedContent, undefined);
  } catch {
    // Content isn't structured JSON entries — just overwrite
    return uploadFile(config, filename, content, undefined);
  }
}

/**
 * Download a file from WebDAV (GET).
 * Returns the ETag header value in the response as `etag` when present.
 */
export async function downloadFile(
  config: WebDAVConfig,
  filename: string,
): Promise<WebDAVResponse & { etag?: string }> {
  try {
    const fileUrl = buildFilePath(config.url, filename);
    const response = await fetch(fileUrl, {
      method: 'GET',
      headers: {
        'Authorization': buildAuthHeader(config.username, config.password),
      },
    });

    if (response.ok) {
      const data = await response.text();
      const etag = response.headers.get('ETag') ?? undefined;
      return { success: true, status: response.status, data, etag };
    }

    if (response.status === 404) {
      return { success: false, status: 404, error: 'File not found' };
    }

    return { success: false, status: response.status, error: `Download failed: ${response.status}` };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Download failed',
    };
  }
}

/**
 * Delete a file from WebDAV (DELETE)
 */
export async function deleteFile(
  config: WebDAVConfig,
  filename: string,
): Promise<WebDAVResponse> {
  try {
    const fileUrl = buildFilePath(config.url, filename);
    const response = await fetch(fileUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': buildAuthHeader(config.username, config.password),
      },
    });

    if (response.status === 204 || response.status === 200 || response.status === 404) {
      return { success: true, status: response.status };
    }

    return { success: false, status: response.status, error: `Delete failed: ${response.status}` };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Delete failed',
    };
  }
}

/**
 * Create a subdirectory under MoodHaven/ using MKCOL.
 * 201 = created, 405 = already exists — both are success.
 */
async function ensureSubdirectory(config: WebDAVConfig, subpath: string): Promise<void> {
  const dirUrl = `${normalizeWebDAVUrl(config.url)}${MOODHAVEN_DIR}/${subpath}/`;
  const response = await fetch(dirUrl, {
    method: 'MKCOL',
    headers: { 'Authorization': buildAuthHeader(config.username, config.password) },
  });
  // 201 = created, 405 = already exists, 301/302 redirects — all acceptable
  if (response.status !== 201 && response.status !== 405 && !response.ok) {
    // Non-fatal: log but don't throw; some WebDAV servers return 200 for MKCOL
    log.warn('ensureSubdirectory: unexpected status', { subpath, status: response.status });
  }
}

/**
 * Ensure the full sync directory tree exists under MoodHaven/:
 *   sync/
 *   sync/entries/
 *   sync/books/
 *
 * Call this once before starting a sync operation.
 */
export async function ensureSyncDirectories(config: WebDAVConfig): Promise<void> {
  // Ensure the root MoodHaven/ dir first
  await ensureDirectory(config);
  // Then the sync subdirs in order
  await ensureSubdirectory(config, 'sync');
  await ensureSubdirectory(config, 'sync/entries');
  await ensureSubdirectory(config, 'sync/books');
  await ensureSubdirectory(config, 'sync/media');
}

/**
 * List files in MoodHaven directory (PROPFIND Depth:1)
 */
export async function listFiles(config: WebDAVConfig): Promise<WebDAVResponse & { files?: string[] }> {
  try {
    const dirUrl = buildDirectoryPath(config.url);
    const response = await fetch(dirUrl, {
      method: 'PROPFIND',
      headers: {
        'Authorization': buildAuthHeader(config.username, config.password),
        'Depth': '1',
        'Content-Type': 'application/xml',
      },
    });

    if (response.status === 207 || response.status === 200) {
      const xml = await response.text();
      const files = parseFilenamesFromPropfind(xml);
      return { success: true, status: response.status, files };
    }

    if (response.status === 404) {
      return { success: true, files: [] };
    }

    return { success: false, status: response.status, error: `List failed: ${response.status}` };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'List failed',
    };
  }
}

/**
 * Parse filenames from WebDAV PROPFIND XML response.
 * Extracts href values and returns just the .moodhaven filenames.
 */
export function parseFilenamesFromPropfind(xml: string): string[] {
  const files: string[] = [];
  const hrefRegex = /<(?:[dD]:)?href>([^<]+)<\/(?:[dD]:)?href>/g;
  let match;
  while ((match = hrefRegex.exec(xml)) !== null) {
    const href = decodeURIComponent(match[1]);
    const parts = href.replace(/\/$/, '').split('/');
    const name = parts[parts.length - 1];
    if (name && name.endsWith('.moodhaven')) {
      files.push(name);
    }
  }
  return files;
}
