/**
 * SettingToggle - Toggle switch for boolean settings
 */

interface SettingToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function SettingToggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: SettingToggleProps) {
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
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`
          relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
          transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2
          focus-visible:ring-violet-500 focus-visible:ring-offset-2
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${checked ? 'bg-violet-500' : 'bg-slate-300 dark:bg-slate-600'}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg
            ring-0 transition duration-200 ease-in-out
            ${checked ? 'translate-x-5' : 'translate-x-0'}
          `}
        />
      </button>
    </div>
  );
}
