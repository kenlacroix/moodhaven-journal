/**
 * SettingsPage - User preferences and configuration
 *
 * Features:
 * - Tabbed interface for organized navigation
 * - Search functionality to find settings quickly
 * - Keyboard navigation support
 */

import { useEffect, useState, useMemo } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import {
  SettingSection,
  SettingToggle,
  SettingSelect,
  SettingInput,
} from '../components/settings';
import { testOpenAIKey, testLocalAIConnection } from '../lib/settingsService';

type SettingsTab = 'general' | 'privacy' | 'ai' | 'about';

interface TabConfig {
  id: SettingsTab;
  label: string;
  icon: string;
  keywords: string[];
}

const TABS: TabConfig[] = [
  {
    id: 'general',
    label: 'General',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    keywords: ['appearance', 'theme', 'dark', 'light', 'compact', 'animations', 'journal', 'prompts', 'auto-save'],
  },
  {
    id: 'privacy',
    label: 'Privacy',
    icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
    keywords: ['security', 'lock', 'timeout', 'clipboard', 'encryption', 'password'],
  },
  {
    id: 'ai',
    label: 'AI Features',
    icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
    keywords: ['openai', 'ollama', 'local', 'insights', 'prompts', 'wellness', 'reflections', 'api key'],
  },
  {
    id: 'about',
    label: 'About',
    icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    keywords: ['version', 'info', 'app', 'moodbloom'],
  },
];

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

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [searchQuery, setSearchQuery] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Auto-switch tabs based on search query
  const matchedTab = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const query = searchQuery.toLowerCase();

    for (const tab of TABS) {
      if (tab.keywords.some(kw => kw.includes(query))) {
        return tab.id;
      }
    }
    return null;
  }, [searchQuery]);

  useEffect(() => {
    if (matchedTab) {
      setActiveTab(matchedTab);
    }
  }, [matchedTab]);

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

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = TABS.findIndex(t => t.id === activeTab);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % TABS.length;
      setActiveTab(TABS[nextIndex].id);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + TABS.length) % TABS.length;
      setActiveTab(TABS[prevIndex].id);
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

      {/* Search bar */}
      <div className="relative mb-4">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          placeholder="Search settings..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Tabs navigation */}
      <div
        role="tablist"
        className="flex gap-1 p-1 mb-4 bg-slate-100 dark:bg-slate-800 rounded-xl"
        onKeyDown={handleKeyDown}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => {
              setActiveTab(tab.id);
              setSearchQuery('');
            }}
            className={`
              flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200
              ${activeTab === tab.id
                ? 'bg-white dark:bg-slate-700 text-violet-600 dark:text-violet-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }
            `}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div className="flex-1 overflow-auto pb-6">
        {/* General Tab */}
        {activeTab === 'general' && (
          <div id="panel-general" role="tabpanel" className="space-y-6">
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
          </div>
        )}

        {/* Privacy Tab */}
        {activeTab === 'privacy' && (
          <div id="panel-privacy" role="tabpanel" className="space-y-6">
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

            <SettingSection
              title="Data Management"
              description="Control your personal data"
            >
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                  Your journal entries are encrypted using AES-256-GCM encryption with PBKDF2 key derivation (600,000 iterations).
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors"
                    onClick={() => {/* TODO: Export */}}
                  >
                    Export Data
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm font-medium text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/30 rounded-lg hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors"
                    onClick={() => {/* TODO: Reset */}}
                  >
                    Reset App
                  </button>
                </div>
              </div>
            </SettingSection>
          </div>
        )}

        {/* AI Tab */}
        {activeTab === 'ai' && (
          <div id="panel-ai" role="tabpanel" className="space-y-6">
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
          </div>
        )}

        {/* About Tab */}
        {activeTab === 'about' && (
          <div id="panel-about" role="tabpanel" className="space-y-6">
            <SettingSection
              title="About MoodBloom"
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

                <div className="pt-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    MoodBloom is a privacy-focused mood tracking and journaling application.
                    All your data is stored locally on your device and encrypted using
                    industry-standard AES-256-GCM encryption.
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
              </div>
            </SettingSection>
          </div>
        )}
      </div>
    </div>
  );
}
