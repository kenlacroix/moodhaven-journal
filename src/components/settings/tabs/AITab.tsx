import type { RefObject } from 'react';
import type { AppSettings } from '../../../types/settings';
import { SettingSection } from '../SettingSection';
import { SettingToggle } from '../SettingToggle';
import { SettingSelect } from '../SettingSelect';
import { SettingInput } from '../SettingInput';
import { testOpenAIKey, testLocalAIConnection } from '../../../lib/services/settingsService';

interface AITabProps {
  settings: AppSettings;
  saveSettings: () => Promise<void>;
  aiSectionRef: RefObject<HTMLDivElement>;
  setAIEnabled: (v: boolean) => void;
  setAIProvider: (v: 'openai' | 'local') => void;
  setOpenAIKey: (v: string | null) => void;
  setOpenAIModel: (v: 'gpt-4o-mini' | 'gpt-4o' | 'gpt-3.5-turbo') => void;
  setLocalAIEndpoint: (v: string) => void;
  setLocalAIModel: (v: string) => void;
  setAIFeatures: (patch: Partial<AppSettings['ai']['features']>) => void;
  setAIConsent: (v: boolean) => void;
}

export function AITab({
  settings,
  aiSectionRef,
  setAIEnabled,
  setAIProvider,
  setOpenAIKey,
  setOpenAIModel,
  setLocalAIEndpoint,
  setLocalAIModel,
  setAIFeatures,
  setAIConsent,
}: AITabProps) {
  return (
    <div id="panel-ai" role="tabpanel" aria-labelledby="tab-ai" className="space-y-6" ref={aiSectionRef}>
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
  );
}
