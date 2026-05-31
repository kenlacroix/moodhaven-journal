import { useEffect, useRef } from 'react';
import type { TrustedDevice } from '../../types/peerSync';

export function PINDisplay({ pin }: { pin: string }) {
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

export function PINInput({
  value,
  onChange,
  disabled,
  hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  hasError?: boolean;
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
          className={`w-10 h-14 text-center text-2xl font-bold font-mono rounded-xl border-2 bg-white dark:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-40 disabled:cursor-not-allowed ${
            hasError
              ? 'border-red-400 dark:border-red-500'
              : value[i]
              ? 'border-violet-400 dark:border-violet-500 text-violet-700 dark:text-violet-300'
              : 'border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100'
          } ${i === 2 ? 'mr-2' : ''}`}
          aria-label={`PIN digit ${i + 1}`}
          aria-invalid={hasError}
        />
      ))}
    </div>
  );
}

export function SuccessScreen({ device, onClose }: { device: TrustedDevice; onClose: () => void }) {
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

export function LockedBanner({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
        <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-semibold text-red-600 dark:text-red-400">Session locked</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Too many incorrect attempts. Generate a new code to try again.
        </p>
      </div>
      <button
        onClick={onRefresh}
        className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors"
      >
        Generate New Code
      </button>
    </div>
  );
}
