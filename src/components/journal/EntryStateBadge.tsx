/**
 * EntryStateBadge
 *
 * Inline badge that cycles through entry states on click:
 *   "Still thinking" → "Complete" → "Come back to this" → (repeat)
 *
 * Optimistic update: shows new state immediately, reverts on IPC failure.
 * Default when status is undefined/null: "Complete" (backwards compat).
 */

import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export type EntryStatus = 'thinking' | 'complete' | 'revisit';

interface EntryStateBadgeProps {
  entryId: string;
  status?: EntryStatus | null;
}

const STATUS_CYCLE: EntryStatus[] = ['thinking', 'complete', 'revisit'];

const STATUS_CONFIG: Record<EntryStatus, { label: string; className: string }> = {
  thinking: {
    label: 'Still thinking',
    className:
      'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/40',
  },
  complete: {
    label: 'Complete',
    className:
      'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40',
  },
  revisit: {
    label: 'Come back to this',
    className:
      'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/40',
  },
};

function normalizeStatus(status: EntryStatus | null | undefined): EntryStatus {
  if (status === 'thinking' || status === 'revisit') return status;
  return 'complete';
}

export function EntryStateBadge({ entryId, status }: EntryStateBadgeProps) {
  const [current, setCurrent] = useState<EntryStatus>(() => normalizeStatus(status));
  const [saving, setSaving] = useState(false);

  const config = STATUS_CONFIG[current];

  async function handleClick() {
    const idx = STATUS_CYCLE.indexOf(current);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];

    const prev = current;
    setCurrent(next); // optimistic
    setSaving(true);

    try {
      await invoke('patch_entry_status', { id: entryId, status: next });
    } catch {
      setCurrent(prev); // revert on failure
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={saving}
      aria-label={`Entry status: ${config.label}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors duration-150 disabled:opacity-60 ${config.className}`}
    >
      {config.label}
    </button>
  );
}
