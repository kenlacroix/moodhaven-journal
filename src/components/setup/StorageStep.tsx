import type { StorageBackend } from '../../types/settings';

interface StorageStepProps {
  onBack: () => void;
  onNext: () => void;
  storageType: StorageBackend;
  onStorageTypeChange: (type: StorageBackend) => void;
  webdavUrl: string;
  onWebdavUrlChange: (url: string) => void;
  enableLanSync: boolean;
  onEnableLanSyncChange: (enable: boolean) => void;
}

function StorageOption({
  title,
  description,
  icon,
  selected,
  onSelect,
  recommended,
  comingSoon,
}: {
  title: string;
  description: string;
  icon: string;
  selected: boolean;
  onSelect: () => void;
  recommended?: boolean;
  comingSoon?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={comingSoon}
      className={`
        w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-colors
        ${selected
          ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
        }
        ${comingSoon ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <div className={`
        w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0
        ${selected
          ? 'bg-violet-100 dark:bg-violet-900/30'
          : 'bg-slate-100 dark:bg-slate-700'
        }
      `}>
        <svg
          className={`w-5 h-5 ${selected ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`font-medium ${selected ? 'text-violet-700 dark:text-violet-300' : 'text-slate-700 dark:text-slate-200'}`}>
            {title}
          </p>
          {recommended && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded">
              Recommended
            </span>
          )}
          {comingSoon && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 rounded">
              Coming Soon
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      {selected && (
        <div className="w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center flex-shrink-0">
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </button>
  );
}

export function StorageStep({
  onBack,
  onNext,
  storageType,
  onStorageTypeChange,
  webdavUrl,
  onWebdavUrlChange,
  enableLanSync,
  onEnableLanSyncChange,
}: StorageStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">
          Choose Storage Location
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Where should your encrypted data be stored?
        </p>
      </div>

      <div className="space-y-3">
        <StorageOption
          title="Local Storage"
          description="Store data on this device only"
          icon="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          selected={storageType === 'local'}
          onSelect={() => onStorageTypeChange('local')}
          recommended
        />
        <StorageOption
          title="WebDAV"
          description="Sync encrypted backups to your own server or NAS"
          icon="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"
          selected={storageType === 'webdav'}
          onSelect={() => onStorageTypeChange('webdav')}
        />
      </div>

      {storageType === 'webdav' && (
        <div>
          <label htmlFor="webdavUrl" className="label">
            WebDAV URL
          </label>
          <input
            id="webdavUrl"
            type="url"
            value={webdavUrl}
            onChange={(e) => onWebdavUrlChange(e.target.value)}
            placeholder="https://your-server.com/webdav"
            className="input"
          />
        </div>
      )}

      {/* LAN Sync toggle */}
      <div className="p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-slate-700 dark:text-slate-200 text-sm">Local Network Sync</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Sync securely with your other devices on the same network</p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enableLanSync}
            onClick={() => onEnableLanSyncChange(!enableLanSync)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              enableLanSync ? 'bg-violet-500' : 'bg-slate-200 dark:bg-slate-600'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              enableLanSync ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
        {enableLanSync && (
          <p className="text-xs text-violet-600 dark:text-violet-400">
            You'll be able to pair with nearby devices in the next step.
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary flex-1 py-3"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="btn-primary flex-1 py-3"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
