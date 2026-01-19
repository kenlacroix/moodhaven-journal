/**
 * ContextButton - Subtle entry point for metadata
 *
 * Per UX spec:
 * - Single subtle icon
 * - This is the ONLY visible entry point for metadata
 */

interface ContextButtonProps {
  onClick: () => void;
  className?: string;
}

export function ContextButton({ onClick, className = '' }: ContextButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        p-2.5 rounded-full
        text-slate-300 dark:text-slate-600
        hover:text-slate-500 dark:hover:text-slate-400
        hover:bg-slate-100 dark:hover:bg-slate-800
        transition-colors
        ${className}
      `}
      aria-label="Add context"
      title="Add context (mood, photos, location)"
    >
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </button>
  );
}
