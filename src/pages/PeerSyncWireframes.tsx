/**
 * PeerSyncWireframes — Dev-only preview of peer sync UI across device types.
 *
 * Access via:  ?mode=peersync  (append to app URL in dev)
 *
 * Shows:
 *   1. Desktop — Devices tab in Settings (discovery + pairing + trusted list)
 *   2. Desktop — Pairing modal (QR display)
 *   3. Mobile  — Devices screen
 *   4. Mobile  — QR Scanner screen
 *   5. Mobile  — Pairing confirmation screen
 *   6. Watch   — Pair request screen (round)
 *   7. Watch   — Sync status screen (round)
 */

import { useState } from 'react';

// ─── Shared primitives ────────────────────────────────────────────────────────

function DeviceIcon({ type, size = 16 }: { type: string; size?: number }) {
  const s = size;
  if (type === 'phone')
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <circle cx="12" cy="18" r="1" fill="currentColor" />
      </svg>
    );
  if (type === 'tablet')
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <circle cx="12" cy="18" r="1" fill="currentColor" />
      </svg>
    );
  if (type === 'watch')
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="7" y="6" width="10" height="12" rx="3" />
        <path d="M9 6V4h6v2M9 18v2h6v-2" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </svg>
    );
  // desktop default
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function SyncDots() {
  return (
    <span className="inline-flex gap-0.5 items-center">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-violet-400 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

function SignalBars({ strength = 3 }: { strength?: 1 | 2 | 3 }) {
  return (
    <span className="inline-flex items-end gap-px h-3">
      {[1, 2, 3].map((b) => (
        <span
          key={b}
          className={`w-1 rounded-sm ${b <= strength ? 'bg-emerald-400' : 'bg-zinc-600'}`}
          style={{ height: `${b * 4}px` }}
        />
      ))}
    </span>
  );
}

// Minimal QR placeholder
function QRPlaceholder({ size = 160 }: { size?: number }) {
  // Render a stylised QR-like grid as SVG
  const cells = 11;
  const cell = size / cells;
  const pattern = [
    '11100011100',
    '10100010100',
    '10100010100',
    '10100010100',
    '11100011100',
    '00000000000',
    '11100010010',
    '00101001101',
    '10110100110',
    '01001011001',
    '11100011100',
  ];
  return (
    <svg width={size} height={size} className="rounded-lg">
      <rect width={size} height={size} fill="white" rx={8} />
      {pattern.map((row, r) =>
        row.split('').map((v, c) =>
          v === '1' ? (
            <rect
              key={`${r}-${c}`}
              x={c * cell + 4}
              y={r * cell + 4}
              width={cell - 1}
              height={cell - 1}
              fill="#18181b"
              rx={1}
            />
          ) : null
        )
      )}
    </svg>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="h-px flex-1 bg-zinc-700" />
      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{children}</span>
      <div className="h-px flex-1 bg-zinc-700" />
    </div>
  );
}

// ─── DESKTOP WIREFRAMES ───────────────────────────────────────────────────────

function DesktopDevicesTab() {
  const [localSync, setLocalSync] = useState(true);
  const [showQR, setShowQR] = useState(false);

  return (
    <div className="flex h-full" style={{ minHeight: 520 }}>
      {/* Sidebar */}
      <div className="w-48 bg-zinc-900 border-r border-zinc-700 flex flex-col py-4">
        <div className="px-4 mb-4">
          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Settings</div>
        </div>
        {['General', 'Appearance', 'Privacy', 'Security', 'AI', 'Health', 'Devices', 'Storage'].map((item) => (
          <button
            key={item}
            className={`px-4 py-1.5 text-sm text-left transition-colors ${
              item === 'Devices'
                ? 'bg-violet-500/20 text-violet-300 font-medium border-r-2 border-violet-400'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6 bg-zinc-950">
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">Devices</h2>
        <p className="text-sm text-zinc-500 mb-6">
          Sync your journal privately across devices on your local network.
        </p>

        {/* Toggle */}
        <div className="bg-zinc-900 rounded-xl p-4 mb-4 flex items-center justify-between border border-zinc-800">
          <div>
            <div className="text-sm font-medium text-zinc-200">Local Sync</div>
            <div className="text-xs text-zinc-500 mt-0.5">Discover devices on your Wi-Fi network</div>
          </div>
          <button
            onClick={() => setLocalSync(!localSync)}
            className={`w-10 h-5 rounded-full relative transition-colors ${localSync ? 'bg-violet-500' : 'bg-zinc-600'}`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${localSync ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </button>
        </div>

        {localSync && (
          <>
            {/* This device */}
            <div className="bg-zinc-900 rounded-xl p-4 mb-4 border border-zinc-800">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">This Device</div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-violet-500/20 flex items-center justify-center text-violet-400">
                  <DeviceIcon type="desktop" size={18} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-zinc-200">Ken's Laptop</div>
                  <div className="text-xs text-zinc-500">desktop · ID: 9a4f0b2c · port 4242</div>
                </div>
                <button className="text-xs text-violet-400 hover:text-violet-300 px-2 py-1 rounded bg-violet-500/10">
                  Rename
                </button>
              </div>
            </div>

            {/* Nearby */}
            <div className="bg-zinc-900 rounded-xl p-4 mb-4 border border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Nearby Devices
                </div>
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <SyncDots />
                  <span>Scanning</span>
                </div>
              </div>

              {/* Undiscovered state */}
              <div className="flex items-center gap-3 py-2">
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-500">
                  <DeviceIcon type="phone" size={16} />
                </div>
                <div className="flex-1">
                  <div className="text-sm text-zinc-300">Ken's iPhone</div>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <SignalBars strength={3} />
                    <span>Just discovered</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowQR(true)}
                  className="text-xs font-medium text-white px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500"
                >
                  Pair
                </button>
              </div>

              <div className="h-px bg-zinc-800 my-2" />

              <div className="flex items-center gap-3 py-2 opacity-50">
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-500">
                  <DeviceIcon type="tablet" size={16} />
                </div>
                <div className="flex-1">
                  <div className="text-sm text-zinc-300">Ken's iPad</div>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <SignalBars strength={1} />
                    <span>Weak signal</span>
                  </div>
                </div>
                <button className="text-xs font-medium text-white px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 opacity-60">
                  Pair
                </button>
              </div>
            </div>

            {/* Trusted / Paired */}
            <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Paired Devices
                </div>
                <button
                  onClick={() => setShowQR(true)}
                  className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
                >
                  <span>+</span> Pair new device
                </button>
              </div>

              {[
                { name: "Ken's MacBook Pro", type: 'desktop', sync: '3 min ago', entries: 12 },
                { name: "Ken's Pixel Watch", type: 'watch', sync: '1 hr ago', entries: 3 },
              ].map((d) => (
                <div key={d.name} className="flex items-center gap-3 py-2.5 border-b border-zinc-800 last:border-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <DeviceIcon type={d.type} size={16} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-zinc-200">{d.name}</div>
                    <div className="text-xs text-zinc-500">
                      Last sync: {d.sync} · {d.entries} entries exchanged
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mr-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-xs text-emerald-400">Online</span>
                  </div>
                  <button className="text-xs text-zinc-500 hover:text-red-400 px-2 py-1 rounded bg-zinc-800">
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* QR Pairing Modal overlay */}
      {showQR && <DesktopPairingModal onClose={() => setShowQR(false)} />}
    </div>
  );
}

function DesktopPairingModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'qr' | 'confirm' | 'success'>('qr');
  const ttl = 4 * 60 + 52; // seconds display
  const mm = Math.floor(ttl / 60);
  const ss = String(ttl % 60).padStart(2, '0');

  return (
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-10 rounded-xl">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-700 shadow-2xl w-96 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="text-sm font-semibold text-zinc-100">
            {step === 'qr' && 'Pair a New Device'}
            {step === 'confirm' && 'Confirm Pairing'}
            {step === 'success' && 'Device Paired!'}
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">
            ×
          </button>
        </div>

        {step === 'qr' && (
          <div className="p-6 flex flex-col items-center gap-4">
            <p className="text-xs text-zinc-400 text-center">
              Scan this QR code from another device running MoodBloom to begin pairing.
            </p>
            <div className="p-3 bg-white rounded-xl shadow-lg">
              <QRPlaceholder size={160} />
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              Expires in {mm}:{ss}
            </div>
            <div className="h-px w-full bg-zinc-800" />
            <div className="w-full">
              <div className="text-xs text-zinc-500 text-center mb-2">Or use a PIN code</div>
              <div className="flex justify-center">
                <div className="flex gap-2">
                  {'483921'.split('').map((d, i) => (
                    <span
                      key={i}
                      className="w-9 h-11 flex items-center justify-center text-xl font-bold text-violet-300 bg-zinc-800 rounded-lg border border-zinc-700"
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => setStep('confirm')}
              className="w-full text-xs text-zinc-400 hover:text-zinc-200 py-2"
            >
              (demo: simulate incoming pair request →)
            </button>
          </div>
        )}

        {step === 'confirm' && (
          <div className="p-6 flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-violet-500/20 flex items-center justify-center text-violet-400">
              <DeviceIcon type="phone" size={28} />
            </div>
            <div className="text-center">
              <div className="text-base font-semibold text-zinc-100">Ken's iPhone</div>
              <div className="text-xs text-zinc-500 mt-1">iPhone 16 Pro · iOS 18.3</div>
            </div>
            <div className="bg-zinc-800 rounded-xl px-4 py-3 w-full text-center">
              <div className="text-xs text-zinc-500 mb-1">Device ID</div>
              <div className="text-sm font-mono text-zinc-300">a1b2c3d4e5f60718</div>
            </div>
            <p className="text-xs text-zinc-400 text-center">
              Only pair devices you own. Once paired, this device can sync your encrypted journal data.
            </p>
            <div className="flex gap-3 w-full">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm text-zinc-400 bg-zinc-800 hover:bg-zinc-700"
              >
                Decline
              </button>
              <button
                onClick={() => setStep('success')}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500"
              >
                Trust Device
              </button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="p-6 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth={2.5}>
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="text-center">
              <div className="text-base font-semibold text-zinc-100">Paired Successfully</div>
              <div className="text-xs text-zinc-500 mt-1">
                Ken's iPhone has been added to your trusted devices.
              </div>
            </div>
            <div className="bg-zinc-800 rounded-xl px-4 py-3 w-full text-xs text-zinc-400 text-center">
              Initial sync will begin automatically when both devices are online on the same network.
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Sync status badge shown in sidebar footer
function DesktopSyncBadge() {
  const [state, setState] = useState<'idle' | 'syncing' | 'done'>('idle');

  return (
    <div className="flex flex-col gap-2 w-56">
      <div className="text-xs text-zinc-500 mb-1">Sidebar footer sync badge:</div>
      <button
        onClick={() => setState(state === 'idle' ? 'syncing' : state === 'syncing' ? 'done' : 'idle')}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs transition-colors cursor-pointer ${
          state === 'idle'
            ? 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'
            : state === 'syncing'
              ? 'bg-violet-500/10 border-violet-500/30 text-violet-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
        }`}
      >
        {state === 'idle' && (
          <>
            <DeviceIcon type="phone" size={13} />
            <span>2 paired devices</span>
          </>
        )}
        {state === 'syncing' && (
          <>
            <SyncDots />
            <span>Syncing with Ken's iPhone…</span>
          </>
        )}
        {state === 'done' && (
          <>
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Synced · 3 min ago</span>
          </>
        )}
      </button>
      <div className="text-[10px] text-zinc-600">(click to cycle states)</div>
    </div>
  );
}

// ─── MOBILE WIREFRAMES ────────────────────────────────────────────────────────

function MobileFrame({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xs text-zinc-500 font-medium">{title}</div>
      <div
        className="relative bg-zinc-950 rounded-[2.5rem] border-4 border-zinc-700 shadow-2xl overflow-hidden"
        style={{ width: 220, height: 440 }}
      >
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-zinc-700 rounded-b-2xl z-10" />
        {/* Home bar */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-16 h-1 bg-zinc-600 rounded-full z-10" />
        <div className="pt-8 h-full overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

function MobileDevicesScreen() {
  return (
    <MobileFrame title="Devices screen">
      <div className="h-full bg-zinc-950 flex flex-col">
        {/* Nav bar */}
        <div className="px-4 py-3 flex items-center gap-2">
          <button className="text-violet-400 text-xs">← Settings</button>
          <div className="flex-1 text-center text-sm font-semibold text-zinc-100">Devices</div>
          <div className="w-12" />
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-8 space-y-3">
          {/* Toggle */}
          <div className="bg-zinc-900 rounded-2xl p-3 flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-zinc-200">Local Sync</div>
              <div className="text-[10px] text-zinc-500">Same Wi-Fi only</div>
            </div>
            <div className="w-8 h-4 rounded-full bg-violet-500 relative">
              <span className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full shadow" />
            </div>
          </div>

          {/* This device */}
          <div className="bg-zinc-900 rounded-2xl p-3">
            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              This Device
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center text-violet-400">
                <DeviceIcon type="phone" size={15} />
              </div>
              <div>
                <div className="text-xs font-medium text-zinc-200">Ken's iPhone</div>
                <div className="text-[10px] text-zinc-500">phone · ID: a1b2c3d4</div>
              </div>
            </div>
          </div>

          {/* Nearby */}
          <div className="bg-zinc-900 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Nearby</div>
              <SyncDots />
            </div>
            <div className="flex items-center gap-2 py-1.5">
              <div className="w-7 h-7 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400">
                <DeviceIcon type="desktop" size={13} />
              </div>
              <div className="flex-1">
                <div className="text-xs text-zinc-300">Ken's Laptop</div>
                <div className="text-[10px] text-zinc-500">
                  <SignalBars strength={3} /> strong
                </div>
              </div>
              <button className="text-[10px] text-white px-2 py-1 rounded-lg bg-violet-600">Pair</button>
            </div>
          </div>

          {/* Paired */}
          <div className="bg-zinc-900 rounded-2xl p-3">
            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Paired</div>
            {[
              { name: "Ken's Laptop", type: 'desktop', sync: '3m ago' },
              { name: "Pixel Watch 3", type: 'watch', sync: '1h ago' },
            ].map((d) => (
              <div key={d.name} className="flex items-center gap-2 py-1.5 border-b border-zinc-800 last:border-0">
                <div className="w-7 h-7 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <DeviceIcon type={d.type} size={13} />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-zinc-200">{d.name}</div>
                  <div className="text-[10px] text-zinc-500">{d.sync}</div>
                </div>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </div>
            ))}
          </div>

          <button className="w-full py-2.5 rounded-2xl text-xs font-semibold text-white bg-violet-600">
            + Pair New Device
          </button>
        </div>
      </div>
    </MobileFrame>
  );
}

function MobileQRScanScreen() {
  return (
    <MobileFrame title="QR scan (acceptor)">
      <div className="h-full bg-zinc-950 flex flex-col">
        <div className="px-4 py-3 flex items-center gap-2">
          <button className="text-violet-400 text-xs">← Devices</button>
          <div className="flex-1 text-center text-sm font-semibold text-zinc-100">Scan QR Code</div>
          <div className="w-12" />
        </div>

        <div className="px-4 text-xs text-zinc-400 text-center mb-3">
          Point your camera at the QR code on the other device
        </div>

        {/* Viewfinder */}
        <div className="mx-4 rounded-2xl overflow-hidden relative" style={{ height: 200 }}>
          <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center">
            {/* Scanline animation hint */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-violet-500/10 to-transparent animate-pulse" />
            {/* Corner brackets */}
            {[
              'top-3 left-3 border-t-2 border-l-2',
              'top-3 right-3 border-t-2 border-r-2',
              'bottom-3 left-3 border-b-2 border-l-2',
              'bottom-3 right-3 border-b-2 border-r-2',
            ].map((cls, i) => (
              <div key={i} className={`absolute w-6 h-6 border-violet-400 rounded-sm ${cls}`} />
            ))}
            <span className="text-zinc-600 text-xs">Camera viewfinder</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-end px-4 pb-8 gap-3">
          <div className="h-px bg-zinc-800" />
          <div className="text-[10px] text-zinc-500 text-center">Or enter PIN manually</div>
          <div className="flex gap-1.5 justify-center">
            {'_ _ _ _ _ _'.split(' ').map((d, i) => (
              <div
                key={i}
                className="w-7 h-8 flex items-center justify-center text-sm font-bold text-zinc-600 bg-zinc-800 rounded-lg border border-zinc-700"
              >
                {d}
              </div>
            ))}
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}

function MobilePairingConfirmScreen() {
  return (
    <MobileFrame title="Pair confirm (acceptor)">
      <div className="h-full bg-zinc-950 flex flex-col">
        <div className="px-4 py-3 flex items-center gap-2">
          <button className="text-violet-400 text-xs">← Back</button>
          <div className="flex-1 text-center text-sm font-semibold text-zinc-100">Pair Device</div>
          <div className="w-12" />
        </div>

        <div className="flex-1 px-4 flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-violet-500/20 flex items-center justify-center text-violet-400">
            <DeviceIcon type="desktop" size={32} />
          </div>
          <div className="text-center">
            <div className="text-base font-semibold text-zinc-100">Ken's Laptop</div>
            <div className="text-xs text-zinc-500 mt-0.5">macOS · MoodBloom 0.7.0</div>
          </div>

          <div className="bg-zinc-900 rounded-2xl w-full p-3 text-center">
            <div className="text-[10px] text-zinc-500 mb-1">Device ID</div>
            <div className="text-xs font-mono text-zinc-300">9a4f0b2ce1d37f82</div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-[10px] text-amber-300 text-center">
            Only pair devices you own. Paired devices can sync your encrypted journal.
          </div>
        </div>

        <div className="px-4 pb-12 flex gap-3">
          <button className="flex-1 py-2.5 rounded-2xl text-xs text-zinc-400 bg-zinc-800">Decline</button>
          <button className="flex-1 py-2.5 rounded-2xl text-xs font-semibold text-white bg-violet-600">
            Trust Device
          </button>
        </div>
      </div>
    </MobileFrame>
  );
}

// ─── WATCH WIREFRAMES ─────────────────────────────────────────────────────────

function WatchFrame({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xs text-zinc-500 font-medium">{title}</div>
      <div
        className="relative bg-zinc-950 border-4 border-zinc-600 shadow-2xl overflow-hidden flex items-center justify-center"
        style={{ width: 160, height: 160, borderRadius: '50%' }}
      >
        {children}
      </div>
      {/* Crown + band stubs */}
      <div className="flex flex-col items-center gap-1" style={{ marginTop: -4 }}>
        <div className="w-2 h-6 bg-zinc-600 rounded-full" style={{ marginTop: -152, marginLeft: 76 }} />
      </div>
    </div>
  );
}

function WatchPairRequestScreen() {
  return (
    <WatchFrame title="Pair request (watch)">
      <div className="flex flex-col items-center justify-center gap-2 px-4 text-center">
        <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400">
          <DeviceIcon type="phone" size={16} />
        </div>
        <div className="text-[9px] font-semibold text-zinc-200 leading-tight">
          Pair with Ken's iPhone?
        </div>
        <div className="text-[8px] text-zinc-500">PIN: 4 8 3 9 2 1</div>
        <div className="flex gap-2 mt-1">
          <button className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400">
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <button className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </button>
        </div>
      </div>
    </WatchFrame>
  );
}

function WatchSyncStatusScreen() {
  return (
    <WatchFrame title="Sync status (watch)">
      <div className="flex flex-col items-center justify-center gap-2 px-3 text-center">
        {/* Animated ring */}
        <div className="relative w-12 h-12">
          <svg className="absolute inset-0 -rotate-90" width={48} height={48} viewBox="0 0 48 48">
            <circle cx={24} cy={24} r={20} fill="none" stroke="#3f3f46" strokeWidth={4} />
            <circle
              cx={24}
              cy={24}
              r={20}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth={4}
              strokeDasharray={`${2 * Math.PI * 20 * 0.72} ${2 * Math.PI * 20 * 0.28}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[9px] font-bold text-violet-300">72%</span>
          </div>
        </div>
        <div className="text-[9px] font-semibold text-zinc-200">Syncing…</div>
        <div className="text-[8px] text-zinc-500">Ken's iPhone</div>
        <div className="text-[8px] text-zinc-500">8 of 11 entries</div>
      </div>
    </WatchFrame>
  );
}

function WatchSyncDoneScreen() {
  return (
    <WatchFrame title="Sync done (watch)">
      <div className="flex flex-col items-center justify-center gap-2 text-center">
        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth={3}>
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="text-[9px] font-semibold text-zinc-200">All synced</div>
        <div className="text-[8px] text-zinc-500">11 entries · just now</div>
        <div className="w-8 h-px bg-zinc-800 my-0.5" />
        <div className="text-[8px] text-zinc-600">via Ken's iPhone</div>
      </div>
    </WatchFrame>
  );
}

function WatchIdle() {
  return (
    <WatchFrame title="Idle / no sync (watch)">
      <div className="flex flex-col items-center justify-center gap-2 text-center">
        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500">
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
          </svg>
        </div>
        <div className="text-[9px] text-zinc-400">No devices nearby</div>
        <div className="text-[8px] text-zinc-600">Join same Wi-Fi</div>
      </div>
    </WatchFrame>
  );
}

// ─── Network topology diagram ─────────────────────────────────────────────────

function TopologyDiagram() {
  return (
    <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
      <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4 text-center">
        Sync Topology — Same LAN
      </div>
      <div className="flex flex-col items-center gap-0">
        {/* Watch row */}
        <div className="flex justify-center">
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400">
              <DeviceIcon type="watch" size={18} />
            </div>
            <span className="text-[10px] text-zinc-500">Watch</span>
            <span className="text-[9px] text-zinc-700">BLE</span>
          </div>
        </div>
        {/* BLE line */}
        <div className="flex justify-center">
          <div className="w-px h-6 bg-zinc-700 border-dashed" style={{ borderLeft: '1px dashed #52525b' }} />
        </div>
        {/* Phone (hub) */}
        <div className="flex flex-col items-center gap-1">
          <div className="w-12 h-12 rounded-full bg-violet-500/20 border-2 border-violet-500/40 flex items-center justify-center text-violet-400">
            <DeviceIcon type="phone" size={22} />
          </div>
          <span className="text-[10px] text-violet-300 font-medium">Phone (gateway)</span>
        </div>
        {/* LAN lines */}
        <div className="flex items-start justify-center gap-12 mt-1">
          <div className="flex flex-col items-center gap-1">
            <div className="w-px h-8 bg-emerald-500/40" />
            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400">
              <DeviceIcon type="desktop" size={18} />
            </div>
            <span className="text-[10px] text-zinc-500">Laptop</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-px h-8 bg-emerald-500/40" />
            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400">
              <DeviceIcon type="tablet" size={18} />
            </div>
            <span className="text-[10px] text-zinc-500">Tablet</span>
          </div>
        </div>
        <div className="text-[9px] text-emerald-600 mt-2">mDNS / LAN (encrypted WebSocket)</div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function PeerSyncWireframes() {
  const [activeTab, setActiveTab] = useState<'desktop' | 'mobile' | 'watch' | 'topology'>('desktop');

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center text-violet-400">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
              <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
              <line x1="6" y1="1" x2="6" y2="4" />
              <line x1="10" y1="1" x2="10" y2="4" />
              <line x1="14" y1="1" x2="14" y2="4" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold">Local Peer Sync — UI Wireframes</h1>
            <p className="text-xs text-zinc-500">
              MoodBloom v0.7.0 · Peer discovery + secure pairing + encrypted sync
            </p>
          </div>
          <div className="ml-auto">
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Dev Preview
            </span>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mt-4 bg-zinc-900 p-1 rounded-xl w-fit border border-zinc-800">
          {(['desktop', 'mobile', 'watch', 'topology'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                activeTab === tab
                  ? 'bg-violet-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto">
        {/* DESKTOP TAB */}
        {activeTab === 'desktop' && (
          <div className="space-y-8">
            <SectionLabel>Desktop — Settings → Devices Tab</SectionLabel>

            {/* Full settings layout mockup */}
            <div
              className="rounded-2xl border border-zinc-800 overflow-hidden relative shadow-2xl"
              style={{ height: 520 }}
            >
              {/* Window chrome */}
              <div className="bg-zinc-800 px-4 py-2 flex items-center gap-2 border-b border-zinc-700">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/60" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
                </div>
                <div className="flex-1 text-center text-xs text-zinc-500">
                  MoodBloom — Settings
                </div>
              </div>
              <DesktopDevicesTab />
            </div>

            <SectionLabel>Desktop — Sidebar Sync Badge (states)</SectionLabel>
            <div className="flex gap-8 items-start px-4">
              <DesktopSyncBadge />
              <div className="flex-1 bg-zinc-900 rounded-xl p-4 border border-zinc-800 text-xs text-zinc-400 space-y-1.5">
                <div className="font-semibold text-zinc-300 mb-2">Badge behavior</div>
                <div>• <span className="text-zinc-300">Idle</span> — shows count of paired devices</div>
                <div>• <span className="text-violet-300">Syncing</span> — animated dots + device name</div>
                <div>• <span className="text-emerald-300">Done</span> — green dot + relative time</div>
                <div>• Click opens SyncDetailsModal (existing)</div>
                <div className="pt-2 text-zinc-600">Located in Sidebar footer, left of cloud icon</div>
              </div>
            </div>
          </div>
        )}

        {/* MOBILE TAB */}
        {activeTab === 'mobile' && (
          <div className="space-y-8">
            <SectionLabel>Mobile — Three Key Screens</SectionLabel>
            <div className="flex flex-wrap gap-8 justify-center">
              <MobileDevicesScreen />
              <MobileQRScanScreen />
              <MobilePairingConfirmScreen />
            </div>

            <SectionLabel>Mobile — UX Notes</SectionLabel>
            <div className="grid grid-cols-3 gap-4 text-xs">
              {[
                {
                  title: 'Devices screen',
                  notes: [
                    'Accessible via Settings → Devices',
                    'Toggle enables mDNS broadcast',
                    '"This Device" section always visible',
                    'Nearby list auto-refreshes via events',
                    'Paired list shows last sync time',
                  ],
                },
                {
                  title: 'QR Scanner',
                  notes: [
                    'Camera permission requested on first open',
                    'WKWebView camera API on iOS',
                    'Scanning overlay with corner brackets',
                    'PIN fallback for no-camera scenarios',
                    'Auto-proceeds on valid QR decode',
                  ],
                },
                {
                  title: 'Pair Confirm',
                  notes: [
                    'Shows device name + OS (from QR payload)',
                    'Shows Device ID (first 16 chars)',
                    'Amber warning for first pairing',
                    'Decline = back to scanner',
                    'Trust = stores to trusted_devices',
                  ],
                },
              ].map((col) => (
                <div key={col.title} className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                  <div className="font-semibold text-zinc-300 mb-3">{col.title}</div>
                  <ul className="space-y-1.5 text-zinc-400">
                    {col.notes.map((n) => (
                      <li key={n} className="flex gap-2">
                        <span className="text-violet-500 mt-0.5">·</span>
                        <span>{n}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* WATCH TAB */}
        {activeTab === 'watch' && (
          <div className="space-y-8">
            <SectionLabel>Watch — Four Screen States (round display)</SectionLabel>
            <div className="flex flex-wrap gap-10 justify-center">
              <WatchIdle />
              <WatchPairRequestScreen />
              <WatchSyncStatusScreen />
              <WatchSyncDoneScreen />
            </div>

            <SectionLabel>Watch — Architecture Notes</SectionLabel>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                <div className="font-semibold text-zinc-300 mb-3">Watch → Phone gateway model</div>
                <div className="space-y-2 text-zinc-400">
                  <p>The watch does NOT join the mDNS peer network directly. Instead:</p>
                  <ol className="space-y-1.5 list-decimal list-inside">
                    <li>Watch syncs to phone via existing BLE/local channel</li>
                    <li>Phone stores entries locally with watch <span className="font-mono text-zinc-300">deviceId</span></li>
                    <li>Phone participates in LAN peer sync as a normal peer</li>
                    <li>Desktop receives entries with watch origin preserved</li>
                  </ol>
                  <p className="pt-1 text-zinc-600">
                    This keeps watch battery use minimal and network complexity low.
                  </p>
                </div>
              </div>
              <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                <div className="font-semibold text-zinc-300 mb-3">Pairing the watch</div>
                <div className="space-y-2 text-zinc-400">
                  <p>
                    The watch companion pairs with the phone first (during watch app setup). Once the phone
                    is paired to the desktop, watch entries flow through automatically.
                  </p>
                  <p>
                    For direct watch-to-desktop pairing (optional future feature): PIN code method only
                    (no camera on watch). The phone displays the PIN; user enters it on the watch crown/screen.
                  </p>
                  <div className="pt-2 text-zinc-500">
                    <span className="text-zinc-300">Pair request screen</span> shows device name + PIN for
                    confirmation. Accept/reject via crown press or tap.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TOPOLOGY TAB */}
        {activeTab === 'topology' && (
          <div className="space-y-8">
            <SectionLabel>Network Topology</SectionLabel>
            <div className="flex gap-6 items-start">
              <div className="w-64">
                <TopologyDiagram />
              </div>
              <div className="flex-1 space-y-4 text-xs">
                <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                  <div className="font-semibold text-zinc-300 mb-3">4-Layer Architecture Summary</div>
                  <div className="space-y-3 text-zinc-400">
                    <div className="flex gap-3">
                      <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 text-[10px] flex items-center justify-center font-bold flex-shrink-0">1</span>
                      <div><span className="text-zinc-300">Identity</span> — Ed25519 key pair, device.json, stable deviceId from pubkey hash</div>
                    </div>
                    <div className="flex gap-3">
                      <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 text-[10px] flex items-center justify-center font-bold flex-shrink-0">2</span>
                      <div><span className="text-zinc-300">Discovery</span> — mDNS <code className="text-violet-300">_moodbloom._tcp.local</code>, UDP fallback, event-driven peer list</div>
                    </div>
                    <div className="flex gap-3">
                      <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 text-[10px] flex items-center justify-center font-bold flex-shrink-0">3</span>
                      <div><span className="text-zinc-300">Pairing</span> — QR code or PIN exchange, 5-min token, trusted_devices.json</div>
                    </div>
                    <div className="flex gap-3">
                      <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 text-[10px] flex items-center justify-center font-bold flex-shrink-0">4</span>
                      <div><span className="text-zinc-300">Sync</span> — TLS WebSocket, Ed25519 challenge-response, manifest+delta, LWW conflicts</div>
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                  <div className="font-semibold text-zinc-300 mb-3">Privacy guarantees</div>
                  <div className="space-y-1.5 text-zinc-400">
                    {[
                      ['LAN-only', 'mDNS is multicast-scoped; server binds to LAN interface'],
                      ['No servers', 'Zero relay, signaling, or cloud infrastructure'],
                      ['Encrypted transit', 'TLS + AES-256-GCM payloads (same ciphertext as local storage)'],
                      ['Explicit pairing', 'Discovery never auto-syncs; user must pair explicitly'],
                      ['Revocable', 'Any device removed from trusted list is immediately rejected'],
                    ].map(([prop, desc]) => (
                      <div key={prop} className="flex gap-2">
                        <span className="text-emerald-400 w-24 flex-shrink-0">{prop}</span>
                        <span>{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                  <div className="font-semibold text-zinc-300 mb-3">Implementation phases</div>
                  <div className="space-y-2 text-zinc-400">
                    {[
                      { v: 'v0.6.0', phase: 'Phase 1', label: 'Identity + Discovery', done: false },
                      { v: 'v0.6.1', phase: 'Phase 2', label: 'Pairing (QR + PIN)', done: false },
                      { v: 'v0.7.0', phase: 'Phase 3', label: 'Encrypted Sync Engine', done: false },
                      { v: 'v0.7.1', phase: 'Phase 4', label: 'Polish + Watch gateway', done: false },
                    ].map((p) => (
                      <div key={p.v} className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full border border-zinc-700 flex items-center justify-center">
                          {p.done && (
                            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth={3}>
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          )}
                        </div>
                        <span className="text-zinc-500 w-14">{p.v}</span>
                        <span className="text-zinc-300">{p.phase}</span>
                        <span className="text-zinc-500">— {p.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
