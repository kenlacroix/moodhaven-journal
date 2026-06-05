/**
 * NewBookModal — Two-tab modal for creating a new journal (book).
 *
 * Basic tab:  emoji picker, name, color swatch
 * Advanced tab: default privacy, location, On This Day, AI opt-out, conceal previews
 */

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { BookSettings, PrivacyMode } from '../../types/journal';
import { BOOK_COLORS } from '../../types/journal';

const QUICK_EMOJIS = [
  '📓','📔','📒','📕','📗','📘','📙','📚',
  '✏️','🖊️','🖋️','📝','📄','📃','📜','📑',
  '💭','💡','🌱','🌸','🌿','🍃','🌙','⭐',
  '🔮','🎯','🧠','💙','💜','🤍','🖤','🌊',
];

const COLOR_CLASSES: Record<string, string> = {
  violet:  'bg-violet-500',
  rose:    'bg-rose-500',
  amber:   'bg-amber-500',
  emerald: 'bg-emerald-500',
  sky:     'bg-sky-500',
  indigo:  'bg-indigo-500',
  teal:    'bg-teal-500',
  slate:   'bg-slate-500',
};

interface NewBookModalProps {
  onClose: () => void;
  onCreate: (name: string, emoji: string, color: string, description?: string, settings?: BookSettings) => Promise<void>;
}

type Tab = 'basic' | 'advanced';

export function NewBookModal({ onClose, onCreate }: NewBookModalProps) {
  const [tab, setTab] = useState<Tab>('basic');
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📓');
  const [color, setColor] = useState<string>('violet');
  const [description, setDescription] = useState('');
  const [settings, setSettings] = useState<BookSettings>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  const patchSettings = (patch: Partial<BookSettings>) =>
    setSettings((s) => ({ ...s, ...patch }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('Please enter a journal name.'); return; }
    setSubmitting(true);
    try {
      await onCreate(trimmed, emoji, color, description.trim() || undefined, Object.keys(settings).length ? settings : undefined);
      onClose();
    } catch (err) {
      setError(String(err));
      setSubmitting(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-hidden="true"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-book-title"
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h2 id="new-book-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">New Journal</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-md transition-colors"
            >
              <svg className="w-4 h-4" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div role="tablist" className="flex gap-1 mt-3">
            {(['basic', 'advanced'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                aria-controls={`tab-panel-${t}`}
                id={`tab-${t}`}
                onClick={() => setTab(t)}
                className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                  tab === t
                    ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {tab === 'basic' && (
              <div
                role="tabpanel"
                id="tab-panel-basic"
                aria-labelledby="tab-basic"
                tabIndex={0}
                className="space-y-4 outline-none"
              >
                {/* Emoji picker */}
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Icon
                  </label>
                  <div role="group" aria-label="Journal icon" className="mt-2 grid grid-cols-8 gap-1.5">
                    {QUICK_EMOJIS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setEmoji(e)}
                        aria-label={e}
                        aria-pressed={emoji === e}
                        className={`w-8 h-8 text-lg flex items-center justify-center rounded-lg transition-all ${
                          emoji === e
                            ? 'bg-violet-100 dark:bg-violet-900/30 ring-2 ring-violet-400 scale-110'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Name
                  </label>
                  <input
                    ref={nameRef}
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setError(''); }}
                    placeholder="e.g. Morning Thoughts"
                    className="mt-1.5 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </div>

                {/* Color */}
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Color
                  </label>
                  <div role="group" aria-label="Journal color" className="mt-2 flex gap-2 flex-wrap">
                    {(BOOK_COLORS as readonly string[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        aria-label={c}
                        aria-pressed={color === c}
                        className={`w-7 h-7 rounded-full ${COLOR_CLASSES[c] ?? 'bg-slate-500'} transition-all ${
                          color === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Description <span className="normal-case font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What's this journal for?"
                    rows={2}
                    className="mt-1.5 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                  />
                </div>
              </div>
            )}

            {tab === 'advanced' && (
              <div
                role="tabpanel"
                id="tab-panel-advanced"
                aria-labelledby="tab-advanced"
                tabIndex={0}
                className="space-y-4 outline-none"
              >
                {/* Default privacy */}
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Default Privacy
                  </label>
                  <div role="group" aria-label="Default privacy" className="mt-2 flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    {([0, 1, 2] as PrivacyMode[]).map((mode, i) => {
                      const labels = ['Open', 'Mindful', 'Private'];
                      const selected = (settings.privacyDefault ?? 0) === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => patchSettings({ privacyDefault: mode })}
                          className={`flex-1 py-2 text-xs font-medium transition-colors ${
                            i > 0 ? 'border-l border-slate-200 dark:border-slate-700' : ''
                          } ${
                            selected
                              ? 'bg-violet-500 text-white'
                              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {labels[mode]}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Applied to new entries in this journal by default.
                  </p>
                </div>

                {/* Toggles */}
                {[
                  {
                    key: 'autoLocationWeather' as keyof BookSettings,
                    label: 'Auto location & weather',
                    desc: 'Capture city and weather when writing',
                  },
                  {
                    key: 'includeInOnThisDay' as keyof BookSettings,
                    label: 'Include in On This Day',
                    desc: 'Resurface past entries on their anniversary',
                    default: true,
                  },
                  {
                    key: 'concealContent' as keyof BookSettings,
                    label: 'Conceal entry previews',
                    desc: 'Blur entry content in the timeline list',
                  },
                  {
                    key: 'aiOptOut' as keyof BookSettings,
                    label: 'Exclude from AI insights',
                    desc: 'Mood metadata from this journal won\'t be used for AI suggestions',
                  },
                ].map(({ key, label, desc, default: def }) => {
                  const val = (settings[key] as boolean | undefined) ?? (def ?? false);
                  return (
                    <div key={key} className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                      <div>
                        <p className="text-sm text-slate-700 dark:text-slate-200">{label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={val}
                        onClick={() => patchSettings({ [key]: !val })}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${
                          val ? 'bg-violet-500' : 'bg-slate-200 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                            val ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium bg-violet-500 text-white rounded-xl hover:bg-violet-600 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Creating…' : 'Create Journal'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
