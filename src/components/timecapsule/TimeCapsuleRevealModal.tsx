import DOMPurify from 'dompurify';
import { useEffect, useRef, useState } from 'react';
import { decrypt } from '../../lib/services/crypto';
import { getMoodDelta, type CapsuleEntryRow } from '../../lib/services/timeCapsuleService';

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_URI_REGEXP: /^(?:https?|ftp|mailto|tel):/i,
  });
}

interface MoodDelta {
  avg_since: number | null;
  mood_today: number | null;
}

const CAPSULE_LABELS: Record<string, string> = {
  letter: 'A letter to yourself',
  vault: 'Vault entry',
  anniversary: 'One year ago',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

interface Props {
  capsule: CapsuleEntryRow;
  password: string;
  onReveal: (id: string) => Promise<void>;
  onWriteResponse: () => void;
  onDismiss: () => void;
}

export function TimeCapsuleRevealModal({ capsule, password, onReveal, onWriteResponse, onDismiss }: Props) {
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null);
  const [moodDelta, setMoodDelta] = useState<MoodDelta | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRevealingRef = useRef(false);
  const firstFocusRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!capsule.encrypted_content) return;

    Promise.all([
      decrypt(capsule.encrypted_content, password),
      getMoodDelta(capsule.id, capsule.created_at),
    ]).then(([result, delta]) => {
      if (result.success && result.data !== undefined) {
        setDecryptedContent(sanitizeHtml(result.data));
      } else {
        setError('Could not decrypt this entry.');
      }
      setMoodDelta(delta);
    }).catch(() => setError('Failed to load entry.'));
  }, [capsule, password]);

  // Focus first focusable element on mount
  useEffect(() => {
    firstFocusRef.current?.focus();
  }, []);

  // Trap focus within modal + ESC to dismiss
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onDismiss]);

  const handleReveal = async () => {
    if (isRevealingRef.current) return;
    isRevealingRef.current = true;
    setIsRevealing(true);
    try {
      await onReveal(capsule.id);
    } finally {
      isRevealingRef.current = false;
      setIsRevealing(false);
    }
  };

  const capsuleLabel = CAPSULE_LABELS[capsule.capsule_type ?? 'anniversary'] ?? 'A note from the past';

  const moodDeltaChip = (() => {
    if (!moodDelta?.avg_since || !moodDelta?.mood_today) return null;
    const diff = moodDelta.mood_today - moodDelta.avg_since;
    if (Math.abs(diff) < 0.3) return null;
    const improved = diff > 0;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        improved
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
      }`}>
        {improved ? 'Your mood has improved since this was written' : 'Your mood has changed since this was written'}
      </span>
    );
  })();

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="capsule-reveal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onDismiss(); }}
    >
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <p id="capsule-reveal-title" className="text-xs font-semibold uppercase tracking-widest text-violet-500 dark:text-violet-400 mb-1">
            {capsuleLabel}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Written on {formatDate(capsule.created_at)}
            {capsule.unsealed_at && ` · Revealed ${formatDate(capsule.unsealed_at)}`}
          </p>
          {moodDeltaChip && <div className="mt-2">{moodDeltaChip}</div>}
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-80 flex-1">
          {error ? (
            <p role="alert" className="text-sm text-rose-500">{error}</p>
          ) : decryptedContent === null ? (
            <p className="text-sm text-slate-400 animate-pulse">Decrypting…</p>
          ) : (
            <div
              className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-200"
              // nosemgrep: dangerouslySetInnerHTML-pattern (DOMPurify-sanitized at setState call site)
              dangerouslySetInnerHTML={{ __html: decryptedContent }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
          <button
            ref={firstFocusRef}
            type="button"
            onClick={handleReveal}
            disabled={isRevealing}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            {isRevealing ? 'Saving…' : "I've read this"}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleReveal().then(onWriteResponse).catch(() => {
                setError('Failed to mark as revealed. Please try again.');
              });
            }}
            disabled={isRevealing}
            className="px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50"
          >
            Write a response
          </button>
        </div>
      </div>
    </div>
  );
}
