import '@testing-library/jest-dom/vitest';
import { webcrypto } from 'node:crypto';
import 'fake-indexeddb/auto';

// Polyfill WebCrypto API for jsdom environment (Node 18 doesn't expose it fully in jsdom)
// jsdom provides a partial crypto that lacks SubtleCrypto support.
vi.stubGlobal('crypto', webcrypto);

// Mock @tauri-apps/api/core globally
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock @tauri-apps/plugin-shell
vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn(),
}));

// Mock @tauri-apps/plugin-notification
vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: vi.fn().mockResolvedValue(true),
  requestPermission: vi.fn().mockResolvedValue('granted'),
  sendNotification: vi.fn(),
}));

// Mock @tauri-apps/plugin-http
vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn(),
}));

// Mock @tauri-apps/plugin-dialog
vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn().mockResolvedValue(null),
  open: vi.fn().mockResolvedValue(null),
}));

// Mock @tauri-apps/plugin-fs
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: vi.fn().mockResolvedValue(undefined),
  readTextFile: vi.fn().mockResolvedValue(''),
}));

// Mock @tauri-apps/plugin-log
vi.mock('@tauri-apps/plugin-log', () => ({
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  attachConsole: vi.fn().mockResolvedValue(() => {}),
}));

// Simulate Tauri WebView environment so IS_BROWSER checks behave correctly in tests.
// All existing tests mock invoke() and assume Tauri IPC — not browser IndexedDB.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    value: {},
    writable: true,
    configurable: true,
  });
}

// Mock window.matchMedia for theme-related tests (only in jsdom environment)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
