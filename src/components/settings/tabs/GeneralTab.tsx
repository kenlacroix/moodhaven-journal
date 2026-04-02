import { useEffect, useState, useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import type { AppSettings, ReminderFrequency, STTModel, STTFormattingLayer, DayOfWeek } from '../../../types/settings';
import { STT_MODELS } from '../../../types/settings';
import {
  SettingSection,
  SettingToggle,
  SettingSelect,
  SettingInput,
  DaySelector,
} from '../index';
import { useSettingsStore } from '../../../stores/settingsStore';
import {
  checkModelStatus,
  downloadModel,
  deleteModel,
  checkSidecarAvailable,
} from '../../../lib/services/speechToTextService';
import { sendTestNotification } from '../../../lib/services/reminderService';
import { CloudConsentModal } from '../../transcript/CloudConsentModal';

interface GeneralTabProps {
  settings: AppSettings;
  saveSettings: () => Promise<void>;
  sttSectionRef: RefObject<HTMLDivElement>;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setCompactMode: (v: boolean) => void;
  setAnimationsEnabled: (v: boolean) => void;
  setShowPrompts: (v: boolean) => void;
  setAutoLocationWeather: (v: boolean) => void;
  setTemperatureUnit: (v: 'C' | 'F') => void;
  setAutoTitle: (v: boolean) => void;
  setReminderEnabled: (v: boolean) => void;
  setReminderTime: (v: string) => void;
  setReminderFrequency: (v: ReminderFrequency) => void;
  setReminderCustomDays: (v: DayOfWeek[]) => void;
  setReminderMessage: (v: string) => void;
  setReminderSound: (v: boolean) => void;
  setSTTEnabled: (v: boolean) => void;
  setSTTModel: (v: STTModel) => void;
  setSTTModelDownloaded: (v: boolean) => void;
  setSTTDownloadProgress: (v: number | null) => void;
  setSttFormattingLayer: (v: STTFormattingLayer) => void;
  setSttCloudConsent: (v: boolean) => void;
  setHasSeenTutorial: (v: boolean) => void;
  setTimeCapsuleSettings: (patch: Partial<AppSettings['timeCapsule']>) => void;
}

export function GeneralTab({
  settings,
  saveSettings,
  sttSectionRef,
  setTheme,
  setCompactMode,
  setAnimationsEnabled,
  setShowPrompts,
  setAutoLocationWeather,
  setTemperatureUnit,
  setAutoTitle,
  setReminderEnabled,
  setReminderTime,
  setReminderFrequency,
  setReminderCustomDays,
  setReminderMessage,
  setReminderSound,
  setSTTEnabled,
  setSTTModel,
  setSTTModelDownloaded,
  setSTTDownloadProgress,
  setSttFormattingLayer,
  setSttCloudConsent,
  setHasSeenTutorial,
  setTimeCapsuleSettings,
}: GeneralTabProps) {
  const [sttDownloading, setSTTDownloading] = useState(false);
  const [sttDownloadError, setSTTDownloadError] = useState<string | null>(null);
  const [sttSidecarAvailable, setSTTSidecarAvailable] = useState<boolean | null>(null);
  const [cloudConsentModalOpen, setCloudConsentModalOpen] = useState(false);
  const prevFormattingLayerRef = useRef<STTFormattingLayer>('local');
  const [testingNotification, setTestingNotification] = useState(false);
  const [notificationTestResult, setNotificationTestResult] = useState<string | null>(null);

  useEffect(() => {
    checkSidecarAvailable().then(setSTTSidecarAvailable);
    if (settings.speechToText.model) {
      checkModelStatus(settings.speechToText.model).then((status) => {
        setSTTModelDownloaded(status.downloaded);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.speechToText.model, setSTTModelDownloaded]);

  const handleSTTModelDownload = useCallback(async () => {
    setSTTDownloading(true);
    setSTTDownloadError(null);
    setSTTDownloadProgress(0);

    try {
      await downloadModel(settings.speechToText.model, (progress) => {
        setSTTDownloadProgress(progress.percentage);
      });
      setSTTModelDownloaded(true);
      setSTTDownloadProgress(null);
      await saveSettings();
    } catch (error) {
      setSTTDownloadError(error instanceof Error ? error.message : 'Download failed');
      setSTTDownloadProgress(null);
    } finally {
      setSTTDownloading(false);
    }
  }, [settings.speechToText.model, setSTTModelDownloaded, setSTTDownloadProgress, saveSettings]);

  const handleSTTModelDelete = useCallback(async () => {
    try {
      await deleteModel(settings.speechToText.model);
      setSTTModelDownloaded(false);
      await saveSettings();
    } catch (error) {
      setSTTDownloadError(error instanceof Error ? error.message : 'Delete failed');
    }
  }, [settings.speechToText.model, setSTTModelDownloaded, saveSettings]);

  const handleTestNotification = useCallback(async () => {
    setTestingNotification(true);
    setNotificationTestResult(null);
    try {
      await sendTestNotification(settings.reminders.message);
      setNotificationTestResult('Notification sent!');
      setTimeout(() => setNotificationTestResult(null), 3000);
    } catch (error) {
      setNotificationTestResult(
        error instanceof Error ? error.message : 'Failed to send notification'
      );
    } finally {
      setTestingNotification(false);
    }
  }, [settings.reminders.message]);

  const handleShowTutorial = useCallback(async () => {
    setHasSeenTutorial(false);
    await saveSettings();
  }, [setHasSeenTutorial, saveSettings]);

  return (
    <div id="panel-general" role="tabpanel" className="space-y-6">
      <SettingSection
        title="Appearance"
        description="Customize how MoodHaven Journal looks"
      >
        <SettingSelect
          label="Theme"
          description="Choose your preferred color scheme"
          value={settings.appearance.theme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          onChange={(v) => setTheme(v as 'light' | 'dark' | 'system')}
        />

        <SettingToggle
          label="Compact mode"
          description="Use less spacing for a denser layout"
          checked={settings.appearance.compactMode}
          onChange={setCompactMode}
        />

        <SettingToggle
          label="Animations"
          description="Enable smooth transitions and animations"
          checked={settings.appearance.animationsEnabled}
          onChange={setAnimationsEnabled}
        />
      </SettingSection>

      <SettingSection
        title="Journal"
        description="Configure your journaling experience"
      >
        <SettingToggle
          label="Show writing prompts"
          description="Display helpful prompts when creating entries"
          checked={settings.journal.showPrompts}
          onChange={setShowPrompts}
        />

        <SettingToggle
          label="Auto-save drafts"
          description="Automatically save your entry as you type"
          checked={settings.journal.autoSave}
          onChange={(v) => useSettingsStore.setState((s) => ({
            settings: { ...s.settings, journal: { ...s.settings.journal, autoSave: v } },
            hasUnsavedChanges: true,
          }))}
        />

        <SettingToggle
          label="Auto-add location & weather"
          description="Capture your city and weather when starting a new entry. Uses Open-Meteo + OpenStreetMap — no API key required."
          checked={settings.journal.autoLocationWeather ?? false}
          onChange={setAutoLocationWeather}
        />

        <SettingSelect
          label="Temperature unit"
          description="Display unit for weather chips"
          value={settings.journal.temperatureUnit ?? 'C'}
          options={[
            { value: 'C', label: 'Celsius (°C)' },
            { value: 'F', label: 'Fahrenheit (°F)' },
          ]}
          onChange={(v) => setTemperatureUnit(v as 'C' | 'F')}
        />

        <SettingToggle
          label="Auto-title entries"
          description="Generate an entry title from the first sentence when you don't type one"
          checked={settings.journal.autoTitle ?? false}
          onChange={setAutoTitle}
        />
      </SettingSection>

      <SettingSection
        title="Reminders"
        description="Get notified to journal regularly"
      >
        <SettingToggle
          label="Enable reminders"
          description="Receive notifications at your preferred time"
          checked={settings.reminders.enabled}
          onChange={setReminderEnabled}
        />

        {settings.reminders.enabled && (
          <>
            <SettingInput
              label="Reminder time"
              description="When should we remind you?"
              value={settings.reminders.time}
              onChange={setReminderTime}
              type="time"
            />

            <SettingSelect
              label="Frequency"
              description="How often do you want reminders?"
              value={settings.reminders.frequency}
              options={[
                { value: 'daily', label: 'Every day' },
                { value: 'weekdays', label: 'Weekdays only' },
                { value: 'weekends', label: 'Weekends only' },
                { value: 'custom', label: 'Custom days' },
              ]}
              onChange={(v) => setReminderFrequency(v as ReminderFrequency)}
            />

            {settings.reminders.frequency === 'custom' && (
              <div className="py-2">
                <p className="font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Select days
                </p>
                <DaySelector
                  selectedDays={settings.reminders.customDays}
                  onChange={setReminderCustomDays}
                />
              </div>
            )}

            <SettingInput
              label="Reminder message"
              description="Customize your notification message"
              value={settings.reminders.message}
              onChange={setReminderMessage}
              placeholder="Time to reflect on your day"
            />

            <SettingToggle
              label="Play sound"
              description="Play a sound with the notification"
              checked={settings.reminders.sound}
              onChange={setReminderSound}
            />

            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={handleTestNotification}
                disabled={testingNotification}
                className="px-4 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors disabled:opacity-50"
              >
                {testingNotification ? 'Sending...' : 'Send Test Notification'}
              </button>
              {notificationTestResult && (
                <p className={`text-sm mt-2 ${notificationTestResult.includes('sent') ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {notificationTestResult}
                </p>
              )}
            </div>
          </>
        )}
      </SettingSection>

      <div ref={sttSectionRef}>
        <SettingSection
          title="Speech to Text"
          description="Dictate journal entries using your voice"
        >
          {sttSidecarAvailable === false && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-sm mb-3">
              <p className="font-medium">Whisper engine not installed</p>
              <p className="text-xs mt-1 text-amber-700 dark:text-amber-300">
                Speech-to-text requires the Whisper sidecar. This feature will be available in a future release.
              </p>
            </div>
          )}

          <SettingToggle
            label="Enable speech to text"
            description="Show microphone button in the editor toolbar"
            checked={settings.speechToText.enabled}
            onChange={setSTTEnabled}
            disabled={sttSidecarAvailable === false}
          />

          {settings.speechToText.enabled && (
            <>
              <SettingSelect
                label="Model"
                description="Choose quality vs. speed tradeoff"
                value={settings.speechToText.model}
                options={STT_MODELS.map((m) => ({
                  value: m.id,
                  label: `${m.name} (${m.size})`,
                }))}
                onChange={(v) => setSTTModel(v as STTModel)}
              />

              <div className="py-2">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-medium text-slate-700 dark:text-slate-200 text-sm">
                      Model Status
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {settings.speechToText.modelDownloaded
                        ? `${STT_MODELS.find(m => m.id === settings.speechToText.model)?.name} is ready to use`
                        : 'Model needs to be downloaded for offline use'}
                    </p>
                  </div>

                  {settings.speechToText.modelDownloaded ? (
                    <button
                      type="button"
                      onClick={handleSTTModelDelete}
                      className="px-3 py-1.5 text-sm font-medium text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/30 rounded-lg hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors"
                    >
                      Delete Model
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSTTModelDownload}
                      disabled={sttDownloading}
                      className="px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors disabled:opacity-50"
                    >
                      {sttDownloading ? 'Downloading...' : 'Download Model'}
                    </button>
                  )}
                </div>

                {sttDownloading && settings.speechToText.downloadProgress !== null && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                      <span>Downloading...</span>
                      <span>{Math.round(settings.speechToText.downloadProgress)}%</span>
                    </div>
                    <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-500 transition-all duration-300"
                        style={{ width: `${settings.speechToText.downloadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {sttDownloadError && (
                  <p className="text-sm text-rose-600 dark:text-rose-400 mt-2">
                    {sttDownloadError}
                  </p>
                )}
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <p className="font-medium text-slate-600 dark:text-slate-300 mb-1">Privacy Notice</p>
                <p>
                  All speech recognition happens locally on your device. No audio data is ever sent to external servers.
                  Models are downloaded from Hugging Face once and stored locally.
                </p>
              </div>

              {/* Formatting layer sub-section */}
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Formatting layer
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  How should raw whisper output be cleaned up before inserting into your journal?
                </p>

                <div className="space-y-2">
                  {/* Local cleanup */}
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="stt-formatting-layer"
                      value="local"
                      checked={settings.speechToText.formatting?.layer === 'local' || !settings.speechToText.formatting?.layer}
                      onChange={() => {
                        setSttFormattingLayer('local');
                        void saveSettings();
                      }}
                      className="mt-0.5 accent-violet-600"
                    />
                    <div>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        Local cleanup
                      </span>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Always on. No LLM. Removes fillers, adds paragraph breaks.
                      </p>
                    </div>
                  </label>

                  {/* Ollama */}
                  <label className={`flex items-start gap-3 ${settings.ai.localAI.enabled ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}>
                    <input
                      type="radio"
                      name="stt-formatting-layer"
                      value="ollama"
                      checked={settings.speechToText.formatting?.layer === 'ollama'}
                      disabled={!settings.ai.localAI.enabled}
                      onChange={() => {
                        if (!settings.ai.localAI.enabled) return;
                        setSttFormattingLayer('ollama');
                        void saveSettings();
                      }}
                      className="mt-0.5 accent-violet-600"
                    />
                    <div>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        Ollama (local LLM)
                      </span>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {settings.ai.localAI.enabled
                          ? 'Requires Ollama running. Full quality, stays on device.'
                          : 'Requires Ollama endpoint configured in AI settings.'}
                      </p>
                    </div>
                  </label>

                  {/* OpenAI */}
                  <label className={`flex items-start gap-3 ${settings.ai.openai.apiKey ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}>
                    <input
                      type="radio"
                      name="stt-formatting-layer"
                      value="openai"
                      checked={settings.speechToText.formatting?.layer === 'openai'}
                      disabled={!settings.ai.openai.apiKey}
                      onChange={() => {
                        if (!settings.ai.openai.apiKey) return;
                        if (!settings.speechToText.formatting?.cloudConsentGiven) {
                          prevFormattingLayerRef.current = settings.speechToText.formatting?.layer ?? 'local';
                          setSttFormattingLayer('openai');
                          setCloudConsentModalOpen(true);
                        } else {
                          setSttFormattingLayer('openai');
                          void saveSettings();
                        }
                      }}
                      className="mt-0.5 accent-violet-600"
                    />
                    <div>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        OpenAI (cloud)
                      </span>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {settings.ai.openai.apiKey
                          ? 'Requires API key + consent. Best quality.'
                          : 'Requires an OpenAI API key set in AI settings.'}
                      </p>
                    </div>
                  </label>
                </div>

                {/* Consent status */}
                {settings.speechToText.formatting?.layer === 'openai' && !settings.speechToText.formatting?.cloudConsentGiven && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                    ⚠️ Selecting OpenAI will prompt for consent before first use.
                  </p>
                )}
                {settings.speechToText.formatting?.layer === 'openai' && settings.speechToText.formatting?.cloudConsentGiven && (
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-green-600 dark:text-green-400">
                      ✓ Cloud consent granted{settings.speechToText.formatting.consentDate
                        ? ` on ${new Date(settings.speechToText.formatting.consentDate).toLocaleDateString()}`
                        : ''}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSttCloudConsent(false);
                        setSttFormattingLayer('local');
                        void saveSettings();
                      }}
                      className="text-xs text-rose-500 hover:text-rose-700 underline"
                    >
                      Revoke
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </SettingSection>
      </div>

      {/* Cloud consent modal */}
      <CloudConsentModal
        isOpen={cloudConsentModalOpen}
        onConfirm={() => {
          setSttCloudConsent(true);
          setCloudConsentModalOpen(false);
          void saveSettings();
        }}
        onCancel={() => {
          setSttFormattingLayer(prevFormattingLayerRef.current);
          setCloudConsentModalOpen(false);
        }}
      />

      <SettingSection
        title="Time Capsule"
        description="Seal entries to reveal in the future"
      >
        <SettingToggle
          label="Enable time capsule reveals"
          description="Show a reveal prompt when sealed entries become due"
          checked={settings.timeCapsule?.enabled ?? true}
          onChange={(v) => { setTimeCapsuleSettings({ enabled: v }); void saveSettings(); }}
        />
        <SettingToggle
          label="Auto-surface anniversary entries"
          description="Highlight entries written one or more years ago"
          checked={settings.timeCapsule?.anniversaryReveal ?? true}
          onChange={(v) => { setTimeCapsuleSettings({ anniversaryReveal: v }); void saveSettings(); }}
        />
        <SettingSelect
          label="Default seal duration"
          description="How far ahead entries are sealed by default"
          value={String(settings.timeCapsule?.defaultSealDays ?? 30)}
          options={[
            { value: '30', label: '30 days' },
            { value: '90', label: '90 days' },
            { value: '180', label: '180 days' },
            { value: '365', label: '1 year' },
          ]}
          onChange={(v) => { setTimeCapsuleSettings({ defaultSealDays: Number(v) }); void saveSettings(); }}
        />
      </SettingSection>

      <SettingSection
        title="Help"
        description="Learn how to use MoodHaven Journal"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-700 dark:text-slate-200 text-sm">
              App Tutorial
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Replay the introductory tour of MoodHaven Journal
            </p>
          </div>
          <button
            type="button"
            onClick={handleShowTutorial}
            className="px-4 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors"
          >
            Show Tutorial
          </button>
        </div>
      </SettingSection>
    </div>
  );
}
