/**
 * SetupScreen - First-run wizard for new users
 *
 * Steps:
 * 1. Welcome - Introduction to MoodBloom
 * 2. Password - Set encryption password
 * 3. Security - Optional 2FA setup (TOTP or WebAuthn)
 * 4. Storage - Choose storage backend (local, cloud)
 * 5. Import - Optional import from backup
 * 6. Complete - Ready to use
 */

import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { useSettingsStore } from '../stores/settingsStore';
import { usePeerSyncStore } from '../stores/peerSyncStore';
import { TotpSetup, HardwareKeySetup } from '../components/twoFactor';
import { generateRecoveryKey, storeRecoveryKey } from '../lib/recoveryKeyService';
import { readBackupFile, encryptedImport } from '../lib/dataManagementService';
import { startDiscovery, stopDiscovery } from '../lib/peerDiscoveryService';
import { peerSyncNow, peerFullRestore, peerApplyAndRestart, onRestoreProgress, onRestoreReady, onRestoreError, type RestoreProgressEvent } from '../lib/peerSyncEngineService';
import { PairingModal } from '../components/peer-sync/PairingModal';
import type { StorageBackend } from '../types/settings';
import type { DiscoveredPeer } from '../types/peerSync';

type WizardStep = 'welcome' | 'source' | 'password' | 'recovery' | 'security' | 'storage' | 'devices' | 'sync_from_peer' | 'import' | 'complete';

interface StepConfig {
  id: WizardStep;
  title: string;
  subtitle: string;
}

const FRESH_STEPS: StepConfig[] = [
  { id: 'welcome',       title: 'Welcome',        subtitle: 'Get started' },
  { id: 'source',        title: 'Setup',          subtitle: 'Choose path' },
  { id: 'password',      title: 'Password',       subtitle: 'Protect your data' },
  { id: 'recovery',      title: 'Recovery',       subtitle: 'Optional backup' },
  { id: 'security',      title: 'Extra Security', subtitle: 'Two-factor auth' },
  { id: 'storage',       title: 'Storage',        subtitle: 'Choose location' },
  { id: 'devices',       title: 'Devices',        subtitle: 'Connect your devices' },
  { id: 'import',        title: 'Import',         subtitle: 'Restore data' },
  { id: 'complete',      title: 'Ready',          subtitle: 'All set!' },
];

const SYNC_STEPS: StepConfig[] = [
  { id: 'welcome',        title: 'Welcome',  subtitle: 'Get started' },
  { id: 'source',         title: 'Setup',    subtitle: 'Choose path' },
  { id: 'password',       title: 'Password', subtitle: 'Match your other device' },
  { id: 'sync_from_peer', title: 'Sync',     subtitle: 'Pull from device' },
  { id: 'complete',       title: 'Ready',    subtitle: 'All set!' },
];

type StorageType = StorageBackend;

