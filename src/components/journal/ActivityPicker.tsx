import { useState } from 'react';
import type { Activity } from '../../types/activities';

interface ActivityPickerProps {
  activities: Activity[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onCreateCustom?: (name: string, emoji: string) => Promise<void>;
  onDeleteCustom?: (id: string) => Promise<void>;
  disabled?: boolean;
}

export function ActivityPicker({
  activities,
  selectedIds,
  onToggle,
  onCreateCustom,
  onDeleteCustom,
  disabled = false,
}: ActivityPickerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('✨');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim() || !onCreateCustom) return;
    setIsCreating(true);
    try {
      await onCreateCustom(newName.trim(), newEmoji);
      setNewName('');
      setNewEmoji('✨');
      setShowAddForm(false);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {activities.map((activity) => {
          const isSelected = selectedIds.includes(activity.id);
          return (
            <div key={activity.id} className="relative group">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onToggle(activity.id)}
                aria-pressed={isSelected}
                aria-label={`${isSelected ? 'Remove' : 'Add'} activity: ${activity.name}`}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-150 ${
                  isSelected
                    ? 'bg-emerald-500 text-white ring-2 ring-emerald-300 dark:ring-emerald-700'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                <span aria-hidden="true">{activity.emoji}</span>
                <span>{activity.name}</span>
              </button>
              {activity.isCustom && onDeleteCustom && (
                <button
                  type="button"
                  onClick={() => onDeleteCustom(activity.id)}
                  aria-label={`Delete custom activity: ${activity.name}`}
                  className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-slate-500 text-white text-xs leading-none hover:bg-red-500 transition-colors duration-150"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {onCreateCustom && !showAddForm && !disabled && (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            aria-label="Add custom activity"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-500 dark:hover:text-slate-400 transition-all duration-150"
          >
            <span aria-hidden="true">+</span>
            <span>Custom</span>
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            value={newEmoji}
            onChange={(e) => setNewEmoji(e.target.value)}
            maxLength={4}
            aria-label="Activity emoji"
            className="w-12 text-center px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') {
                setShowAddForm(false);
                setNewName('');
              }
            }}
            placeholder="Activity name"
            maxLength={64}
            autoFocus
            aria-label="New activity name"
            className="flex-1 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={!newName.trim() || isCreating}
            aria-label="Save new activity"
            className="px-3 py-1 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAddForm(false);
              setNewName('');
            }}
            aria-label="Cancel adding activity"
            className="px-3 py-1 rounded-lg text-slate-500 dark:text-slate-400 text-sm hover:text-slate-700 dark:hover:text-slate-200 transition-colors duration-150"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
