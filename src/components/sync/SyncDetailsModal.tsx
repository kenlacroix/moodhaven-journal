/**
 * SyncDetailsModal — Centered overlay showing storage type, file path,
 * last-saved time, sync status, entry count, and upload/download actions.
 *
 * Triggered by the ☁ Sync icon in the Sidebar header.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { appDataDir } from '@tauri-apps/api/path';
import { useSettingsStore } from '../../stores/settingsStore';
import { getAllEntries } from '../../lib/journalService';
import { uploadBackup, downloadBackup } from '../../lib/cloudSyncService';
import type { SyncResult } from '../../lib/cloudSyncService';

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(isoStr: string | null | undefined): string {
  if (!isoStr) return 'Never';
  const ms = Date.now() - new Date(isoStr).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function absoluteTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Strip username:password from a WebDAV URL for display */
function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    u.username = '';
    u.password = '';
    return u.toString();
  } catch {
    return url;
  }
}

// ── Row helper ────────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-sm text-slate-500 dark:text-slate-400 flex-shrink-0">{label}</span>
      <span className="text-sm text-slate-700 dark:text-slate-200 text-right min-w-0">{children}</span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface SyncDetailsModalProps {
  onClose: () => void;
  onNavigateToSettings: () => void;
}

export function SyncDetailsModal({ onClose, onNavigateToSettings }: SyncDetailsModalProps) {
  const storage = useSettingsStore((s) => s.settings.storage);
  const lastAutoSaved = useSettingsStore((s) => s.lastAutoSaved);
  const setLastSyncDate = useSettingsStore((s) => s.setLastSyncDate);

  const [entryCount, setEntryCount] = useState<number | null>(null);
  const [dbPath, setDbPath] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<'upload' | 'download' | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [password, setPassword] = useState('');
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [pendingAction, setPendingAction] = useState<'upload' | 'download' | null>(null);

  const backdropRef = useRef<HTMLDivElement>(null);

  // Load entry count + DB path on mount
  useEffect(() => {
    getAllEntries()
      .then((entries) => setEntryCount(entries.length))
      .catch(() => setEntryCount(null));

    appDataDir()
      .then((dir) => {
        const sep = dir.includes('\\') ? '\\' : '/';
        const trimmed = dir.endsWith(sep) ? dir.slice(0, -1) : dir;
        setDbPath(`${trimmed}${sep}moodbloom.db`);
      })
      .catch(() => setDbPath(null));
  }, []);

  // Close on backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSyncAction = useCallback(async (action: 'upload' | 'download') => {
    if (!password.trim()) {
      setPendingAction(action);
      setShowPasswordField(true);
      return;
    }

    setIsSyncing(action);
    setSyncResult(null);

    try {
      const result = action === 'upload'
        ? await uploadBackup(password, storage.webdav)
        : await downloadBackup(password, storage.webdav);

      setSyncResult(result);
      if (result.success && result.timestamp) {
        setLastSyncDate(result.timestamp, action);
        await useSettingsStore.getState().saveSettings();
      }
    } finally {
      setIsSyncing(null);
      setPassword('');
      setShowPasswordField(false);
      setPendingAction(null);
    }
  }, [password, storage.webdav, setLastSyncDate]);

  const handlePasswordSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingAction) await handleSyncAction(pendingAction);
  }, [pendingAction, handleSyncAction]);

  const isWebDAV = storage.type === 'webdav';
  const isConfigured = isWebDAV && storage.webdav.url.trim().length > 0;
  const dirIcon = storage.lastSyncDirection === 'upload' ? '↑' : storage.lastSyncDirection === 'download' ? '↓' : '';

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <div className="w-[500px] max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Storage &amp; Sync</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3.5">

          {/* Storage type */}
          <Row label="Storage">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              isWebDAV
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}>
              {isWebDAV ? (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
                  </svg>
                  WebDAV
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 7.409A2.25 2.25 0 012.25 5.493V5.25" />
                  </svg>
                  Local only
                </>
              )}
            </span>
          </Row>

          {/* DB file path (local only) */}
          {!isWebDAV && (
            <Row label="Database">
              {dbPath ? (
                <span
                  className="font-mono text-xs text-slate-500 dark:text-slate-400 break-all"
                  title={dbPath}
                >
                  {dbPath}
                </span>
              ) : (
                <span className="inline-block w-48 h-3 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
              )}
            </Row>
          )}

          {/* WebDAV server URL */}
          {isWebDAV && storage.webdav.url && (
            <Row label="Server">
              <span
                className="font-mono text-xs text-slate-500 dark:text-slate-400 break-all"
                title={maskUrl(storage.webdav.url)}
              >
                {maskUrl(storage.webdav.url)}
              </span>
            </Row>
          )}

          {/* Divider */}
          <div className="h-px bg-slate-100 dark:bg-slate-800" />

          {/* Entry count */}
          <Row label="Entries">
            {entryCount === null ? (
              <span className="inline-block w-8 h-3 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            ) : (
              <span className="font-medium">{entryCount}</span>
            )}
          </Row>

          {/* Last auto-saved */}
          <Row label="Last saved">
            {lastAutoSaved ? (
              <span title={new Date(lastAutoSaved).toLocaleString()}>
                {absoluteTime(lastAutoSaved)}{' '}
                <span className="text-slate-400 dark:text-slate-500">· {relativeTime(lastAutoSaved)}</span>
              </span>
            ) : (
              <span className="text-slate-400 dark:text-slate-500">Not yet saved this session</span>
            )}
          </Row>

          {/* Last synced (WebDAV only) */}
          {isWebDAV && (
            <Row label="Last synced">
              <span className="flex items-center gap-1.5 justify-end">
                {dirIcon && <span className="text-slate-400">{dirIcon}</span>}
                <span>
                  {storage.lastSyncDate ? (
                    <>
                      {absoluteTime(storage.lastSyncDate)}{' '}
                      <span className="text-slate-400 dark:text-slate-500">· {relativeTime(storage.lastSyncDate)}</span>
                    </>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500">Never synced</span>
                  )}
                </span>
              </span>
            </Row>
          )}

          {/* Sync result feedback */}
          {syncResult && (
            <div className={`rounded-lg px-3 py-2.5 text-sm ${
              syncResult.success
                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300'
            }`}>
              {syncResult.success ? (
                <>
                  <span className="font-medium">Success</span>
                  {syncResult.entriesCount !== undefined && (
                    <span> · {syncResult.entriesCount} entries imported</span>
                  )}
                  {syncResult.filename && (
                    <span className="opacity-75"> · {syncResult.filename}</span>
                  )}
                </>
              ) : (
                <span>{syncResult.error}</span>
              )}
            </div>
          )}

          {/* Password field (shown on demand) */}
          {showPasswordField && (
            <form onSubmit={handlePasswordSubmit} className="space-y-2">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                Enter your journal password to {pendingAction === 'upload' ? 'encrypt the backup' : 'decrypt the backup'}
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Journal password"
                  autoFocus
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400"
                />
                <button
                  type="submit"
                  disabled={!password.trim() || isSyncing !== null}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-violet-500 hover:bg-violet-600 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {isSyncing ? (
                    <span className="w-3.5 h-3.5 border border-white/50 border-t-white rounded-full animate-spin inline-block" />
                  ) : 'Go'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowPasswordField(false); setPendingAction(null); setPassword(''); }}
                  className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* WebDAV actions */}
          {isConfigured && !showPasswordField && (
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleSyncAction('upload')}
                disabled={isSyncing !== null}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {isSyncing === 'upload' ? (
                  <span className="w-3.5 h-3.5 border border-slate-400 border-t-violet-500 rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                )}
                Upload backup
              </button>
              <button
                type="button"
                onClick={() => handleSyncAction('download')}
                disabled={isSyncing !== null}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {isSyncing === 'download' ? (
                  <span className="w-3.5 h-3.5 border border-slate-400 border-t-violet-500 rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                )}
                Download latest
              </button>
            </div>
          )}

          {/* Not configured hint */}
          {isWebDAV && !isConfigured && (
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
              Configure WebDAV in Settings to enable cloud sync.
            </p>
          )}

          {/* Settings link */}
          <button
            type="button"
            onClick={() => { onClose(); onNavigateToSettings(); }}
            className="w-full text-xs text-slate-400 dark:text-slate-500 hover:text-violet-500 dark:hover:text-violet-400 transition-colors py-1"
          >
            Open sync settings →
          </button>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
          <svg className="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            Data is encrypted locally (AES-256-GCM). Backups are encrypted before upload — the server never sees plaintext.
          </span>
        </div>
      </div>
    </div>
  );
}
