/**
 * usePlatform — detect whether the app is running on Android or desktop.
 *
 * Strategy: Tauri exposes `window.__TAURI_INTERNALS__` on all platforms.
 * On Android the user-agent contains "Android". This is reliable inside a
 * Tauri WebView because we control the UA string.
 *
 * Result is stable for the lifetime of the app — computed once at module load.
 */

const IS_ANDROID = typeof navigator !== 'undefined' &&
  /android/i.test(navigator.userAgent);

const IS_BROWSER = typeof window !== 'undefined' && !window.__TAURI_INTERNALS__;

export function usePlatform() {
  return {
    isAndroid: IS_ANDROID,
    isBrowser: IS_BROWSER,
    isDesktop: !IS_ANDROID && !IS_BROWSER,
  };
}
