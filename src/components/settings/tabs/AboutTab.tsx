import { useState } from 'react';
import type { AppSettings } from '../../../types/settings';
import { SettingSection } from '../SettingSection';
import { UpdatePanel } from '../../updater/UpdatePanel';
import type { UseUpdateCheckReturn } from '../../../hooks/useUpdateCheck';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../../../lib/services/logger';
import type { LogLevel, LogModule } from '../../../lib/services/logger';
import { usePlatform } from '../../../hooks/usePlatform';

const LOG_MODULES: LogModule[] = ['sync', 'ai', 'stt', 'peer', 'crypto', 'db'];

interface AboutTabProps {
  settings: AppSettings;
  updateHook: UseUpdateCheckReturn;
  appVersion: string;
  logPath: string | null;
  handleLogLevelChange: (level: LogLevel) => void;
  setModuleLogLevel: (module: LogModule, level: LogLevel | null) => void;
}

export function AboutTab({
  settings,
  updateHook,
  appVersion,
  logPath,
  handleLogLevelChange,
  setModuleLogLevel,
}: AboutTabProps) {
  const { isBrowser, isIOS, isDesktop } = usePlatform();
  const [moduleOverridesOpen, setModuleOverridesOpen] = useState(false);
  return (
    <div id="panel-about" role="tabpanel" aria-labelledby="tab-about" className="space-y-6">

      {/* Updates section — desktop only: the in-app updater downloads a native
          installer (no-op in the browser/PWA; the App Store handles iOS/Android). */}
      {isDesktop && (
        <SettingSection
          title="Updates"
          description="Keep MoodHaven Journal up to date"
        >
          <UpdatePanel hook={updateHook} currentVersion={appVersion} />
        </SettingSection>
      )}

      <SettingSection
        title="About MoodHaven Journal"
        description="App information and credits"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-700">
            <p className="text-slate-700 dark:text-slate-200">App Version</p>
            <p className="text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              v{appVersion}
            </p>
          </div>

          <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-700">
            <p className="text-slate-700 dark:text-slate-200">Settings Version</p>
            <p className="text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              {settings.version}
            </p>
          </div>

          <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-700">
            <p className="text-slate-700 dark:text-slate-200">Platform</p>
            <p className="text-slate-500 dark:text-slate-400">
              {navigator.platform}
            </p>
          </div>

          {!isBrowser && !isIOS && (
            <>
              <div className="py-3 border-b border-slate-100 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-700 dark:text-slate-200">Log Level</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Debug is verbose — use only for troubleshooting</p>
                  </div>
                  <select
                    aria-label="Log level"
                    value={settings.logLevel ?? 'warn'}
                    onChange={(e) => handleLogLevelChange(e.target.value as LogLevel)}
                    className="px-3 py-1 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-0 cursor-pointer"
                  >
                    <option value="error">Error</option>
                    <option value="warn">Warn</option>
                    <option value="info">Info</option>
                    <option value="debug">Debug</option>
                  </select>
                </div>
                {settings.logLevel === 'debug' && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-md px-2 py-1">
                    Verbose logging active — disable after troubleshooting
                  </p>
                )}
                {settings.logLevel === 'error' && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1">
                    Minimal logging — warnings and info are suppressed
                  </p>
                )}
              </div>

              <div className="py-3 border-b border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setModuleOverridesOpen((v) => !v)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <div>
                    <p className="text-slate-700 dark:text-slate-200">Module overrides</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Per-module verbosity (overrides global level)</p>
                  </div>
                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform ${moduleOverridesOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {moduleOverridesOpen && (
                  <div className="mt-3 space-y-2">
                    {LOG_MODULES.map((mod) => {
                      const current = settings.moduleLogLevels?.[mod] ?? null;
                      return (
                        <div key={mod} className="flex items-center justify-between">
                          <span className="text-sm font-mono text-slate-600 dark:text-slate-400">[{mod}]</span>
                          <select
                            aria-label={`Log level for ${mod} module`}
                            value={current ?? ''}
                            onChange={(e) => {
                              const val = e.target.value as LogLevel | '';
                              setModuleLogLevel(mod, val === '' ? null : val);
                            }}
                            className="px-2 py-1 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-0 cursor-pointer"
                          >
                            <option value="">— (global)</option>
                            <option value="error">Error</option>
                            <option value="warn">Warn</option>
                            <option value="info">Info</option>
                            <option value="debug">Debug</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-700">
                <p className="text-slate-700 dark:text-slate-200">Log File</p>
                <button
                  onClick={() => {
                    if (logPath) {
                      invoke('open_log_folder').catch((e: unknown) => {
                        logger.error('open_log_folder failed', { err: String(e) });
                      });
                    }
                  }}
                  disabled={!logPath}
                  className="px-3 py-1 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Open Log Folder
                </button>
              </div>
            </>
          )}

          <div className="pt-4">
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              MoodHaven Journal is built and maintained by a solo indie developer. The security
              model relies on established cryptographic primitives — AES-256-GCM, PBKDF2,
              Ed25519 — not proprietary systems. The codebase has not been independently
              audited; you're welcome to{' '}
              <a
                href="https://github.com/kenlacroix/moodhaven-journal"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-violet-600 dark:text-violet-400"
              >
                review it on GitHub
              </a>
              .
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mt-2">
              If it brings value to your life, a coffee goes a long way.
            </p>
          </div>

          <div className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-xl border border-violet-100 dark:border-violet-800">
            <p className="text-sm font-medium text-violet-700 dark:text-violet-300 mb-2">
              Built with
            </p>
            <div className="flex flex-wrap gap-2">
              {['Tauri', 'React', 'TypeScript', 'TailwindCSS', 'Rust', 'SQLite'].map((tech) => (
                <span
                  key={tech}
                  className="px-2 py-1 text-xs font-medium bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 rounded-md shadow-sm"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>

          {/* StillHaven wellness disclaimer */}
          <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-800/40 space-y-2">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
              StillHaven — Wellness Tool Notice
            </p>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/70 leading-relaxed">
              StillHaven uses bilateral audio stimulation as a general wellness practice.
              It is not a licensed tool and is not intended to replace working
              with a mental health professional.
            </p>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/70 leading-relaxed">
              It may not be appropriate if you are currently experiencing dissociation,
              flashbacks, or acute crisis. If you are unsure whether it is right for you,
              please consult a qualified professional before using it.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-3 pt-2">
            <a
              href="https://github.com/kenlacroix/moodhaven-journal#readme"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
            >
              User Guide ↗
            </a>
            <a
              href="https://github.com/kenlacroix/moodhaven-journal/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Share Feedback ↗
            </a>
            <a
              href="https://buymeacoffee.com/moodbloom"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Buy Me a Coffee ↗
            </a>
          </div>
        </div>
      </SettingSection>
    </div>
  );
}
