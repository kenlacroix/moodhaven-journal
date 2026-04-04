import type { AppSettings } from '../../../types/settings';
import { SettingSection, SettingToggle } from '../index';
import { OuraConnectionCard } from '../../oura/OuraConnectionCard';
import { usePlatform } from '../../../hooks/usePlatform';

interface HealthTabProps {
  settings: AppSettings;
  saveSettings: () => Promise<void>;
  setOuraEnabled: (v: boolean) => void;
  setOuraSettings: (patch: Partial<AppSettings['oura']>) => void;
}

export function HealthTab({
  settings,
  saveSettings,
  setOuraEnabled,
  setOuraSettings,
}: HealthTabProps) {
  const { isBrowser } = usePlatform();

  return (
    <div id="panel-health" role="tabpanel" className="space-y-6">
      <SettingSection
        title="Oura Ring"
        description="Connect your Oura Ring to enrich journal writing prompts with today's sleep, readiness, and stress context. Health data stays on your device."
      >
        {isBrowser ? (
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-sm">
            Oura Ring integration requires the desktop app. It uses a native HTTP plugin to connect to Oura's API securely.{' '}
            <a href="https://github.com/kenlacroix/moodhaven-journal/releases/latest" target="_blank" rel="noopener noreferrer" className="text-violet-600 dark:text-violet-400 underline">Download the desktop app</a>.
          </div>
        ) : (
          <>
            <SettingToggle
              label="Enable Oura Integration"
              description="Show health context in the writing view and optionally enrich AI prompts"
              checked={settings.oura.enabled}
              onChange={(v) => {
                setOuraEnabled(v);
                void saveSettings();
              }}
            />

            {settings.oura.enabled && (
              <div className="mt-4 space-y-4">
                <OuraConnectionCard
                  onConnected={() => {
                    setOuraSettings({ connectedAt: new Date().toISOString() });
                    void saveSettings();
                  }}
                  onDisconnected={() => {
                    setOuraSettings({ connectedAt: null, lastSyncAt: null });
                    void saveSettings();
                  }}
                />

                <SettingToggle
                  label="Auto-sync on open"
                  description="Fetch today's health data automatically when you open the app"
                  checked={settings.oura.autoSyncOnOpen}
                  onChange={(v) => {
                    setOuraSettings({ autoSyncOnOpen: v });
                    void saveSettings();
                  }}
                />

                <SettingToggle
                  label="Enrich writing prompts"
                  description="Include health context when generating AI writing prompts (qualitative labels only — no raw biometrics sent)"
                  checked={settings.oura.enrichPrompts}
                  onChange={(v) => {
                    setOuraSettings({ enrichPrompts: v });
                    void saveSettings();
                  }}
                />
              </div>
            )}
          </>
        )}
      </SettingSection>

      <SettingSection
        title="Privacy"
        description="How your health data is handled"
      >
        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
          <div className="flex gap-2.5">
            <span className="text-emerald-500 mt-0.5">✓</span>
            <span>Health data is fetched directly from Oura's API and stored locally in your encrypted database</span>
          </div>
          <div className="flex gap-2.5">
            <span className="text-emerald-500 mt-0.5">✓</span>
            <span>When AI prompt enrichment is on, only qualitative labels are included (e.g., "user is well rested") — never raw scores or biometrics</span>
          </div>
          <div className="flex gap-2.5">
            <span className="text-emerald-500 mt-0.5">✓</span>
            <span>Your Personal Access Token is stored in your local database — it never leaves your device except to connect to Oura's API</span>
          </div>
          <div className="flex gap-2.5">
            <span className="text-emerald-500 mt-0.5">✓</span>
            <span>All health data is included in your encrypted backup when you export your journal</span>
          </div>
        </div>
      </SettingSection>
    </div>
  );
}
