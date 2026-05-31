import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AppSettings } from '../../../types/settings';
import { SettingSection } from '../SettingSection';
import { logger } from '../../../lib/services/logger';

export function PrivacyStatRow({
  label,
  value,
  ok,
  neutral,
}: {
  label: string;
  value: string;
  ok?: boolean;
  neutral?: boolean;
}) {
  const color = neutral
    ? 'text-amber-600 dark:text-amber-400'
    : ok
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-slate-500 dark:text-slate-400';
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
      <span className={`text-sm font-medium ${color}`}>{value}</span>
    </div>
  );
}

interface TransparencySectionProps {
  settings: AppSettings;
  isBrowser: boolean;
}

export function TransparencySection({ settings, isBrowser }: TransparencySectionProps) {
  const [isExporting, setIsExporting] = useState(false);

  const cloudSync = settings.storage.type === 'webdav';
  const aiEnabled = settings.ai.enabled;
  const peerSync = settings.sync?.peerSyncEnabled ?? false;
  const sttLayer = settings.speechToText.formatting.layer;

  const handleExportPrivacySnapshot = useCallback(async () => {
    if (isBrowser) return;
    setIsExporting(true);
    try {
      const snapshot = {
        generatedAt: new Date().toISOString(),
        appVersion: await invoke<string>('get_app_version'),
        dataStorage: 'local-only — SQLite encrypted with AES-256-GCM, PBKDF2 600k iterations',
        cloudSync: cloudSync ? 'WebDAV (user-configured, ciphertext only)' : 'disabled',
        aiInsights: aiEnabled ? 'enabled (metadata only, no journal text)' : 'disabled',
        peerSync: peerSync ? 'LAN peer-to-peer (Ed25519 + AES-256-GCM)' : 'disabled',
        speechToText: sttLayer === 'openai' ? 'OpenAI (explicit consent required)' : sttLayer === 'ollama' ? 'local Ollama' : 'fully local (whisper.cpp)',
        telemetry: 'none — no analytics, no crash reporting, no usage tracking',
        accounts: 'none — no registration, no login, no cloud account',
      };
      const json = JSON.stringify(snapshot, null, 2);
      const logPath = await invoke<string>('get_log_path');
      const sep = logPath.includes('\\') ? '\\' : '/';
      const dir = logPath.substring(0, logPath.lastIndexOf(sep) + 1);
      await invoke('write_text_file', {
        path: `${dir}privacy-snapshot.json`,
        contents: json,
      });
      await invoke('open_log_folder');
    } catch (err) {
      logger.error('Privacy snapshot export failed:', { error: String(err) });
    } finally {
      setIsExporting(false);
    }
  }, [isBrowser, cloudSync, aiEnabled, peerSync, sttLayer]);

  return (
    <SettingSection
      title="Transparency"
      description="What MoodHaven does and does not do with your data"
    >
      {/* PRIV-001: Static privacy guarantees */}
      <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl mb-4">
        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-2">
          Privacy Guarantees
        </p>
        <ul className="space-y-1.5">
          {[
            'Journal text never leaves your device',
            'No telemetry, analytics, or crash reporting',
            'No accounts, no registration, no cloud profile',
            'Peer sync is LAN-only — no relay servers',
            'AES-256-GCM encryption with PBKDF2 key derivation',
            'AI insights use anonymised metadata only (mood, frequency)',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-emerald-800 dark:text-emerald-300">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* PRIV-002: Live privacy state */}
      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl mb-4">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
          Current Privacy State
        </p>
        <div className="space-y-2">
          <PrivacyStatRow
            label="Storage"
            value="Local only"
            ok
          />
          <PrivacyStatRow
            label="Cloud sync"
            value={cloudSync ? 'WebDAV (ciphertext only)' : 'Off'}
            ok={!cloudSync}
            neutral={cloudSync}
          />
          <PrivacyStatRow
            label="AI insights"
            value={aiEnabled ? 'On (metadata only)' : 'Off'}
            ok={!aiEnabled}
            neutral={aiEnabled}
          />
          <PrivacyStatRow
            label="Peer sync"
            value={peerSync ? 'On (LAN only, encrypted)' : 'Off'}
            ok={!peerSync}
            neutral={peerSync}
          />
          <PrivacyStatRow
            label="STT formatting"
            value={
              sttLayer === 'openai'
                ? 'OpenAI (opt-in, explicit consent)'
                : sttLayer === 'ollama'
                ? 'Ollama (local)'
                : 'Local only'
            }
            ok={sttLayer !== 'openai'}
            neutral={sttLayer === 'openai'}
          />
          <PrivacyStatRow label="Telemetry" value="None" ok />
          <PrivacyStatRow label="Accounts" value="None" ok />
        </div>
      </div>

      {/* PRIV-003: Export privacy snapshot */}
      {!isBrowser && (
        <button
          type="button"
          disabled={isExporting}
          onClick={handleExportPrivacySnapshot}
          className="px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
        >
          {isExporting ? 'Exporting…' : 'Export Privacy Snapshot'}
        </button>
      )}
    </SettingSection>
  );
}
