import type { AppSettings } from '../../../types/settings';
import { SettingSection } from '../SettingSection';
import { SettingToggle } from '../SettingToggle';
import { SettingSelect } from '../SettingSelect';
import { useSettingsStore } from '../../../stores/settingsStore';

interface PrivacyAutoLockProps {
  settings: AppSettings;
  setAutoLockTimeout: (v: number) => void;
}

export function PrivacyAutoLock({ settings, setAutoLockTimeout }: PrivacyAutoLockProps) {
  return (
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
  );
}
