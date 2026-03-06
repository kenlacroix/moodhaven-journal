/**
 * useUpdateCheck — manages the update check lifecycle.
 *
 * - Runs once per app session on mount if autoCheck is enabled and
 *   the last check was > 24 hours ago (or never).
 * - Exposes checkNow() for manual "Check for updates" button.
 * - Skipped versions are respected: is_available will appear false for them.
 * - Works gracefully when the GitHub repo is private or has no releases yet
 *   (the Rust layer returns is_available=false and the hook surfaces nothing).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { checkForUpdate } from '../lib/updaterService';
import type { UpdateInfo } from '../lib/updaterService';

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface UseUpdateCheckReturn {
  updateInfo: UpdateInfo | null;
  /** True while the check HTTP request is in flight */
  isChecking: boolean;
  /** Error message from the last check, if any */
  checkError: string | null;
  /** Trigger a manual check (ignores the 24-hour gate) */
  checkNow: () => Promise<void>;
  /** Call when the user clicks "Skip this version" */
  skipVersion: (version: string) => void;
  /** Clear a previously skipped version */
  clearSkip: () => void;
}

export function useUpdateCheck(): UseUpdateCheckReturn {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const hasAutoChecked = useRef(false);

  const updateSettings = useSettingsStore((s) => s.settings.updates);
  const setLastChecked = useSettingsStore((s) => s.setUpdateLastChecked);
  const setSkippedVersion = useSettingsStore((s) => s.setUpdateSkippedVersion);
  const saveSettings = useSettingsStore((s) => s.saveSettings);

  const performCheck = useCallback(async () => {
    setIsChecking(true);
    setCheckError(null);
    try {
      const info = await checkForUpdate();
      const skipped = updateSettings.skippedVersion;
      // Suppress the banner if the user has skipped this exact version
      if (info.is_available && skipped && skipped === info.version) {
        setUpdateInfo({ ...info, is_available: false });
      } else {
        setUpdateInfo(info);
      }
      setLastChecked(new Date().toISOString());
      await saveSettings();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Network errors are expected when offline or repo is private;
      // surface them only to the manual check UI, not as a crash.
      setCheckError(msg);
    } finally {
      setIsChecking(false);
    }
  }, [updateSettings.skippedVersion, setLastChecked, saveSettings]);

  // Auto-check on mount (once per session, gated by 24-hour cooldown)
  useEffect(() => {
    if (!updateSettings.autoCheck) return;
    if (hasAutoChecked.current) return;
    hasAutoChecked.current = true;

    const lastChecked = updateSettings.lastChecked
      ? new Date(updateSettings.lastChecked).getTime()
      : 0;
    const elapsed = Date.now() - lastChecked;
    if (elapsed >= CHECK_INTERVAL_MS) {
      void performCheck();
    }
  }, [updateSettings.autoCheck, updateSettings.lastChecked, performCheck]);

  const checkNow = useCallback(async () => {
    await performCheck();
  }, [performCheck]);

  const skipVersion = useCallback((version: string) => {
    setSkippedVersion(version);
    void saveSettings();
    // Hide the banner immediately
    setUpdateInfo((prev) => prev ? { ...prev, is_available: false } : prev);
  }, [setSkippedVersion, saveSettings]);

  const clearSkip = useCallback(() => {
    setSkippedVersion(null);
    void saveSettings();
  }, [setSkippedVersion, saveSettings]);

  return { updateInfo, isChecking, checkError, checkNow, skipVersion, clearSkip };
}
