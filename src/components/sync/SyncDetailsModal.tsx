/**
 * SyncDetailsModal — Storage status + per-entry WebDAV sync.
 *
 * "Sync Now" runs the granular per-entry engine (syncEngine.ts).
 * Point-in-time blob export/import lives in Settings → Data tab.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { usePlatform } from '../../hooks/usePlatform';
import { useAppStore } from '../../stores/appStore';
import { usePeerSyncStore } from '../../stores/peerSyncStore';
import { getAllEntries } from '../../lib/services/journalService';
import { syncWithWebDAV, type SyncProgress } from '../../lib/services/syncEngine';
import { getDeviceName, setDeviceName as persistDeviceName } from '../../lib/services/deviceIdentity';
import { startDiscovery } from '../../lib/services/peerDiscoveryService';
import { peerSyncNow } from '../../lib/services/peerSyncEngineService';
import { revokeDevice } from '../../lib/services/peerPairingService';
import { PairingModal } from '../peer-sync/PairingModal';
import type { DiscoveredPeer } from '../../types/peerSync';

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
  return `${Math.floor(hours / 24)}d ago`;
}

function absoluteTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

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
  const { isBrowser, canPeerSync } = usePlatform();
  const storage = useSettingsStore((s) => s.settings.storage);
  const syncSettings = useSettingsStore((s) => s.settings.sync);
  const lastAutoSaved = useSettingsStore((s) => s.lastAutoSaved);
  const setLastSyncDate = useSettingsStore((s) => s.setLastSyncDate);
  const setSyncResult = useSettingsStore((s) => s.setSyncResult);
  const setPeerSyncEnabled = useSettingsStore((s) => s.setPeerSyncEnabled);
  const peerSyncEnabled = syncSettings.peerSyncEnabled;

  const nearbyPeers = usePeerSyncStore((s) => s.nearbyPeers);
  const trustedDevices = usePeerSyncStore((s) => s.trustedDevices);
  const isDiscovering = usePeerSyncStore((s) => s.isDiscovering);
  const removeTrusted = usePeerSyncStore((s) => s.removeTrusted);
  const markPeerUntrusted = usePeerSyncStore((s) => s.markPeerUntrusted);

  const [pairingPeer, setPairingPeer] = useState<DiscoveredPeer | null>(null);
  const [entryCount, setEntryCount] = useState<number | null>(null);
  const [dbPath, setDbPath] = useState<string | null>(null);

  const sessionPassword = useAppStore((s) => s.sessionPassword);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncOutcome, setSyncOutcome] = useState<{ pulled: number; pushed: number; error?: string } | null>(null);

  const [deviceName, setDeviceName] = useState('');
  const [deviceNameDirty, setDeviceNameDirty] = useState(false);

  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAllEntries().then((e) => setEntryCount(e.length)).catch(() => setEntryCount(null));
    if (!isBrowser) {
      import('@tauri-apps/api/path').then(({ appDataDir }) =>
        appDataDir().then((dir) => {
          const sep = dir.includes('\\') ? '\\' : '/';
          const trimmed = dir.endsWith(sep) ? dir.slice(0, -1) : dir;
          setDbPath(`${trimmed}${sep}moodhaven.db`);
        })
      ).catch(() => setDbPath(null));
    }
    getDeviceName().then(setDeviceName).catch(() => {});
  }, [isBrowser]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const runSync = useCallback(async () => {
    if (!sessionPassword) return;
    setIsSyncing(true);
    setSyncOutcome(null);
    setSyncProgress(null);
    try {
      const result = await syncWithWebDAV(storage.webdav, sessionPassword, setSyncProgress);
      setSyncOutcome({ pulled: result.pulled, pushed: result.pushed, error: result.error });
      if (result.success) {
        setSyncResult({ at: result.syncedAt, success: true, pulled: result.pulled, pushed: result.pushed });
        setLastSyncDate(result.syncedAt, 'upload');
        await useSettingsStore.getState().saveSettings();
      }
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  }, [storage.webdav, sessionPassword, setLastSyncDate, setSyncResult]);

  const isWebDAV = storage.type === 'webdav';
  const isConfigured = isWebDAV && storage.webdav.url.trim().length > 0;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <div className="w-[480px] max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">

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

          {/* DB path (local) */}
          {!isWebDAV && (
            <Row label="Database">
              {dbPath
                ? <span className="font-mono text-xs text-slate-500 dark:text-slate-400 break-all">{dbPath}</span>
                : <span className="inline-block w-48 h-3 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />}
            </Row>
          )}

          {/* WebDAV URL */}
          {isWebDAV && storage.webdav.url && (
            <Row label="Server">
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400 break-all">
                {maskUrl(storage.webdav.url)}
              </span>
            </Row>
          )}

          <div className="h-px bg-slate-100 dark:bg-slate-800" />

          {/* Entry count */}
          <Row label="Entries">
            {entryCount === null
              ? <span className="inline-block w-8 h-3 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
              : <span className="font-medium">{entryCount}</span>}
          </Row>

          {/* Last saved */}
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

          {/* Last synced */}
          {isWebDAV && (
            <Row label="Last synced">
              {syncSettings.lastSyncAt ? (
                <span>
                  {absoluteTime(syncSettings.lastSyncAt)}{' '}
                  <span className="text-slate-400 dark:text-slate-500">· {relativeTime(syncSettings.lastSyncAt)}</span>
                  {syncSettings.lastSyncResult === 'success' && (
                    <span className="ml-1.5 text-emerald-500">✓</span>
                  )}
                </span>
              ) : (
                <span className="text-slate-400 dark:text-slate-500">Never synced</span>
              )}
            </Row>
          )}

          {/* WebDAV sync panel */}
          {isConfigured && (
            <div className="space-y-2.5 pt-1">

              {/* Device name */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0 w-20">This device</span>
                <input
                  type="text"
                  value={deviceName}
                  onChange={(e) => { setDeviceName(e.target.value); setDeviceNameDirty(true); }}
                  onBlur={async () => {
                    if (deviceNameDirty && deviceName.trim()) {
                      await persistDeviceName(deviceName.trim());
                      useSettingsStore.getState().setSyncDeviceName(deviceName.trim());
                      await useSettingsStore.getState().saveSettings();
                      setDeviceNameDirty(false);
                    }
                  }}
                  placeholder="e.g. Ken's Desktop"
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                />
              </div>

              {/* Progress */}
              {isSyncing && syncProgress && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 border border-violet-400 border-t-violet-600 rounded-full animate-spin flex-shrink-0" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">{syncProgress.message}</span>
                  </div>
                  {syncProgress.total > 0 && (
                    <div className="h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.round(((syncProgress.pulled + syncProgress.pushed) / syncProgress.total) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Outcome */}
              {syncOutcome && !isSyncing && (
                <div className={`text-xs rounded-lg px-3 py-2 ${
                  syncOutcome.error
                    ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'
                    : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                }`}>
                  {syncOutcome.error
                    ? syncOutcome.error
                    : `Synced — ↓ ${syncOutcome.pulled} pulled · ↑ ${syncOutcome.pushed} pushed`}
                </div>
              )}

              {/* Sync Now button */}
              <button
                type="button"
                onClick={runSync}
                disabled={isSyncing || !sessionPassword}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 transition-colors"
              >
                {isSyncing ? (
                  <span className="w-4 h-4 border border-white/50 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                )}
                {isSyncing ? 'Syncing…' : 'Sync Now'}
              </button>
            </div>
          )}

          {/* Not configured hint */}
          {isWebDAV && !isConfigured && (
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
              Configure WebDAV in Settings to enable sync.
            </p>
          )}

          {/* LAN Sync section — desktop + Android only */}
          {canPeerSync && (
          <>
          <div className="h-px bg-slate-100 dark:bg-slate-800" />
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
                </svg>
                Local Network Sync
              </span>
              {peerSyncEnabled && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {isDiscovering && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                  {isDiscovering ? 'Scanning' : 'On'}
                </span>
              )}
            </div>

            {!peerSyncEnabled ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Local Network Sync is disabled. Enable it to discover and sync with devices on your network.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPeerSyncEnabled(true);
                    startDiscovery().catch(() => {});
                    useSettingsStore.getState().saveSettings().catch(() => {});
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border border-violet-300 dark:border-violet-600 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                >
                  Enable LAN Sync
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Nearby devices */}
                {nearbyPeers.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Nearby Devices</p>
                    {nearbyPeers.map((peer) => {
                      const trusted = trustedDevices.some((d) => d.deviceId === peer.deviceId);
                      return (
                        <div key={peer.deviceId} className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-800">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${peer.isOnline ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'}`} />
                          <span className="flex-1 text-xs text-slate-700 dark:text-slate-200 truncate">{peer.deviceName}</span>
                          {trusted ? (
                            <span className="text-xs text-emerald-500">Paired</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setPairingPeer(peer)}
                              className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
                            >
                              Pair
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Paired devices */}
                {trustedDevices.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Paired Devices</p>
                    {trustedDevices.map((device) => {
                      const nearby = nearbyPeers.find((p) => p.deviceId === device.deviceId);
                      return (
                        <div key={device.deviceId} className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-800">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${nearby?.isOnline ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'}`} />
                          <span className="flex-1 text-xs text-slate-700 dark:text-slate-200 truncate">{device.deviceName}</span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {nearby && (
                              <button
                                type="button"
                                onClick={() => peerSyncNow(device.deviceId, nearby.host).catch(() => {})}
                                className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
                              >
                                Sync
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                await revokeDevice(device.deviceId).catch(() => {});
                                removeTrusted(device.deviceId);
                                markPeerUntrusted(device.deviceId);
                              }}
                              className="text-xs text-rose-500 hover:underline"
                            >
                              Revoke
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {nearbyPeers.length === 0 && trustedDevices.length === 0 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    No devices found. Make sure other devices are on the same network.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Pairing modal */}
          {pairingPeer && (
            <PairingModal
              peer={pairingPeer}
              onClose={() => setPairingPeer(null)}
            />
          )}
          </>
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
            Each entry is encrypted individually (AES-256-GCM) — the server never sees plaintext.
          </span>
        </div>
      </div>
    </div>
  );
}
