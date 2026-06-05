import { useEffect, useRef, useState } from 'react';
import { sealEntry } from '../../lib/services/timeCapsuleService';

type CapsuleType = 'letter' | 'vault';

const CAPSULE_OPTIONS: { type: CapsuleType; label: string; description: string }[] = [
  { type: 'letter', label: 'Letter', description: 'A personal message to your future self.' },
  { type: 'vault', label: 'Vault', description: 'Locked away — revealed on the date you choose.' },
];

interface Props {
  entryId: string;
  defaultDays: number;
  onSeal: () => void;
  onCancel: () => void;
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function minDate(): string {
  return addDays(2);
}

export function SealEntryModal({ entryId, defaultDays, onSeal, onCancel }: Props) {
  const [capsuleType, setCapsuleType] = useState<CapsuleType>('letter');
  const [unlockDate, setUnlockDate] = useState(addDays(defaultDays));
  const [isSealing, setIsSealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const handleSeal = async () => {
    if (!unlockDate) return;
    setIsSealing(true);
    setError(null);
    try {
      await sealEntry(entryId, new Date(`${unlockDate}T00:00:00`).toISOString(), capsuleType);
      onSeal();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsSealing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Seal entry as time capsule"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.currentTarget === e.target) onCancel(); }}
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Seal as time capsule</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            This entry will be hidden until the date you choose.
          </p>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Type selector */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Capsule type</p>
            <div className="grid grid-cols-2 gap-2">
              {CAPSULE_OPTIONS.map(({ type, label, description }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setCapsuleType(type)}
                  className={`text-left px-3 py-3 rounded-xl border-2 transition-colors ${
                    capsuleType === type
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <p className={`text-sm font-medium ${capsuleType === type ? 'text-violet-700 dark:text-violet-300' : 'text-slate-700 dark:text-slate-200'}`}>
                    {label}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Date picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400" htmlFor="capsule-date">
              Reveal date
            </label>
            <input
              id="capsule-date"
              type="date"
              value={unlockDate}
              min={minDate()}
              onChange={(e) => setUnlockDate(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {error && <p role="alert" className="text-sm text-rose-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-0 flex items-center justify-end gap-3">
          <button
            ref={firstFocusRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSeal()}
            disabled={isSealing || !unlockDate}
            className="px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50"
          >
            {isSealing ? 'Sealing…' : 'Seal entry'}
          </button>
        </div>
      </div>
    </div>
  );
}
