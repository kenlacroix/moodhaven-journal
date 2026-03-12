import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
    port: 1420,
    strictPort: true,
    host: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },

  // Build options
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS/Linux
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari14',
    // Don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },

  // Environment variable prefix
  envPrefix: ['VITE_', 'TAURI_ENV_'],
});
