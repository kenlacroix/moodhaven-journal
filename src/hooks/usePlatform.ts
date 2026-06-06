/**
 * usePlatform — detect whether the app is running on iOS, Android, or desktop.
 *
 * Strategy: Tauri exposes `window.__TAURI_INTERNALS__` on all platforms.
 * Platform is inferred from the WebView user-agent — reliable inside Tauri
 * because we control the UA string. Result is stable for the app lifetime.
 */

const _hasTauri = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
const _ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

const IS_IOS = _hasTauri && /iPhone|iPad|iPod/i.test(_ua);
const IS_ANDROID = _hasTauri && !IS_IOS && /android/i.test(_ua);
const IS_BROWSER = !_hasTauri;

export function usePlatform() {
  return {
    isIOS: IS_IOS,
    isAndroid: IS_ANDROID,
    isMobile: IS_IOS || IS_ANDROID,
    isBrowser: IS_BROWSER,
    isDesktop: !IS_IOS && !IS_ANDROID && !IS_BROWSER,
  };
}
