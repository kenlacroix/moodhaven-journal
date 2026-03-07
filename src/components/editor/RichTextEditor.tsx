/**
 * RichTextEditor - Tiptap-based rich text editor
 *
 * Features:
 * - Bold, Italic, Strikethrough, Links, Lists
 * - Headings (H2, H3), Blockquotes, Code Blocks, Horizontal Rules
 * - Task lists with interactive checkboxes
 * - Slash commands (`/` to open command palette)
 * - Floating toolbar on text selection
 * - Auto-focus on open
 * - Large readable font, comfortable line height
 * - No toolbar visible by default
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Extension } from '@tiptap/core';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { FloatingToolbar } from './FloatingToolbar';
import { EmojiPicker } from './EmojiPicker';
import { SlashCommands } from './slashCommands';
import { useSpeechToText, type STTState } from '../../hooks/useSpeechToText';
import { useSettingsStore } from '../../stores/settingsStore';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string, text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  onOpenContextMenu?: () => void;
  onNavigateToSTTSettings?: () => void;
  /** When set, inserts this text at the current cursor position */
  insertText?: string | null;
  /** Called after insertText has been consumed so the parent can clear it */
  onInsertTextConsumed?: () => void;
  /** When true, keeps the cursor at ~38% from top of the scroll container (typewriter mode) */
  distractionFree?: boolean;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Start writing — there are no rules here.',
  autoFocus = false,
  className = '',
  onOpenContextMenu,
  onNavigateToSTTSettings,
  insertText,
  onInsertTextConsumed,
  distractionFree = false,
}: RichTextEditorProps) {
  const distractionFreeRef = useRef(distractionFree);
  useEffect(() => { distractionFreeRef.current = distractionFree; }, [distractionFree]);
  const [toolbarExpanded, setToolbarExpanded] = useState(true);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDialogInitialUrl, setLinkDialogInitialUrl] = useState('');
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  // Speech-to-text
  const sttSettings = useSettingsStore((s) => s.settings.speechToText);
  const { state: sttState, error: sttError, startRecording, stopAndTranscribe, cancel: cancelSTT } = useSpeechToText();

  // Ref so the Tiptap extension can call the latest opener without stale closures
  const openLinkDialogRef = useRef<() => void>(() => {});

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
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
      TaskList,
      TaskItem.configure({ nested: true }),
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
      // Ctrl+K to open link dialog
      Extension.create({
        name: 'linkShortcut',
        addKeyboardShortcuts() {
          return {
            'Mod-k': () => {
              openLinkDialogRef.current();
              return true;
            },
          };
        },
      }),
      SlashCommands,
    ],
    content: value,
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        class: 'outline-none min-h-full text-lg leading-[1.8] text-slate-700 dark:text-slate-200',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const text = editor.getText();
      onChange(html, text);

      // Typewriter scroll — keep cursor at ~38% from top in distraction-free mode
      if (distractionFreeRef.current) {
        const { from } = editor.state.selection;
        const coords = editor.view.coordsAtPos(from);
        const container = editor.view.dom.closest('.editor-scroll-container') as HTMLElement | null;
        if (container) {
          const targetTop = container.clientHeight * 0.38;
          const currentTop = coords.top - container.getBoundingClientRect().top;
          if (Math.abs(currentTop - targetTop) > 40) {
            container.scrollBy({ top: currentTop - targetTop, behavior: 'smooth' });
          }
        }
      }
    },
  });

  // Insert text at cursor when insertText prop is set (used by prompt suggestions)
  useEffect(() => {
    if (insertText && editor) {
      editor.commands.focus('end');
      editor.commands.insertContent(insertText);
      onInsertTextConsumed?.();
    }
  }, [insertText, editor, onInsertTextConsumed]);

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
      case 'heading2':
        editor.chain().focus().toggleHeading({ level: 2 }).run();
        break;
      case 'heading3':
        editor.chain().focus().toggleHeading({ level: 3 }).run();
        break;
      case 'blockquote':
        editor.chain().focus().toggleBlockquote().run();
        break;
      case 'taskList':
        editor.chain().focus().toggleTaskList().run();
        break;
      case 'codeBlock':
        editor.chain().focus().toggleCodeBlock().run();
        break;
      case 'horizontalRule':
        editor.chain().focus().setHorizontalRule().run();
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
        heading2: false,
        heading3: false,
        blockquote: false,
        taskList: false,
        codeBlock: false,
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
      heading2: editor.isActive('heading', { level: 2 }),
      heading3: editor.isActive('heading', { level: 3 }),
      blockquote: editor.isActive('blockquote'),
      taskList: editor.isActive('taskList'),
      codeBlock: editor.isActive('codeBlock'),
    };
  }, [editor]);

  // Open the link dialog with the current link URL (if any)
  const handleOpenLinkDialog = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href || '';
    setLinkDialogInitialUrl(previousUrl);
    setLinkDialogOpen(true);
  }, [editor]);

  // Keep ref in sync for the Tiptap keyboard shortcut
  openLinkDialogRef.current = handleOpenLinkDialog;

  // Handle link dialog submission
  const handleLinkDialogSubmit = useCallback((url: string) => {
    setLinkDialogOpen(false);
    if (url) {
      handleFormat('link', url);
    } else {
      handleFormat('link');
    }
  }, [handleFormat]);

  // Handle emoji selection
  const handleEmojiSelect = useCallback((emoji: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(emoji).run();
    setEmojiPickerOpen(false);
  }, [editor]);

  // Check if STT is ready (enabled and model downloaded)
  const sttReady = sttSettings.enabled && sttSettings.modelDownloaded;

  // Handle mic button click for speech-to-text
  const handleMicClick = useCallback(async () => {
    if (!editor) return;

    // If STT is not ready, navigate to settings
    if (!sttReady) {
      onNavigateToSTTSettings?.();
      return;
    }

    if (sttState === 'recording') {
      // Stop recording and transcribe
      const text = await stopAndTranscribe();
      if (text) {
        editor.chain().focus().insertContent(text).run();
      }
    } else if (sttState === 'idle') {
      // Start recording
      await startRecording();
    }
    // If transcribing or processing, do nothing (button should be disabled)
  }, [editor, sttState, sttReady, startRecording, stopAndTranscribe, onNavigateToSTTSettings]);

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
        onLinkClick={handleOpenLinkDialog}
        onEmojiClick={() => setEmojiPickerOpen(true)}
        sttReady={sttReady}
        sttState={sttState}
        sttError={sttError}
        onMicClick={handleMicClick}
        onMicCancel={cancelSTT}
      />

      {/* Editor content */}
      <EditorContent
        editor={editor}
        className="flex-1 overflow-y-auto editor-scroll-container"
      />

      {/* Floating toolbar - appears on text selection */}
      <FloatingToolbar
        editor={editor}
        onFormat={handleFormat}
        getFormatState={getFormatState}
        onOpenContextMenu={onOpenContextMenu}
        disabled={false}
        onLinkClick={handleOpenLinkDialog}
        onEmojiClick={() => setEmojiPickerOpen(true)}
      />

      {/* Emoji picker */}
      {emojiPickerOpen && (
        <EmojiPicker
          onSelect={handleEmojiSelect}
          onClose={() => setEmojiPickerOpen(false)}
        />
      )}

      {/* Link dialog */}
      {linkDialogOpen && (
        <LinkDialog
          initialUrl={linkDialogInitialUrl}
          onSubmit={handleLinkDialogSubmit}
          onClose={() => setLinkDialogOpen(false)}
        />
      )}

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
        /* Remove focus outline and ring from TipTap wrapper */
        .tiptap:focus,
        .tiptap:focus-visible,
        .tiptap *:focus-visible {
          outline: none;
          box-shadow: none;
          --tw-ring-shadow: 0 0 #0000;
        }

        /* Hide editor scrollbar unless hovered */
        .editor-scroll-container {
          scrollbar-gutter: stable;
        }
        .editor-scroll-container::-webkit-scrollbar {
          width: 4px;
        }
        .editor-scroll-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .editor-scroll-container::-webkit-scrollbar-thumb {
          background: transparent;
          border-radius: 9999px;
          transition: background 0.2s;
        }
        .editor-scroll-container:hover::-webkit-scrollbar-thumb {
          background: rgb(203 213 225);
        }
        .dark .editor-scroll-container:hover::-webkit-scrollbar-thumb {
          background: rgb(71 85 105);
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: rgb(148 163 184);
          pointer-events: none;
          height: 0;
        }

        /* Paragraph spacing */
        .ProseMirror p {
          margin: 0.75em 0;
        }

        /* Headings */
        .ProseMirror h2 {
          font-size: 1.5em;
          font-weight: 700;
          line-height: 1.3;
          margin: 1em 0 0.4em;
          color: rgb(30 41 59);
        }
        .dark .ProseMirror h2 {
          color: rgb(226 232 240);
        }
        .ProseMirror h3 {
          font-size: 1.25em;
          font-weight: 600;
          line-height: 1.4;
          margin: 0.8em 0 0.3em;
          color: rgb(51 65 85);
        }
        .dark .ProseMirror h3 {
          color: rgb(203 213 225);
        }

        /* Blockquote */
        .ProseMirror blockquote {
          border-left: 3px solid rgb(139 92 246);
          padding-left: 1em;
          margin: 0.75em 0;
          color: rgb(100 116 139);
          font-style: italic;
        }
        .dark .ProseMirror blockquote {
          border-left-color: rgb(167 139 250);
          color: rgb(148 163 184);
        }

        /* Code block */
        .ProseMirror pre {
          background: rgb(241 245 249);
          border-radius: 0.5em;
          padding: 0.75em 1em;
          margin: 0.75em 0;
          overflow-x: auto;
          font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
          font-size: 0.9em;
          line-height: 1.5;
          color: rgb(30 41 59);
        }
        .dark .ProseMirror pre {
          background: rgb(30 41 59);
          color: rgb(226 232 240);
        }
        .ProseMirror pre code {
          background: none;
          padding: 0;
          border-radius: 0;
          font-size: inherit;
          color: inherit;
        }

        /* Inline code */
        .ProseMirror code {
          background: rgb(241 245 249);
          border-radius: 0.25em;
          padding: 0.15em 0.35em;
          font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
          font-size: 0.9em;
          color: rgb(139 92 246);
        }
        .dark .ProseMirror code {
          background: rgb(30 41 59);
          color: rgb(167 139 250);
        }

        /* Horizontal rule */
        .ProseMirror hr {
          border: none;
          border-top: 2px solid rgb(226 232 240);
          margin: 1.5em 0;
        }
        .dark .ProseMirror hr {
          border-top-color: rgb(51 65 85);
        }

        /* Lists */
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

        /* Task list */
        .ProseMirror ul[data-type="taskList"] {
          list-style: none;
          padding-left: 0;
          margin: 0.5em 0;
        }
        .ProseMirror ul[data-type="taskList"] li {
          display: flex;
          align-items: flex-start;
          gap: 0.5em;
          margin: 0.35em 0;
        }
        .ProseMirror ul[data-type="taskList"] li > label {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 0.25em;
          user-select: none;
        }
        .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"] {
          appearance: none;
          -webkit-appearance: none;
          width: 1.15em;
          height: 1.15em;
          border: 2px solid rgb(203 213 225);
          border-radius: 0.25em;
          cursor: pointer;
          position: relative;
          transition: all 150ms ease;
        }
        .dark .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"] {
          border-color: rgb(100 116 139);
        }
        .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"]:checked {
          background: rgb(139 92 246);
          border-color: rgb(139 92 246);
        }
        .dark .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"]:checked {
          background: rgb(167 139 250);
          border-color: rgb(167 139 250);
        }
        .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"]:checked::after {
          content: '';
          position: absolute;
          top: 0.05em;
          left: 0.25em;
          width: 0.35em;
          height: 0.6em;
          border: solid white;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }
        .ProseMirror ul[data-type="taskList"] li > div {
          flex: 1;
        }
        .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div > p {
          text-decoration: line-through;
          color: rgb(148 163 184);
        }
        .dark .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div > p {
          color: rgb(100 116 139);
        }

        /* Nested task lists */
        .ProseMirror ul[data-type="taskList"] ul[data-type="taskList"] {
          margin: 0.25em 0;
          padding-left: 1.5em;
        }

        /* Slash command menu — CSS variables for dark mode */
        :root {
          --slash-menu-bg: white;
          --slash-menu-border: rgb(226 232 240);
        }
        .dark {
          --slash-menu-bg: rgb(15 23 42);
          --slash-menu-border: rgb(51 65 85);
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
  onLinkClick: () => void;
  onEmojiClick: () => void;
  // Speech-to-text
  sttReady?: boolean; // true if enabled AND model downloaded
  sttState?: STTState;
  sttError?: string | null;
  onMicClick?: () => void;
  onMicCancel?: () => void;
}

