/**
 * SettingSelect - Dropdown select for settings
 */

interface SettingSelectOption {
  value: string;
  label: string;
}

interface SettingSelectProps {
  label: string;
  description?: string;
  value: string;
  options: SettingSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function SettingSelect({
  label,
  description,
  value,
  options,
  onChange,
  disabled = false,
}: SettingSelectProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex-1 pr-4">
        <p className={`font-medium ${disabled ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'}`}>
          {label}
        </p>
        {description && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {description}
          </p>
        )}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`
          px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600
          bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200
          focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
          transition-colors duration-200
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
