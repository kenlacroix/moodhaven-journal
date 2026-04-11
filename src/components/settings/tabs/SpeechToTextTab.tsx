import { useState, useEffect, useCallback } from 'react';
import { checkModelStatus, downloadModel, deleteModel, cancelDownload } from '../../../lib/services/speechToTextService';
import { SettingToggle } from '../SettingToggle';
import type { SettingsTabBaseProps } from './types';
import { STT_MODELS } from '../../../types/settings';
import type { STTModel } from '../../../types/settings';

type Props = Pick<SettingsTabBaseProps, 'settings' | 'updateSettings' | 'saveSettings'>;

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

interface ModelRowProps {
  modelId: STTModel;
  isSelected: boolean;
  isEnabled: boolean;
  onSelect: (id: STTModel) => void;
  onDownloadToggle: (id: STTModel) => void;
  downloadState: DownloadState | null;
  downloadedSize: number | null;
}

interface DownloadState {
  phase: 'connecting' | 'downloading' | 'verifying' | 'complete' | 'error' | 'cancelled';
  percentage: number;
  downloaded: number;
  total: number;
  speed: number;
  error: string | null;
}

function ModelRow({ modelId, isSelected, isEnabled, onSelect, onDownloadToggle, downloadState, downloadedSize }: ModelRowProps) {
  const info = STT_MODELS.find((m) => m.id === modelId)!;
  const isDownloaded = downloadedSize !== null;
  const isDownloading = downloadState !== null && downloadState.phase !== 'complete' && downloadState.phase !== 'error' && downloadState.phase !== 'cancelled';

  return (
    <div
      className={[
        'rounded-xl border p-3.5 transition-all duration-200',
        isSelected && isEnabled
          ? 'border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/30'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50',
        isEnabled && isDownloaded && !isSelected ? 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-600' : '',
      ].join(' ')}
      onClick={() => {
        if (isEnabled && isDownloaded && !isSelected) onSelect(modelId);
      }}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: info */}
        <div className="flex items-center gap-2.5 min-w-0">
          {isEnabled && isDownloaded && (
            <div className={`mt-0.5 w-3 h-3 rounded-full flex-shrink-0 ${isSelected ? 'bg-violet-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
              {info.name}
              {isSelected && isEnabled && isDownloaded && (
                <span className="ml-2 text-xs text-violet-600 dark:text-violet-400 font-normal">Active</span>
              )}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {info.size} &mdash; {info.quality} quality &mdash; {info.speed}
            </p>
          </div>
        </div>

        {/* Right: action button */}
        {isEnabled && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDownloadToggle(modelId); }}
            disabled={isDownloading}
            className={[
              'flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors duration-150',
              isDownloading
                ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-wait'
                : isDownloaded
                  ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/30'
                  : downloadState?.phase === 'error'
                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30'
                    : 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/30',
            ].join(' ')}
          >
            {isDownloading
              ? 'Downloading\u2026'
              : isDownloaded
                ? 'Delete'
                : downloadState?.phase === 'error'
                  ? 'Retry'
                  : 'Download'}
          </button>
        )}
      </div>

      {/* Download progress bar */}
      {isDownloading && downloadState && (
        <div className="mt-3 space-y-1.5">
          <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-300 animate-bar-grow origin-left"
              style={{ width: `${downloadState.percentage.toFixed(1)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
            <span>
              {downloadState.phase === 'connecting' ? 'Connecting\u2026' : (
                `${formatBytes(downloadState.downloaded)}${downloadState.total ? ` / ${formatBytes(downloadState.total)}` : ''}`
              )}
            </span>
            {downloadState.speed > 0 && (
              <span>{formatSpeed(downloadState.speed)}</span>
            )}
          </div>
          {/* Cancel button */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDownloadToggle(modelId); }}
            className="text-xs text-slate-400 hover:text-rose-500 dark:text-slate-500 dark:hover:text-rose-400 transition-colors"
          >
            Cancel download
          </button>
        </div>
      )}

      {/* Error state */}
      {downloadState?.phase === 'error' && downloadState.error && (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{downloadState.error}</p>
      )}
    </div>
  );
}

