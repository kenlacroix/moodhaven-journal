/**
 * PairingModal — Secure device pairing via 6-digit PIN
 *
 * Two tabs:
 *  "Show My Code" — this device generates a PIN and shows it (+ QR) for the peer to enter
 *  "Enter Their Code" — the peer shows a PIN, you enter it here to accept
 *
 * Props:
 *  peer      — the DiscoveredPeer to pair with (supplies the target host for "Enter Their Code")
 *  onClose   — called after success or cancellation
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { DiscoveredPeer, TrustedDevice, PairingTokenInfo } from '../../types/peerSync';
import { generatePairingToken, acceptPairing, cancelPairing } from '../../lib/peerPairingService';
import { onPeerPaired } from '../../lib/peerPairingService';

// ── QR image generator (uses qrcode npm package) ──────────────────────────────

function useQRCode(payload: string | null): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!payload) { setDataUrl(null); return; }
    import('qrcode').then((QRCode) => {
      QRCode.toDataURL(payload, {
        width: 200,
        margin: 2,
        color: { dark: '#4c1d95', light: '#faf5ff' },
      }).then(setDataUrl);
    });
  }, [payload]);

  return dataUrl;
}

// ── Countdown timer ────────────────────────────────────────────────────────────

function useCountdown(expiresAt: number | null): number {
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

function formatCountdown(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ── PIN display ────────────────────────────────────────────────────────────────

function PINDisplay({ pin }: { pin: string }) {
  return (
    <div className="flex items-center justify-center gap-2 my-4" aria-label={`PIN: ${pin.split('').join(' ')}`}>
      {pin.split('').map((digit, i) => (
        <div
          key={i}
          className={`w-10 h-14 flex items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-900/20 border-2 border-violet-200 dark:border-violet-700 text-2xl font-bold font-mono text-violet-700 dark:text-violet-300 select-none ${
            i === 2 ? 'mr-2' : ''
          }`}
        >
          {digit}
        </div>
      ))}
    </div>
  );
}

// ── PIN input (6 digits, auto-advance) ────────────────────────────────────────

function PINInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) {
      inputs.current[i - 1]?.focus();
      onChange(value.slice(0, i - 1));
    }
  };

  const handleChange = (i: number, v: string) => {
    const digit = v.replace(/\D/g, '').slice(-1);
    const next = value.slice(0, i) + digit + value.slice(i + 1);
    onChange(next.slice(0, 6));
    if (digit && i < 5) {
      inputs.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      onChange(pasted);
      const nextIdx = Math.min(pasted.length, 5);
      inputs.current[nextIdx]?.focus();
      e.preventDefault();
    }
  };

  return (
    <div className="flex items-center justify-center gap-2 my-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { inputs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]"
          maxLength={1}
          value={value[i] ?? ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className={`w-10 h-14 text-center text-2xl font-bold font-mono rounded-xl border-2 bg-white dark:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-40 ${
            value[i]
              ? 'border-violet-400 dark:border-violet-500 text-violet-700 dark:text-violet-300'
              : 'border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100'
          } ${i === 2 ? 'mr-2' : ''}`}
          aria-label={`PIN digit ${i + 1}`}
        />
      ))}
    </div>
  );
}

// ── Success screen ─────────────────────────────────────────────────────────────

function SuccessScreen({ device, onClose }: { device: TrustedDevice; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
        <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div>
        <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">Paired!</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {device.deviceName} is now a trusted device.
        </p>
      </div>
      <button
        onClick={onClose}
        className="px-5 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors"
      >
        Done
      </button>
    </div>
  );
}

// ── Show My Code tab ───────────────────────────────────────────────────────────

function ShowCodeTab({
  onSuccess,
}: {
  onSuccess: (device: TrustedDevice) => void;
}) {
  const [tokenInfo, setTokenInfo] = useState<PairingTokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const qrDataUrl = useQRCode(tokenInfo?.qrPayload ?? null);
  const secondsLeft = useCountdown(tokenInfo?.expiresAt ?? null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    async function start() {
      setLoading(true);
      setError('');
      try {
        const info = await generatePairingToken();
        if (!cancelled) setTokenInfo(info);

        // Listen for the paired event
        unlisten = await onPeerPaired((device) => {
          if (!cancelled) onSuccess(device);
        });
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    start();

    return () => {
      cancelled = true;
      unlisten?.();
      cancelPairing().catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    setError('');
    setTokenInfo(null);
    try {
      const info = await generatePairingToken();
      setTokenInfo(info);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Starting pairing server…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  const expired = secondsLeft === 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300 text-center">
        On the other device, go to{' '}
        <strong>Settings → Devices → Pair → Enter Their Code</strong> and type:
      </p>

      {tokenInfo && <PINDisplay pin={tokenInfo.pin} />}

      {/* QR code */}
      <div className="flex flex-col items-center gap-2">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="Pairing QR code"
            className="w-40 h-40 rounded-xl border-2 border-violet-100 dark:border-violet-900/40"
          />
        ) : (
          <div className="w-40 h-40 rounded-xl bg-violet-50 dark:bg-violet-900/10 border-2 border-violet-100 dark:border-violet-900/40 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <p className="text-xs text-slate-400 dark:text-slate-500">Or scan this QR code</p>
      </div>

      {/* Countdown + status */}
      {expired ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-amber-600 dark:text-amber-400">Code expired</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg"
          >
            Generate New Code
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse flex-shrink-0" />
          <span>Waiting for connection…</span>
          <span className="font-mono text-xs text-slate-400 dark:text-slate-500 tabular-nums">
            ({formatCountdown(secondsLeft)})
          </span>
        </div>
      )}
    </div>
  );
}

