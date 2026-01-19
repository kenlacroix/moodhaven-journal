/**
 * SidebarItem - Individual navigation item for the sidebar
 *
 * Per UX spec:
 * - Icons + short labels only
 * - Muted color palette
 * - No badges, counters, charts, notifications
 */

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

export function SidebarItem({ icon, label, isActive, onClick }: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
        text-sm font-medium transition-colors
        focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500
        ${
          isActive
            ? 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50'
        }
      `}
      aria-current={isActive ? 'page' : undefined}
    >
      <span className="w-5 h-5 flex-shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
