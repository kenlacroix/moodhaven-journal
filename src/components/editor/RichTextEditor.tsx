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
import { useSpeechToText } from '../../hooks/useSpeechToText';
import { useSettingsStore } from '../../stores/settingsStore';
import { usePlatform } from '../../hooks/usePlatform';
import { TranscriptPreviewOverlay } from '../transcript/TranscriptPreviewOverlay';
import { MicrophonePermissionModal } from '../stt/MicrophonePermissionModal';
import { MicrophoneBlockedModal } from '../stt/MicrophoneBlockedModal';
import { CollapsibleToolbar } from './EditorToolbar';
import { RecordingStrip } from './EditorRecording';
import { LinkDialog } from './EditorLinkDialog';
import './EditorStyles.css';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string, text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  onOpenContextMenu?: () => void;
  onNavigateToSTTSettings?: () => void;
  /** When set, inserts this plain text at the current cursor position (A-08: never treated as HTML) */
  insertText?: string | null;
  /** When set, inserts this HTML content at the current cursor position (for templates that intentionally contain markup) */
  insertHtml?: string | null;
  /** Called after insertText or insertHtml has been consumed so the parent can clear it */
  onInsertTextConsumed?: () => void;
  /** When true, keeps the cursor at ~38% from top of the scroll container (typewriter mode) */
  distractionFree?: boolean;
  /** Called with the Editor instance once mounted; called with null on unmount.
   *  Lets parents (e.g. Android action bar) invoke formatting commands directly. */
  onEditorReady?: (editor: Editor | null) => void;
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
  insertHtml,
  onInsertTextConsumed,
  distractionFree = false,
  onEditorReady,
}: RichTextEditorProps) {
  const distractionFreeRef = useRef(distractionFree);
  useEffect(() => { distractionFreeRef.current = distractionFree; }, [distractionFree]);
  const [toolbarExpanded, setToolbarExpanded] = useState(true);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDialogInitialUrl, setLinkDialogInitialUrl] = useState('');
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const { canSTT } = usePlatform();

  // Speech-to-text
  const sttSettings = useSettingsStore((s) => s.settings.speechToText);
  const {
    state: sttState,
    error: sttError,
    permissionModal,
    elapsedSeconds,
    quickCapture,
    toggleQuickCapture,
    formattedResult,
    clearFormattedResult,
    startRecording,
    proceedAfterConsent,
    dismissPermissionModal,
    stopAndTranscribe,
    cancel: cancelSTT,
  } = useSpeechToText();

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
        // StarterKit v3 bundles Link + Underline; disable so the explicitly
        // configured extensions below win (avoids duplicate-name warning).
        link: false,
        underline: false,
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
        // Font, size, line-height, and letter-spacing are driven by CSS vars
        // declared on the [data-writing-prefs] ancestor in WritingView. See
        // active-plans/writing-experience-customization.md. The dark text
        // fallback below applies only when the editor is rendered outside a
        // data-writing-prefs ancestor (e.g. future reuse in other contexts).
        class: 'outline-none min-h-full text-slate-700 dark:text-slate-200',
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

  // Expose editor instance to parent via callback (e.g. Android formatting toolbar)
  useEffect(() => {
    onEditorReady?.(editor ?? null);
    return () => onEditorReady?.(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Insert plain text at cursor when insertText prop is set (A-08: plain text only, never HTML)
  useEffect(() => {
    if (insertText && editor) {
      editor.commands.focus('end');
      editor.commands.command(({ tr }) => { tr.insertText(insertText); return true; });
      onInsertTextConsumed?.();
    }
  }, [insertText, editor, onInsertTextConsumed]);

  // Insert HTML content at cursor when insertHtml prop is set (for templates with intentional markup)
  useEffect(() => {
    if (insertHtml && editor) {
      editor.commands.focus('end');
      editor.commands.insertContent(insertHtml);
      onInsertTextConsumed?.();
    }
  }, [insertHtml, editor, onInsertTextConsumed]);

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

  // STT-ERR-1: show toast when transcription fails; auto-dismiss after 4s
  const [sttToast, setSttToast] = useState<string | null>(null);
  const prevSttErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (sttError && sttError !== prevSttErrorRef.current) {
      setSttToast(sttError);
      prevSttErrorRef.current = sttError;
    } else if (!sttError) {
      prevSttErrorRef.current = null;
    }
  }, [sttError]);
  useEffect(() => {
    if (!sttToast) return;
    const t = setTimeout(() => setSttToast(null), 4000);
    return () => clearTimeout(t);
  }, [sttToast]);

  // Check if STT is ready (enabled and model downloaded)
  const sttReady = canSTT && sttSettings.enabled && sttSettings.modelDownloaded;

  // Handle mic button click for speech-to-text
  const handleMicClick = useCallback(async () => {
    if (!editor) return;

    // If STT is not ready, navigate to settings
    if (!sttReady) {
      onNavigateToSTTSettings?.();
      return;
    }

    if (sttState === 'recording') {
      // Stop recording and transcribe (may return null if L2/L3 preview is shown)
      const text = await stopAndTranscribe();
      if (text) {
        // A-08 (mic path): whisper output is plain text — use tr.insertText not insertContent
        editor.chain().focus().command(({ tr }) => { tr.insertText(text); return true; }).run();
      }
    } else if (sttState === 'idle') {
      // Start recording
      await startRecording();
    }
    // If transcribing/formatting/processing, do nothing (button should be disabled)
  }, [editor, sttState, sttReady, startRecording, stopAndTranscribe, onNavigateToSTTSettings]);

  // Transcript preview overlay handlers
  const handleUseFormatted = useCallback(() => {
    if (!editor || !formattedResult) return;
    // A-08: use tr.insertText (not insertContent) — LLM output is plain text, not HTML
    editor.chain().focus().command(({ tr }) => { tr.insertText(formattedResult.formatted); return true; }).run();
    clearFormattedResult();
  }, [editor, formattedResult, clearFormattedResult]);

  const handleEditFirst = useCallback(() => {
    if (!editor || !formattedResult) return;
    // Insert text then reposition cursor to start of the inserted block
    const { from } = editor.state.selection;
    // A-08: use tr.insertText (not insertContent) — LLM output is plain text, not HTML
    editor.chain().focus().command(({ tr }) => { tr.insertText(formattedResult.formatted); return true; }).setTextSelection(from).run();
    clearFormattedResult();
  }, [editor, formattedResult, clearFormattedResult]);

  const handleUseRaw = useCallback(() => {
    if (!editor || !formattedResult) return;
    // A-08: raw whisper output is plain text — use tr.insertText not insertContent
    editor.chain().focus().command(({ tr }) => { tr.insertText(formattedResult.raw); return true; }).run();
    clearFormattedResult();
  }, [editor, formattedResult, clearFormattedResult]);

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
        quickCapture={quickCapture}
        onToggleQuickCapture={toggleQuickCapture}
      />

      {/* Recording indicator strip — shown while recording or transcribing */}
      <RecordingStrip
        state={sttState}
        elapsedSeconds={elapsedSeconds}
        onStop={handleMicClick}
        onCancel={cancelSTT}
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

      {/* STT-ERR-1: transcription error toast */}
      {sttToast && (
        <div className="absolute bottom-4 left-4 right-4 z-50 flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 shadow-md animate-float-in">
          <svg className="w-4 h-4 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span className="text-xs text-amber-700 dark:text-amber-300 flex-1">{sttToast}</span>
          <button type="button" onClick={() => setSttToast(null)} className="text-amber-400 hover:text-amber-600 dark:hover:text-amber-200 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Transcript preview overlay — shown when L2/L3 formatting returns a result */}
      <TranscriptPreviewOverlay
        isOpen={formattedResult !== null}
        formattedText={formattedResult?.formatted ?? ''}
        rawText={formattedResult?.raw ?? ''}
        source={formattedResult?.source ?? null}
        onUseFormatted={handleUseFormatted}
        onEditFirst={handleEditFirst}
        onUseRaw={handleUseRaw}
      />

      {/* Microphone permission consent modal — explains why we need mic access */}
      <MicrophonePermissionModal
        isOpen={permissionModal === 'consent'}
        onAllow={proceedAfterConsent}
        onCancel={dismissPermissionModal}
      />

      {/* Microphone blocked modal — shown when the OS has denied mic access */}
      <MicrophoneBlockedModal
        isOpen={permissionModal === 'blocked'}
        onDismiss={dismissPermissionModal}
      />

    </div>
  );
}
