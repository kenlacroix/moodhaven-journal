import { useState, useEffect, useRef } from 'react';
import { type Editor } from '@tiptap/react';
import { type STTState } from '../../hooks/useSpeechToText';
import { usePlatform } from '../../hooks/usePlatform';
import {
  TBBoldIcon,
  TBItalicIcon,
  TBUnderlineIcon,
  TBStrikeIcon,
  TBBulletListIcon,
  TBOrderedListIcon,
  TBHeading2Icon,
  TBHeading3Icon,
  TBBlockquoteIcon,
  TBTaskListIcon,
  TBLinkIcon,
  TBEmojiIcon,
  TBMicIcon,
} from './EditorIcons';

export interface CollapsibleToolbarProps {
  editor: Editor;
  onFormat: (command: string, value?: string) => void;
  getFormatState: () => Record<string, boolean>;
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
  onLinkClick: () => void;
  onEmojiClick: () => void;
  // Speech-to-text
  sttReady?: boolean;
  sttState?: STTState;
  sttError?: string | null;
  onMicClick?: () => void;
  onMicCancel?: () => void;
  quickCapture?: boolean;
  onToggleQuickCapture?: () => void;
}

export function CollapsibleToolbar({
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
  quickCapture = false,
  onToggleQuickCapture,
}: CollapsibleToolbarProps) {
  const { isIOS } = usePlatform();
  const [formatState, setFormatState] = useState<Record<string, boolean>>({});
  const toolbarPanelRef = useRef<HTMLDivElement>(null);

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

  // Remove invisible toolbar buttons from the keyboard/AT tab order when collapsed
  useEffect(() => {
    const el = toolbarPanelRef.current;
    if (!el) return;
    if (expanded) {
      el.removeAttribute('inert');
      el.removeAttribute('aria-hidden');
    } else {
      el.setAttribute('inert', '');
      el.setAttribute('aria-hidden', 'true');
    }
  }, [expanded]);

  return (
    <div className="flex-shrink-0 border-b border-slate-100 dark:border-slate-800">
      {/* Toggle bar */}
      <button
        type="button"
        onClick={() => onToggle(!expanded)}
        aria-expanded={expanded}
        aria-controls="editor-toolbar-buttons"
        aria-label={expanded ? 'Collapse formatting toolbar' : 'Expand formatting toolbar'}
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
        ref={toolbarPanelRef}
        className={`overflow-y-hidden transition-all duration-300 ease-out ${expanded ? 'max-h-16 opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="overflow-x-auto scrollbar-hide">
        <div id="editor-toolbar-buttons" role="toolbar" aria-label="Text formatting" className="flex items-center gap-0.5 px-2 pb-2 flex-nowrap">
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

          {/* Speech-to-text: quick capture toggle + mic button — sidecar unavailable on iOS */}
          {onMicClick && !isIOS && (
            <>
              <TBDivider />
              {onToggleQuickCapture && (
                <QuickCaptureToggle
                  active={quickCapture}
                  onToggle={onToggleQuickCapture}
                />
              )}
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

export function ToolbarBtn({
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
      aria-label={label}
      title={label}
      aria-pressed={isActive}
      className={`
        p-1.5 rounded transition-all duration-150 active:scale-90
        ${isActive
          ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
          : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300'
        }
      `}
    >
      {icon}
    </button>
  );
}

export function TBDivider() {
  return <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />;
}

export function MicButton({
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
  const isFormatting = state === 'formatting';
  const isProcessing = state === 'processing' || state === 'transcribing' || state === 'requesting' || isFormatting;

  // Determine button appearance based on state
  let buttonClass = 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300';
  let title = isReady ? 'Start dictation' : 'Set up speech-to-text';

  if (!isReady) {
    // Not configured - show setup hint
    buttonClass = 'text-slate-300 dark:text-slate-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:text-violet-500 dark:hover:text-violet-400';
  } else if (isRecording) {
    buttonClass = 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 animate-pulse';
    title = 'Stop recording';
  } else if (isFormatting) {
    buttonClass = 'bg-amber-100 dark:bg-amber-900/30 text-amber-500 dark:text-amber-400';
    title = 'Formatting…';
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
        aria-label={title}
        title={title}
        className={`p-1.5 rounded transition-all duration-150 active:scale-90 ${buttonClass} ${isProcessing ? 'cursor-wait' : ''}`}
      >
        {isProcessing ? (
          <span className="flex items-center gap-1">
            <svg className={`w-4 h-4 animate-spin ${isFormatting ? 'text-amber-500' : ''}`} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {isFormatting && <span className="text-xs text-amber-500">Formatting…</span>}
          </span>
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
          aria-label="Cancel recording"
          title="Cancel recording"
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center justify-center text-xs"
        >
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function QuickCaptureToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        onToggle();
      }}
      aria-label="Quick capture (bypass formatting)"
      title="Quick capture (bypass formatting)"
      aria-pressed={active}
      className={[
        'p-1.5 rounded transition-all duration-150 active:scale-90 min-w-[44px] min-h-[44px] flex items-center justify-center',
        active
          ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20'
          : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-slate-100 dark:hover:bg-slate-800',
      ].join(' ')}
    >
      {/* Lightning bolt / bolt icon */}
      <svg className="w-4 h-4" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    </button>
  );
}
