/**
 * usePlatform — detect the runtime platform and derive feature capabilities.
 *
 * Runtime: Tauri exposes `window.__TAURI_INTERNALS__` on every native platform.
 * The browser/PWA build replaces that reference with `undefined` at compile time
 * (see vite.config.ts `define`), so `_hasTauri` is statically false there.
 *
 * OS: inferred from the WebView user-agent. iPadOS 13+ reports a desktop
 * ("Macintosh") UA, so a Mac-like UA backed by a touch screen is treated as iOS —
 * otherwise an iPad running the native app would be misclassified as desktop and
 * every `!isIOS` gate (mic, breakout writer, updater) would wrongly appear.
 *
 * Prefer the capability flags (`canPeerSync`, `canSTT`, `canHardwareKey`) when
 * gating UI: gate on what the platform can DO, not on which platform it is.
 */

const _hasTauri = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
const _ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const _touchPoints = typeof navigator !== 'undefined' ? (navigator.maxTouchPoints ?? 0) : 0;

// iPadOS 13+ masquerades as macOS in the UA; a Mac UA with a multi-touch screen is an iPad.
const _isIPadOS = /Macintosh/i.test(_ua) && _touchPoints > 1;

const IS_IOS = _hasTauri && (/iPhone|iPad|iPod/i.test(_ua) || _isIPadOS);
const IS_ANDROID = _hasTauri && !IS_IOS && /android/i.test(_ua);
const IS_BROWSER = !_hasTauri;
const IS_DESKTOP = _hasTauri && !IS_IOS && !IS_ANDROID;

// Standalone export for non-React modules (services) that need the same signal
// without the hook. Keep keyed to the single source of truth above.
export const isAndroidPlatform = IS_ANDROID;

// Capability flags — the preferred gating signal. Keyed to where each feature
// actually works: native mDNS/TCP peer sync (desktop + Android phone companion),
// the whisper.cpp sidecar (desktop only — App Sandbox blocks sidecars on iOS),
// and native CTAP2/HID hardware keys (desktop only).
const CAN_PEER_SYNC = IS_DESKTOP || IS_ANDROID;
const CAN_STT = IS_DESKTOP;
const CAN_HARDWARE_KEY = IS_DESKTOP;

export function usePlatform() {
  return {
    isIOS: IS_IOS,
    isAndroid: IS_ANDROID,
    isMobile: IS_IOS || IS_ANDROID,
    isBrowser: IS_BROWSER,
    isDesktop: IS_DESKTOP,
    canPeerSync: CAN_PEER_SYNC,
    canSTT: CAN_STT,
    canHardwareKey: CAN_HARDWARE_KEY,
  };
}
