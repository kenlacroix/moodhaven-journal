/**
 * RichTextEditor - Tiptap-based rich text editor
 *
 * Features:
 * - Bold, Italic, Strikethrough, Links, Lists
 * - Floating toolbar on text selection
 * - Auto-focus on open
 * - Large readable font, comfortable line height
 * - No toolbar visible by default
 */

import { useState, useEffect, useCallback } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { FloatingToolbar } from './FloatingToolbar';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string, text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  onOpenContextMenu?: () => void;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Start writing...',
  autoFocus = false,
  className = '',
  onOpenContextMenu,
}: RichTextEditorProps) {
  const [toolbarExpanded, setToolbarExpanded] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable heading levels we don't need
        heading: false,
        // Keep bullet and ordered lists
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-violet-500 underline cursor-pointer hover:text-violet-600',
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: value,
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        class: 'outline-none min-h-full text-lg leading-relaxed text-slate-700 dark:text-slate-200',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const text = editor.getText();
      onChange(html, text);
    },
  });

  // Sync external value changes
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  // Format handlers for toolbar
  const handleFormat = useCallback((command: string, value?: string) => {
    if (!editor) return;

    switch (command) {
      case 'bold':
        editor.chain().focus().toggleBold().run();
        break;
      case 'italic':
        editor.chain().focus().toggleItalic().run();
        break;
      case 'underline':
        editor.chain().focus().toggleUnderline().run();
        break;
      case 'strike':
        editor.chain().focus().toggleStrike().run();
        break;
      case 'link':
        if (value) {
          editor.chain().focus().setLink({ href: value }).run();
        } else {
          editor.chain().focus().unsetLink().run();
        }
        break;
      case 'bulletList':
        editor.chain().focus().toggleBulletList().run();
        break;
      case 'orderedList':
        editor.chain().focus().toggleOrderedList().run();
        break;
    }
  }, [editor]);

  // Get current formatting state
  const getFormatState = useCallback((): Record<string, boolean> => {
    if (!editor) {
      return {
        bold: false,
        italic: false,
        underline: false,
        strike: false,
        link: false,
        bulletList: false,
        orderedList: false,
      };
    }
    return {
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      strike: editor.isActive('strike'),
      link: editor.isActive('link'),
      bulletList: editor.isActive('bulletList'),
      orderedList: editor.isActive('orderedList'),
    };
  }, [editor]);

  // Show loading state while editor initializes
  if (!editor) {
    return (
      <div className={`relative flex-1 flex flex-col ${className}`}>
        <div className="flex-1 flex items-center justify-center text-slate-400">
          Loading editor...
        </div>
      </div>
    );
  }

  return (
    <div className={`relative flex-1 flex flex-col ${className}`}>
      {/* Collapsible formatting toolbar */}
      <CollapsibleToolbar
        editor={editor}
        onFormat={handleFormat}
        getFormatState={getFormatState}
        expanded={toolbarExpanded}
        onToggle={setToolbarExpanded}
      />

      {/* Editor content */}
      <EditorContent
        editor={editor}
        className="flex-1 overflow-auto"
      />

      {/* Floating toolbar - appears on selection, hidden when collapsible toolbar is open */}
      <FloatingToolbar
        editor={editor}
        onFormat={handleFormat}
        getFormatState={getFormatState}
        onOpenContextMenu={onOpenContextMenu}
        disabled={toolbarExpanded}
      />

      {/* Editor styling — restore list styles stripped by Tailwind preflight */}
      <style>{`
        .is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: rgb(148 163 184);
          pointer-events: none;
          height: 0;
        }
        .ProseMirror {
          min-height: 100%;
        }
        .ProseMirror:focus {
          outline: none;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: rgb(148 163 184);
          pointer-events: none;
          height: 0;
        }
        .ProseMirror ul {
          list-style-type: disc;
          padding-left: 1.5em;
          margin: 0.5em 0;
        }
        .ProseMirror ol {
          list-style-type: decimal;
          padding-left: 1.5em;
          margin: 0.5em 0;
        }
        .ProseMirror li {
          margin: 0.25em 0;
        }
        .ProseMirror li p {
          margin: 0;
        }
      `}</style>
    </div>
  );
}

