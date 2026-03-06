/**
 * UpdateBanner — compact "update available" chip shown at the bottom of
 * the Sidebar. Navigates to Settings → About when clicked.
 * Renders nothing when no update is available.
 */

import type { UseUpdateCheckReturn } from '../../hooks/useUpdateCheck';

interface UpdateBannerProps {
  hook: UseUpdateCheckReturn;
  collapsed: boolean;
  onOpenSettings: () => void;
}

export function UpdateBanner({ hook, collapsed, onOpenSettings }: UpdateBannerProps) {
  const { updateInfo } = hook;
  if (!updateInfo?.is_available) return null;

  return (
    <button
      type="button"
      onClick={onOpenSettings}
      title={`${updateInfo.version} available — click to update`}
      className={`w-full flex items-center gap-2 px-2 py-2 rounded-xl
        bg-violet-50 dark:bg-violet-900/20
        border border-violet-200 dark:border-violet-800
        text-violet-600 dark:text-violet-400
        hover:bg-violet-100 dark:hover:bg-violet-900/40
        transition-colors group`}
    >
      {/* Up-arrow icon */}
      <svg
        className="w-4 h-4 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
      </svg>

      {!collapsed && (
        <span className="text-xs font-medium truncate">
          {updateInfo.version} available
        </span>
      )}
    </button>
  );
}
