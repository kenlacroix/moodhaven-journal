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

export function usePlatform() {
  return {
    isAndroid: IS_ANDROID,
    isDesktop: !IS_ANDROID,
  };
}
