export const INTERVAL_OPTIONS = [
  { label: '10 s', value: 10 },
  { label: '30 s', value: 30 },
  { label: '1 min', value: 60 },
  { label: '5 min', value: 300 },
];

interface DevicesSyncOptionsProps {
  peerSyncLanOnly: boolean;
  peerSyncIntervalSecs: number;
  onToggleLanOnly: () => void;
  onChangeInterval: (secs: number) => void;
}

export function DevicesSyncOptions({
  peerSyncLanOnly,
  peerSyncIntervalSecs,
  onToggleLanOnly,
  onChangeInterval,
}: DevicesSyncOptionsProps) {
  return (
    <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Sync Options
      </p>

      {/* LAN-only toggle */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">LAN-only mode</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Only auto-sync when the peer is on your local network (RFC-1918 address).
            Prevents accidental sync over VPN tunnels.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={peerSyncLanOnly}
          onClick={onToggleLanOnly}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
            peerSyncLanOnly ? 'bg-violet-600' : 'bg-slate-200 dark:bg-slate-700'
          }`}
        >
          <span className="sr-only">LAN-only mode</span>
          <span
            aria-hidden="true"
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
              peerSyncLanOnly ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Auto-sync interval */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Auto-sync interval</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Minimum time between automatic syncs per device.
          </p>
        </div>
        <select
          value={peerSyncIntervalSecs}
          onChange={(e) => onChangeInterval(Number(e.target.value))}
          className="text-sm px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
        >
          {INTERVAL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
