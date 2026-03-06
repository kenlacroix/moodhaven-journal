/**
 * WebDAV Service for MoodBloom
 *
 * Handles WebDAV HTTP operations (PUT, GET, PROPFIND, MKCOL).
 * Uses @tauri-apps/plugin-http for HTTP requests that bypass CSP restrictions.
 */

import { fetch } from '@tauri-apps/plugin-http';
import type { WebDAVConfig } from '../types/settings';

export interface WebDAVResponse {
  success: boolean;
  status?: number;
  error?: string;
  data?: string;
}

const MOODBLOOM_DIR = 'MoodBloom';

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
 * Build full path to a file within the MoodBloom directory
 */
export function buildFilePath(baseUrl: string, filename: string): string {
  return `${normalizeWebDAVUrl(baseUrl)}${MOODBLOOM_DIR}/${filename}`;
}

/**
 * Build path to MoodBloom directory
 */
export function buildDirectoryPath(baseUrl: string): string {
  return `${normalizeWebDAVUrl(baseUrl)}${MOODBLOOM_DIR}/`;
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
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

/**
 * Ensure the MoodBloom directory exists (MKCOL)
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
 */
export async function uploadFile(
  config: WebDAVConfig,
  filename: string,
  content: string,
): Promise<WebDAVResponse> {
  try {
    const fileUrl = buildFilePath(config.url, filename);
    const response = await fetch(fileUrl, {
      method: 'PUT',
      headers: {
        'Authorization': buildAuthHeader(config.username, config.password),
        'Content-Type': 'application/octet-stream',
      },
      body: content,
    });

    if (response.status === 201 || response.status === 204 || response.status === 200) {
      return { success: true, status: response.status };
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
 * Download a file from WebDAV (GET)
 */
export async function downloadFile(
  config: WebDAVConfig,
  filename: string,
): Promise<WebDAVResponse> {
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
      return { success: true, status: response.status, data };
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
 * Create a subdirectory under MoodBloom/ using MKCOL.
 * 201 = created, 405 = already exists — both are success.
 */
async function ensureSubdirectory(config: WebDAVConfig, subpath: string): Promise<void> {
  const dirUrl = `${normalizeWebDAVUrl(config.url)}${MOODBLOOM_DIR}/${subpath}/`;
  const response = await fetch(dirUrl, {
    method: 'MKCOL',
    headers: { 'Authorization': buildAuthHeader(config.username, config.password) },
  });
  // 201 = created, 405 = already exists, 301/302 redirects — all acceptable
  if (response.status !== 201 && response.status !== 405 && !response.ok) {
    // Non-fatal: log but don't throw; some WebDAV servers return 200 for MKCOL
    console.warn(`ensureSubdirectory ${subpath}: unexpected status ${response.status}`);
  }
}

/**
 * Ensure the full sync directory tree exists under MoodBloom/:
 *   sync/
 *   sync/entries/
 *   sync/books/
 *
 * Call this once before starting a sync operation.
 */
export async function ensureSyncDirectories(config: WebDAVConfig): Promise<void> {
  // Ensure the root MoodBloom/ dir first
  await ensureDirectory(config);
  // Then the sync subdirs in order
  await ensureSubdirectory(config, 'sync');
  await ensureSubdirectory(config, 'sync/entries');
  await ensureSubdirectory(config, 'sync/books');
}

/**
 * List files in MoodBloom directory (PROPFIND Depth:1)
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
 * Extracts href values and returns just the .moodbloom filenames.
 */
export function parseFilenamesFromPropfind(xml: string): string[] {
  const files: string[] = [];
  const hrefRegex = /<(?:[dD]:)?href>([^<]+)<\/(?:[dD]:)?href>/g;
  let match;
  while ((match = hrefRegex.exec(xml)) !== null) {
    const href = decodeURIComponent(match[1]);
    const parts = href.replace(/\/$/, '').split('/');
    const name = parts[parts.length - 1];
    if (name && name.endsWith('.moodbloom')) {
      files.push(name);
    }
  }
  return files;
}
