import type { RefObject } from 'react';
import type { AppSettings } from '../../../types/settings';
import type { TwoFactorStatus } from '../../../types/twoFactor';

export interface SettingsTabBaseProps {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  saveSettings: () => Promise<void>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onClose: () => void;
}

export type { TwoFactorStatus, RefObject };
