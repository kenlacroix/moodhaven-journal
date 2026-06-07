import type { AppSettings } from '../../../types/settings';

export interface SettingsTabBaseProps {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  saveSettings: () => Promise<void>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onClose: () => void;
}

