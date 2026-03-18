/**
 * OuraConnectionCard
 *
 * Used in Settings → Health tab.
 * Guides the user through connecting their Oura ring via Personal Access Token.
 */

import { useState, useEffect } from 'react';
import { savePAT, disconnect, getStatus, syncToday, backfill } from '../../lib/ouraService';
import type { OuraStatusResponse } from '../../types/oura';

interface OuraConnectionCardProps {
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export function OuraConnectionCard({ onConnected, onDisconnected }: OuraConnectionCardProps) {
  const [status, setStatus] = useState<OuraStatusResponse | null>(null);
  const [pat, setPat] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    getStatus()
      .then(setStatus)
      .catch(() => {/* non-critical */});
  }, []);

  const handleConnect = async () => {
    if (!pat.trim()) {
      setError('Please enter your Personal Access Token');
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setIsSaving(true);
    try {
      await savePAT(pat.trim());
      // Prime the 7-day history so trend-aware prompts work immediately
      try { await backfill(7); } catch { /* non-critical */ }
      const newStatus = await getStatus();
      setStatus(newStatus);
      setPat('');
      setSuccessMsg('Connected! Loading 7-day history complete.');
      onConnected?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSync = async () => {
    setError(null);
    setIsSyncing(true);
    try {
      await syncToday();
      const newStatus = await getStatus();
      setStatus(newStatus);
      setSuccessMsg('Health data synced for today');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    setIsDisconnecting(true);
    try {
      await disconnect();
      setStatus({ connected: false, connectedAt: null, lastSyncAt: null });
      setSuccessMsg(null);
      onDisconnected?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const isConnected = status?.connected ?? false;

  return (
    <div className="space-y-4">
      {/* Connected state */}
      {isConnected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800">
            <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Connected to Oura Ring
              </p>
              {status?.lastSyncAt && (
                <p className="text-xs text-emerald-600/70 dark:text-emerald-500">
                  Last synced: {new Date(status.lastSyncAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-violet-500 hover:bg-violet-600 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSyncing ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Syncing…
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Sync Today's Data
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="px-3 py-2 text-sm font-medium rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors disabled:opacity-50"
            >
              {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        </div>
      ) : (
        /* Disconnected state — PAT entry */
        <div className="space-y-3">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400 space-y-2">
            <p className="font-medium text-slate-700 dark:text-slate-300">How to connect:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>
                Open{' '}
                <span className="font-mono text-violet-600 dark:text-violet-400">
                  cloud.ouraring.com/personal-access-tokens
                </span>{' '}
                in your browser
              </li>
              <li>Generate a new token and copy it</li>
              <li>Paste it below and click Connect</li>
            </ol>
          </div>

          <div className="flex gap-2">
            <input
              type="password"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleConnect(); }}
              placeholder="Paste your Personal Access Token…"
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            <button
              type="button"
              onClick={handleConnect}
              disabled={isSaving || !pat.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-violet-500 hover:bg-violet-600 text-white transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Connecting…' : 'Connect'}
            </button>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            40-character token from your Oura cloud dashboard — Personal Access Tokens page.
          </p>
        </div>
      )}

      {/* Feedback messages */}
      {error && (
        <p className="text-xs text-rose-500 dark:text-rose-400">{error}</p>
      )}
      {successMsg && !error && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">{successMsg}</p>
      )}
    </div>
  );
}
