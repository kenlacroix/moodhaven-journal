/**
 * UpdatePanel — full update UI shown in Settings → About tab.
 *
 * States it handles:
 *   checking      — spinner while HTTP request is in flight
 *   up-to-date    — green badge, "MoodHaven Journal is up to date"
 *   available     — changelog card + download button
 *   downloading   — progress bar with byte counter
 *   verifying     — brief "Verifying…" state
 *   ready         — "Verified. Installer launched / Restart to finish."
 *   error         — red box with message + retry
 *   private-repo  — friendly note when GitHub returns no releases
 *   no-self-update — platform cannot self-update (Android etc.)
 */

import { useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-shell';
import { downloadAndInstallUpdate } from '../../lib/services/updaterService';
import { useSettingsStore } from '../../stores/settingsStore';
import type { UseUpdateCheckReturn } from '../../hooks/useUpdateCheck';

// ── Minimal inline markdown → HTML renderer ───────────────────────────────────
// Handles: ## headings, **bold**, `code`, - bullet lists, blank line → <p>
// This avoids adding a markdown library dependency.
function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inList = false;

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs font-mono">$1</code>');

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.startsWith('### ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-3 mb-1">${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h2 class="text-base font-bold text-slate-800 dark:text-slate-100 mt-4 mb-1.5">${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h1 class="text-lg font-bold text-slate-800 dark:text-slate-100 mt-4 mb-2">${inline(line.slice(2))}</h1>`);
    } else if (/^[-*] /.test(line)) {
      if (!inList) { out.push('<ul class="list-disc list-inside space-y-0.5 text-sm text-slate-600 dark:text-slate-300 mb-2">'); inList = true; }
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (line === '') {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('<div class="h-2" />');
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p class="text-sm text-slate-600 dark:text-slate-300 mb-1">${inline(line)}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}

// ── Download progress event shape (mirrors Rust DownloadProgress) ─────────────
interface ProgressPayload {
  downloaded: number;
  total: number;
  percent: number;
}
interface FinishedPayload {
  success: boolean;
  message: string;
  /** false when checksums.txt was absent and SHA-256 was skipped */
  checksum_verified?: boolean;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ color, children }: { color: 'green' | 'violet' | 'slate' | 'red'; children: React.ReactNode }) {
  const cls = {
    green:  'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    violet: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800',
    slate:  'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    red:    'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800',
  }[color];
  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${cls}`}>
      {children}
    </div>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
      <div
        className="h-2 bg-violet-500 rounded-full transition-all duration-300"
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface UpdatePanelProps {
  hook: UseUpdateCheckReturn;
  currentVersion: string;
}

type InstallPhase = 'idle' | 'downloading' | 'verifying' | 'ready' | 'error';

export function UpdatePanel({ hook, currentVersion }: UpdatePanelProps) {
  const { updateInfo, isChecking, checkError, checkNow, skipVersion } = hook;
  const autoCheck = useSettingsStore((s) => s.settings.updates.autoCheck);
  const setAutoCheck = useSettingsStore((s) => s.setUpdateAutoCheck);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const lastChecked = useSettingsStore((s) => s.settings.updates.lastChecked);

  const [phase, setPhase] = useState<InstallPhase>('idle');
  const [progress, setProgress] = useState<ProgressPayload>({ downloaded: 0, total: 0, percent: 0 });
  const [installMessage, setInstallMessage] = useState('');
  const [installError, setInstallError] = useState('');
  const [checksumVerified, setChecksumVerified] = useState<boolean | null>(null);

  // Listen to Rust progress/finished events
  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenFinished: (() => void) | undefined;

    listen<ProgressPayload>('update-progress', (e) => {
      setProgress(e.payload);
      setPhase('downloading');
    }).then((fn) => { unlistenProgress = fn; });

    listen<FinishedPayload>('update-finished', (e) => {
      if (e.payload.success) {
        setPhase('ready');
        setInstallMessage(e.payload.message);
        setChecksumVerified(e.payload.checksum_verified ?? null);
      } else {
        setPhase('error');
        setInstallError(e.payload.message);
        setChecksumVerified(null);
      }
    }).then((fn) => { unlistenFinished = fn; });

    return () => {
      unlistenProgress?.();
      unlistenFinished?.();
    };
  }, []);

  const handleDownload = useCallback(async () => {
    if (!updateInfo?.asset) return;
    setPhase('downloading');
    setInstallError('');
    try {
      await downloadAndInstallUpdate(updateInfo.asset);
      // "update-finished" event will fire; phase transitions there
    } catch (e) {
      setPhase('error');
      setInstallError(e instanceof Error ? e.message : String(e));
    }
  }, [updateInfo]);

  const handleOpenReleasePage = useCallback(() => {
    if (updateInfo?.release_url) {
      void open(updateInfo.release_url);
    }
  }, [updateInfo]);

  const formatBytes = (b: number) =>
    b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch { return iso; }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Checking spinner ── */}
      {isChecking && (
        <StatusBadge color="slate">
          <svg className="w-4 h-4 animate-spin flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 12h4z"/>
          </svg>
          <span className="text-sm">Checking for updates…</span>
        </StatusBadge>
      )}

      {/* ── Check error ── */}
      {!isChecking && checkError && (
        <StatusBadge color="red">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Could not check for updates</p>
            <p className="text-xs mt-0.5 opacity-80 break-words">{checkError}</p>
            {checkError.includes('404') && (
              <p className="text-xs mt-1 opacity-70">
                The repository may be private or has no releases yet.
              </p>
            )}
          </div>
        </StatusBadge>
      )}

      {/* ── Up to date ── */}
      {!isChecking && !checkError && updateInfo && !updateInfo.is_available && (
        <StatusBadge color="green">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div>
            <p className="text-sm font-medium">MoodHaven Journal is up to date</p>
            <p className="text-xs mt-0.5 opacity-70">
              v{currentVersion}
              {updateInfo.version !== currentVersion && updateInfo.version
                ? ` — latest is ${updateInfo.version}`
                : ' is the latest release'}
            </p>
          </div>
        </StatusBadge>
      )}

      {/* ── No releases yet (fresh repo) ── */}
      {!isChecking && !checkError && !updateInfo && (
        <StatusBadge color="slate">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/>
          </svg>
          <p className="text-sm">Click "Check now" to look for updates.</p>
        </StatusBadge>
      )}

      {/* ── Update available card ── */}
      {!isChecking && updateInfo?.is_available && phase === 'idle' && (
        <div className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 bg-violet-50 dark:bg-violet-900/20 border-b border-violet-100 dark:border-violet-800">
            <div>
              <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">
                {updateInfo.version} available
              </p>
              {updateInfo.pub_date && (
                <p className="text-xs text-violet-500 dark:text-violet-400 mt-0.5">
                  Released {formatDate(updateInfo.pub_date)}
                </p>
              )}
            </div>
            <span className="text-xs text-slate-400 dark:text-slate-500 font-mono bg-white dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-100 dark:border-slate-700">
              current: v{currentVersion}
            </span>
          </div>

          {/* Release notes */}
          {updateInfo.notes && (
            <div className="px-5 py-4 max-h-64 overflow-y-auto">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
                Release notes
              </p>
              <div
                className="prose-sm"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(updateInfo.notes) }}
              />
            </div>
          )}

          {/* Footer: actions */}
          <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
            {updateInfo.can_self_update && updateInfo.asset ? (
              <>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/>
                  </svg>
                  Download &amp; Install
                  {updateInfo.asset.size_label && (
                    <span className="opacity-70 font-normal text-xs">· {updateInfo.asset.size_label}</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleOpenReleasePage}
                  className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                >
                  View on GitHub ↗
                </button>
                <button
                  type="button"
                  onClick={() => skipVersion(updateInfo.version)}
                  className="ml-auto px-3 py-2 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 transition-colors"
                >
                  Skip this version
                </button>
              </>
            ) : (
              // Platform cannot self-update (Android, unknown)
              <>
                <button
                  type="button"
                  onClick={handleOpenReleasePage}
                  className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
                >
                  View release on GitHub ↗
                </button>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Download the update for your platform from the releases page.
                </p>
              </>
            )}
          </div>

          {/* Security note */}
          <div className="px-5 py-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>
            </svg>
            SHA-256 integrity verification · downloaded from github.com over HTTPS
          </div>
        </div>
      )}

      {/* ── Downloading ── */}
      {phase === 'downloading' && (
        <div className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-900 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Downloading update…</p>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {progress.total > 0
                ? `${formatBytes(progress.downloaded)} / ${formatBytes(progress.total)}`
                : formatBytes(progress.downloaded)}
            </span>
          </div>
          <ProgressBar percent={progress.percent} />
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {progress.percent < 100
              ? `${progress.percent}% — verifying after download completes…`
              : 'Verifying integrity…'}
          </p>
        </div>
      )}

      {/* ── Ready / installed ── */}
      {phase === 'ready' && (
        <div className="space-y-2">
          <StatusBadge color={checksumVerified === false ? 'violet' : 'green'}>
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <div>
              <p className="text-sm font-semibold">
                {checksumVerified === false ? 'Update installed (unverified)' : 'Update verified and installed'}
              </p>
              <p className="text-xs mt-0.5 opacity-80">{installMessage}</p>
              {/* macOS: needs manual restart; Linux/Windows: already restarting */}
              <p className="text-xs mt-1 opacity-70">
                You may need to restart MoodHaven Journal to use the new version.
              </p>
            </div>
          </StatusBadge>
          {checksumVerified === false && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-400">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
              </svg>
              <div className="text-xs">
                <span className="font-semibold">Integrity check skipped</span> — this release did not include a{' '}
                <code className="font-mono">checksums.txt</code> file, so SHA-256 verification was not performed.
                The download was served over HTTPS from github.com.
                If you have concerns, verify the file hash manually before using the app.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Install error ── */}
      {phase === 'error' && (
        <StatusBadge color="red">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Update failed</p>
            <p className="text-xs mt-0.5 opacity-80 break-words">{installError}</p>
            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={() => { setPhase('idle'); setInstallError(''); }}
                className="text-xs underline"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={handleOpenReleasePage}
                className="text-xs underline"
              >
                Download manually ↗
              </button>
            </div>
          </div>
        </StatusBadge>
      )}

      {/* ── Controls row ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void checkNow()}
            disabled={isChecking || phase === 'downloading'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            <svg className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Check now
          </button>

          {lastChecked && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              Last checked {new Date(lastChecked).toLocaleDateString()}
            </span>
          )}
        </div>

        {/* Auto-check toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-xs text-slate-500 dark:text-slate-400">Auto-check daily</span>
          <button
            type="button"
            role="switch"
            aria-checked={autoCheck}
            onClick={() => { setAutoCheck(!autoCheck); void saveSettings(); }}
            className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${autoCheck ? 'bg-violet-500' : 'bg-slate-200 dark:bg-slate-700'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${autoCheck ? 'translate-x-4' : ''}`} />
          </button>
        </label>
      </div>

      {/* Privacy note */}
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Update checks contact raw.githubusercontent.com over HTTPS.
        Your IP address is visible to GitHub. Disable auto-check above for full privacy.
      </p>
    </div>
  );
}
