/**
 * FocusMenu — single icon button that opens a portal dropdown with:
 *   ◈ Focus mode  Ctrl+Shift+F   [✓ active]
 *   ⛶ Fullscreen
 *   ─────────────────────────────
 *   ↗ Breakout writer
 *
 * Dropdown is portalled to document.body with fixed positioning so it escapes
 * the TopBar's backdrop-blur stacking context and MainLayout's overflow-hidden
 * ancestor.
 *
 * Only rendered when currentView === 'writing' (enforced by TopBar).
 */

import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSettingsStore } from '../../stores/settingsStore';
import { toggleFullscreen } from '../../lib/windowUtils';

interface FocusMenuProps {
  onOpenBreakout: () => void;
}

export function FocusMenu({ onOpenBreakout }: FocusMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const distractionFree = useSettingsStore((s) => s.distractionFree);
  const setDistractionFree = useSettingsStore((s) => s.setDistractionFree);

  const openMenu = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen(true);
  };

  const toggleMenu = () => (open ? setOpen(false) : openMenu());

  // Close on click outside (checks both the trigger and the portal dropdown)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const handleFocus = () => {
    setDistractionFree(!distractionFree);
    setOpen(false);
  };

  const handleFullscreen = () => {
    setOpen(false);
    setTimeout(() => toggleFullscreen().catch(() => {}), 50);
  };

  const handleBreakout = () => {
    setOpen(false);
    setTimeout(() => onOpenBreakout(), 50);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleMenu}
        title="Focus & window options"
        className={`p-2 rounded-lg transition-all duration-200 ${
          distractionFree
            ? 'text-violet-500 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20'
            : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        {distractionFree ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
        )}
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999 }}
          className="w-52 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 py-1"
        >
          {/* Focus mode */}
          <button
            type="button"
            onClick={handleFocus}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
          >
            <span className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
              Focus mode
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-1 py-0.5 rounded font-mono">⌃⇧F</kbd>
              {distractionFree && (
                <svg className="w-3.5 h-3.5 text-violet-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </span>
          </button>

          {/* Fullscreen */}
          <button
            type="button"
            onClick={handleFullscreen}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8V5a2 2 0 012-2h3M3 16v3a2 2 0 002 2h3m10-18h3a2 2 0 012 2v3m0 10v3a2 2 0 01-2 2h-3" />
            </svg>
            Fullscreen
          </button>

          {/* Divider */}
          <div className="my-1 border-t border-slate-100 dark:border-slate-700" />

          {/* Breakout writer */}
          <button
            type="button"
            onClick={handleBreakout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            Breakout writer
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
