import { useState, useCallback } from 'react';
import { SettingSection } from '../SettingSection';
import { factoryReset, exitApp } from '../../../lib/services/dataManagementService';
import { logger } from '../../../lib/services/logger';

interface PrivacyDataManagementProps {
  dataStats: { totalEntries: number; averageMood: number } | null;
  isExporting: boolean;
  exportProgress: { done: number; total: number } | null;
  handleExport: () => void;
}

export function PrivacyDataManagement({
  dataStats,
  isExporting,
  exportProgress,
  handleExport,
}: PrivacyDataManagementProps) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = useCallback(async () => {
    if (resetConfirmText !== 'RESET') return;
    setIsResetting(true);
    try {
      await factoryReset();
      await exitApp();
    } catch (error) {
      logger.error('Reset failed:', { error: String(error) });
      setIsResetting(false);
    }
  }, [resetConfirmText]);

  return (
    <>
      <SettingSection
        title="Data Management"
        description="Control your personal data"
      >
        {dataStats && (
          <div className="flex gap-4 mb-4">
            <div className="flex-1 p-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl text-center">
              <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">
                {dataStats.totalEntries}
              </div>
              <div className="text-xs text-violet-600/70 dark:text-violet-400/70">
                Total Entries
              </div>
            </div>
            <div className="flex-1 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-center">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {dataStats.averageMood.toFixed(1)}
              </div>
              <div className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                Avg Mood
              </div>
            </div>
          </div>
        )}

        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
            Your journal entries are encrypted using AES-256-GCM encryption with PBKDF2 key derivation (600,000 iterations).
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isExporting}
              className="px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors disabled:opacity-50"
              onClick={handleExport}
            >
              {isExporting
                ? exportProgress
                  ? `Packing media ${exportProgress.done}/${exportProgress.total}…`
                  : 'Exporting…'
                : 'Export Data'}
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-sm font-medium text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/30 rounded-lg hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors"
              onClick={() => setShowResetConfirm(true)}
            >
              Reset App
            </button>
          </div>
        </div>
      </SettingSection>

      {/* Reset confirmation dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                  Factory Reset
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  This action cannot be undone
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              This will permanently delete all your journal entries, settings, and encryption keys.
              You will need to set up the app again.
            </p>

            <div className="mb-4">
              <label htmlFor="resetConfirm" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                Type <span className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded">RESET</span> to confirm
              </label>
              <input
                id="resetConfirm"
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="RESET"
                className="input"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                onClick={() => {
                  setShowResetConfirm(false);
                  setResetConfirmText('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetConfirmText !== 'RESET' || isResetting}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleReset}
              >
                {isResetting ? 'Resetting...' : 'Delete Everything'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