// ── Enter Their Code tab ───────────────────────────────────────────────────────

function EnterCodeTab({
  peer,
  onSuccess,
}: {
  peer: DiscoveredPeer;
  onSuccess: (device: TrustedDevice) => void;
}) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async () => {
    if (pin.length !== 6) return;
    setLoading(true);
    setError('');
    try {
      const device = await acceptPairing(peer.host, pin);
      onSuccess(device);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [pin, peer.host, onSuccess]);

  // Auto-submit when 6 digits are entered
  useEffect(() => {
    if (pin.length === 6 && !loading) {
      handleSubmit();
    }
  }, [pin, loading, handleSubmit]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300 text-center">
        On <strong>{peer.deviceName}</strong>, go to{' '}
        <strong>Settings → Devices → Pair → Show My Code</strong> and enter the 6-digit code shown:
      </p>

      <PINInput value={pin} onChange={setPin} disabled={loading} />

      {error && (
        <p className="text-xs text-red-500 text-center">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={pin.length !== 6 || loading}
        className="w-full py-2.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Pairing…
          </>
        ) : (
          'Pair Device'
        )}
      </button>

      <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
        Connecting to {peer.host}:{42425}
      </p>
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────

export function PairingModal({
  peer,
  onClose,
}: {
  peer: DiscoveredPeer;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'show' | 'enter'>('show');
  const [paired, setPaired] = useState<TrustedDevice | null>(null);

  const handleSuccess = useCallback((device: TrustedDevice) => {
    setPaired(device);
  }, []);

  // Trap focus within modal; close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Pair device"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              Pair with {peer.deviceName}
            </h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 capitalize">
              {peer.deviceType} · {peer.version}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {paired ? (
            <SuccessScreen device={paired} onClose={onClose} />
          ) : (
            <>
              {/* Tab switcher */}
              <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 mb-5">
                {(
                  [
                    { key: 'show', label: 'Show My Code' },
                    { key: 'enter', label: 'Enter Their Code' },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all ${
                      tab === key
                        ? 'bg-white dark:bg-slate-700 text-violet-700 dark:text-violet-300 shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {tab === 'show' ? (
                <ShowCodeTab onSuccess={handleSuccess} />
              ) : (
                <EnterCodeTab peer={peer} onSuccess={handleSuccess} />
              )}
            </>
          )}
        </div>

        {/* Security footer */}
        {!paired && (
          <div className="px-5 pb-4">
            <div className="flex gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <svg
                className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                />
              </svg>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Pairing is local-only. No data is shared until you sync. Keys are verified during sync.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
