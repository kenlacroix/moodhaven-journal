/**
 * CloudSyncChip — compact sync status pill for the sidebar footer
 *
 * Only renders when storage.type === 'webdav'.
 * Shows last-sync time + opens an inline status panel above it.
 */

import { useState, useEffect, useRef } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';

// ── Relative time helper ──────────────────────────────────────────────────────

function relativeTime(isoStr: string | undefined): string {
  if (!isoStr) return 'Never synced';
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

function truncateUrl(url: string, maxLen = 28): string {
  try {
    const u = new URL(url);
    const host = u.host + (u.pathname !== '/' ? u.pathname : '');
    return host.length > maxLen ? host.slice(0, maxLen - 1) + '…' : host;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen - 1) + '…' : url;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface CloudSyncChipProps {
  collapsed: boolean;
  onOpenSettings: () => void;
}

export function CloudSyncChip({ collapsed, onOpenSettings }: CloudSyncChipProps) {
  const storage = useSettingsStore((s) => s.settings.storage);
  const [panelOpen, setPanelOpen] = useState(false);
  const [timeLabel, setTimeLabel] = useState(() => relativeTime(storage.lastSyncDate));
  const chipRef = useRef<HTMLDivElement>(null);

  // Refresh relative time every minute
  useEffect(() => {
    setTimeLabel(relativeTime(storage.lastSyncDate));
    const id = setInterval(() => setTimeLabel(relativeTime(storage.lastSyncDate)), 60_000);
    return () => clearInterval(id);
  }, [storage.lastSyncDate]);

  // Close panel on outside click
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: MouseEvent) => {
      if (chipRef.current && !chipRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [panelOpen]);

  if (storage.type !== 'webdav') return null;

  const dirIcon = storage.lastSyncDirection === 'upload' ? '↑' : storage.lastSyncDirection === 'download' ? '↓' : '';

  return (
    <div ref={chipRef} className="relative">
      {/* ── Status panel (positioned above chip) ── */}
      {panelOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-3 z-50">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
            WebDAV Sync
          </p>

          {/* URL */}
          <p className="text-xs text-slate-600 dark:text-slate-300 font-mono truncate mb-2">
            {storage.webdav.url ? truncateUrl(storage.webdav.url) : 'Not configured'}
          </p>

          {/* Last sync */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-3">
            <span className="text-slate-400">{dirIcon}</span>
            <span>{timeLabel}</span>
          </div>

          {/* Navigate to full sync controls */}
          <button
            type="button"
            onClick={() => { setPanelOpen(false); onOpenSettings(); }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/30 rounded-lg transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Sync settings
          </button>
        </div>
      )}

      {/* ── Chip button ── */}
      <button
        type="button"
        onClick={() => setPanelOpen((p) => !p)}
        title="WebDAV sync status"
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
          panelOpen
            ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
            : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300'
        }`}
      >
        {/* Cloud icon */}
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
        </svg>

        {!collapsed && (
          <span className="truncate whitespace-nowrap overflow-hidden transition-all duration-300">
            {timeLabel}
          </span>
        )}
      </button>
    </div>
  );
}