export function SpeechToTextTab({ settings, updateSettings, saveSettings }: Props) {
  const stt = settings.speechToText;

  // Per-model download state (phase + progress)
  const [downloadStates, setDownloadStates] = useState<Partial<Record<STTModel, DownloadState>>>({});
  // Per-model downloaded size (null = not downloaded)
  const [downloadedSizes, setDownloadedSizes] = useState<Partial<Record<STTModel, number | null>>>({});

  // B2: check all model statuses on tab open
  useEffect(() => {
    let cancelled = false;
    async function checkAll() {
      for (const m of STT_MODELS) {
        if (cancelled) break;
        const status = await checkModelStatus(m.id);
        setDownloadedSizes((prev) => ({ ...prev, [m.id]: status.downloaded ? (status.size ?? 0) : null }));
      }
      // If active model is no longer downloaded, reflect that in settings
      if (!cancelled) {
        const activeStatus = await checkModelStatus(stt.model);
        if (stt.modelDownloaded !== activeStatus.downloaded) {
          updateSettings({ speechToText: { ...stt, modelDownloaded: activeStatus.downloaded } });
        }
      }
    }
    checkAll();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownloadToggle = useCallback(async (modelId: STTModel) => {
    const existing = downloadStates[modelId];
    const isDownloading = existing && existing.phase !== 'complete' && existing.phase !== 'error' && existing.phase !== 'cancelled';

    if (isDownloading) {
      // Cancel
      await cancelDownload(modelId);
      setDownloadStates((prev) => ({ ...prev, [modelId]: { ...prev[modelId]!, phase: 'cancelled', error: null } }));
      return;
    }

    const isDownloaded = downloadedSizes[modelId] !== null && downloadedSizes[modelId] !== undefined;
    if (isDownloaded) {
      // Delete
      await deleteModel(modelId);
      setDownloadedSizes((prev) => ({ ...prev, [modelId]: null }));
      if (stt.model === modelId) {
        updateSettings({ speechToText: { ...stt, modelDownloaded: false } });
        await saveSettings();
      }
      return;
    }

    // Start download
    setDownloadStates((prev) => ({
      ...prev,
      [modelId]: { phase: 'connecting', percentage: 0, downloaded: 0, total: 0, speed: 0, error: null },
    }));

    try {
      await downloadModel(modelId, (progress) => {
        setDownloadStates((prev) => ({
          ...prev,
          [modelId]: {
            phase: progress.state as DownloadState['phase'],
            percentage: progress.percentage,
            downloaded: progress.downloaded,
            total: progress.total,
            speed: progress.speed,
            error: progress.error ?? null,
          },
        }));
      });

      // Download complete
      const status = await checkModelStatus(modelId);
      setDownloadedSizes((prev) => ({ ...prev, [modelId]: status.size ?? 0 }));
      setDownloadStates((prev) => ({ ...prev, [modelId]: null as unknown as DownloadState }));

      if (stt.model === modelId) {
        updateSettings({ speechToText: { ...stt, modelDownloaded: true, downloadProgress: null } });
        await saveSettings();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDownloadStates((prev) => ({
        ...prev,
        [modelId]: { phase: 'error', percentage: 0, downloaded: 0, total: 0, speed: 0, error: msg },
      }));
    }
  }, [downloadStates, downloadedSizes, stt, updateSettings, saveSettings]);

  const handleSelectModel = useCallback(async (modelId: STTModel) => {
    const isDownloaded = downloadedSizes[modelId] !== null && downloadedSizes[modelId] !== undefined;
    updateSettings({ speechToText: { ...stt, model: modelId, modelDownloaded: isDownloaded } });
    await saveSettings();
  }, [downloadedSizes, stt, updateSettings, saveSettings]);

  const handleToggleEnabled = useCallback(async (enabled: boolean) => {
    updateSettings({ speechToText: { ...stt, enabled } });
    await saveSettings();
  }, [stt, updateSettings, saveSettings]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
          Speech to Text
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Dictate journal entries using your microphone. All transcription happens on your device — no audio leaves your machine.
        </p>
      </div>

      {/* Enable toggle */}
      <SettingToggle
        label="Enable speech to text"
        description="Show the mic button in the editor toolbar"
        checked={stt.enabled}
        onChange={handleToggleEnabled}
      />

      {/* Models */}
      <div>
        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
          Whisper Models
        </h4>
        <div className="space-y-2.5">
          {STT_MODELS.map((m) => (
            <ModelRow
              key={m.id}
              modelId={m.id}
              isSelected={stt.model === m.id}
              isEnabled={stt.enabled}
              onSelect={handleSelectModel}
              onDownloadToggle={handleDownloadToggle}
              downloadState={downloadStates[m.id] ?? null}
              downloadedSize={downloadedSizes[m.id] ?? null}
            />
          ))}
        </div>
        {!stt.enabled && (
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
            Enable speech to text above to manage models.
          </p>
        )}
      </div>

      {/* Formatting settings (only when enabled) */}
      {stt.enabled && (
        <div>
          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Transcript Formatting
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            How transcribed text is cleaned up before insertion.
          </p>
          <div className="space-y-2">
            {(['local', 'ollama', 'openai'] as const).map((layer) => (
              <label key={layer} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="formatting-layer"
                  value={layer}
                  checked={stt.formatting.layer === layer}
                  onChange={() => {
                    updateSettings({ speechToText: { ...stt, formatting: { ...stt.formatting, layer } } });
                    saveSettings();
                  }}
                  className="mt-0.5 accent-violet-600"
                />
                <span>
                  <span className="block text-sm text-slate-700 dark:text-slate-300">
                    {layer === 'local' ? 'Local rules (fast, private)' : layer === 'ollama' ? 'Ollama (local AI)' : 'OpenAI (cloud, requires consent)'}
                  </span>
                  <span className="block text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {layer === 'local'
                      ? 'Punctuation and paragraph detection using local heuristics only.'
                      : layer === 'ollama'
                        ? 'Uses your local Ollama instance for better formatting. No data leaves your machine.'
                        : 'Sends transcript text (not journal content) to OpenAI for polished formatting.'}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
