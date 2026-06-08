import { useState, useCallback } from 'react';
import type { AppSettings, StorageBackend } from '../../../types/settings';
import { SettingSection } from '../SettingSection';
import { SettingSelect } from '../SettingSelect';
import { SettingInput } from '../SettingInput';
import { testConnection as testWebDAVConnection } from '../../../lib/services/webdavService';
import {
  cloudProviderAuthStart,
  cloudProviderDisconnect,
  syncUpload,
  syncDownload,
} from '../../../lib/services/cloudProvidersService';
import {
  pickSyncFolder,
  byoCloudUpload,
  byoCloudDownload,
} from '../../../lib/services/byoCloudService';
import { getSessionPassword } from '../../../lib/services/journalService';

interface SyncTabProps {
  settings: AppSettings;
  saveSettings: () => Promise<void>;
  setStorageType: (v: StorageBackend) => void;
  setWebDAVConfig: (patch: Partial<AppSettings['storage']['webdav']>) => void;
  setSyncMode: (v: 'manual' | 'on-open' | 'on-save') => void;
  setSyncIntervalMinutes: (v: number) => void;
  setByoCloudFolder: (folderPath: string | null) => void;
  setByoCloudLastSync: (date: string) => void;
}

export function SyncTab({
  settings,
  saveSettings,
  setStorageType,
  setWebDAVConfig,
  setSyncMode,
  setSyncIntervalMinutes,
  setByoCloudFolder,
  setByoCloudLastSync,
}: SyncTabProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ text: string; error: boolean } | null>(null);

  const clearMessage = useCallback(() => setSyncMessage(null), []);

  const handleConnect = useCallback(
    async (provider: 'dropbox' | 'gdrive') => {
      setIsConnecting(true);
      setSyncMessage(null);
      try {
        await cloudProviderAuthStart(provider);
      } catch (e) {
        setSyncMessage({
          text: e instanceof Error ? e.message : 'Connection failed',
          error: true,
        });
      } finally {
        setIsConnecting(false);
      }
    },
    [],
  );

  const handleDisconnect = useCallback(
    async (provider: 'dropbox' | 'gdrive') => {
      setSyncMessage(null);
      try {
        await cloudProviderDisconnect(provider);
      } catch (e) {
        setSyncMessage({
          text: e instanceof Error ? e.message : 'Disconnect failed',
          error: true,
        });
      }
    },
    [],
  );

  const handleUpload = useCallback(
    async (provider: 'dropbox' | 'gdrive') => {
      const password = getSessionPassword();
      if (!password) {
        setSyncMessage({ text: 'Session not unlocked', error: true });
        return;
      }
      setIsSyncing(true);
      setSyncMessage(null);
      const result = await syncUpload(provider, password);
      setIsSyncing(false);
      setSyncMessage(
        result.success
          ? { text: 'Upload complete', error: false }
          : { text: result.error ?? 'Upload failed', error: true },
      );
    },
    [],
  );

  const handleDownload = useCallback(
    async (provider: 'dropbox' | 'gdrive') => {
      const password = getSessionPassword();
      if (!password) {
        setSyncMessage({ text: 'Session not unlocked', error: true });
        return;
      }
      setIsSyncing(true);
      setSyncMessage(null);
      const result = await syncDownload(provider, password);
      setIsSyncing(false);
      setSyncMessage(
        result.success
          ? {
              text: `Download complete${result.entriesCount !== undefined ? ` — ${result.entriesCount} entries` : ''}`,
              error: false,
            }
          : { text: result.error ?? 'Download failed', error: true },
      );
    },
    [],
  );

  const byoFolder = settings.storage.byocloud?.folderPath ?? null;
  const byoLastSync = settings.storage.byocloud?.lastSyncAt ?? null;

  const handlePickFolder = useCallback(async () => {
    setSyncMessage(null);
    try {
      const folder = await pickSyncFolder();
      if (!folder) return; // cancelled
      setByoCloudFolder(folder);
      await saveSettings();
    } catch (e) {
      setSyncMessage({ text: e instanceof Error ? e.message : 'Could not select folder', error: true });
    }
  }, [setByoCloudFolder, saveSettings]);

  const handleByoSync = useCallback(
    async (direction: 'upload' | 'download') => {
      if (!byoFolder) {
        setSyncMessage({ text: 'Choose a sync folder first', error: true });
        return;
      }
      const password = getSessionPassword();
      if (!password) {
        setSyncMessage({ text: 'Session not unlocked', error: true });
        return;
      }
      setIsSyncing(true);
      setSyncMessage(null);
      const result =
        direction === 'upload'
          ? await byoCloudUpload(password, byoFolder)
          : await byoCloudDownload(password, byoFolder);
      setIsSyncing(false);
      if (result.success) {
        setByoCloudLastSync(new Date().toISOString());
        void saveSettings();
        setSyncMessage({
          text:
            direction === 'upload'
              ? 'Backup written to sync folder'
              : `Imported${result.entriesCount !== undefined ? ` — ${result.entriesCount} entries` : ''}`,
          error: false,
        });
      } else {
        setSyncMessage({ text: result.error ?? 'Sync failed', error: true });
      }
    },
    [byoFolder, setByoCloudLastSync, saveSettings],
  );

  const providerLabel = settings.storage.type === 'dropbox' ? 'Dropbox' : 'Google Drive';
  const cloudProviderKey = settings.storage.type === 'dropbox' || settings.storage.type === 'gdrive'
    ? settings.storage.type
    : null;
  const providerStatus = cloudProviderKey
    ? settings.storage.cloudProviders[cloudProviderKey]
    : null;

  return (
    <div id="panel-sync" role="tabpanel" aria-labelledby="tab-sync" className="space-y-6">
      <SettingSection
        title="Cloud Sync"
        description="Back up your encrypted journal across devices. All data is encrypted before upload — your cloud provider never sees your journal content."
      >
        <SettingSelect
          label="Storage backend"
          description="Where to store synced data"
          value={settings.storage.type}
          options={[
            { value: 'local', label: 'Local only' },
            { value: 'byocloud', label: 'Sync folder (iCloud/Drive/Dropbox)' },
            { value: 'dropbox', label: 'Dropbox' },
            { value: 'gdrive', label: 'Google Drive' },
            { value: 'webdav', label: 'WebDAV' },
          ]}
          onChange={(v) => setStorageType(v as StorageBackend)}
        />

        {settings.storage.type === 'local' && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Your journal is stored locally only. Connect a sync provider to back up across devices.
          </p>
        )}

        {settings.storage.type === 'byocloud' && (
          <div className="space-y-3">
            {/* Folder status */}
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Sync folder</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {byoFolder ?? 'No folder selected'}
                </p>
                {byoLastSync && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    Last synced {new Date(byoLastSync).toLocaleString()}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void handlePickFolder()}
                className="shrink-0 px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors"
              >
                {byoFolder ? 'Change…' : 'Choose folder…'}
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isSyncing || !byoFolder}
                onClick={() => { clearMessage(); void handleByoSync('upload'); }}
                className="px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors disabled:opacity-50"
              >
                {isSyncing ? 'Syncing…' : 'Back up now'}
              </button>
              <button
                type="button"
                disabled={isSyncing || !byoFolder}
                onClick={() => { clearMessage(); void handleByoSync('download'); }}
                className="px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors disabled:opacity-50"
              >
                {isSyncing ? 'Syncing…' : 'Restore from folder'}
              </button>
            </div>

            {/* Inline status message */}
            {syncMessage && (
              <p
                className={`text-xs ${
                  syncMessage.error
                    ? 'text-rose-500 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {syncMessage.text}
              </p>
            )}

            <p className="text-xs text-slate-400 dark:text-slate-500">
              Pick a folder inside a service that already syncs to the cloud (iCloud Drive, Google
              Drive, Dropbox, OneDrive). Your backup is encrypted on this device before it's written —
              the cloud provider only ever sees ciphertext.
            </p>
          </div>
        )}

        {(settings.storage.type === 'dropbox' || settings.storage.type === 'gdrive') && (
          <div className="space-y-3">
            {/* Connection status */}
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {providerLabel} status
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {providerStatus?.connected
                    ? providerStatus.lastSyncAt
                      ? `Last synced ${new Date(providerStatus.lastSyncAt).toLocaleString()}`
                      : 'Connected'
                    : 'Not connected'}
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  providerStatus?.connected
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    providerStatus?.connected ? 'bg-emerald-500' : 'bg-slate-400'
                  }`}
                />
                {providerStatus?.connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {providerStatus?.connected ? (
                <>
                  <button
                    type="button"
                    disabled={isSyncing}
                    onClick={() => { clearMessage(); void handleUpload(cloudProviderKey!); }}
                    className="px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors disabled:opacity-50"
                  >
                    {isSyncing ? 'Syncing…' : 'Upload'}
                  </button>
                  <button
                    type="button"
                    disabled={isSyncing}
                    onClick={() => { clearMessage(); void handleDownload(cloudProviderKey!); }}
                    className="px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors disabled:opacity-50"
                  >
                    {isSyncing ? 'Syncing…' : 'Download'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { clearMessage(); void handleDisconnect(cloudProviderKey!); }}
                    className="px-3 py-1.5 text-sm font-medium text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/30 rounded-lg hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={isConnecting}
                  onClick={() => void handleConnect(cloudProviderKey!)}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50"
                >
                  {isConnecting ? 'Connecting…' : `Connect ${providerLabel}`}
                </button>
              )}
            </div>

            {/* Inline status message */}
            {syncMessage && (
              <p
                className={`text-xs ${
                  syncMessage.error
                    ? 'text-rose-500 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {syncMessage.text}
              </p>
            )}

            <p className="text-xs text-slate-400 dark:text-slate-500">
              Encrypts backup before upload — your {providerLabel} account never sees your journal content.
            </p>
          </div>
        )}

        {settings.storage.type === 'webdav' && (
          <>
            <SettingInput
              label="WebDAV URL"
              description="Full URL to your WebDAV directory"
              value={settings.storage.webdav.url}
              onChange={(v) => setWebDAVConfig({ url: v })}
              placeholder="https://cloud.example.com/remote.php/dav/files/user/"
              type="url"
              onTest={async () => {
                const result = await testWebDAVConnection(settings.storage.webdav);
                return { valid: result.success, error: result.error };
              }}
            />

            <SettingInput
              label="Username"
              description="WebDAV login username"
              value={settings.storage.webdav.username}
              onChange={(v) => setWebDAVConfig({ username: v })}
              placeholder="username"
            />

            <SettingInput
              label="Password"
              description="WebDAV login password"
              value={settings.storage.webdav.password}
              onChange={(v) => setWebDAVConfig({ password: v })}
              placeholder="password"
              type="password"
            />

            <SettingSelect
              label="Sync on open"
              description="Automatically sync once each time the app unlocks"
              value={settings.sync.syncMode}
              options={[
                { value: 'manual', label: 'Off' },
                { value: 'on-open', label: 'On' },
              ]}
              onChange={(v) => setSyncMode(v as 'manual' | 'on-open' | 'on-save')}
            />

            <SettingSelect
              label="Sync every"
              description="Background sync runs silently while the app is unlocked — no password prompt needed"
              value={String(settings.sync.syncIntervalMinutes ?? 0)}
              options={[
                { value: '0', label: 'Off' },
                { value: '5', label: '5 minutes' },
                { value: '15', label: '15 minutes' },
                { value: '30', label: '30 minutes' },
                { value: '60', label: '1 hour' },
              ]}
              onChange={(v) => setSyncIntervalMinutes(Number(v))}
            />

            <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Last sync</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {settings.sync.lastSyncAt
                      ? new Date(settings.sync.lastSyncAt).toLocaleString()
                      : 'Never synced'}
                    {settings.sync.lastSyncResult === 'error' && (
                      <span className="ml-1 text-rose-500 dark:text-rose-400">· Error</span>
                    )}
                  </p>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Use the sync icon in the sidebar to sync now
                </p>
              </div>
            </div>
          </>
        )}
      </SettingSection>
    </div>
  );
}
