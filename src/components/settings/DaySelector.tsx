/**
 * DaySelector - Multi-select for days of the week
 */

import type { DayOfWeek } from '../../types/settings';

interface DaySelectorProps {
  selectedDays: DayOfWeek[];
  onChange: (days: DayOfWeek[]) => void;
  disabled?: boolean;
}

const DAYS: { value: DayOfWeek; label: string }[] = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

export function DaySelector({ selectedDays, onChange, disabled = false }: DaySelectorProps) {
  const toggleDay = (day: DayOfWeek) => {
    if (disabled) return;

    if (selectedDays.includes(day)) {
      onChange(selectedDays.filter((d) => d !== day));
    } else {
      onChange([...selectedDays, day].sort((a, b) => a - b));
    }
  };

  return (
    <div className="flex gap-2">
      {DAYS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => toggleDay(value)}
          disabled={disabled}
          aria-pressed={selectedDays.includes(value)}
          className={`
            px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200
            ${selectedDays.includes(value)
              ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/25'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
