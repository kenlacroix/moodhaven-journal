import { useState, useRef } from 'react';
import type { Activity } from '../../types/activities';

interface ActivityPickerProps {
  activities: Activity[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onAddCustom: (name: string, emoji: string) => Promise<Activity>;
  onRemoveCustom: (id: string) => Promise<void>;
  isLoading?: boolean;
}

export function ActivityPicker({
  activities,
  selectedIds,
  onChange,
  onAddCustom,
  onRemoveCustom,
  isLoading = false,
}: ActivityPickerProps) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('✨');
  const [addError, setAddError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((s) => s !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    setAddError(null);
    try {
      await onAddCustom(newName.trim(), newEmoji);
      setNewName('');
      setNewEmoji('✨');
      setShowNewForm(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add activity');
    }
  }

  async function handleDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setConfirmDeleteId(null);
    onChange(selectedIds.filter((s) => s !== id));
    await onRemoveCustom(id);
  }

  const predefined = activities.filter((a) => !a.isCustom);
  const custom = activities.filter((a) => a.isCustom);

  if (isLoading) {
    return (
      <div className="flex gap-1.5 flex-wrap pb-1">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-7 w-20 rounded-full bg-slate-100 dark:bg-slate-800 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5 pb-1">
      {predefined.map((a) => {
        const active = selectedIds.includes(a.id);
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => toggle(a.id)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm whitespace-nowrap transition-all duration-150 ${
              active
                ? 'bg-violet-500 text-white ring-2 ring-violet-300 dark:ring-violet-700'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <span>{a.emoji}</span>
            <span className="capitalize">{a.name.replace(/_/g, ' ')}</span>
          </button>
        );
      })}

      {custom.length > 0 && (
        <>
          <div className="w-px h-7 bg-slate-200 dark:bg-slate-700 self-center mx-0.5" />
          {custom.map((a) => {
            const active = selectedIds.includes(a.id);
            const confirming = confirmDeleteId === a.id;
            return (
              <span key={a.id} className="inline-flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => { setConfirmDeleteId(null); toggle(a.id); }}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-l-full text-sm whitespace-nowrap transition-all duration-150 ${
                    active
                      ? 'bg-violet-500 text-white ring-2 ring-violet-300 dark:ring-violet-700'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{a.emoji}</span>
                  <span>{a.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  aria-label={confirming ? `Confirm delete ${a.name}` : `Delete ${a.name}`}
                  className={`px-1.5 py-1 rounded-r-full text-xs transition-all duration-150 ${
                    confirming
                      ? 'bg-red-500 text-white'
                      : active
                        ? 'bg-violet-500 text-violet-200 hover:bg-violet-600'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30'
                  }`}
                >
                  {confirming ? '✓' : '×'}
                </button>
              </span>
            );
          })}
        </>
      )}

      {!showNewForm ? (
        <button
          type="button"
          onClick={() => { setShowNewForm(true); setTimeout(() => nameInputRef.current?.focus(), 0); }}
          aria-label="Add custom activity"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 hover:border-violet-400 hover:text-violet-500 transition-all duration-150"
        >
          <span>+</span>
          <span>Custom</span>
        </button>
      ) : (
        <div className="flex items-center gap-1.5 flex-wrap">
          <input
            type="text"
            value={newEmoji}
            onChange={(e) => setNewEmoji(e.target.value)}
            maxLength={4}
            aria-label="Activity emoji"
            className="w-10 text-center px-1 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          <input
            ref={nameInputRef}
            type="text"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setAddError(null); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') { setShowNewForm(false); setNewName(''); setAddError(null); }
            }}
            maxLength={50}
            placeholder="Activity name"
            aria-label="New activity name"
            className="w-32 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newName.trim()}
            className="px-2 py-1 rounded-lg bg-violet-500 text-white text-sm disabled:opacity-40 hover:bg-violet-600 transition-colors"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => { setShowNewForm(false); setNewName(''); setAddError(null); }}
            className="px-2 py-1 rounded-lg text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Cancel
          </button>
          {addError && (
            <span className="text-xs text-red-500 w-full">{addError}</span>
          )}
        </div>
      )}
    </div>
  );
}