function CollapsibleToolbar({
  editor,
  onFormat,
  getFormatState,
  expanded,
  onToggle,
  onLinkClick,
  onEmojiClick,
  sttReady = false,
  sttState = 'idle',
  sttError,
  onMicClick,
  onMicCancel,
}: CollapsibleToolbarProps) {
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

      {/* Expandable button row — overflow-x-auto so mobile can scroll horizontally */}
      <div
        className={`overflow-y-hidden transition-all duration-300 ease-out ${expanded ? 'max-h-16 opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-0.5 px-2 pb-2 flex-nowrap">
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

          {/* Blocks */}
          <ToolbarBtn
            icon={<TBHeading2Icon />}
            label="Heading 2"
            isActive={formatState.heading2}
            onClick={() => onFormat('heading2')}
          />
          <ToolbarBtn
            icon={<TBHeading3Icon />}
            label="Heading 3"
            isActive={formatState.heading3}
            onClick={() => onFormat('heading3')}
          />
          <ToolbarBtn
            icon={<TBBlockquoteIcon />}
            label="Blockquote"
            isActive={formatState.blockquote}
            onClick={() => onFormat('blockquote')}
          />
          <ToolbarBtn
            icon={<TBTaskListIcon />}
            label="Task list"
            isActive={formatState.taskList}
            onClick={() => onFormat('taskList')}
          />

          <TBDivider />

          {/* Insert */}
          <ToolbarBtn
            icon={<TBLinkIcon />}
            label="Link (Ctrl+K)"
            isActive={formatState.link}
            onClick={onLinkClick}
          />
          <ToolbarBtn
            icon={<TBEmojiIcon />}
            label="Emoji"
            onClick={onEmojiClick}
          />

          {/* Speech-to-text mic button - always visible */}
          {onMicClick && (
            <>
              <TBDivider />
              <MicButton
                state={sttState}
                error={sttError}
                onClick={onMicClick}
                onCancel={onMicCancel}
                isReady={sttReady}
              />
            </>
          )}
        </div>
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
        p-1.5 rounded transition-all duration-150 active:scale-90
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

// Mic button for speech-to-text
function MicButton({
  state,
  error,
  onClick,
  onCancel,
  isReady = false,
}: {
  state: STTState;
  error?: string | null;
  onClick: () => void;
  onCancel?: () => void;
  isReady?: boolean;
}) {
  const isRecording = state === 'recording';
  const isProcessing = state === 'processing' || state === 'transcribing' || state === 'requesting';

  // Determine button appearance based on state
  let buttonClass = 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300';
  let title = isReady ? 'Start dictation' : 'Set up speech-to-text';

  if (!isReady) {
    // Not configured - show setup hint
    buttonClass = 'text-slate-300 dark:text-slate-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:text-violet-500 dark:hover:text-violet-400';
  } else if (isRecording) {
    buttonClass = 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 animate-pulse';
    title = 'Stop recording';
  } else if (isProcessing) {
    buttonClass = 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400';
    title = state === 'transcribing' ? 'Transcribing...' : 'Processing...';
  } else if (error) {
    buttonClass = 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400';
    title = error;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault();
          onClick();
        }}
        disabled={isProcessing}
        className={`p-1.5 rounded transition-all duration-150 active:scale-90 ${buttonClass} ${isProcessing ? 'cursor-wait' : ''}`}
        title={title}
      >
        {isProcessing ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          <TBMicIcon isRecording={isRecording} />
        )}
      </button>

      {/* Cancel button shown during recording */}
      {isRecording && onCancel && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }}
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center justify-center text-xs"
          title="Cancel recording"
        >
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

function TBMicIcon({ isRecording }: { isRecording?: boolean }) {
  return (
    <svg className="w-4 h-4" fill={isRecording ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
  );
}

// ============================================
// Link Dialog
// ============================================

interface LinkDialogProps {
  initialUrl: string;
  onSubmit: (url: string) => void;
  onClose: () => void;
}

function LinkDialog({ initialUrl, onSubmit, onClose }: LinkDialogProps) {
  const [url, setUrl] = useState(initialUrl || 'https://');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus and select URL on open
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    onSubmit(trimmed === 'https://' ? '' : trimmed);
  };

  const handleRemoveLink = () => {
    onSubmit('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              {initialUrl ? 'Edit Link' : 'Add Link'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-5 pb-5">
          <div className="mb-4">
            <label htmlFor="link-url" className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              URL
            </label>
            <input
              ref={inputRef}
              id="link-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="input"
            />
          </div>

          <div className="flex gap-2.5">
            {initialUrl && (
              <button
                type="button"
                onClick={handleRemoveLink}
                className="btn-secondary px-3 py-2 text-sm text-rose-600 dark:text-rose-400"
              >
                Remove
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary px-4 py-2 text-sm"
            >
              {initialUrl ? 'Update' : 'Add Link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
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

function TBEmojiIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function TBHeading2Icon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6v12M4 12h7M11 6v12" />
      <text x="15" y="19" fontSize="10" fill="currentColor" stroke="none" fontWeight="bold" fontFamily="sans-serif">2</text>
    </svg>
  );
}

function TBHeading3Icon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6v12M4 12h7M11 6v12" />
      <text x="15" y="19" fontSize="10" fill="currentColor" stroke="none" fontWeight="bold" fontFamily="sans-serif">3</text>
    </svg>
  );
}

function TBBlockquoteIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M6 17h3l2-4V7H5v6h3l-2 4zm8 0h3l2-4V7h-6v6h3l-2 4z" />
    </svg>
  );
}

function TBTaskListIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="5" width="4" height="4" rx="0.5" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.25 7l0.75 0.75L6.5 6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 7h10" />
      <rect x="3" y="14" width="4" height="4" rx="0.5" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 16h10" />
    </svg>
  );
}
