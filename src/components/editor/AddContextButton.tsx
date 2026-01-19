/**
 * AddContextButton - Subtle button to add context to entries
 *
 * Per spec:
 * - Bottom-right of editor surface
 * - Low contrast
 * - Hidden while typing
 * - Reappears after idle (2-3 seconds)
 * - Opens context menu when clicked
 */

import { useState, useEffect, useRef } from 'react';
import { ContextMenu } from './ContextMenu';

interface AddContextButtonProps {
  isTyping: boolean;
  onAction: (action: string) => void;
}

export function AddContextButton({ isTyping, onAction }: AddContextButtonProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Hide while typing, show after idle
  useEffect(() => {
    if (isTyping) {
      setIsVisible(false);
      setShowMenu(false);
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    } else {
      // Show after 2 seconds of idle
      idleTimerRef.current = setTimeout(() => {
        setIsVisible(true);
      }, 2000);
    }

    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [isTyping]);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const handleAction = (action: string) => {
    setShowMenu(false);
    onAction(action);
  };

  if (!isVisible) return null;

  return (
    <div className="absolute bottom-4 right-4">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setShowMenu(!showMenu)}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
          transition-all duration-200
          ${showMenu
            ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
            : 'text-slate-400 dark:text-slate-500 hover:text-slate-500 dark:hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }
        `}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        <span>Add context</span>
      </button>

      {showMenu && (
        <div ref={menuRef} className="absolute bottom-full right-0 mb-2">
          <ContextMenu
            onAction={handleAction}
            onClose={() => setShowMenu(false)}
          />
        </div>
      )}
    </div>
  );
}
