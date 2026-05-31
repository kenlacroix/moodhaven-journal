import { useState, useEffect, useRef } from 'react';

export interface LinkDialogProps {
  initialUrl: string;
  onSubmit: (url: string) => void;
  onClose: () => void;
}

export function LinkDialog({ initialUrl, onSubmit, onClose }: LinkDialogProps) {
  const [url, setUrl] = useState(initialUrl || 'https://');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus and select URL on open
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    onSubmit(trimmed === 'https://' ? '' : trimmed);
  };

  const handleRemoveLink = () => {
    onSubmit('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              {initialUrl ? 'Edit Link' : 'Add Link'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-5 pb-5">
          <div className="mb-4">
            <label htmlFor="link-url" className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              URL
            </label>
            <input
              ref={inputRef}
              id="link-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="input"
            />
          </div>

          <div className="flex gap-2.5">
            {initialUrl && (
              <button
                type="button"
                onClick={handleRemoveLink}
                className="btn-secondary px-3 py-2 text-sm text-rose-600 dark:text-rose-400"
              >
                Remove
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary px-4 py-2 text-sm"
            >
              {initialUrl ? 'Update' : 'Add Link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
