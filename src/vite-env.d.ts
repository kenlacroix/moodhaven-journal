/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_MODE?: 'bypass' | 'seeded';
  readonly VITE_TARGET?: 'web';
  readonly VITE_APP_VERSION?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Tauri injects __TAURI_INTERNALS__ into the WebView. Absent in browsers.
interface Window {
  __TAURI_INTERNALS__?: unknown;
}

