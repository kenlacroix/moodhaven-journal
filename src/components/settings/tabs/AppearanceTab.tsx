import type { AppSettings } from '../../../types/settings';
import { SettingSection } from '../SettingSection';
import { SettingSelect } from '../SettingSelect';
import { SettingToggle } from '../SettingToggle';

interface AppearanceTabProps {
  settings: AppSettings;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setCompactMode: (v: boolean) => void;
  setAnimationsEnabled: (v: boolean) => void;
}

export function AppearanceTab({
  settings,
  setTheme,
  setCompactMode,
  setAnimationsEnabled,
}: AppearanceTabProps) {
  return (
    <div id="panel-appearance" role="tabpanel" className="space-y-6">
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
    </div>
  );
}
