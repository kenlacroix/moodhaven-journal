import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  );

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return isMobile;
}

export function useIsIOS(): boolean {
  const [isIOS, setIsIOS] = useState(() => {
    if (typeof navigator === 'undefined') return false;
    // Primary: Tauri WebView on iOS sets a recognisable UA
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
    // Secondary: iPadOS in desktop mode reports as macOS, check pointer type
    return navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent);
  });

  useEffect(() => {
    // Attempt Tauri plugin-os if available (optional dep — not installed by default)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    import('@tauri-apps/plugin-os' as any)
      .then((mod: { platform: () => Promise<string> }) => {
        mod.platform()
          .then((p) => setIsIOS(p === 'ios'))
          .catch(() => {/* keep UA-based initial value */});
      })
      .catch(() => {/* plugin not present — UA value from useState is correct */});
  }, []);

  return isIOS;
}
