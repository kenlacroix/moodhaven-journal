/**
 * SettingInput - Text input for settings like API keys
 */

import { useState } from 'react';

interface SettingInputProps {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'password' | 'url';
  disabled?: boolean;
  onTest?: () => Promise<{ valid: boolean; error?: string }>;
}

export function SettingInput({
  label,
  description,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
  onTest,
}: SettingInputProps) {
  const [showValue, setShowValue] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; error?: string } | null>(null);

  const inputType = type === 'password' && !showValue ? 'password' : 'text';

  const handleTest = async () => {
    if (!onTest) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTest();
      setTestResult(result);
    } catch {
      setTestResult({ valid: false, error: 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className={`font-medium ${disabled ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'}`}>
            {label}
          </p>
          {description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {description}
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={inputType}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setTestResult(null);
            }}
            placeholder={placeholder}
            disabled={disabled}
            className={`
              w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600
              bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200
              placeholder-slate-400 dark:placeholder-slate-500
              focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
              transition-colors duration-200
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              ${testResult?.valid === true ? 'border-emerald-500 dark:border-emerald-500' : ''}
              ${testResult?.valid === false ? 'border-rose-500 dark:border-rose-500' : ''}
            `}
          />
          {type === 'password' && value && (
            <button
              type="button"
              onClick={() => setShowValue(!showValue)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              {showValue ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          )}
        </div>

        {onTest && (
          <button
            type="button"
            onClick={handleTest}
            disabled={disabled || !value || testing}
            className={`
              px-4 py-2.5 rounded-xl font-medium transition-colors duration-200
              ${disabled || !value || testing
                ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-900/50'
              }
            `}
          >
            {testing ? 'Testing...' : 'Test'}
          </button>
        )}
      </div>

      {testResult && (
        <p className={`text-sm mt-2 ${testResult.valid ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {testResult.valid ? 'Connection successful!' : testResult.error || 'Invalid'}
        </p>
      )}
    </div>
  );
}
