/**
 * FloatingToolbar - Contextual formatting toolbar
 *
 * Per spec:
 * - Appears ONLY when text is selected
 * - Disappears immediately when selection ends
 * - Positioned above selection
 * - Icons only (no labels)
 * - Contains: Bold | Italic | Strikethrough | Link | Emoji | More (...)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { ContextMenu } from './ContextMenu';

interface FloatingToolbarProps {
  editor: Editor;
  onFormat: (command: string, value?: string) => void;
  getFormatState: () => Record<string, boolean>;
  onOpenContextMenu?: () => void;
  disabled?: boolean;
  onLinkClick?: () => void;
  onEmojiClick?: () => void;
}

interface FormatState {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  link?: boolean;
}

interface Position {
  top: number;
  left: number;
}

export function FloatingToolbar({
  editor,
  onFormat,
  getFormatState,
  onOpenContextMenu,
  disabled = false,
  onLinkClick,
  onEmojiClick,
}: FloatingToolbarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<Position>({ top: 0, left: 0 });
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [formatState, setFormatState] = useState<FormatState>({});
  const toolbarRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Update visibility and position based on selection
  const updateToolbar = useCallback(() => {
    // Hide when collapsible toolbar is expanded
    if (disabled) {
      setIsVisible(false);
      setShowMoreMenu(false);
      return;
    }

    const { selection } = editor.state;
    const { from, to } = selection;

    // Hide if no selection or collapsed
    if (from === to) {
      setIsVisible(false);
      setShowMoreMenu(false);
      return;
    }

    // Get selection coordinates
    const { view } = editor;
    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(to);

    // Position above the selection, centered
    const toolbarWidth = toolbarRef.current?.offsetWidth || 280;
    const left = Math.max(
      16,
      Math.min(
        (start.left + end.left) / 2 - toolbarWidth / 2,
        window.innerWidth - toolbarWidth - 16
      )
    );

    setPosition({
      top: start.top - 48,
      left,
    });
    setIsVisible(true);
    setFormatState(getFormatState());
  }, [editor, getFormatState, disabled]);

  // Listen to selection changes
  useEffect(() => {
    editor.on('selectionUpdate', updateToolbar);
    editor.on('transaction', updateToolbar);

    return () => {
      editor.off('selectionUpdate', updateToolbar);
      editor.off('transaction', updateToolbar);
    };
  }, [editor, updateToolbar]);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        moreButtonRef.current &&
        !moreButtonRef.current.contains(e.target as Node)
      ) {
        setShowMoreMenu(false);
      }
    };

    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMoreMenu]);

  const handleLinkClick = () => {
    if (onLinkClick) {
      onLinkClick();
    }
  };

  const handleEmojiClick = () => {
    if (onEmojiClick) {
      onEmojiClick();
    }
  };

  const handleMoreMenuAction = (action: string) => {
    setShowMoreMenu(false);
    if (action === 'link') {
      handleLinkClick();
    } else if (onOpenContextMenu) {
      onOpenContextMenu();
    }
  };

  if (!isVisible) return null;

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 flex items-center gap-0.5 px-1.5 py-1 bg-slate-800 dark:bg-slate-700 rounded-lg shadow-lg"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      <ToolbarButton
        icon={<BoldIcon />}
        label="Bold (Ctrl+B)"
        isActive={formatState.bold}
        onClick={() => onFormat('bold')}
      />
      <ToolbarButton
        icon={<ItalicIcon />}
        label="Italic (Ctrl+I)"
        isActive={formatState.italic}
        onClick={() => onFormat('italic')}
      />
      <ToolbarButton
        icon={<StrikeIcon />}
        label="Strikethrough"
        isActive={formatState.strike}
        onClick={() => onFormat('strike')}
      />

      <Divider />

      <ToolbarButton
        icon={<LinkIcon />}
        label="Link (Ctrl+K)"
        isActive={formatState.link}
        onClick={handleLinkClick}
      />
      <ToolbarButton
        icon={<EmojiIcon />}
        label="Emoji"
        onClick={handleEmojiClick}
      />

      <Divider />

      {/* More (...) button */}
      <div className="relative">
        <button
          ref={moreButtonRef}
          type="button"
          onClick={() => setShowMoreMenu(!showMoreMenu)}
          className={`
            p-1.5 rounded transition-colors
            ${showMoreMenu
              ? 'bg-slate-600 dark:bg-slate-500 text-white'
              : 'text-slate-300 hover:bg-slate-700 dark:hover:bg-slate-600 hover:text-white'
            }
          `}
          title="More options"
        >
          <MoreIcon />
        </button>

        {showMoreMenu && (
          <div ref={menuRef}>
            <ContextMenu
              position={{ top: 40, left: -100 }}
              onAction={handleMoreMenuAction}
              onClose={() => setShowMoreMenu(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  isActive,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={`
        p-1.5 rounded transition-colors
        ${isActive
          ? 'bg-violet-500 text-white'
          : 'text-slate-300 hover:bg-slate-700 dark:hover:bg-slate-600 hover:text-white'
        }
      `}
      title={label}
    >
      {icon}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-slate-600 mx-1" />;
}

// Icons
function BoldIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" />
    </svg>
  );
}

function ItalicIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 4h4m-2 0l-4 16m0 0h4" />
    </svg>
  );
}

function StrikeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 12H7m10-4a4 4 0 00-4-4H9a4 4 0 000 8m2 8a4 4 0 004-4" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

function EmojiIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}
