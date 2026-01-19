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

import { useState, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { useSettingsStore } from '../stores/settingsStore';
import { TotpSetup, WebAuthnSetup } from '../components/twoFactor';

type WizardStep = 'welcome' | 'password' | 'security' | 'storage' | 'import' | 'complete';

interface StepConfig {
  id: WizardStep;
  title: string;
  subtitle: string;
}

const STEPS: StepConfig[] = [
  { id: 'welcome', title: 'Welcome', subtitle: 'Get started' },
  { id: 'password', title: 'Password', subtitle: 'Protect your data' },
  { id: 'security', title: 'Extra Security', subtitle: 'Two-factor auth' },
  { id: 'storage', title: 'Storage', subtitle: 'Choose location' },
  { id: 'import', title: 'Import', subtitle: 'Restore data' },
  { id: 'complete', title: 'Ready', subtitle: 'All set!' },
];

type StorageType = 'local' | 'dropbox' | 'webdav';

export function SetupScreen() {
  const [currentStep, setCurrentStep] = useState<WizardStep>('welcome');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [storageType, setStorageType] = useState<StorageType>('local');
  const [webdavUrl, setWebdavUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [twoFactorSetupMode, setTwoFactorSetupMode] = useState<'none' | 'totp' | 'webauthn'>('none');
  const [twoFactorComplete, setTwoFactorComplete] = useState(false);

  const initialize = useAppStore((state) => state.initialize);
  const saveSettings = useSettingsStore((state) => state.saveSettings);

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

  const handlePasswordSubmit = useCallback(() => {
    if (!password) {
      setError('Please enter a password');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
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

      // Save storage settings
      useSettingsStore.setState((s) => ({
        settings: {
          ...s.settings,
          storage: {
            type: storageType,
            webdavUrl: storageType === 'webdav' ? webdavUrl : undefined,
          },
        },
      }));
      await saveSettings();

      // If import file provided, handle import
      if (importFile) {
        // TODO: Implement import logic
        console.log('Import file selected:', importFile.name);
      }

      goNext();
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [password, storageType, webdavUrl, importFile, initialize, saveSettings]);

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
              className="h-full bg-gradient-to-r from-violet-500 to-purple-600 transition-all duration-500"
              style={{ width: `${((currentStepIndex + 1) / STEPS.length) * 100}%` }}
            />
          </div>

          {/* Step indicators */}
          <div className="flex justify-center gap-2 pt-6 pb-2">
            {STEPS.map((step, index) => (
              <div
                key={step.id}
                className={`
                  w-2 h-2 rounded-full transition-all duration-300
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
                <div className="flex justify-center">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
                    <span className="text-white text-3xl font-bold">M</span>
                  </div>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
                    Welcome to MoodBloom
                  </h1>
                  <p className="text-slate-500 dark:text-slate-400">
                    Your private, secure mood tracking and journaling companion.
                  </p>
                </div>
                <div className="space-y-3 text-left">
                  <FeatureItem
                    icon="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    title="End-to-end encryption"
                    description="Your entries are encrypted locally before storage"
                  />
                  <FeatureItem
                    icon="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    title="Privacy first"
                    description="All data stays on your device - no cloud required"
                  />
                  <FeatureItem
                    icon="M13 10V3L4 14h7v7l9-11h-7z"
                    title="AI-powered insights"
                    description="Optional AI features that respect your privacy"
                  />
                </div>
                <button
                  type="button"
                  onClick={goNext}
                  className="btn-primary w-full py-3"
                >
                  Get Started
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
                    Create Your Password
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    This password encrypts all your journal entries
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

                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    <strong>Important:</strong> We cannot recover your password. Please store it securely.
                  </p>
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
                {twoFactorSetupMode === 'webauthn' && (
                  <WebAuthnSetup
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
                            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-600 text-left transition-all"
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
                            onClick={() => setTwoFactorSetupMode('webauthn')}
                            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-600 text-left transition-all"
                          >
                            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                              <span className="text-xl">&#128273;</span>
                            </div>
                            <div className="flex-1">
                              <p className="font-medium text-slate-700 dark:text-slate-200">Hardware Security Key</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Use a YubiKey or similar FIDO2 device
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
                    type="local"
                    title="Local Storage"
                    description="Store data on this device only"
                    icon="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                    selected={storageType === 'local'}
                    onSelect={() => setStorageType('local')}
                    recommended
                  />
                  <StorageOption
                    type="dropbox"
                    title="Dropbox"
                    description="Sync across devices with Dropbox"
                    icon="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707"
                    selected={storageType === 'dropbox'}
                    onSelect={() => setStorageType('dropbox')}
                    comingSoon
                  />
                  <StorageOption
                    type="webdav"
                    title="WebDAV"
                    description="Use your own server or NAS"
                    icon="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"
                    selected={storageType === 'webdav'}
                    onSelect={() => setStorageType('webdav')}
                    comingSoon
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
  type: _type,
  title,
  description,
  icon,
  selected,
  onSelect,
  recommended,
  comingSoon,
}: {
  type: StorageType;
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
        w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all
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
