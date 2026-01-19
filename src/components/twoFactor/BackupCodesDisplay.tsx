/**
 * BackupCodesDisplay - Shows backup codes after 2FA setup
 *
 * Features:
 * - Grid display of 10 codes
 * - Copy all button
 * - Download as text file
 * - Warning about single-use
 */

import { useState } from 'react';
import { downloadBackupCodes, copyBackupCodesToClipboard } from '../../lib/twoFactorService';

interface BackupCodesDisplayProps {
  codes: string[];
  onDone: () => void;
  showDoneButton?: boolean;
}

export function BackupCodesDisplay({
  codes,
  onDone,
  showDoneButton = true,
}: BackupCodesDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const handleCopy = async () => {
    await copyBackupCodesToClipboard(codes);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    downloadBackupCodes(codes);
    setDownloaded(true);
  };

  return (
    <div className="space-y-6">
      {/* Warning */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">&#9888;</span>
          <div>
            <h4 className="font-medium text-amber-800 dark:text-amber-200">
              Save these backup codes
            </h4>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
              Store these codes in a safe place. Each code can only be used once
              to access your account if you lose your authenticator.
            </p>
          </div>
        </div>
      </div>

      {/* Codes Grid */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
        <div className="grid grid-cols-2 gap-3">
          {codes.map((code, index) => (
            <div
              key={index}
              className="
                font-mono text-center py-2 px-3
                bg-white dark:bg-slate-700
                border border-slate-200 dark:border-slate-600
                rounded-lg text-sm
                text-slate-700 dark:text-slate-200
              "
            >
              <span className="text-slate-400 dark:text-slate-500 mr-2">
                {index + 1}.
              </span>
              {code}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleCopy}
          className="
            flex-1 py-2.5 px-4 rounded-xl
            text-sm font-medium
            bg-slate-100 dark:bg-slate-700
            text-slate-700 dark:text-slate-200
            hover:bg-slate-200 dark:hover:bg-slate-600
            transition-colors
          "
        >
          {copied ? 'Copied!' : 'Copy All'}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="
            flex-1 py-2.5 px-4 rounded-xl
            text-sm font-medium
            bg-slate-100 dark:bg-slate-700
            text-slate-700 dark:text-slate-200
            hover:bg-slate-200 dark:hover:bg-slate-600
            transition-colors
          "
        >
          {downloaded ? 'Downloaded!' : 'Download'}
        </button>
      </div>

      {/* Done Button */}
      {showDoneButton && (
        <button
          type="button"
          onClick={onDone}
          disabled={!copied && !downloaded}
          className="
            w-full py-3 px-4 rounded-xl
            text-sm font-medium text-white
            bg-violet-500 hover:bg-violet-600
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
          "
        >
          {copied || downloaded ? "I've Saved My Codes" : 'Save your codes first'}
        </button>
      )}

      {/* Reminder */}
      <p className="text-xs text-center text-slate-500 dark:text-slate-400">
        You won't be able to see these codes again after closing this screen.
      </p>
    </div>
  );
}
