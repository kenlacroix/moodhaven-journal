/**
 * SetupScreen - First-run wizard orchestrator
 *
 * Holds all shared wizard state and renders the appropriate step component.
 * Each step component owns only ephemeral UI state (hover, loading spinners).
 *
 * Steps:
 * Fresh path: welcome → source → password → recovery → security → storage → devices → import → complete
 * Sync path:  welcome → source → password → sync_from_peer → complete
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import { useSettingsStore } from '../stores/settingsStore';
import { usePeerSyncStore } from '../stores/peerSyncStore';
import { readBackupFile, encryptedImport } from '../lib/dataManagementService';
import { startDiscovery, stopDiscovery } from '../lib/peerDiscoveryService';
import { onRestoreProgress, onRestoreReady, onRestoreError, type RestoreProgressEvent } from '../lib/peerSyncEngineService';
import type { StorageBackend } from '../types/settings';
import type { DiscoveredPeer } from '../types/peerSync';

import { WelcomeStep } from '../components/setup/WelcomeStep';
import { SourceStep } from '../components/setup/SourceStep';
import { PasswordStep } from '../components/setup/PasswordStep';
import { RecoveryStep } from '../components/setup/RecoveryStep';
import { SecurityStep } from '../components/setup/SecurityStep';
import { StorageStep } from '../components/setup/StorageStep';
import { DevicesStep } from '../components/setup/DevicesStep';
import { SyncFromPeerStep } from '../components/setup/SyncFromPeerStep';
import { ImportStep } from '../components/setup/ImportStep';
import { CompleteStep } from '../components/setup/CompleteStep';

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

export function SetupScreen() {
  const [currentStep, setCurrentStep] = useState<WizardStep>('welcome');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [storageType, setStorageType] = useState<StorageBackend>('local');
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
  const enableLanSyncRef = useRef(false);
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

  const STEPS = setupMode === 'sync' ? SYNC_STEPS : FRESH_STEPS;

  // Start/stop discovery when entering the devices or sync_from_peer step
  useEffect(() => {
    if (currentStep !== 'devices' && currentStep !== 'sync_from_peer') return;
    startDiscovery().catch(() => {});
    return () => {
      if (!enableLanSyncRef.current) stopDiscovery().catch(() => {});
    };
  }, [currentStep]);

  // Listen for restore events while on the sync_from_peer step.
  // Promise.all ensures all 3 unlisteners are captured before any cleanup can run —
  // avoids a race where React's cleanup fires before .then() callbacks register the fns.
  useEffect(() => {
    if (currentStep !== 'sync_from_peer') return;
    let cancelled = false;
    let unlisteners: Array<() => void> = [];
    Promise.all([
      onRestoreProgress((e) => setRestoreProgress(e)),
      onRestoreReady(() => setRestoreReady(true)),
      onRestoreError((e) => setRestoreError(e.message)),
    ]).then((fns) => {
      if (cancelled) {
        fns.forEach((u) => u());
      } else {
        unlisteners = fns;
      }
    });
    return () => {
      cancelled = true;
      unlisteners.forEach((u) => u());
    };
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
  }, [password, confirmPassword]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleComplete = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const success = await initialize(password);
      if (!success) {
        setError('Failed to set up. Please try again.');
        setIsLoading(false);
        return;
      }

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

      if (importFile) {
        const fileContents = await readBackupFile(importFile);
        const count = await encryptedImport(fileContents, password);
        if (count === 0) {
          setError('No entries found in backup file.');
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
  }, [password, storageType, webdavUrl, importFile, enableLanSync, initialize, saveSettings]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <div
            className="flex justify-center gap-2 pt-6 pb-2"
            role="progressbar"
            aria-label={`Step ${currentStepIndex + 1} of ${STEPS.length}`}
            aria-valuenow={currentStepIndex + 1}
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
          >
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
            {currentStep === 'welcome' && (
              <WelcomeStep onNext={() => setCurrentStep('source')} />
            )}

            {currentStep === 'source' && (
              <SourceStep
                onBack={goBack}
                onChooseFresh={() => handleChooseSource('fresh')}
                onChooseSync={() => handleChooseSource('sync')}
              />
            )}

            {currentStep === 'password' && (
              <PasswordStep
                onBack={goBack}
                onSubmit={handlePasswordSubmit}
                password={password}
                confirmPassword={confirmPassword}
                onPasswordChange={setPassword}
                onConfirmPasswordChange={setConfirmPassword}
                error={error}
                setupMode={setupMode}
              />
            )}

            {currentStep === 'recovery' && (
              <RecoveryStep
                onBack={goBack}
                onNext={goNext}
                password={password}
                recoveryKey={recoveryKey}
                onRecoveryKeyGenerated={(key) => { setRecoveryKey(key); setShowRecoveryKey(true); }}
                onRecoveryKeyClear={() => { setRecoveryKey(null); setRecoveryKeyConfirmed(false); setShowRecoveryKey(false); }}
                recoveryKeyConfirmed={recoveryKeyConfirmed}
                onRecoveryKeyConfirmedChange={setRecoveryKeyConfirmed}
                showRecoveryKey={showRecoveryKey}
                onShowRecoveryKey={() => setShowRecoveryKey(true)}
                onError={setError}
              />
            )}

            {currentStep === 'security' && (
              <SecurityStep
                onBack={goBack}
                onNext={goNext}
                twoFactorSetupMode={twoFactorSetupMode}
                onSetupModeChange={setTwoFactorSetupMode}
                twoFactorComplete={twoFactorComplete}
                onTwoFactorComplete={setTwoFactorComplete}
              />
            )}

            {currentStep === 'storage' && (
              <StorageStep
                onBack={goBack}
                onNext={goNext}
                storageType={storageType}
                onStorageTypeChange={setStorageType}
                webdavUrl={webdavUrl}
                onWebdavUrlChange={setWebdavUrl}
                enableLanSync={enableLanSync}
                onEnableLanSyncChange={(v) => { setEnableLanSync(v); enableLanSyncRef.current = v; }}
              />
            )}

            {currentStep === 'devices' && (
              <DevicesStep
                onBack={goBack}
                onNext={goNext}
                nearbyPeers={nearbyPeers}
                trustedDevices={trustedDevices}
                isDiscovering={isDiscovering}
                pairingPeer={pairingPeer}
                onPairingPeerChange={setPairingPeer}
              />
            )}

            {currentStep === 'sync_from_peer' && (
              <SyncFromPeerStep
                onBack={goBack}
                onSkip={handleComplete}
                restoreProgress={restoreProgress}
                restoreReady={restoreReady}
                restoreError={restoreError}
                onRestoreErrorChange={setRestoreError}
                nearbyPeers={nearbyPeers}
                trustedDevices={trustedDevices}
                isDiscovering={isDiscovering}
                pairingPeer={pairingPeer}
                onPairingPeerChange={setPairingPeer}
                isLoading={isLoading}
              />
            )}

            {currentStep === 'import' && (
              <ImportStep
                onBack={goBack}
                onSubmit={handleComplete}
                importFile={importFile}
                onImportFileChange={setImportFile}
                error={error}
                isLoading={isLoading}
              />
            )}

            {currentStep === 'complete' && (
              <CompleteStep enableLanSync={enableLanSync} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
