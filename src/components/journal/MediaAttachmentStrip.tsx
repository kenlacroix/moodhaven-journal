/**
 * MediaAttachmentStrip
 *
 * Horizontal row of attachment chips displayed below the TipTap editor.
 * Images show a thumbnail; all other types show a MIME-category icon.
 * Each chip opens the file on click and offers a delete button.
 */

import { useState } from 'react';
import type { MediaAttachment } from '../../types/journal';
import { getMediaCategory, formatFileSize } from '../../types/journal';

interface MediaAttachmentStripProps {
  attachments: MediaAttachment[];
  thumbnails: Record<string, string>; // mediaId → data URL
  onOpen: (mediaId: string) => void;
  onDelete: (mediaId: string) => void;
  isAttaching?: boolean;
}

// ── Category icons ─────────────────────────────────────────────────────────────

function PdfIcon() {
  return (
    <svg className="w-7 h-7 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function AudioIcon() {
  return (
    <svg className="w-7 h-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg className="w-7 h-7 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

// ── Single attachment chip ─────────────────────────────────────────────────────

interface ChipProps {
  attachment: MediaAttachment;
  thumbnail?: string;
  onOpen: () => void;
  onDelete: () => void;
}

function AttachmentChip({ attachment, thumbnail, onOpen, onDelete }: ChipProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const category = getMediaCategory(attachment.mimeType);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete();
    } else {
      setConfirmDelete(true);
      // Reset confirm state after 2.5 s if user doesn't confirm
      setTimeout(() => setConfirmDelete(false), 2500);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      title={`${attachment.filename} · ${formatFileSize(attachment.sizeBytes)}\nClick to open`}
      className="
        group relative flex-shrink-0 flex items-center gap-2.5
        bg-slate-50 dark:bg-slate-800/60
        border border-slate-200 dark:border-slate-700
        rounded-xl px-3 py-2
        cursor-pointer
        hover:border-violet-300 dark:hover:border-violet-700
        hover:bg-white dark:hover:bg-slate-800
        transition-all duration-150
        max-w-[200px]
      "
    >
      {/* Thumbnail or icon */}
      <div className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center bg-slate-100 dark:bg-slate-700">
        {category === 'image' && thumbnail ? (
          <img
            src={thumbnail}
            alt={attachment.filename}
            className="w-full h-full object-cover"
          />
        ) : category === 'image' ? (
          // Image without thumbnail yet — show placeholder
          <svg className="w-5 h-5 text-slate-300 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        ) : category === 'pdf' ? (
          <PdfIcon />
        ) : category === 'audio' ? (
          <AudioIcon />
        ) : category === 'video' ? (
          <VideoIcon />
        ) : (
          <FileIcon />
        )}
      </div>

      {/* Filename + size */}
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate leading-tight">
          {attachment.filename}
        </p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
          {formatFileSize(attachment.sizeBytes)}
        </p>
      </div>

      {/* Delete button — appears on hover */}
      <button
        type="button"
        onClick={handleDeleteClick}
        title={confirmDelete ? 'Click again to delete' : 'Remove attachment'}
        className={`
          absolute -top-1.5 -right-1.5
          w-5 h-5 rounded-full flex items-center justify-center
          opacity-0 group-hover:opacity-100
          transition-all duration-150
          ${confirmDelete
            ? 'bg-rose-500 text-white scale-110'
            : 'bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-300 hover:bg-rose-500 hover:text-white'
          }
        `}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ── Strip ──────────────────────────────────────────────────────────────────────

export function MediaAttachmentStrip({
  attachments,
  thumbnails,
  onOpen,
  onDelete,
  isAttaching,
}: MediaAttachmentStripProps) {
  if (attachments.length === 0 && !isAttaching) return null;

  return (
    <div className="mt-3 -mx-1">
      {/* Section label */}
      <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2 px-1">
        Attachments
      </p>

      {/* Horizontal scroll row */}
      <div className="flex gap-2 overflow-x-auto pb-1 px-1 scrollbar-none">
        {attachments.map((a) => (
          <AttachmentChip
            key={a.id}
            attachment={a}
            thumbnail={thumbnails[a.id]}
            onOpen={() => onOpen(a.id)}
            onDelete={() => onDelete(a.id)}
          />
        ))}

        {/* Attaching spinner chip */}
        {isAttaching && (
          <div className="flex-shrink-0 flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">
            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
              <svg className="w-4 h-4 text-violet-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Encrypting…</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Please wait</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
