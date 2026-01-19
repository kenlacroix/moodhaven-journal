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

import { useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
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
      {/* Editor content */}
      <EditorContent
        editor={editor}
        className="flex-1 overflow-auto"
      />

      {/* Floating toolbar - appears on selection */}
      <FloatingToolbar
        editor={editor}
        onFormat={handleFormat}
        getFormatState={getFormatState}
        onOpenContextMenu={onOpenContextMenu}
      />

      {/* Placeholder styling */}
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
      `}</style>
    </div>
  );
}
