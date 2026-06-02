export type EnvironmentId = 'underwater' | 'forest' | 'sky';

const OPTIONS: { id: EnvironmentId; label: string; icon: string; bg: string; active: string }[] = [
  { id: 'underwater', label: 'Underwater', icon: '🌊', bg: 'bg-[#0a3a5a]/10', active: 'border-[#1a6478] text-[#1a6478] dark:border-[#4BA3BF] dark:text-[#4BA3BF]' },
  { id: 'forest',     label: 'Forest',     icon: '🌲', bg: 'bg-[#1A3A1D]/10', active: 'border-[#2D6B35] text-[#2D6B35] dark:border-[#5A9E65] dark:text-[#5A9E65]' },
  { id: 'sky',        label: 'Sky',        icon: '✦',  bg: 'bg-violet-50/60 dark:bg-violet-950/20', active: 'border-violet-500 text-violet-600 dark:border-violet-400 dark:text-violet-400' },
];

interface Props {
  value: EnvironmentId;
  onChange: (v: EnvironmentId) => void;
}

export function EnvironmentPicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-col items-center gap-2 w-full max-w-xs" data-testid="environment-picker">
      <p className="text-xs text-neutral-400 text-center">Environment</p>
      <div className="flex gap-2 w-full justify-center">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`
              flex flex-col items-center gap-1 flex-1 py-2.5 px-2 rounded-xl border text-xs font-medium transition-colors
              ${value === opt.id
                ? `${opt.bg} ${opt.active} border-current`
                : 'border-neutral-200 dark:border-neutral-700 text-neutral-400 dark:text-neutral-500 hover:border-neutral-300 dark:hover:border-neutral-600'}
            `}
            aria-pressed={value === opt.id}
          >
            <span className="text-lg leading-none">{opt.icon}</span>
            <span>{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