// ============================================
// Collapsible Toolbar
// ============================================

interface CollapsibleToolbarProps {
  editor: Editor;
  onFormat: (command: string, value?: string) => void;
  getFormatState: () => Record<string, boolean>;
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
}

function CollapsibleToolbar({ editor, onFormat, getFormatState, expanded, onToggle }: CollapsibleToolbarProps) {
  const [formatState, setFormatState] = useState<Record<string, boolean>>({});

  // Track format state on selection/transaction changes
  useEffect(() => {
    const update = () => setFormatState(getFormatState());
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
    };
  }, [editor, getFormatState]);

  const handleLinkClick = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Enter URL:', previousUrl || 'https://');
    if (url === null) return;
    if (url === '') {
      onFormat('link');
    } else {
      onFormat('link', url);
    }
  };

  return (
    <div className="flex-shrink-0 border-b border-slate-100 dark:border-slate-800">
      {/* Toggle bar */}
      <button
        type="button"
        onClick={() => onToggle(!expanded)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        <span>Formatting</span>
      </button>

      {/* Expandable button row */}
      <div
        className={`overflow-hidden transition-all duration-200 ${expanded ? 'max-h-12 opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="flex items-center gap-0.5 px-2 pb-2">
          {/* Text formatting */}
          <ToolbarBtn
            icon={<TBBoldIcon />}
            label="Bold (Ctrl+B)"
            isActive={formatState.bold}
            onClick={() => onFormat('bold')}
          />
          <ToolbarBtn
            icon={<TBItalicIcon />}
            label="Italic (Ctrl+I)"
            isActive={formatState.italic}
            onClick={() => onFormat('italic')}
          />
          <ToolbarBtn
            icon={<TBUnderlineIcon />}
            label="Underline (Ctrl+U)"
            isActive={formatState.underline}
            onClick={() => onFormat('underline')}
          />
          <ToolbarBtn
            icon={<TBStrikeIcon />}
            label="Strikethrough"
            isActive={formatState.strike}
            onClick={() => onFormat('strike')}
          />

          <TBDivider />

          {/* Lists */}
          <ToolbarBtn
            icon={<TBBulletListIcon />}
            label="Bullet list"
            isActive={formatState.bulletList}
            onClick={() => onFormat('bulletList')}
          />
          <ToolbarBtn
            icon={<TBOrderedListIcon />}
            label="Numbered list"
            isActive={formatState.orderedList}
            onClick={() => onFormat('orderedList')}
          />

          <TBDivider />

          {/* Insert */}
          <ToolbarBtn
            icon={<TBLinkIcon />}
            label="Link (Ctrl+K)"
            isActive={formatState.link}
            onClick={handleLinkClick}
          />
        </div>
      </div>
    </div>
  );
}

function ToolbarBtn({
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
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`
        p-1.5 rounded transition-colors
        ${isActive
          ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
          : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300'
        }
      `}
      title={label}
    >
      {icon}
    </button>
  );
}

function TBDivider() {
  return <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />;
}

// Toolbar icons (prefixed TB to avoid collision with FloatingToolbar icons)
function TBBoldIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" />
    </svg>
  );
}

function TBItalicIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 4h4m-2 0l-4 16m0 0h4" />
    </svg>
  );
}

function TBUnderlineIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v7a5 5 0 0010 0V4M5 21h14" />
    </svg>
  );
}

function TBStrikeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 12H7m10-4a4 4 0 00-4-4H9a4 4 0 000 8m2 8a4 4 0 004-4" />
    </svg>
  );
}

function TBBulletListIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h9m-9 5.25h9m-9 5.25h9M4.5 6.75h.007v.008H4.5V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM4.5 12h.007v.008H4.5V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H4.5v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

function TBOrderedListIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h9m-9 5.25h9m-9 5.25h9" />
      <text x="3" y="8.5" fontSize="6" fill="currentColor" fontFamily="sans-serif">1</text>
      <text x="3" y="14" fontSize="6" fill="currentColor" fontFamily="sans-serif">2</text>
      <text x="3" y="19.5" fontSize="6" fill="currentColor" fontFamily="sans-serif">3</text>
    </svg>
  );
}

function TBLinkIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}
