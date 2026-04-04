import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const isWebBuild = process.env.VITE_TARGET === 'web';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Vite options tailored for Tauri development
  clearScreen: false,

  // Tauri expects a fixed port.
  // host: true (0.0.0.0) is required for real Android hardware: Tauri CLI forcibly
  // replaces the devUrl host with the laptop's detected network IP, so Vite must
  // listen on that interface. Both phone and laptop should be on the same WiFi
  // (e.g. a phone/Apple hotspot or home router) — the phone cannot reach the
  // laptop when the phone itself is the hotspot gateway.
  server: {
    port: parseInt(process.env.VITE_PORT ?? (isWebBuild ? '5173' : '1420')),
    strictPort: !isWebBuild,
    host: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },

  // Browser build: alias Tauri packages to browser shims so service files are unchanged
  resolve: isWebBuild
    ? {
        alias: {
          '@tauri-apps/api/core': resolve(__dirname, 'src/lib/backend/browser-invoke.ts'),
          '@tauri-apps/plugin-http': resolve(__dirname, 'src/lib/backend/browser-stubs.ts'),
          '@tauri-apps/plugin-log': resolve(__dirname, 'src/lib/backend/browser-stubs.ts'),
          '@tauri-apps/plugin-shell': resolve(__dirname, 'src/lib/backend/browser-stubs.ts'),
          '@tauri-apps/plugin-dialog': resolve(__dirname, 'src/lib/backend/browser-stubs.ts'),
          '@tauri-apps/plugin-notification': resolve(__dirname, 'src/lib/backend/browser-stubs.ts'),
          '@tauri-apps/api/window': resolve(__dirname, 'src/lib/backend/browser-stubs.ts'),
          '@tauri-apps/api/event': resolve(__dirname, 'src/lib/backend/browser-stubs.ts'),
        },
      }
    : undefined,

  // Build options
  build: {
    outDir: isWebBuild ? 'dist-web' : 'dist',
    // Tauri uses Chromium on Windows and WebKit on macOS/Linux
    target: isWebBuild
      ? 'es2020'
      : process.env.TAURI_ENV_PLATFORM === 'windows'
        ? 'chrome105'
        : 'safari14',
    // Don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG && !isWebBuild ? 'esbuild' : isWebBuild ? 'esbuild' : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },

  define: isWebBuild
    ? {
        // Stub out Tauri globals so runtime checks work correctly
        'window.__TAURI_INTERNALS__': 'undefined',
      }
    : undefined,

  // Environment variable prefix
  envPrefix: ['VITE_', 'TAURI_ENV_'],
});
