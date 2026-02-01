/**
 * WritingView - Calm writing space (default view)
 *
 * Per spec:
 * - Centered writing column (max ~680-760px)
 * - Vertically padded, soft background
 * - Title field: placeholder "Title (optional)", lighter color
 * - Body editor: auto-focus, large readable font, no toolbar by default
 * - Auto-save on debounce (async, no blocking)
 * - Subtle "Saved" indicator
 * - Context items stored as metadata (not inline)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { saveEntry, getEntryById } from '../lib/journalService';
import { RichTextEditor, AddContextButton } from '../components/editor';

interface WritingViewProps {
  entryId?: string | null;
  onEntrySaved?: () => void;
}

interface EntryContext {
  attachments: string[];
  photos: string[];
  location?: string;
  links: string[];
}

export function WritingView({ entryId, onEntrySaved }: WritingViewProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contentText, setContentText] = useState('');
  const [context, setContext] = useState<EntryContext>({
    attachments: [],
    photos: [],
    links: [],
  });
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing entry if editing
  useEffect(() => {
    if (entryId) {
      getEntryById(entryId).then((entry) => {
        if (entry) {
          setTitle(entry.title || '');
          setContent(entry.content);
          setContentText(entry.content);
        }
      });
    }
  }, [entryId]);

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  // Auto-save after 2 seconds of inactivity (async, non-blocking)
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Only auto-save if there's content
    if (!contentText.trim()) return;

    autoSaveTimeoutRef.current = setTimeout(() => {
      // Fire and forget - don't block UI
      setIsSaving(true);
      saveEntry({
        id: entryId || undefined,
        title: title || undefined,
        content: contentText,
      })
        .then(() => {
          setShowSaved(true);
          onEntrySaved?.();
          // Hide "Saved" after 2 seconds
          savedTimeoutRef.current = setTimeout(() => {
            setShowSaved(false);
          }, 2000);
        })
        .catch((err) => {
          console.error('Auto-save failed:', err);
        })
        .finally(() => {
          setIsSaving(false);
        });
    }, 2000);
  }, [contentText, title, entryId, onEntrySaved]);

  // Trigger auto-save when content changes
  useEffect(() => {
    scheduleAutoSave();
  }, [contentText, title, scheduleAutoSave]);

  // Handle content change from rich text editor
  const handleContentChange = useCallback((html: string, text: string) => {
    setContent(html);
    setContentText(text);

    // Mark as typing
    setIsTyping(true);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 1500);
  }, []);

  // Handle title change
  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);

    // Mark as typing
    setIsTyping(true);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 1500);
  }, []);

  // Handle context actions
  const handleContextAction = useCallback((action: string) => {
    switch (action) {
      case 'attachment':
        // TODO: Open file picker for attachments
        console.log('Add attachment');
        break;
      case 'location':
        // TODO: Open location input/picker
        const location = window.prompt('Enter location (city, region):');
        if (location) {
          setContext((prev) => ({ ...prev, location }));
        }
        break;
      case 'photo':
        // TODO: Open image picker
        console.log('Add photo');
        break;
      case 'link':
        const link = window.prompt('Enter URL:');
        if (link) {
          setContext((prev) => ({ ...prev, links: [...prev.links, link] }));
        }
        break;
      case 'reflect':
        // TODO: Open AI reflection panel
        console.log('Reflect with AI');
        break;
    }
  }, []);

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Main writing area - centered column */}
      <div className="flex-1 flex flex-col min-h-0 px-6 sm:px-12 lg:px-20 py-12">
        {/* Centered content container with soft background */}
        <div className="flex-1 flex flex-col max-w-[720px] w-full mx-auto min-h-0 relative">
          {/* Inviting heading - only for new entries */}
          {!entryId && (
            <div className="mb-6">
              <h1 className="text-2xl font-light text-slate-400 dark:text-slate-500 tracking-wide">
                What's on your mind?
              </h1>
            </div>
          )}

          {/* Editor surface with subtle contrast */}
          <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900 rounded-2xl shadow-sm px-8 py-10">
            {/* Title input - lighter weight */}
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              placeholder="Title (optional)"
              className="
                w-full text-2xl font-medium
                bg-transparent border-none outline-none
                text-slate-600 dark:text-slate-300
                placeholder:text-slate-300 dark:placeholder:text-slate-600
                mb-6 flex-shrink-0
              "
            />

            {/* Rich text editor - expands to fill space */}
            <RichTextEditor
              value={content}
              onChange={handleContentChange}
              placeholder="Start writing..."
              autoFocus={!entryId}
              className="flex-1 min-h-0"
              onOpenContextMenu={() => handleContextAction('attachment')}
            />

            {/* Context chips (collapsed, show if any context exists) */}
            {(context.location || context.attachments.length > 0 || context.photos.length > 0 || context.links.length > 0) && (
              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex flex-wrap gap-2">
                  {context.location && (
                    <ContextChip
                      icon={<LocationIcon />}
                      label={context.location}
                      onRemove={() => setContext((prev) => ({ ...prev, location: undefined }))}
                    />
                  )}
                  {context.photos.map((_, i) => (
                    <ContextChip
                      key={`photo-${i}`}
                      icon={<PhotoIcon />}
                      label={`Photo ${i + 1}`}
                      onRemove={() =>
                        setContext((prev) => ({
                          ...prev,
                          photos: prev.photos.filter((__, idx) => idx !== i),
                        }))
                      }
                    />
                  ))}
                  {context.attachments.map((_, i) => (
                    <ContextChip
                      key={`attachment-${i}`}
                      icon={<AttachmentIcon />}
                      label={`File ${i + 1}`}
                      onRemove={() =>
                        setContext((prev) => ({
                          ...prev,
                          attachments: prev.attachments.filter((__, idx) => idx !== i),
                        }))
                      }
                    />
                  ))}
                  {context.links.map((link, i) => (
                    <ContextChip
                      key={`link-${i}`}
                      icon={<LinkIcon />}
                      label={new URL(link).hostname}
                      onRemove={() =>
                        setContext((prev) => ({
                          ...prev,
                          links: prev.links.filter((_, idx) => idx !== i),
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Add context button - bottom right, hidden while typing */}
          <AddContextButton isTyping={isTyping} onAction={handleContextAction} />

          {/* Bottom status bar - encryption badge + save indicator */}
          <div className="flex items-center justify-between mt-3 px-1">
            {/* Encryption reassurance */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <span>End-to-end encrypted</span>
            </div>

            {/* Save indicator */}
            <div
              className={`
                text-xs text-slate-400 dark:text-slate-500
                transition-opacity duration-300
                ${isSaving || showSaved ? 'opacity-100' : 'opacity-0'}
              `}
            >
              {isSaving ? 'Saving...' : showSaved ? 'Saved' : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Context chip component
function ContextChip({
  icon,
  label,
  onRemove,
}: {
  icon: React.ReactNode;
  label: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-xs text-slate-600 dark:text-slate-400">
      {icon}
      <span className="max-w-[120px] truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// Small icons for chips
function LocationIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

function PhotoIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

function AttachmentIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
  );
}