export function SetupScreen() {
  const [currentStep, setCurrentStep] = useState<WizardStep>('welcome');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [storageType, setStorageType] = useState<StorageType>('local');
  const [webdavUrl, setWebdavUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [twoFactorSetupMode, setTwoFactorSetupMode] = useState<'none' | 'totp' | 'hardwarekey'>('none');
  const [twoFactorComplete, setTwoFactorComplete] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [recoveryKeyConfirmed, setRecoveryKeyConfirmed] = useState(false);
  const [showRecoveryKey, setShowRecoveryKey] = useState(false);

  const [enableLanSync, setEnableLanSync] = useState(false);
  const [pairingPeer, setPairingPeer] = useState<DiscoveredPeer | null>(null);
  const [setupMode, setSetupMode] = useState<'fresh' | 'sync'>('fresh');
  const [restoreProgress, setRestoreProgress] = useState<RestoreProgressEvent | null>(null);
  const [restoreReady, setRestoreReady] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const initialize = useAppStore((state) => state.initialize);
  const saveSettings = useSettingsStore((state) => state.saveSettings);

  const nearbyPeers = usePeerSyncStore((s) => s.nearbyPeers);
  const isDiscovering = usePeerSyncStore((s) => s.isDiscovering);
  const trustedDevices = usePeerSyncStore((s) => s.trustedDevices);
  // Dynamic step path based on chosen mode
  const STEPS = setupMode === 'sync' ? SYNC_STEPS : FRESH_STEPS;

  // Start/stop discovery when entering the devices or sync_from_peer step
  useEffect(() => {
    if (currentStep !== 'devices' && currentStep !== 'sync_from_peer') return;
    startDiscovery().catch(() => {});
    return () => {
      if (!enableLanSync) stopDiscovery().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  // Listen for restore events while on the sync_from_peer step
  useEffect(() => {
    if (currentStep !== 'sync_from_peer') return;
    const cleanups: Array<() => void> = [];
    onRestoreProgress((e) => setRestoreProgress(e)).then((u) => cleanups.push(u));
    onRestoreReady(() => setRestoreReady(true)).then((u) => cleanups.push(u));
    onRestoreError((e) => setRestoreError(e.message)).then((u) => cleanups.push(u));
    return () => cleanups.forEach((u) => u());
  }, [currentStep]);

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);

  const goNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id);
      setError(null);
    }
  };

  const goBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id);
      setError(null);
    }
  };

  const handleChooseSource = (mode: 'fresh' | 'sync') => {
    setSetupMode(mode);
    setCurrentStep('password');
    setError(null);
  };

  const handlePasswordSubmit = useCallback(() => {
    if (!password) {
      setError('Please enter a password');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    // eslint-disable-next-line security/detect-possible-timing-attacks -- comparing two user-typed fields, not secrets
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    goNext();
  }, [password, confirmPassword]);

  const handleComplete = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Initialize with password
      const success = await initialize(password);
      if (!success) {
        setError('Failed to set up. Please try again.');
        setIsLoading(false);
        return;
      }

      // Save storage + LAN sync settings
      useSettingsStore.setState((s) => ({
        settings: {
          ...s.settings,
          storage: {
            type: storageType,
            webdav: {
              url: storageType === 'webdav' ? webdavUrl : '',
              username: '',
              password: '',
            },
          },
          sync: { ...s.settings.sync, peerSyncEnabled: enableLanSync },
        },
      }));
      await saveSettings();

      // If import file provided, handle import
      if (importFile) {
        const fileContents = await readBackupFile(importFile);
        const count = await encryptedImport(fileContents, password);
        if (count === 0) {
          setError('No entries found in backup file.');
          setIsLoading(false);
          return;
        }
      }

      goNext();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An error occurred';
      if (msg.includes('Decryption failed') || msg.includes('wrong password')) {
        setError('Import failed: wrong password. The backup was created with a different password.');
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [password, storageType, webdavUrl, importFile, enableLanSync, initialize, saveSettings]);

  // Password strength indicator
  const getPasswordStrength = () => {
    if (!password) return { label: '', color: '', width: '0%' };
    if (password.length < 8) return { label: 'Too short', color: 'bg-rose-500', width: '25%' };
    if (password.length < 12) return { label: 'Fair', color: 'bg-amber-500', width: '50%' };
    if (password.length < 16) return { label: 'Good', color: 'bg-lime-500', width: '75%' };
    return { label: 'Strong', color: 'bg-emerald-500', width: '100%' };
  };

  const strength = getPasswordStrength();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      {/* Decorative background */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-violet-200/30 dark:bg-violet-900/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-purple-200/30 dark:bg-purple-900/20 blur-3xl" />
      </div>

      <div className="w-full max-w-lg">
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl overflow-hidden">
          {/* Progress bar */}
          <div className="h-1 bg-slate-100 dark:bg-slate-700">
            <div
              className="h-full bg-violet-500 transition-[width] duration-500"
              style={{ width: `${((currentStepIndex + 1) / STEPS.length) * 100}%` }}
            />
          </div>

          {/* Step indicators */}
          <div className="flex justify-center gap-2 pt-6 pb-2">
            {STEPS.map((step, index) => (
              <div
                key={step.id}
                className={`
                  w-2 h-2 rounded-full transition-[width,background-color] duration-300
                  ${index === currentStepIndex
                    ? 'w-6 bg-violet-500'
                    : index < currentStepIndex
                    ? 'bg-violet-300 dark:bg-violet-600'
                    : 'bg-slate-200 dark:bg-slate-700'
                  }
                `}
              />
            ))}
          </div>

          <div className="p-8">
            {/* Welcome Step */}
            {currentStep === 'welcome' && (
              <div className="text-center space-y-6">
                {/* Bloom icon — replaces generic letter-in-gradient placeholder */}
                <div className="flex justify-center">
                  <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <ellipse cx="36" cy="21" rx="8" ry="14" fill="#ddd6fe" transform="rotate(0 36 36)" />
                    <ellipse cx="36" cy="21" rx="8" ry="14" fill="#c4b5fd" transform="rotate(60 36 36)" />
                    <ellipse cx="36" cy="21" rx="8" ry="14" fill="#ddd6fe" transform="rotate(120 36 36)" />
                    <ellipse cx="36" cy="21" rx="8" ry="14" fill="#c4b5fd" transform="rotate(180 36 36)" />
                    <ellipse cx="36" cy="21" rx="8" ry="14" fill="#ddd6fe" transform="rotate(240 36 36)" />
                    <ellipse cx="36" cy="21" rx="8" ry="14" fill="#c4b5fd" transform="rotate(300 36 36)" />
                    <circle cx="36" cy="36" r="11" fill="#8b5cf6" />
                    <circle cx="36" cy="36" r="6" fill="#7c3aed" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">
                    Welcome to MoodBloom
                  </h1>
                  <p className="text-slate-500 dark:text-slate-400">
                    Your private, secure mood tracking and journaling companion.
                  </p>
                </div>
                {/* Inline feature chips — replaces icon-card grid */}
                <div className="flex items-center justify-center flex-wrap gap-x-4 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    End-to-end encrypted
                  </span>
                  <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Stays on your device
                  </span>
                  <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    Optional AI insights
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentStep('source')}
                  className="btn-primary w-full py-3"
                >
                  Create My Journal
                </button>
              </div>
            )}

            {/* Source Step — choose path */}
            {currentStep === 'source' && (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">
                    How would you like to start?
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Start fresh or restore your data from another device on your network.
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Start fresh */}
                  <button
                    type="button"
                    onClick={() => handleChooseSource('fresh')}
                    className="w-full text-left p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/10 transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0 group-hover:bg-violet-200 dark:group-hover:bg-violet-800/40 transition-colors">
                        <svg className="w-5 h-5 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-white">Start fresh</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                          New to MoodBloom — create a new journal from scratch.
                        </p>
                      </div>
                      <svg className="w-5 h-5 text-slate-300 dark:text-slate-600 ml-auto flex-shrink-0 self-center group-hover:text-violet-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>

                  {/* Sync from another device */}
                  <button
                    type="button"
                    onClick={() => handleChooseSource('sync')}
                    className="w-full text-left p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-800/40 transition-colors">
                        <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-white">Restore from another device</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                          Pull your journals, settings and data from a device already running MoodBloom on this network.
                        </p>
                      </div>
                      <svg className="w-5 h-5 text-slate-300 dark:text-slate-600 ml-auto flex-shrink-0 self-center group-hover:text-emerald-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={goBack}
                  className="btn-secondary w-full py-3"
                >
                  Back
                </button>
              </div>
            )}

            {/* Password Step */}
            {currentStep === 'password' && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">
                    {setupMode === 'sync' ? 'Enter Your Password' : 'Create Your Password'}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {setupMode === 'sync'
                      ? 'Enter the same password used on your other device — data is encrypted with it.'
                      : 'This password encrypts all your journal entries'}
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="password" className="label">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a strong password"
                      autoFocus
                      className="input"
                    />
                    {password && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${strength.color} transition-all duration-300`}
                            style={{ width: strength.width }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400 w-16">
                          {strength.label}
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label htmlFor="confirmPassword" className="label">
                      Confirm Password
                    </label>
                    <input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm your password"
                      className="input"
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-rose-500 dark:text-rose-400">{error}</p>
                )}

                <div className="p-4 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-800">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
                        Zero-Knowledge Security
                      </p>
                      <p className="text-xs text-rose-600 dark:text-rose-400">
                        Your password encrypts all data locally. We never see or store your password.
                        <strong className="block mt-1">
                          If you forget your password, your data cannot be recovered.
                        </strong>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={goBack}
                    className="btn-secondary flex-1 py-3"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handlePasswordSubmit}
                    disabled={!password || !confirmPassword}
                    className="btn-primary flex-1 py-3"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* Recovery Key Step */}
            {currentStep === 'recovery' && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">
                    Recovery Key (Optional)
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Generate a backup key in case you forget your password
                  </p>
                </div>

                {!recoveryKey ? (
                  <>
                    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl space-y-3">
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        A recovery key is a 24-character code that can unlock your journal if you forget your password.
                      </p>
                      <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1 list-disc list-inside">
                        <li>Write it down and store it securely</li>
                        <li>It will only be shown once</li>
                        <li>Anyone with this key can access your data</li>
                      </ul>
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={goBack}
                        className="btn-secondary flex-1 py-3"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const key = generateRecoveryKey();
                          setRecoveryKey(key);
                          setShowRecoveryKey(true);
                        }}
                        className="btn-primary flex-1 py-3"
                      >
                        Generate Key
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={goNext}
                      className="w-full text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 py-2"
                    >
                      Skip - I understand my password cannot be recovered
                    </button>
                  </>
                ) : (
                  <>
                    <div className="p-4 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-200 dark:border-violet-800">
                      <p className="text-xs text-violet-600 dark:text-violet-400 mb-3 font-medium">
                        Write this down and store it securely:
                      </p>
                      <div className="relative">
                        <div className={`
                          font-mono text-lg text-center py-4 px-2 bg-white dark:bg-slate-800 rounded-lg
                          ${showRecoveryKey ? '' : 'blur-sm select-none'}
                        `}>
                          {recoveryKey}
                        </div>
                        {!showRecoveryKey && (
                          <button
                            type="button"
                            onClick={() => setShowRecoveryKey(true)}
                            className="absolute inset-0 flex items-center justify-center text-sm text-violet-600 dark:text-violet-400 hover:underline"
                          >
                            Click to reveal
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(recoveryKey);
                        }}
                        className="w-full mt-3 text-xs text-violet-600 dark:text-violet-400 hover:underline"
                      >
                        Copy to clipboard
                      </button>
                    </div>

                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={recoveryKeyConfirmed}
                          onChange={(e) => setRecoveryKeyConfirmed(e.target.checked)}
                          className="mt-0.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                        />
                        <span className="text-xs text-amber-700 dark:text-amber-300">
                          I have written down my recovery key and stored it securely. I understand this key will not be shown again.
                        </span>
                      </label>
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setRecoveryKey(null);
                          setRecoveryKeyConfirmed(false);
                          setShowRecoveryKey(false);
                        }}
                        className="btn-secondary flex-1 py-3"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (recoveryKey && recoveryKeyConfirmed && password) {
                            try {
                              await storeRecoveryKey(recoveryKey, password);
                              goNext();
                            } catch (err) {
                              setError('Failed to save recovery key');
                            }
                          }
                        }}
                        disabled={!recoveryKeyConfirmed}
                        className="btn-primary flex-1 py-3"
                      >
                        Save & Continue
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Security (2FA) Step */}
            {currentStep === 'security' && (
              <div className="space-y-6">
                {/* Show setup component if mode selected */}
                {twoFactorSetupMode === 'totp' && (
                  <TotpSetup
                    onComplete={() => {
                      setTwoFactorComplete(true);
                      setTwoFactorSetupMode('none');
                    }}
                    onCancel={() => setTwoFactorSetupMode('none')}
                  />
                )}
                {twoFactorSetupMode === 'hardwarekey' && (
                  <HardwareKeySetup
                    onComplete={() => {
                      setTwoFactorComplete(true);
                      setTwoFactorSetupMode('none');
                    }}
                    onCancel={() => setTwoFactorSetupMode('none')}
                  />
                )}

                {/* Show options if no mode selected */}
                {twoFactorSetupMode === 'none' && (
                  <>
                    <div className="text-center">
                      <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </div>
                      <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">
                        {twoFactorComplete ? 'Two-Factor Authentication Enabled' : 'Enhanced Security'}
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {twoFactorComplete
                          ? 'Your account is now protected with 2FA'
                          : 'Add an extra layer of protection with two-factor authentication'}
                      </p>
                    </div>

                    {twoFactorComplete ? (
                      <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-center">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-2">
                          <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <p className="text-sm text-emerald-700 dark:text-emerald-300">
                          2FA is configured. You can manage it later in Settings.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-3">
                          <button
                            type="button"
                            onClick={() => setTwoFactorSetupMode('totp')}
                            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-600 text-left transition-colors"
                          >
                            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                              <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <div className="flex-1">
                              <p className="font-medium text-slate-700 dark:text-slate-200">Authenticator App</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Use Authy, Google Authenticator, or a password manager
                              </p>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setTwoFactorSetupMode('hardwarekey')}
                            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-600 text-left transition-colors"
                          >
                            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                              <span className="text-xl">🔑</span>
                            </div>
                            <div className="flex-1">
                              <p className="font-medium text-slate-700 dark:text-slate-200">Hardware Security Key</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Use a YubiKey or similar FIDO2 device (native)
                              </p>
                            </div>
                          </button>
                        </div>

                        <p className="text-xs text-center text-slate-400 dark:text-slate-500">
                          You can also set this up later in Settings
                        </p>
                      </>
                    )}

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={goBack}
                        className="btn-secondary flex-1 py-3"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={goNext}
                        className="btn-primary flex-1 py-3"
                      >
                        {twoFactorComplete ? 'Continue' : 'Skip for Now'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Storage Step */}
            {currentStep === 'storage' && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">
                    Choose Storage Location
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Where should your encrypted data be stored?
                  </p>
                </div>

                <div className="space-y-3">
                  <StorageOption
                    title="Local Storage"
                    description="Store data on this device only"
                    icon="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                    selected={storageType === 'local'}
                    onSelect={() => setStorageType('local')}
                    recommended
                  />
                  <StorageOption
                    title="WebDAV"
                    description="Sync encrypted backups to your own server or NAS"
                    icon="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"
                    selected={storageType === 'webdav'}
                    onSelect={() => setStorageType('webdav')}
                  />
                </div>

                {storageType === 'webdav' && (
                  <div>
                    <label htmlFor="webdavUrl" className="label">
                      WebDAV URL
                    </label>
                    <input
                      id="webdavUrl"
                      type="url"
                      value={webdavUrl}
                      onChange={(e) => setWebdavUrl(e.target.value)}
                      placeholder="https://your-server.com/webdav"
                      className="input"
                    />
                  </div>
                )}

                {/* LAN Sync toggle */}
                <div className="p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                        <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-slate-700 dark:text-slate-200 text-sm">Local Network Sync</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Sync securely with your other devices on the same network</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enableLanSync}
                      onClick={() => setEnableLanSync(!enableLanSync)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        enableLanSync ? 'bg-violet-500' : 'bg-slate-200 dark:bg-slate-600'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        enableLanSync ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                  {enableLanSync && (
                    <p className="text-xs text-violet-600 dark:text-violet-400">
                      You'll be able to pair with nearby devices in the next step.
                    </p>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={goBack}
                    className="btn-secondary flex-1 py-3"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    className="btn-primary flex-1 py-3"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* Devices Step */}
            {currentStep === 'devices' && (
              <div className="space-y-5">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">
                    Connect Your Devices
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {isDiscovering ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3 h-3 border border-violet-400 border-t-violet-600 rounded-full animate-spin" />
                        Scanning your network…
                      </span>
                    ) : (
                      'Nearby devices running MoodBloom will appear below'
                    )}
                  </p>
                </div>

                {/* Nearby peers list */}
                <div className="space-y-2 min-h-[80px]">
                  {nearbyPeers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-slate-400 dark:text-slate-500">
                      <svg className="w-8 h-8 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                      </svg>
                      <p className="text-sm">No devices found yet</p>
                      <p className="text-xs mt-1">Make sure other devices are open and on the same network</p>
                    </div>
                  ) : (
                    nearbyPeers.map((peer) => {
                      const isTrusted = trustedDevices.some((d) => d.deviceId === peer.deviceId);
                      return (
                        <div key={peer.deviceId} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                          <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                              <rect x="2" y="3" width="20" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M12 17v4" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{peer.deviceName}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">{peer.host}</p>
                          </div>
                          {isTrusted ? (
                            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                              Paired
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setPairingPeer(peer)}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-500 hover:bg-violet-600 text-white transition-colors"
                            >
                              Pair
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={goBack}
                    className="btn-secondary flex-1 py-3"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    className="btn-primary flex-1 py-3"
                  >
                    {trustedDevices.length > 0 ? 'Continue' : 'Skip for now →'}
                  </button>
                </div>

                {/* Pairing modal */}
                {pairingPeer && (
                  <PairingModal
                    peer={pairingPeer}
                    onClose={async () => {
                      const justPaired = trustedDevices.find((d) => d.deviceId === pairingPeer.deviceId);
                      if (justPaired) {
                        peerSyncNow(pairingPeer.deviceId, pairingPeer.host).catch(() => {});
                      }
                      setPairingPeer(null);
                    }}
                  />
                )}
              </div>
            )}

            {/* Restore From Peer Step — full DB snapshot for "restore from another device" */}
            {currentStep === 'sync_from_peer' && (() => {
              const isTransferring = restoreProgress !== null && !restoreReady;
              const pct = restoreProgress?.percentage ?? 0;
              const mbReceived = ((restoreProgress?.bytesReceived ?? 0) / 1_048_576).toFixed(1);
              const mbTotal = ((restoreProgress?.totalBytes ?? 0) / 1_048_576).toFixed(1);
              return (
                <div className="space-y-5">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                      {restoreReady ? (
                        <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : isTransferring ? (
                        <span className="w-6 h-6 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />
                      ) : (
                        <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
                        </svg>
                      )}
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">
                      {restoreReady ? 'Transfer Complete!' : isTransferring ? 'Transferring…' : 'Connect to Your Device'}
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {restoreReady
                        ? `All data received from ${restoreProgress?.deviceName ?? 'your device'}. The app will close — reopen it to continue.`
                        : isTransferring
                          ? `${mbReceived} MB / ${mbTotal} MB`
                          : isDiscovering
                            ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="w-3 h-3 border border-emerald-400 border-t-emerald-600 rounded-full animate-spin" />
                                Scanning your network…
                              </span>
                            )
                            : 'Open MoodBloom on your other device — it must be on the same network.'}
                    </p>
                  </div>

                  {/* Transfer progress bar */}
                  {isTransferring && (
                    <div className="space-y-1.5">
                      <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                          style={{ width: `${pct.toFixed(1)}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-500 text-right">
                        {pct.toFixed(0)}%
                      </p>
                    </div>
                  )}

                  {/* Password note — only shown before transfer starts */}
                  {!isTransferring && !restoreReady && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
                      <strong>Important:</strong> The password you just entered must match the one on your source device. Both devices use the same password to encrypt data.
                    </div>
                  )}

                  {/* Peer list — hidden while transferring or done */}
                  {!isTransferring && !restoreReady && (
                    <div className="space-y-2 min-h-[80px]">
                      {nearbyPeers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-6 text-slate-400 dark:text-slate-500">
                          <svg className="w-8 h-8 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                          </svg>
                          <p className="text-sm">No devices found yet</p>
                          <p className="text-xs mt-1">Make sure your other device is open and on the same Wi-Fi</p>
                        </div>
                      ) : (
                        nearbyPeers.map((peer) => {
                          const isTrusted = trustedDevices.some((d) => d.deviceId === peer.deviceId);
                          return (
                            <div key={peer.deviceId} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                              <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                  <rect x="2" y="3" width="20" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M12 17v4" />
                                </svg>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{peer.deviceName}</p>
                                <p className="text-xs text-slate-400 dark:text-slate-500">{peer.host}</p>
                              </div>
                              {isTrusted ? (
                                <button
                                  type="button"
                                  onClick={() => peerFullRestore(peer.deviceId, peer.host).catch((e: unknown) => setRestoreError(String(e)))}
                                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                                >
                                  Restore
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setPairingPeer(peer)}
                                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                                >
                                  Pair & Restore
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {restoreError && (
                    <p className="text-sm text-rose-500 dark:text-rose-400">{restoreError}</p>
                  )}

                  <div className="flex gap-3">
                    {!isTransferring && !restoreReady && (
                      <button
                        type="button"
                        onClick={goBack}
                        className="btn-secondary flex-1 py-3"
                      >
                        Back
                      </button>
                    )}
                    {restoreReady && (
                      <button
                        type="button"
                        onClick={() => peerApplyAndRestart().catch((e: unknown) => setRestoreError(String(e)))}
                        className="btn-primary flex-1 py-3"
                      >
                        Apply & Restart
                      </button>
                    )}
                    {!isTransferring && !restoreReady && (
                      <button
                        type="button"
                        onClick={handleComplete}
                        disabled={isLoading}
                        className="btn-secondary flex-1 py-3"
                      >
                        {isLoading ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-500 rounded-full animate-spin" />
                            Setting up…
                          </span>
                        ) : 'Skip for now'}
                      </button>
                    )}
                  </div>

                  {/* Pairing modal */}
                  {pairingPeer && (
                    <PairingModal
                      peer={pairingPeer}
                      onClose={async () => {
                        const justPaired = trustedDevices.find((d) => d.deviceId === pairingPeer.deviceId);
                        if (justPaired) {
                          // Start full restore immediately after pairing
                          peerFullRestore(pairingPeer.deviceId, pairingPeer.host).catch((e: unknown) => setRestoreError(String(e)));
                        }
                        setPairingPeer(null);
                      }}
                    />
                  )}
                </div>
              );
            })()}

            {/* Import Step */}
            {currentStep === 'import' && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">
                    Import Existing Data
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Have a backup? Import it now or skip this step
                  </p>
                </div>

                <div
                  className={`
                    border-2 border-dashed rounded-xl p-8 text-center transition-colors
                    ${importFile
                      ? 'border-violet-300 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-600'
                    }
                  `}
                >
                  {importFile ? (
                    <div className="space-y-2">
                      <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto">
                        <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="font-medium text-slate-700 dark:text-slate-200">{importFile.name}</p>
                      <button
                        type="button"
                        onClick={() => setImportFile(null)}
                        className="text-sm text-rose-500 hover:text-rose-600"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto">
                        <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <div>
                        <label htmlFor="importFile" className="cursor-pointer">
                          <span className="text-violet-600 dark:text-violet-400 font-medium hover:underline">
                            Choose file
                          </span>
                          <span className="text-slate-500 dark:text-slate-400"> or drag and drop</span>
                        </label>
                        <input
                          id="importFile"
                          type="file"
                          accept=".moodbloom,.json"
                          onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                          className="sr-only"
                        />
                      </div>
                      <p className="text-xs text-slate-400">.moodbloom or .json backup files</p>
                    </div>
                  )}
                </div>

                {error && (
                  <p className="text-sm text-rose-500 dark:text-rose-400">{error}</p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={goBack}
                    className="btn-secondary flex-1 py-3"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleComplete}
                    disabled={isLoading}
                    className="btn-primary flex-1 py-3"
                  >
                    {isLoading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Setting up...
                      </>
                    ) : importFile ? (
                      'Import & Continue'
                    ) : (
                      'Skip & Continue'
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Complete Step */}
            {currentStep === 'complete' && (
              <div className="text-center space-y-6">
                <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
                  <svg className="w-10 h-10 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
                    You're All Set!
                  </h2>
                  <p className="text-slate-500 dark:text-slate-400">
                    Your secure journal is ready. Start tracking your mood and thoughts.
                  </p>
                  {enableLanSync && (
                    <p className="text-xs text-violet-600 dark:text-violet-400 mt-2">
                      Your devices will automatically sync when on the same network.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4 py-4">
                  <div className="text-center">
                    <div className="text-2xl mb-1">5</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Mood Levels</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl mb-1">AES-256</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Encryption</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl mb-1">100%</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Private</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="btn-primary w-full py-3"
                >
                  Start Journaling
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Feature item component for welcome screen
function FeatureItem({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50">
      <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
        <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
      </div>
      <div>
        <p className="font-medium text-slate-700 dark:text-slate-200 text-sm">{title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </div>
    </div>
  );
}

// Storage option component
function StorageOption({
  title,
  description,
  icon,
  selected,
  onSelect,
  recommended,
  comingSoon,
}: {
  title: string;
  description: string;
  icon: string;
  selected: boolean;
  onSelect: () => void;
  recommended?: boolean;
  comingSoon?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={comingSoon}
      className={`
        w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-colors
        ${selected
          ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
        }
        ${comingSoon ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <div className={`
        w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0
        ${selected
          ? 'bg-violet-100 dark:bg-violet-900/30'
          : 'bg-slate-100 dark:bg-slate-700'
        }
      `}>
        <svg
          className={`w-5 h-5 ${selected ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`font-medium ${selected ? 'text-violet-700 dark:text-violet-300' : 'text-slate-700 dark:text-slate-200'}`}>
            {title}
          </p>
          {recommended && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded">
              Recommended
            </span>
          )}
          {comingSoon && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 rounded">
              Coming Soon
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      {selected && (
        <div className="w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center flex-shrink-0">
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </button>
  );
}
