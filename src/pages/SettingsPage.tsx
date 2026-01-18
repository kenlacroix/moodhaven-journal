/**
 * SettingsPage - User preferences and configuration
 */

import { useEffect, useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import {
  SettingSection,
  SettingToggle,
  SettingSelect,
  SettingInput,
} from '../components/settings';
import { testOpenAIKey, testLocalAIConnection } from '../lib/settingsService';

export function SettingsPage() {
  const {
    settings,
    appVersion,
    isLoading,
    hasUnsavedChanges,
    loadSettings,
    saveSettings,
    setTheme,
    setCompactMode,
    setAnimationsEnabled,
    setAIEnabled,
    setAIProvider,
    setOpenAIKey,
    setOpenAIModel,
    setLocalAIEndpoint,
    setLocalAIModel,
    setAIFeatures,
    setAIConsent,
    setAutoLockTimeout,
    setShowPrompts,
  } = useSettingsStore();

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await saveSettings();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-slate-500 dark:text-slate-400">
          Loading settings...
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            Settings
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Customize your MoodBloom experience
          </p>
        </div>

        {/* Save button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasUnsavedChanges || saveStatus === 'saving'}
          className={`
            px-4 py-2 rounded-xl font-medium transition-all duration-200
            ${hasUnsavedChanges
              ? 'bg-violet-500 text-white hover:bg-violet-600 shadow-lg shadow-violet-500/25'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
            }
          `}
        >
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {/* Settings sections */}
      <div className="flex-1 overflow-auto space-y-6 pb-6">
        {/* Appearance */}
        <SettingSection
          title="Appearance"
          description="Customize how MoodBloom looks"
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

        {/* Journal */}
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
        </SettingSection>

        {/* Privacy & Security */}
        <SettingSection
          title="Privacy & Security"
          description="Keep your journal safe"
        >
          <SettingSelect
            label="Auto-lock timeout"
            description="Lock the app after inactivity"
            value={String(settings.privacy.autoLockTimeout)}
            options={[
              { value: '0', label: 'Never' },
              { value: '1', label: '1 minute' },
              { value: '5', label: '5 minutes' },
              { value: '15', label: '15 minutes' },
              { value: '30', label: '30 minutes' },
            ]}
            onChange={(v) => setAutoLockTimeout(Number(v))}
          />

          <SettingToggle
            label="Clear clipboard on lock"
            description="Remove copied content when the app locks"
            checked={settings.privacy.clearClipboardOnLock}
            onChange={(v) => useSettingsStore.setState((s) => ({
              settings: { ...s.settings, privacy: { ...s.settings.privacy, clearClipboardOnLock: v } },
              hasUnsavedChanges: true,
            }))}
          />
        </SettingSection>

        {/* AI Features */}
        <SettingSection
          title="AI Features"
          description="Optional AI-powered insights (your journal content is never sent to external servers)"
        >
          <SettingToggle
            label="Enable AI features"
            description="Get personalized prompts and insights based on your mood patterns"
            checked={settings.ai.enabled}
            onChange={setAIEnabled}
          />

          {settings.ai.enabled && (
            <>
              {/* AI Provider Selection */}
              <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-3">
                  AI Provider
                </p>

                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                    <input
                      type="radio"
                      name="ai-provider"
                      value="openai"
                      checked={settings.ai.provider === 'openai'}
                      onChange={() => setAIProvider('openai')}
                      className="mt-1 accent-violet-500"
                    />
                    <div>
                      <p className="font-medium text-slate-700 dark:text-slate-200">OpenAI API</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Use your own OpenAI API key. You control the costs.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                    <input
                      type="radio"
                      name="ai-provider"
                      value="local"
                      checked={settings.ai.provider === 'local'}
                      onChange={() => setAIProvider('local')}
                      className="mt-1 accent-violet-500"
                    />
                    <div>
                      <p className="font-medium text-slate-700 dark:text-slate-200">Local AI (Ollama)</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Use a local AI server. Maximum privacy - nothing leaves your computer.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* OpenAI Configuration */}
              {settings.ai.provider === 'openai' && (
                <div className="mt-4 space-y-4">
                  <SettingInput
                    label="OpenAI API Key"
                    description="Your key is stored locally and encrypted"
                    value={settings.ai.openai.apiKey || ''}
                    onChange={(v) => setOpenAIKey(v || null)}
                    placeholder="sk-..."
                    type="password"
                    onTest={() => testOpenAIKey(settings.ai.openai.apiKey || '')}
                  />

                  <SettingSelect
                    label="Model"
                    description="Choose the AI model to use"
                    value={settings.ai.openai.model}
                    options={[
                      { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Recommended)' },
                      { value: 'gpt-4o', label: 'GPT-4o (Most capable)' },
                      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Fastest)' },
                    ]}
                    onChange={(v) => setOpenAIModel(v as 'gpt-4o-mini' | 'gpt-4o' | 'gpt-3.5-turbo')}
                  />
                </div>
              )}

              {/* Local AI Configuration */}
              {settings.ai.provider === 'local' && (
                <div className="mt-4 space-y-4">
                  <SettingInput
                    label="Ollama Endpoint"
                    description="URL of your local Ollama server"
                    value={settings.ai.localAI.endpoint}
                    onChange={setLocalAIEndpoint}
                    placeholder="http://localhost:11434"
                    type="url"
                    onTest={async () => {
                      const result = await testLocalAIConnection(settings.ai.localAI.endpoint);
                      if (result.valid && result.models && result.models.length > 0) {
                        return { valid: true, error: `Found ${result.models.length} models` };
                      }
                      return result;
                    }}
                  />

                  <SettingInput
                    label="Model Name"
                    description="The model to use (e.g., llama2, mistral, codellama)"
                    value={settings.ai.localAI.model}
                    onChange={setLocalAIModel}
                    placeholder="llama2"
                  />
                </div>
              )}

              {/* AI Feature Toggles */}
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-3">
                  Features
                </p>

                <SettingToggle
                  label="Contextual prompts"
                  description="Get personalized writing prompts based on your patterns"
                  checked={settings.ai.features.contextualPrompts}
                  onChange={(v) => setAIFeatures({ contextualPrompts: v })}
                />

                <SettingToggle
                  label="Wellness insights"
                  description="Receive gentle observations about your mood trends"
                  checked={settings.ai.features.wellnessInsights}
                  onChange={(v) => setAIFeatures({ wellnessInsights: v })}
                />

                <SettingToggle
                  label="Weekly reflections"
                  description="Get a summary and reflection prompts each week"
                  checked={settings.ai.features.weeklyReflections}
                  onChange={(v) => setAIFeatures({ weeklyReflections: v })}
                />
              </div>

              {/* Privacy Notice */}
              {!settings.ai.consent.agreedToTerms && (
                <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                  <p className="text-sm text-amber-800 dark:text-amber-200 font-medium mb-2">
                    Privacy Notice
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
                    AI features only send anonymized metadata (mood scores, patterns, statistics) -
                    never your actual journal content. Your thoughts remain private.
                  </p>
                  <button
                    type="button"
                    onClick={() => setAIConsent(true)}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
                  >
                    I understand, enable AI
                  </button>
                </div>
              )}
            </>
          )}
        </SettingSection>

        {/* About */}
        <SettingSection
          title="About"
          description="App information"
        >
          <div className="flex items-center justify-between py-2">
            <p className="text-slate-700 dark:text-slate-200">Version</p>
            <p className="text-slate-500 dark:text-slate-400 font-mono">{appVersion}</p>
          </div>

          <div className="flex items-center justify-between py-2">
            <p className="text-slate-700 dark:text-slate-200">Settings Version</p>
            <p className="text-slate-500 dark:text-slate-400 font-mono">{settings.version}</p>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              MoodBloom is a privacy-focused mood tracking and journaling app.
              All your data is stored locally and encrypted.
            </p>
          </div>
        </SettingSection>
      </div>
    </div>
  );
}
