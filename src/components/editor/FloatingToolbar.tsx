/**
 * FloatingToolbar - Contextual formatting toolbar
 *
 * Per spec:
 * - Appears ONLY when text is selected
 * - Disappears immediately when selection ends
 * - Positioned above selection
 * - Icons only (no labels)
 * - Inline: Bold | Italic | Strike | | Link | Emoji
 * - Block:  H2 | H3 | | Bullet | Ordered | Blockquote | Task
 * - Both rows separated by a thin divider
 *
 * Bug fix: ToolbarButton now uses onMouseDown+preventDefault to prevent selection
 * loss before the command executes — critical for block-level formatting.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Editor } from '@tiptap/react';

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
  heading2?: boolean;
  heading3?: boolean;
  bulletList?: boolean;
  orderedList?: boolean;
  blockquote?: boolean;
  taskList?: boolean;
}

interface Position {
  top: number;
  left: number;
}

export function FloatingToolbar({
  editor,
  onFormat,
  getFormatState,
  onOpenContextMenu: _onOpenContextMenu,
  disabled = false,
  onLinkClick,
  onEmojiClick,
}: FloatingToolbarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<Position>({ top: 0, left: 0 });
  const [formatState, setFormatState] = useState<FormatState>({});
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Update visibility and position based on selection
  const updateToolbar = useCallback(() => {
    if (disabled) {
      setIsVisible(false);
      return;
    }

    const { selection } = editor.state;
    const { from, to } = selection;

    if (from === to) {
      setIsVisible(false);
      return;
    }

    const { view } = editor;
    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(to);

    // Position above the selection, centered
    const toolbarWidth = toolbarRef.current?.offsetWidth || 360;
    const left = Math.max(
      16,
      Math.min(
        (start.left + end.left) / 2 - toolbarWidth / 2,
        window.innerWidth - toolbarWidth - 16
      )
    );

    setPosition({ top: start.top - 52, left });
    setIsVisible(true);
    setFormatState(getFormatState());
  }, [editor, getFormatState, disabled]);

  useEffect(() => {
    editor.on('selectionUpdate', updateToolbar);
    editor.on('transaction', updateToolbar);
    return () => {
      editor.off('selectionUpdate', updateToolbar);
      editor.off('transaction', updateToolbar);
    };
  }, [editor, updateToolbar]);

  if (!isVisible) return null;

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 bg-slate-800/95 dark:bg-slate-700/95 backdrop-blur-md rounded-lg shadow-xl animate-float-in border border-slate-700/50 dark:border-slate-600/50"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
    >
      {/* Row 1: Inline formatting */}
      <div className="flex items-center gap-0.5 px-1.5 py-1">
        <ToolbarButton icon={<BoldIcon />} label="Bold (Ctrl+B)" isActive={formatState.bold} onClick={() => onFormat('bold')} />
        <ToolbarButton icon={<ItalicIcon />} label="Italic (Ctrl+I)" isActive={formatState.italic} onClick={() => onFormat('italic')} />
        <ToolbarButton icon={<StrikeIcon />} label="Strikethrough" isActive={formatState.strike} onClick={() => onFormat('strike')} />

        <Divider />

        <ToolbarButton icon={<H2Icon />} label="Heading 2" isActive={formatState.heading2} onClick={() => onFormat('heading2')} />
        <ToolbarButton icon={<H3Icon />} label="Heading 3" isActive={formatState.heading3} onClick={() => onFormat('heading3')} />

        <Divider />

        <ToolbarButton icon={<BulletIcon />} label="Bullet list" isActive={formatState.bulletList} onClick={() => onFormat('bulletList')} />
        <ToolbarButton icon={<OrderedIcon />} label="Numbered list" isActive={formatState.orderedList} onClick={() => onFormat('orderedList')} />
        <ToolbarButton icon={<BlockquoteIcon />} label="Blockquote" isActive={formatState.blockquote} onClick={() => onFormat('blockquote')} />
        <ToolbarButton icon={<TaskIcon />} label="Task list" isActive={formatState.taskList} onClick={() => onFormat('taskList')} />

        <Divider />

        <ToolbarButton
          icon={<LinkIcon />}
          label="Link (Ctrl+K)"
          isActive={formatState.link}
          onClick={() => onLinkClick?.()}
        />
        <ToolbarButton icon={<EmojiIcon />} label="Emoji" onClick={() => onEmojiClick?.()} />
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
      // Prevent editor from losing focus/selection before the command fires
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={`
        p-1.5 rounded transition-all duration-150 active:scale-90
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
  return <div className="w-px h-4 bg-slate-600/60 mx-0.5 flex-shrink-0" />;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function BoldIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" />
    </svg>
  );
}

function ItalicIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 4h4m-2 0l-4 16m0 0h4" />
    </svg>
  );
}

function StrikeIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 12H7m10-4a4 4 0 00-4-4H9a4 4 0 000 8m2 8a4 4 0 004-4" />
    </svg>
  );
}

function H2Icon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6v12M4 12h7M11 6v12" />
      <text x="15" y="19" fontSize="9" fill="currentColor" stroke="none" fontWeight="bold" fontFamily="sans-serif">2</text>
    </svg>
  );
}

function H3Icon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6v12M4 12h7M11 6v12" />
      <text x="15" y="19" fontSize="9" fill="currentColor" stroke="none" fontWeight="bold" fontFamily="sans-serif">3</text>
    </svg>
  );
}

function BulletIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h9m-9 5.25h9m-9 5.25h9M4.5 6.75h.007v.008H4.5V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM4.5 12h.007v.008H4.5V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H4.5v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

function OrderedIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h9m-9 5.25h9m-9 5.25h9" />
      <text x="3" y="8.5" fontSize="5.5" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text>
      <text x="3" y="14" fontSize="5.5" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text>
      <text x="3" y="19.5" fontSize="5.5" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text>
    </svg>
  );
}

function BlockquoteIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M6 17h3l2-4V7H5v6h3l-2 4zm8 0h3l2-4V7h-6v6h3l-2 4z" />
    </svg>
  );
}

function TaskIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="5" width="4" height="4" rx="0.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.25 7l.75.75L6.5 6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 7h10" />
      <rect x="3" y="14" width="4" height="4" rx="0.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 16h10" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

function EmojiIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
