import type { AppSettings, StorageBackend } from '../../../types/settings';
import { SettingSection } from '../SettingSection';
import { SettingSelect } from '../SettingSelect';
import { SettingInput } from '../SettingInput';
import { testConnection as testWebDAVConnection } from '../../../lib/services/webdavService';

interface SyncTabProps {
  settings: AppSettings;
  saveSettings: () => Promise<void>;
  setStorageType: (v: StorageBackend) => void;
  setWebDAVConfig: (patch: Partial<AppSettings['storage']['webdav']>) => void;
  setSyncMode: (v: 'manual' | 'on-open' | 'on-save') => void;
  setSyncIntervalMinutes: (v: number) => void;
}

export function SyncTab({
  settings,
  setStorageType,
  setWebDAVConfig,
  setSyncMode,
  setSyncIntervalMinutes,
}: SyncTabProps) {
  return (
    <div id="panel-sync" role="tabpanel" className="space-y-6">
      <SettingSection
        title="Cloud Sync"
        description="Sync entries across devices via a WebDAV server. Each entry is encrypted individually before upload."
      >
        <SettingSelect
          label="Storage backend"
          description="Where to store synced data"
          value={settings.storage.type}
          options={[
            { value: 'local', label: 'Local only' },
            { value: 'webdav', label: 'WebDAV' },
          ]}
          onChange={(v) => setStorageType(v as StorageBackend)}
        />

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
