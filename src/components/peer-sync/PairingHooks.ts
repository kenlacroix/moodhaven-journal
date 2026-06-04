import { useState, useEffect } from 'react';

export function useQRCode(payload: string | null): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!payload) { setDataUrl(null); return; }
    import('qrcode')
      .then((QRCode) =>
        QRCode.toDataURL(payload, {
          width: 200,
          margin: 2,
          color: { dark: '#4c1d95', light: '#faf5ff' },
        })
      )
      .then(setDataUrl)
      .catch((err) => {
        console.error('[PairingHooks] QR code generation failed:', err);
      });
  }, [payload]);

  return dataUrl;
}

export function useCountdown(expiresAt: number | null): number {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const s = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
      setSecondsLeft(s);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return secondsLeft;
}

export function formatCountdown(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
