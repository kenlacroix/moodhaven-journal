import React from 'react';

interface Props {
  value: number | null;
  onChange: (n: number) => void;
  label?: string;
}

const SEGMENT_COLORS: Record<number, string> = {
  1: '#10b981', 2: '#10b981', 3: '#10b981',
  4: '#eab308', 5: '#eab308', 6: '#eab308',
  7: '#f97316', 8: '#f97316', 9: '#ef4444', 10: '#ef4444',
};

export function ActivationDial({ value, onChange, label = 'How wound up do you feel?' }: Props): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-neutral-700 text-center">{label}</p>
      <div className="flex gap-1.5 justify-center" role="group" aria-label={label}>
        {Array.from({ length: 10 }, (_, i) => {
          const n = i + 1;
          const color = SEGMENT_COLORS[n];
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              aria-label={`Activation level ${n}`}
              aria-pressed={selected}
              onClick={() => onChange(n)}
              style={{
                backgroundColor: selected ? color : 'transparent',
                borderColor: color,
                color: selected ? '#fff' : color,
              }}
              className="w-8 h-8 rounded-md border-2 text-xs font-bold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 hover:opacity-80"
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-neutral-400 px-1">
        <span>calm</span>
        <span>overwhelmed</span>
      </div>
    </div>
  );
}
