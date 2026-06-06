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
import type { DiscoveredPeer, TrustedDevice } from '../../types/peerSync';
import { SuccessScreen } from './PairingUIComponents';
import { ShowCodeTab } from './PairingShowCodeTab';
import { EnterCodeTab } from './PairingEnterCodeTab';

export function PairingModal({
  peer,
  onClose,
}: {
  peer: DiscoveredPeer;
  onClose: () => void;
}) {
  const TABS = ['show', 'enter'] as const;
  const [tab, setTab] = useState<'show' | 'enter'>('show');
  const [paired, setPaired] = useState<TrustedDevice | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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
      aria-labelledby="pairing-modal-title"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 id="pairing-modal-title" className="text-base font-semibold text-slate-800 dark:text-slate-100">
              Pair with {peer.deviceName}
            </h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 capitalize">
              {peer.deviceType} · {peer.version}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close pairing dialog"
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
              <div
                role="tablist"
                aria-label="Pairing method"
                className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 mb-5"
                onKeyDown={(e) => {
                  const idx = TABS.indexOf(tab);
                  if (e.key === 'ArrowRight') {
                    const next = TABS[(idx + 1) % TABS.length];
                    setTab(next);
                    tabRefs.current[next]?.focus();
                  } else if (e.key === 'ArrowLeft') {
                    const prev = TABS[(idx - 1 + TABS.length) % TABS.length];
                    setTab(prev);
                    tabRefs.current[prev]?.focus();
                  }
                }}
              >
                {(
                  [
                    { key: 'show', label: 'Show My Code' },
                    { key: 'enter', label: 'Enter Their Code' },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    ref={(el) => { tabRefs.current[key] = el; }}
                    role="tab"
                    aria-selected={tab === key}
                    aria-controls={`pairing-tab-panel-${key}`}
                    id={`pairing-tab-${key}`}
                    tabIndex={tab === key ? 0 : -1}
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

              {/* Tab content — always mounted; hidden attribute removes from AT/tab order */}
              <div
                id="pairing-tab-panel-show"
                role="tabpanel"
                aria-labelledby="pairing-tab-show"
                hidden={tab !== 'show'}
              >
                <ShowCodeTab onSuccess={handleSuccess} />
              </div>
              <div
                id="pairing-tab-panel-enter"
                role="tabpanel"
                aria-labelledby="pairing-tab-enter"
                hidden={tab !== 'enter'}
              >
                <EnterCodeTab peer={peer} onSuccess={handleSuccess} />
              </div>
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
