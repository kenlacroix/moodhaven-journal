/**
 * SlashCommandMenu - Popup command palette for the "/" slash command
 *
 * Renders a filterable list of block-level commands. Supports keyboard
 * navigation (ArrowUp, ArrowDown, Enter) and click selection.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SlashCommandItem } from './slashCommands';

interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  onSelect: (item: SlashCommandItem) => void;
  rect: DOMRect | null;
}

export function SlashCommandMenu({ items, onSelect, rect }: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  // Scroll selected item into view
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const selected = menu.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Handle keyboard events dispatched from the extension
  const handleKeyDown = useCallback(
    (e: Event) => {
      const key = (e as CustomEvent).detail?.key;
      if (!key) return;

      if (key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % items.length);
      } else if (key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
      } else if (key === 'Enter') {
        if (items[selectedIndex]) {
          onSelect(items[selectedIndex]);
        }
      }
    },
    [items, selectedIndex, onSelect]
  );

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    menu.addEventListener('slash-keydown', handleKeyDown);
    return () => menu.removeEventListener('slash-keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (items.length === 0) {
    return (
      <div
        className="slash-command-menu"
        ref={menuRef}
        style={getMenuStyle(rect)}
      >
        <div className="px-3 py-2 text-sm text-slate-400 dark:text-slate-500">
          No matching commands
        </div>
      </div>
    );
  }

  return (
    <div
      className="slash-command-menu"
      ref={menuRef}
      style={getMenuStyle(rect)}
    >
      {items.map((item, index) => (
        <button
          key={item.title}
          type="button"
          className={`
            w-full flex items-center gap-3 px-3 py-2 text-left transition-colors
            ${index === selectedIndex
              ? 'bg-violet-50 dark:bg-violet-900/20'
              : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }
          `}
          onMouseEnter={() => setSelectedIndex(index)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(item)}
        >
          <span className={`
            flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold
            ${index === selectedIndex
              ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }
          `}>
            {item.icon}
          </span>
          <span className="flex-1 min-w-0">
            <span className={`
              block text-sm font-medium
              ${index === selectedIndex
                ? 'text-violet-700 dark:text-violet-300'
                : 'text-slate-700 dark:text-slate-200'
              }
            `}>
              {item.title}
            </span>
            <span className="block text-xs text-slate-400 dark:text-slate-500 truncate">
              {item.description}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function getMenuStyle(rect: DOMRect | null): React.CSSProperties {
  if (!rect) {
    return { position: 'fixed', top: 0, left: 0, visibility: 'hidden' };
  }

  // Position below the cursor
  const top = rect.bottom + 8;
  const left = rect.left;

  // Ensure menu doesn't go off-screen
  const maxLeft = window.innerWidth - 280;
  const adjustedLeft = Math.max(8, Math.min(left, maxLeft));

  // If near bottom of screen, show above instead
  const showAbove = top + 320 > window.innerHeight;
  const adjustedTop = showAbove ? rect.top - 8 : top;

  return {
    position: 'fixed',
    top: adjustedTop,
    left: adjustedLeft,
    ...(showAbove ? { transform: 'translateY(-100%)' } : {}),
    zIndex: 50,
    width: 260,
    maxHeight: 320,
    overflowY: 'auto',
    background: 'var(--slash-menu-bg, white)',
    border: '1px solid var(--slash-menu-border, rgb(226 232 240))',
    borderRadius: '0.75rem',
    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
    padding: '0.25rem 0',
  };
}
