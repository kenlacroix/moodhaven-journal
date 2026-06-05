import { useState, useCallback } from 'react';
import { usePeerSyncStore } from '../../stores/peerSyncStore';
import { renameDevice } from '../../lib/services/peerDiscoveryService';
import { DeviceIcon } from './DeviceIconSet';
import type { DeviceIdentity } from '../../types/peerSync';

// ── Rename device inline form ─────────────────────────────────────────────────

function RenameForm({
  currentName,
  onSave,
  onCancel,
}: {
  currentName: string;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed) { setError('Name cannot be empty'); return; }
    if (trimmed.length > 64) { setError('Max 64 characters'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(trimmed);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') onCancel();
          }}
          maxLength={64}
          autoFocus
          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-violet-400 dark:border-violet-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          placeholder="e.g. Ken's MacBook"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ── This device card ──────────────────────────────────────────────────────────

export function ThisDeviceCard({ identity }: { identity: DeviceIdentity }) {
  const setIdentity = usePeerSyncStore((s) => s.setIdentity);
  const [renaming, setRenaming] = useState(false);

  const handleRename = useCallback(
    async (name: string) => {
      const updated = await renameDevice(name);
      setIdentity(updated);
      setRenaming(false);
    },
    [setIdentity]
  );

  return (
    <div className="p-4 rounded-xl bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800/40">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
        This Device
      </p>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400 flex-shrink-0">
          <DeviceIcon type={identity.deviceType} className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
              {identity.deviceName}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 capitalize flex-shrink-0">
              {identity.deviceType}
            </span>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">
            ID: {identity.deviceId} · port {42424}
          </p>
          {!renaming && (
            <button
              onClick={() => setRenaming(true)}
              className="mt-2 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-500 underline-offset-2 hover:underline transition-colors"
            >
              Rename
            </button>
          )}
        </div>
      </div>
      {renaming && (
        <RenameForm
          currentName={identity.deviceName}
          onSave={handleRename}
          onCancel={() => setRenaming(false)}
        />
      )}
    </div>
  );
}
