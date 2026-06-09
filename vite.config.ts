import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const isWebBuild = process.env.VITE_TARGET === 'web';
// True when Tauri CLI is driving the build/dev server (sets TAURI_ENV_PLATFORM).
// When false (plain `npm run dev`), there is no Tauri runtime, so we activate the
// browser shim so that invoke() calls route to IndexedDB instead of crashing.
const isTauriContext = !!process.env.TAURI_ENV_PLATFORM;
const useBrowserShim = isWebBuild || !isTauriContext;

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
  resolve: useBrowserShim
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
        : 'safari16',
    // Don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG && !isWebBuild ? 'esbuild' : isWebBuild ? 'esbuild' : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      output: {
        // Split heavy vendor libraries into stable chunks.
        // Stable chunk names survive app-code changes, so browsers can cache
        // vendor chunks across deploys without re-downloading unchanged code.
        manualChunks(id) {
          if (id.includes('node_modules/@tiptap') || id.includes('node_modules/prosemirror')) {
            return 'vendor-tiptap';
          }
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/zustand/')) {
            return 'vendor-zustand';
          }
        },
      },
    },
  },

  define: {
    ...(useBrowserShim ? { 'window.__TAURI_INTERNALS__': 'undefined' } : {}),
    // StillHaven is built in to all releases; the in-app toggle controls visibility.
    'import.meta.env.VITE_FEATURE_STILL': 'true',
  },

  // Environment variable prefix
  envPrefix: ['VITE_', 'TAURI_ENV_'],
});
